/*
 * backend.js - backend for scratch86
 * entrypoint to the backend of scratch86 --
 * all code generation is done in this file or required files from here
 * HERE BE DRAGONS!
 */

var fs = require("fs");
var fetchPNG = require("./ScratchAPI").fetchPNG;

var indentStatus = 0;
var globalDefinitions = [];

var eventDefinitions = [];
var greenFlagCount = 0;
var otherEventCount = 0;

var visibleDefinitions = [];
var classDefinitions = [];

// different code contexts will generate code at different times,
// which would normally be ridiculluous hard to implement correctly,
// but we can actually just emit code blocks to a temporary stack instead

var LLVMOutStack = [
    { indentStatus: 0, block: [] }
];

function emit(line, indentation) {
    var ctx = LLVMOutStack[LLVMOutStack.length - 1];
  
    if(indentation < 0) {
        ctx.indentStatus += indentation;
    }

    var out = "";
    for(var i = 0; i < ctx.indentStatus; ++i) out += "    ";
    
    ctx.block.push( out + line );
    
    if(indentation > 0) {
        ctx.indentStatus += indentation;
    }
}

function beginEmissionBlock() {
    LLVMOutStack.push(
            {
                indentStatus: LLVMOutStack[LLVMOutStack.length - 1].indentStatus,
                block: []
            }
    );
}

// a raw block is the output of collapseEmissionBlock
// a.k.a the data structure listed above
// emitRawBlock is intended to be called sometime after a raw block is collapsed

function emitRawBlock(raw) {
    var ctx = LLVMOutStack[LLVMOutStack.length - 1];

    ctx.block = ctx.block.concat(raw.block);
}

// TODO: send upstream if necessary
// I haven't yet determined if this is necessary, so..

function collapseEmissionBlock() {
    return LLVMOutStack.pop();
}

var functionCounter = 0; // TODO: infer legitimate names for scripts
var stringCount = 0;

var functionContext = {
    registerCount: 0
};

function newRegister() {
    return "%" + (++functionContext.registerCount);
}

function newString() {
    return "@.str" + (++stringCount);
}

function getTypeIndex(type) {
    var typeIndex = (type == "i8*") ? 0 :
                    (type == "double") ? 1 :
                    -1;

    if(typeIndex == -1) {
        console.error("Unknown type index");
        console.error(type);
        process.exit(0);
    }

    return typeIndex;
}

function staticCast(value, currentType, outputType) {
    if(currentType == outputType) return value; // don't waste time :)

    if(currentType == "double") {
        if(outputType == "i32") {
            // emit an 'fptoui -- floating point to unsigned intener'
            var output = newRegister();

            emit(output + " = fptoui double " + value + " to i32");

            return output;
        } else if(outputType == "i8*") {
            // this is a double -> string conversion
            // which is unfortunately nontrivial:
            // so, we just call our standard library :)

            var output = newRegister();
            emit(output + " = call i8* @sdtoa(double " + value + ")");

            return output;  
        } else {
            console.error("I don't how to static cast a double to a "+outputType);
            process.exit(0);
        }
    } else {
        console.error("I don't know how to static cast "+currentType);
        // TODO
        
        process.exit(0);
    }
}

// compileBlock is the meat of the compiler
// it recursively emits IR to make stuff happen
// this is the real "HERE BE DRAGONS" <3
// its return type is a reference to the output of its operation
// (typically an IR register, a getelementptr, a constant, etc.),
// but in an array, where the second element is the type.
// type tracking is implemented this way to optimize the IR for Scratch's weird type rules.

