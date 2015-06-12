/*
 * ScratchAPI.js
 * interacts with the Scratch API to pull projects
 * used by lionize.js
 */

var request = require("request");
var svg2png = require("svg2png");
var fs = require("fs");

/*
 * pull - pulls a project of the website
 * pull fetches the project JSON
 * and also traverses the JSON for other resources to pull (TODO)
 * it returns an object of the pulled resources for the backend to use
 */

function pull(projectID, callback) {
    request("http://projects.scratch.mit.edu/internalapi/project/" + projectID + "/get/", function(err, resp, body) { 
       callback(JSON.parse(body));
    }).on('error', function(e) {
        console.error(e);
    });
}

// I feel sad about using highly nested callbacks :(

function fetchPNG(md5, callback) {
    request("http://cdn.scratch.mit.edu/internalapi/asset/" + md5 + "/get/", function(err, resp, body) {
        if(md5.slice(-4) == ".png") {
            fs.writeFile(md5, body, function() {
                callback(md5);
            });
        } else if(md5.slice(-4) == ".svg") {
            fs.writeFile(md5, body, function() {
                svg2png(md5, md5.slice(0, -4) + ".png", function(err) {
                    if(callback) callback(md5.slice(0, -4) + ".png");
                });
            });
        }
    });

    return (md5.slice(-4 == ".png")) ? md5 : md5.slice(0, -4) + ".png";
}

module.exports.pull = pull;
module.exports.fetchPNG = fetchPNG;
