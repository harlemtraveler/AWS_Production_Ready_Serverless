'use strict';

const co = require('co');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const Mustache = require('mustache');
// The 'superagent' & 'superagent-promise' libraries are used to call the 'get-restaurants' endpoint and handle callbacks
const http = require('superagent-promise')(require('superagent'), Promise);
const aws4 = require('aws4');
const URL = require('url');

// Test logic below:
// global.fetch = require('node-fetch');
// var AmazonCognitoIdentity = require('amazon-cognito-identity-js');

const awsRegion = process.env.AWS_Region;
const cognitoUserPoolId = process.env.cognito_user_pool_id;
const cognitoClientId = process.env.cognito_client_id;

const restaurantsApiRoot = process.env.restaurants_api;
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

var html;

// console.log(awsRegion);
// console.log(cognitoUserPoolId);
// console.log(cognitoClientId);
// console.log(restaurantsApiRoot);

function* loadHtml() {
  if (!html) {
    html = yield fs.readFileAsync('static/index.html', 'utf-8');
  }
  return html;
}

function* getRestaurants() { // Add "restaurantsApiRoot" as a parameter for functionality test
  let url = URL.parse(restaurantsApiRoot);
  let opts = {
    host: url.hostname,
    path: url.pathname
  };

  aws4.sign(opts);

  return (yield http
    .get(restaurantsApiRoot)
    .set('Host', opts.headers['Host'])
    .set('X-Amz-Date', opts.headers['X-Amz-Date'])
    .set('Authorization', opts.headers['Authorization'])
    .set('X-Amz-Security-Token', opts.headers['X-Amz-Security-Token'])
  ).body;
}

module.exports.handler = co.wrap(function* (event, context, callback) {
  let template = yield loadHtml(); // loads HTML as a template
  let restaurants = yield getRestaurants(); // getRestaurants() is tentative
  let dayOfWeek = days[new Date().getDay()]; // 
  let view = {
    dayOfWeek, 
    restaurants,
    awsRegion,
    cognitoUserPoolId,
    cognitoClientId,
    searchUrl: `${restaurantsApiRoot}/search`
  };
  let html = Mustache.render(template, view); // loads template, passing restaurants as params

  const response = {
    statusCode: 200,
    body: html,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8'
    }
  };

  // This line returns the html file in a callback - IMPORTANT!!!
  callback(null, response);

});