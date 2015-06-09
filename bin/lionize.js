#!/usr/bin/node

/*
 * lionize.js
 * frontend compile to scratch86
 * name is like, turn the cat project into a lion project!
 * supercharge your project with JIT! <3
 * this file handles all of the Scratch facing code / noncompilation related code
 */

var fs = require("fs");
var http = require("http");
var minimist = require("minimist");

// first things first, parse the command line arguments
// lionize doesn't _do_ anything by default. we need to get args

var arguments = minimist(process.argv.slice(2));

console.log(arguments);