function compileBlock(block, expectedType) {
    if(block[0] == "playSound:") {
        // heh, so sound isn't actually supported atm
        // TODO: actually implement sound
        // but, this block is used as a putchar ABI for testing scratch->LLVM until a graphics runtime is setup :)
        
        var argument = compileBlock(block[1], "i32");
        
        // putchar _needs_ an i32, so cast
        var i32ified = staticCast(argument[0], argument[1], "i32");

        // just call putchar

        emit("call void @putchar(i32 " + i32ified + ")");
    } else if(block[0] == "say:") {
        // see above
        // this is the puts ABI :)
        // TODO: actually implement speech bubbles and graphics
        
        var argument = compileBlock(block[1], ["i8*", "double"]);

        var stringified = staticCast(argument[0], argument[1], "i8*");

        emit("call void @puts(i8* " + stringified + ")");
    } else if(block[0] == "wait:elapsed:from:") {
        // sleep :)

        var arg = compileBlock(block[1], "i32");
        var i32ified = staticCast(arg[0], arg[1], "i32");

        // TODO: deal with usleep, nanosleep, POSIX, and windows...
        // this breaks for noninteger values :(

        emit("call void @sleep(i32 " + i32ified + ")");
    } else if(block[0] == "doIfElse") {
        // if-else is trivial to map to LLVM
        // evaluate the condition, pass it into a br, and that's it :)
        // the only caveat is that we can only compute the labels retroactively
        // so we set emission flags so we can compile the inside bits AOT
       
        // compile the condition
        var condition = compileBlock(block[1], "i1"); // i1 == condition

        // compile each codepath, seperately, in their own emission block
        // it is important to note that this will NOT be collapsed onto the main LLVMOut
        // we leave it for ourselves to do this :)
        
        var path1Label = newRegister();
        beginEmissionBlock();
        
        block[2].forEach(function(block_) {
            compileBlock(block_, "void");
        });
        
        var path1 = collapseEmissionBlock();

        
        var path2Label = newRegister();
        beginEmissionBlock();
        
        block[3].forEach(function(block_) {
            compileBlock(block_, "void");
        });

        var path2 = collapseEmissionBlock();

        // the output label will be here:
        var result = newRegister();

        // and we now retroactively need to add an unconditional branch
        
        // TODO: adding a terminator to an old emission block is pretty common
        // make this more DRY, please :)

        path1.block.push("  br label " + result);
        path2.block.push("  br label " + result);

        // emit a branch

        emit("br i1 " + condition[0] + ", label " + path1Label + ", label " + path2Label);

        // and finally, just dump the two blocks independantly :)

        emitRawBlock(path1);
        emitRawBlock(path2);
    } else if(block[0] == "doForever") {
        // forever is.. ah.. very trivial <3

        var label = newRegister();
        emit("br label " + label);
        
        block[1].forEach(function(block_) {
            compileBlock(block_, "void");
        });

        emit("br label " + label); 
    } else if(block[0] == "=" || block[0] == ">" || block[0] == "<") { // condition
        // conditions aren't that difficult to do,
        // but there is one caveat:
        // these blocks are polymorphic for numbers and strings
        // unfortunately, this means we have to fetch the arguments as strings
        // (worst case first mentality, perhaps)

               var argument0 = compileBlock(block[1], "i8*");
        var argument1 = compileBlock(block[2], "i8*");

        // so, we check the types to see if we *actually* have to use slow string ops

        if(argument0[1] == "i8*" || argument1[1] == "i8*") {
            // ugh.. to high-level C stdlib it is

            // it's possible that one, but not both of these arguments is a string
            // in that case, we have to.. ugh.. render it as a string
            // alternatively, we could parse the other one, but that doesn't make a lot of sense compile time :(

            var string0 = staticCast(argument0[0], argument0[1], "i8*");
            var string1 = staticCast(argument1[0], argument1[1], "i8*");

            // we now call strcmp on the arguments
            // TODO: research if it is more accurate / safe to use strncmp instead
            
            var strcmped = newRegister();
            emit(strcmped+ " = call i32 @strcmp(i8* " + string0 + ", i8* " + string1 + ")");

            // strcmp will return 0 if the strings are equal
            // so we check for that :)
            
            var operation = ({
                "=": "eq",
                ">": "ugt",
                "<": "ult"
            })[block[0]];

            var output = newRegister();
            emit(output + " = icmp " + operation + " i32 0, " + strcmped);
            return [output, "i1"];
        } else if(argument0[1] == "double" && argument1[1] == "double") {
            // yay! we can use a native fcmp and be on our way!
            // TODO: research the behaviour of fcmp when one or both of the arguments is NaN
        
            // first things first, generalize the block spec to be DRY <3
        
            var operation = ({
                "=": "ueq",
                ">": "ugt",
                "<": "ult"
            })[block[0]];


            var outputReg = newRegister();
            emit(outputReg + " = fcmp " + operation + " double " + argument0[0] + ", "+ argument1[0]);
            return [outputReg, "i1"];
        } else {
            // this isn't possible...?

            console.error("Unknown type configuration for compare:");
            console.error(argument0);
            console.error(argument1);

            process.exit(0);
        }

    } else if(block[0] == "not") {
        // LLVM doesn't actually support a not instruction,
        // which makes no sense to me, but.. whatever
        // you just do an XOR with (2^n - 1)

        var arg = compileBlock(block[1]);

        var output = newRegister();
        emit(output + " = xor i1 true, " + arg[0] );
        return [output, "i1"];
    } else if(block[0] == "&" || block[0] == "|") {
        // these blocks are pretty straight forward to implement
        // compute the two conditions seperately, and apply a bitwise transform on them to get the combined value

        var arg1 = compileBlock(block[1]);
        var arg2 = compileBlock(block[2]);

        var op = block[0] == "&" ? "and" : "or";

        var output = newRegister();
        emit(output + " = " + op + " i1 " + arg1[0] + ", " + arg2[0]);
        return [output, "i1"];
    } else if(Array.isArray(block) && ['+', '-', '*', '/'].indexOf(block[0]) > -1) { // addition
        // recursively get arguments
        console.log("blag");
        console.log(block); 
        
        var argument0 = compileBlock(block[1], "double");
        var argument1 = compileBlock(block[2], "double");

        // TODO: typecheck the arguments to ensure we don't need to demote anything
        // in the future, compileBlock can refuse our type request and return a double instead
        // this is bad, because doubles are slow, but also necessary in some cases
        // the logic here would be to cast both arguments to doubles and then return as a double
        // yes, this causes a chain reaction. I'm sad too :(
    
        // TODO: figure out how to use integers in the first place!!!

        var op = ({
                "+": "fadd",
                "-": "fsub",
                "*": "fmul",
                "/": "fdiv"
        })[block[0]];

        var register = newRegister();
        emit(register + " = " + op + " " + "double" + " " + argument0[0] + ", " + argument1[0]);

        return [register, "double"];
    } else if(block[0] == "setVar:to:") {
       // setting a variable is unfortunately multistep
       // first, we need to infer the type of the input
       // then, we set the type of the variable to that type
       // finally, we set the appropiate field in the variable struct to the value

        var varname = block[1]; // JSON hackers, don't even try!

        // For type inference, we "request" for the input to be i32
        // But this is kind of selfish of us,
        // I mean, what if the input isn't actually i32?
        // What if she self-identifies as a double?
        // Why must we forcibly cast her into this highly optimizable, simpler box in society against her will?
        // But--- as a coder from Massachusetts, California, or 1 of about 30 other states---
        // We will honor her marriage to the less standard double type, and simply set the type field of the structure accordingly, despite the performance hit.
        // ^ programmer's poetry 

        // TODO: implement what I just wrote
        // we use only doubles for now :(

        console.log(value);
        var value = compileBlock(block[2], "double"); // TODO: change to i32 and still make things work right

        emit("store i32 "+getTypeIndex(value[1])+", i32* getelementptr inbounds (%struct.Variable* @" + varname + ", i32 0, i32 2), align 4");
    
        emit("store "+ value[1] + " " + value[0] + ", " + value[1] + "* getelementptr inbounds (%struct.Variable* @" + varname + ", i32 0, i32 " + getTypeIndex(value[1]) + "), align 8");

        console.log("Value: "+value);
    } else if(block[0] == "readVariable") {
        // reading a variable is really difficult, as it turns out
        // well, difficult to do it fast
        // the issue is that there is an expected type,
        // and we need to figure out some way to meet the expectations,
        // while still maintaining type safety in LLVM
        // TODO: microoptimizations here :)

        // get the runtime type

        var typeRegister = newRegister();

        emit(typeRegister + " = load i32* getelementptr inbounds (%struct.Variable* @" + block[1] + ", i32 0, i32 2), align 8");

        var acceptableTypes = [];

        if(Array.isArray(expectedType)) acceptableTypes = expectedType;
        else                            acceptableTypes = [expectedType];


        var baseID = functionContext.registerCount + 1; 
        var failLabel = baseID + (3 * acceptableTypes.length) - 1;
        var resumeLabel = failLabel + 1;
        var phiNodes = [];

        // emit a switch table
        emit("switch i32 " + typeRegister + ", label %" + failLabel + " [", 1);
        
        acceptableTypes.forEach(function(type, index) {
            // calculate the index
            // this isn't trivial, because everything but index 0 consumes 3 register allocations,
            // but index 0 only consumes 2
            
            var reference = (index == 0) ? 0 :
                            (index * 3) - 1;

            emit("i32 " + getTypeIndex(type) + ", label " + "%" + (baseID + reference));
        });

        emit("]", -1);

        // emit the standard branch paths
        acceptableTypes.forEach(function(type, index) {
           var label = newRegister(); // label
          
           var tempReg = newRegister();
           emit(tempReg + " = load " + type + "* getelementptr inbounds (%struct.Variable* @" + block[1] + ", i32 0, i32 " + getTypeIndex(type) + "), align 8");
            
           var outputReg = staticCast(tempReg, type, acceptableTypes[0]); 
           
           emit("br label %" + resumeLabel);
        
           phiNodes.push("[ " + outputReg + ", " + label + " ]");
        });

        // emit a failure path :(
        ++functionContext.registerCount; // label
        emit("call void @exit(i32 42)");
        emit("unreachable");

        // finally, emit the resume path
        // basically, we use a phi node to collect the output from wherever we just were, throw that in a register, and let the calling code figure out what to do from here! :)

        ++functionContext.registerCount; // label
        var outputRegister = newRegister();
        emit(outputRegister + " = phi " + acceptableTypes[0] + " " + phiNodes.join(", "));
       
        // by this point, we have the final value in outputRegister,
        // and we can gaurentee that its of type acceptableTypes[0]
        // that's all we need to know to return!

       return [outputRegister, acceptableTypes[0]]; 
    } else if(!isNaN(block)) {
        // if the block is a number, we can probably just return it as is :)
        // TODO: infer type of whether it's an integer or a float
        console.log(block);
        
        // force cast to integer in LLVM
        // TODO: make this less hacky
        if(block.toString().indexOf(".") == -1) block = block.toString() + ".0";

        return [block, "double"];
    } else if(typeof block === 'string') {
        // unfortunately, strings in LLVM are NOT atomic
        // we have to create a definition for them preinitialized,
        // and get a reference to that definition here with getelementptr
        // I know, WAT?! (although if you look at the resulting assembly it makes some amount of sense)

        // first, we need a _name_ for the string
        var stringName = newString();
        
        // we emit to the preamble

        globalDefinitions.push( 
            stringName + " = internal constant [" + (block.length+1) + " x i8] c\""
            + block + "\\00\"");

        // then, for the result, we have to emit a getelementptr instruction
        // getelementptr indexes an array without dereferencing
        // so we index it with 0

        var reference = "getelementptr inbounds ([" + (block.length+1) + " x i8]* " + stringName +
                        ", i32 0, i32 0)";

        return [reference, "i8*"];
    } else {
        console.error("Unknown block:");
        console.error(block);

        // return a stub value if needed

        if(expectedType == 'i32' || expectedType == 'double') {
            return ["0", expectedType];
        }
    }

    // if we're still here, it's probably a void block and not part of a chain :)
    // for good measure, just in case, we return type void (I know, wat?)

    return [null, "void"];
}

