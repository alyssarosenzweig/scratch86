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

    fs.writeFile(output, LLVMOut.join("\n") + "\n"); 

    console.log("Backend stub");
}
