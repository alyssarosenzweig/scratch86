/*
 * backend.js - backend for scratch86
 * entrypoint to the backend of scratch86 --
 * all code generation is done in this file or required files from here
 * HERE BE DRAGONS!
 */

var fs = require("fs");

var LLVMOut = [];
var indentStatus = 0;
var globalDefinitions = [];

function emit(line, indentation) {
    if(indentation < 0) indentStatus += indentation;
    
    var out = "";
    for(var i = 0; i < indentStatus; ++i) out += "    ";
    
    LLVMOut.push( out + line );

    if(indentation > 0) indentStatus += indentation;
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
        } else {
            console.error("I don't how to static cast a double to a "+currentType);
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
    } else if(block[0] == '+') { // addition
        // recursively get arguments
        
        var argument0 = compileBlock(block[1], "double");
        var argument1 = compileBlock(block[2], "double");

        // TODO: typecheck the arguments to ensure we don't need to demote anything
        // in the future, compileBlock can refuse our type request and return a double instead
        // this is bad, because doubles are slow, but also necessary in some cases
        // the logic here would be to cast both arguments to doubles and then return as a double
        // yes, this causes a chain reaction. I'm sad too :(
    
        // TODO: figure out how to use integers in the first place!!!

        var register = newRegister();    
        emit(register + " = fadd " + "double" + " " + argument0[0] + ", " + argument1[0]);

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
        var failLabel = baseID + (2 * acceptableTypes.length);
        var resumeLabel = failLabel + 1;
        var phiNodes = [];

        // emit a switch table
        emit("switch i32 " + typeRegister + ", label %" + failLabel + " [", 1);
        
        acceptableTypes.forEach(function(type, index) {
            emit("i32 " + getTypeIndex(type) + ", label " + "%" + (baseID + (index * 2)));
        });

        emit("]", -1);

        // emit the standard branch paths
        acceptableTypes.forEach(function(type, index) {
           var label = newRegister(); // label
          
           var tempReg = newRegister();
           emit(tempReg + " = load " + type + "* getelementptr inbounds (%struct.Variable* @" + block[1] + ", i32 0, i32 " + getTypeIndex(type) + "), align 8");
           emit("br label %" + resumeLabel);
        
           phiNodes.push("[ " + tempReg + ", " + label + " ]");
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
    
    emit("define void @" + hatBlock[0] + (functionCounter++) + "() {", 1);

    // for each block in the script, compile it!
    
    script.forEach(compileBlock);

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
    
    // sprites can have scripts
    // process those seperately

    if(typeof child.scripts !== 'undefined') {
        child.scripts.forEach(function(script) {
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

    // do note that VariableType is at the end of the struct,
    // and that the other fields follow the order from the enum.
    // this is to allow for big optimization (no branching!) of dynamic type lookups
    // although I'd have to think more about if this is actually safe

    var preamble = "declare void @putchar(i32)\n" +
                    "declare void @exit(i32)\n" + 
                    "declare void @puts(i8*)\n" + 
                    "\n" +
                    "%struct.Variable = type { i8*, double, i32 }\n" +
                    (globalDefinitions.join("\n")) + 
                    "\n" +
                    "define i32 @main() {\n" +
                    "   call void @whenGreenFlag0()\n" +
                    "   ret i32 0\n" +
                    "}\n\n";

    fs.writeFile(output, preamble + LLVMOut.join("\n") + "\n\n"); 

    console.log("Backend stub");
}