// process a script
// this method actually hooks into code generation :)

function processScript(context, script) {
    console.log("Compiling script:");
    console.log(script);

    // first element of the script block is the hat block
    // this determines when this function will be called
    // basically, this is used as a note to the runtime
    // and yes, scripts are functions :)

    var hatBlock = script[0];

    // TODO: implement hat blocks

    // emit a function definition
   
    var fnName = "undefined";

    // for each event recorded, there is a corresponding registerEvent call
    // TODO: test if this will affect load times harshly

    if(hatBlock[0] == "whenGreenFlag") {
        fnName = "greenFlag" + (functionCounter++);
        eventDefinitions.push("    call void @registerEvent(i32 1, void ()* @"+ fnName + ")");

        greenFlagCount++;
    } else {
        console.log("Unknown hat block:");
        console.log(fnName);
        console.log("Removed as dead code");
        process.exit(0);
    }

    emit("define void @" + fnName + "() {", 1);

    // for each block in the script, compile it!
    
    script.forEach(function(b, index) {
        if(index > 0) compileBlock(b, "void")
    });

    // return block is needed to avoid LLVM hating me

    emit("ret void");
    emit("}", -1);
}

// processes a child (basically a sprite)

function processChild(child) {
    // attach some metadata to tag the sprite

    child["86"] = {
        type: "sprite"
    };

    var isVisible = true,
        x = "0.0", y = "0.0",
        rotation = "90.0",
        costumeNumber = 0,
        class_n = 0;
  
    var costumeList = [];

    if(typeof child.costumes !== 'undefined') {
        child.costumes.forEach(function(costume) {
            costumeList.push(fetchPNG(costume.baseLayerMD5));
        });
    }
    
    console.log(child);

    // generate the required constants for the class

    var costumeStrings = [];

    costumeList.forEach(function(costume) {
            var reg = newString();

            globalDefinitions.push("    " + reg + " = private unnamed_addr constant [ " + (costume.length + 1) + " x i8] c\"" + costume + "\\00\", align 1");

            costumeStrings.push("i8* getelementptr inbounds ([ " + (costume.length + 1) + " x i8]* " + reg + ", i32 0, i32 0)");
    });

    // generate the costume list constant array
    var costumeArr = newString();

    globalDefinitions.push("    " + costumeArr + " = internal constant [ " + costumeStrings.length + " x i8*] [" + costumeStrings.join(", ") + "], align 16");

    classDefinitions.push("    call void @registerSpriteClass(i8** getelementptr inbounds ([ " + costumeStrings.length + " x i8*]* " + costumeArr + ", i32 0, i32 0), i32 " + costumeStrings.length + ")");

    visibleDefinitions.push("   call void @newVisibleObject(i1 zeroext " + isVisible + ", i32 128, double " + x + ", double " + y + ", double " + rotation + ", i32 " + costumeNumber + ", i32 " + class_n + ")");

    // sprites can have scripts
    // process those seperately

    if(typeof child.scripts !== 'undefined') {
        child.scripts.forEach(function(script, index) {
            processScript(child, script[2]);
        });
    }
}

