'use strict';

const APP_ROOT = '../../';

/*
  The "when" step inokes the "get-index" function with a "stubbed" ( an empty object -> {} ) event and context.
*/

let we_invoke_get_index = function() {
  // Load the handler function for "get-index":
  let handler = require(`${APP_ROOT}/functions/get-index`).handler;

  // Return a new promise:
  return new Promise((resolve, reject) => {
    // "Stub" the "context" we're going to call the handler function with:
    let context = {};
    // resolve the promise when handler func calls the cb we're going to pass in:
    let callback = function(err, response) {
      if (err) {
        // If an error is returned, reject the promise:
        reject(err);
      } else {
        // respond with HTTP repsonse, using lodash to obtain the Content-Type:
        let contentType = _.get(response, 'headers.Content-Type', 'application/json');
        // If Content-Type doesn't exist, default to "application/json":
        if (response.body && contentType === 'application/json') {
          // If Content-Type is "application/json", just pass the JSON body:
          response.body = JSON.parse(response.body);
        }

        // Resolve the promise with the HTTP response:
        response(response);
      }
    };

    // Call the handler function with a "stubbed" event object as well:
    handler({}, context, callback);
  });
};

// Export the function:
module.exports = {
  we_invoke_get_index
};