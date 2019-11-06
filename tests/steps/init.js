'use strict';

const co = require('co');
const Promise = require('bluebird');
const awscred = Promise.promisifyAll(require('awscred'));

let initialized = false;

let init = co.wrap(function* () {
  if (initialized) {
    // If already initialized, then just stop here:
    return;
  }

  // Environment variables required for testing:
  process.env.restaurants_api = "https://ozk1g4x3w2.execute-api.us-east-1.amazonaws.com/dev/restaurants";
  process.env.restaurants_table = "restaurants";
  process.env.AWS_REGION = "us-east-1";
  process.env.cognito_user_pool_id = "us-east-1_CeZvkfvM4";
  process.env.cognito_client_id = "cognito_client_id"; // dummy value
  process.env.cognito_server_client_id = "cognito_server_client_id";

  if (!process.env.AWS_ACCESS_KEY_ID) {
    let cred = (yield awscred.loadAsync()).credentials;

    process.env.AWS_ACCESS_KEY_ID = cred.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = cred.secretAccessKey;

    // NOTE: ADD Logic to fetch user-cred-obj's "sessionToken" property
    if (cred.sessionToken) {
      process.env.AWS_SESSION_TOKEN = cred.sessionToken;
    }
  }

  // The "bluebird" pkg added the "loadAsync()" function to "awscred"
  // let cred = (yield awscred.loadAsync()).credentials;

  // process.env.AWS_ACCESS_KEY_ID = cred.accessKeyId;
  // process.env.AWS_SECRET_ACCESS_KEY = cred.secretAccessKey;

  console.log("AWS credentials loaded");

  // Set to True to prevent repeating process:
  initialized = true;
});

module.exports.init = init;