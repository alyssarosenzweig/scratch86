/*
 * ScratchAPI.js
 * interacts with the Scratch API to pull projects
 * used by lionize.js
 */

var request = require("request");

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

module.exports.pull = pull;