// processes a variable definition
// basically define the global container for the variable,
// and potentially set a default value in @main

function processVariable(context, variable) {
    // TODO: fix naming conflicts for sprite contexts
    // add the global definition

    var name = variable.name;
    var value = variable.value;

    globalDefinitions.push("@" + name + " = common global %struct.Variable zeroinitializer, align 8");
    
    // TODO: value initialization
}

module.exports = function(project, output) {
    // process stage variables
    
    if(typeof project.variables !== 'undefined') {
        project.variables.forEach(function(variable) {
            processVariable(project, variable);
        });
    }

    // and process sprites!

    if(typeof project.children !== 'undefined') {
        project.children.forEach(function(child) {
            processChild(child);
        });
    }

    // since there are no header files in Scratch,
    // we have to account for this _ourselves_
    // erg :p
 
    // we define the Variable struct in LLVM
    // too bad clang didn't annotate the actual struct for me
    // anyway, here's the original C version (approximately):

    // struct Variable {
    //        i8* string_value;
    //        double double_value;
    //        enum VariableType type;
    // }
    //
    // enum VariableType { string_type, double_type }
    
    // see the stdlib source code for the VisibleObject struct

    // do note that VariableType is at the end of the struct,
    // and that the other fields follow the order from the enum.
    // this is to allow for big optimization (no branching!) of dynamic type lookups
    // although I'd have to think more about if this is actually safe

    var preamble = "declare void @putchar(i32)\n" +
                    "declare void @exit(i32)\n" + 
                    "declare void @sleep(i32)\n" + 
                    "declare i8* @sdtoa(double)\n" + 
                    "declare void @puts(i8*)\n" + 
                    "declare i32 @strcmp(i8*, i8*)\n" + 
                    "declare void @ScratchInitialize()\n" + 
                    "declare void @ScratchDestroy()\n" + 
                    "declare void @registerEvent(i32, void ()*)\n" + 
                    "declare void @registerSpriteClass(i8**, i32)\n" + 
                    "declare void @setEventCount(i32, i32)\n" + 
                    "declare void @setClassCount(i32)\n" + 
                    "declare void @newVisibleObject(i1 zeroext, i32, double, double, double, i32, i32)\n" + 
                    "\n" +
                    "%struct.Variable = type { i8*, double, i32 }\n" +
                    (globalDefinitions.join("\n")) + 
                    "\n" +
                    "define i32 @main() {\n" +
                    "   call void @setEventCount(i32 1, i32 " + greenFlagCount + ")\n" +
                    (eventDefinitions.join("\n")) + "\n" +
                    "   call void @setClassCount(i32 " + classDefinitions.length + ")\n" +
                    (classDefinitions.join("\n")) + "\n" +
                    (visibleDefinitions.join("\n")) +
                    "\n"+
                    "   call void @ScratchInitialize()\n" +
                    "   call void @ScratchDestroy()\n" +
                    "   ret i32 0\n" +
                    "}\n\n";

    fs.writeFile(output, preamble + LLVMOutStack[0].block.join("\n") + "\n\n"); 

    console.log("Backend stub");
}
