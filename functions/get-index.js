'use strict';

const co = require("co");
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const Mustache = require("mustache");
// The "superagent" & "superagent-promise" libraries are used to call the "get-restaurants" endpoint and handle callbacks
const http = require("superagent-promise")(require("superagent"), Promise);
const aws4 = require("aws4");

const restaurantsApiRoot = process.env.restaurants_api;
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

var html;

function* loadHtml() {
  if (!html) {
    html = yield fs.readFileAsync('static/index.html', 'utf-8');
  }
  return html;
}

function* getRestaurants() {
  let url = URL.parse(restaurantsApiRoot);
  let opts = {
    host: URL.hostname,
    path: URL.pathname
  };

  aws4.sign(opts);

  return (yield http
    .get(restaurantsApiRoot)
    .set("Host", opts.headers["Host"])
    .set("X-Amz-Date", opts.headers["X-Amz-Date"])
    .set("Authorization", opts.headers["Authorization"])
    .set("X-Amz-Security-Token", opts.headers["X-Amz-Security-Token"])
  ).body;
}

module.exports.handler = co.wrap(function* (event, context, callback) {
  let template = yield loadHtml(); // loads HTML as a template
  let restaurants = yield getRestaurants(); // getRestaurants() is tentative
  let dayOfWeek = days[new Date().getDay()]; // 
  let html = Mustache.render(template, { dayOfWeek, restaurants }); // loads template, passing restaurants as params

  const response = {
    statusCode: 200,
    body: html,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    }
  };

  // This line returns the html file in a callback - IMPORTANT!!!
  callback(null, response);

});