'use strict';

const APP_ROOT = '../../';

const _       = require('lodash');
const co      = require('co');
const Promise = require("bluebird");
const http    = require('superagent-promise')(require('superagent'), Promise);
const aws4    = require('aws4');
const URL     = require('url');
const mode    = process.env.TEST_MODE;

/***
* NOTE:
* The "super-agent" pkg turns all headers in a response into lowercase, including "content-type".
* This means one test in the "get-index" test fixture will fail because it's looking for a camelCase response.
*/

let respondFrom = function (httpRes) {
  let contentType = _.get(httpRes, 'headers.content-type', 'application/json');
  // If Content-Type = JSON, then resp body passed as an JSON Object. Else, the resp is binded to body as a "Text" property
  let body = 
    contentType === 'application/json'
      ? httpRes.body
      : httpRes.text;

  return { 
    statusCode: httpRes.status,
    body: body,
    headers: httpRes.headers
  };
}

let signHttpRequest = (url, httpReq) => {
  let urlData = URL.parse(url);
  let opts = {
    host: urlData.hostname, 
    path: urlData.pathname
  };

  aws4.sign(opts);

  httpReq
    .set('Host', opts.headers['Host'])
    .set('X-Amz-Date', opts.headers['X-Amz-Date'])
    .set('Authorization', opts.headers['Authorization']);

  if (opts.headers['X-Amz-Security-Token']) {
    httpReq.set('X-Amz-Security-Token', opts.headers['X-Amz-Security-Token']);
  }
}

// Helper function that creates a default HTTP URL to make request against
let viaHttp = co.wrap(function* (relPath, method, opts) {
  let root = process.env.TEST_ROOT;
  // Here, we construct an actual URL to make an request against:
  let url = `${root}/${relPath}`;
  console.log(`invoking via HTTP ${method} ${url}`);

  // DEBUG - TEST LOGIC START
  console.log(`[*] The passed URL: ${url}`);
  console.log(`[*] The passed Root: ${root}`);
  console.log(`[*] The passed Relative Path: ${relPath}`);
  // DEBUG - TEST LOGIC END

  try {
    // Initialize the HTTP request:
    let httpReq = http(method, url);

    // Options passed in to the function added to the body of the request:
    let body = _.get(opts, "body");
    if (body) {      
      httpReq.send(body);
    }

    // Optionally sign HTTP request with IAM Role...encapsulated into "signHttpRequest" helper func:
    if (_.get(opts, "iam_auth", false) === true) {
      signHttpRequest(url, httpReq);
    }

    // Returned HTTP Obj must be compatible with what "handler" func returns.
    // This is because our test cases are written against that contract.
    // The "respondFrom" helper function will take care of this transformation:
    let res = yield httpReq;
    return respondFrom(res);
  } catch (err) {
    if (err.status) {
      return {
        statusCode: err.status,
        headers: err.response.headers
      };
    } else {
      throw err;
    }
  }
})

// The "viaHandler" function takes an event payload and invokes a handler function locally
let viaHandler = (event, functionName) => {  
  let handler = require(`${APP_ROOT}/functions/${functionName}`).handler;
  console.log(`invoking via handler function ${functionName}`);

  return new Promise((resolve, reject) => {
    let context = {};
    let callback = function (err, response) {
      if (err) {
        reject(err);
      } else {
        let contentType = _.get(response, 'headers.content-type', 'application/json');
        if (response.body && contentType === 'application/json') {
          response.body = JSON.parse(response.body);
        }

        resolve(response);
      }
    };

    handler(event, context, callback);
  });
}


// Each stage has a toggle that will ONLY use "viaHandler" if ("mode" === "handler"):

let we_invoke_get_index = co.wrap(function* () {
  let res = 
    mode === 'handler' 
      ? yield viaHandler({}, 'get-index')
      : yield viaHttp('', 'GET');

  return res;
});

let we_invoke_get_restaurants = co.wrap(function* () {
  let res =
    mode === 'handler' 
      ? yield viaHandler({}, 'get-restaurants')
      : yield viaHttp('restaurants', 'GET', { iam_auth: true });

  return res;
});

let we_invoke_search_restaurants = co.wrap(function* (theme) {
  let body = JSON.stringify({ theme });

  let res = 
    mode === 'handler'
      ? viaHandler({ body }, 'search-restaurants')
      : viaHttp('restaurants/search', 'POST', { body })

  return res;
});

module.exports = {
  we_invoke_get_index,
  we_invoke_get_restaurants,
  we_invoke_search_restaurants
};