/*
 * backend.js - backend for scratch86
 * entrypoint to the backend of scratch86 --
 * all code generation is done in this file or required files from here
 * HERE BE DRAGONS!
 */

var fs = require("fs");

//var processScript = require("./processScript");

var LLVMOut = [];
var indentStatus = 0;

function emit(line, indentation) {
    if(indentation < 0) indentStatus += indentation;
    
    var out = "";
    for(var i = 0; i < indentStatus; ++i) out += "    ";
    
    LLVMOut.push( out + line );

    if(indentation > 0) indentStatus += indentation;
}

var functionCounter = 0; // TODO: infer legitimate names for scripts

var functionContext = {
    registerCount: 0
};

function newRegister() {
    return "%" + (++functionContext.registerCount);
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
        
        // just call putchar

        emit("call void @putchar(i32 " + argument[0] + ")");
    } else if(block[0] == '+') { // addition
        // recursively get arguments
        
        var argument0 = compileBlock(block[1], "i32");
        var argument1 = compileBlock(block[2], "i32");

        // TODO: typecheck the arguments to ensure we don't need to demote anything
        // in the future, compileBlock can refuse our type request and return a double instead
        // this is bad, because doubles are slow, but also necessary in some cases
        // the logic here would be to cast both arguments to doubles and then return as a double
        // yes, this causes a chain reaction. I'm sad too :(
    
        var register = newRegister();    
        emit(register + " = add " + "i32" + " " + argument0[0] + ", " + argument1[0]);

        return [register, "i32"];
    } else if(!isNaN(block)) {
        // if the block is a number, we can probably just return it as is :)
        // TODO: infer type of whether it's an integer or a float

        return [block, "i32"];
    } else {
        console.error("Unknown block:");
        console.error(block);

        // return a stub value if needed

        if(expectedType == 'i8' || expectedType == 'i16' || expectedType == 'i32') {
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

module.exports = function(project, output) {
    project.children.forEach(function(child) {
        processChild(child);
    });

    // since there are no header files in Scratch,
    // we have to account for this _ourselves_
    // erg :p
    
    var preamble = "declare void @putchar(i32)\n\n" +
                    "define i32 @main() {\n" +
                    "   call void @whenGreenFlag0()\n" +
                    "   ret i32 0\n" +
                    "}\n\n";

    fs.writeFile(output, preamble + LLVMOut.join("\n") + "\n\n"); 

    console.log("Backend stub");
}
