'use strict';

const co = require("co");
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const Mustache = require("mustache");
// The "superagent" & "superagent-promise" libraries are used to call the "get-restaurants" endpoint and handle callbacks
const http = require("superagent-promise")(require("superagent"), Promise);

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
  return (yield http.get(restaurantsApiRoot)).body; // The "restaurantsApiRoot" Env variable is used to store the "get-restaurants" endpoint URL
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