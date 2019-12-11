'use strict';

const co = require('co');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const Mustache = require('mustache');
// The 'superagent' & 'superagent-promise' libraries are used to call the 'get-restaurants' endpoint and handle callbacks
const http = require('superagent-promise')(require('superagent'), Promise);
const aws4 = require('aws4');
const URL = require('url');
const awscred = Promise.promisifyAll(require('awscred'));
const log = require('../lib/log');
const cloudwatch = require('../lib/cloudwatch');
const middy = require('middy');
const sampleLogging = require('../middleware/sample-logging');

const awsRegion = process.env.AWS_Region;
const cognitoUserPoolId = process.env.cognito_user_pool_id;
const cognitoClientId = process.env.cognito_client_id;
const restaurantsApiRoot = process.env.restaurants_api;
const ordersApiRoot = process.env.orders_api;
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

var html;

function* loadHtml() {
  if (!html) {
    html = yield fs.readFileAsync('static/index.html', 'utf-8');
  }
  return html;
}

function* getRestaurants() {
  // Add "restaurantsApiRoot" as a parameter for functionality test
  let url = URL.parse(restaurantsApiRoot);
  let opts = {
    host: url.hostname,
    path: url.pathname
  };

  // START: WAS DOING SOMETHING HERE
  if (!process.env.AWS_ACCESS_KEY_ID) {
    let cred = (yield awscred.loadAsync()).credentials;

    process.env.AWS_ACCESS_KEY_ID = cred.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = cred.secretAccessKey;

    // NOTE: ADD Logic to fetch user-cred-obj's "sessionToken" property
    if (cred.sessionToken) {
      process.env.AWS_SESSION_TOKEN = cred.sessionToken;
    }

  }
  // END: WAS DOING SOMETHING HERE

  aws4.sign(opts);

  let httpReq = http
    .get(restaurantsApiRoot)
    .set('Host', opts.headers['Host'])
    .set('X-Amz-Date', opts.headers['X-Amz-Date'])
    .set('Authorization', opts.headers['Authorization']);

  if (opts.headers['X-Amz-Security-Token']) {
    httpReq.set('X-Amz-Security-Token', opts.headers['X-Amz-Security-Token']);
  }

  return (yield httpReq).body;
}

const handler = co.wrap(function* (event, context, callback) {
  // loads HTML as a template
  let template = yield loadHtml();

  // A quick DEBUG log
  log.debug('[*] Loaded HTML tmeplate');

  // getRestaurants() is tentative
  let restaurants = yield cloudwatch.trackExecTime(
    "GetRestayrantsLatency",
    () => getRestaurants()
  );

  // A DEBUG log after loading the restaurants
  log.debug(`[*] Loaded ${restaurants.length} restaurants`);

  let dayOfWeek = days[new Date().getDay()];
  let view = {
    dayOfWeek, 
    restaurants,
    awsRegion,
    cognitoUserPoolId,
    cognitoClientId,
    searchUrl: `${restaurantsApiRoot}/search`,
    placeOrderUrl: `${ordersApiRoot}`
  };
  // loads template, passing restaurants as params
  let html = Mustache.render(template, view);

  // A DEBUG log after generating the HTML
  log.debug(`[*] Generated HTML [${html.length} bytes]`);

  cloudwatch.incrCount('RestaurantsReturned', restaurants.length);

  const response = {
    statusCode: 200,
    body: html,
    headers: {
      'content-type': 'text/html; charset=UTF-8'
    }
  };

  // This line returns the html file in a callback - IMPORTANT!!!
  callback(null, response);

});

// The "sampleRate" is set to 50% of the time (1 out of 100 == 0.01):
module.exports.handler = middy(handler).use(sampleLogging({ sampleRate: 0.01 }));