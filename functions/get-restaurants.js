'use strict';

const co = require('co');
const AWS = require('aws-sdk');
const Mustache = require('mustache');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const log = require('../lib/log');
const cloudwatch = require('../lib/cloudwatch');

const defaultResults = process.env.defaultResults || 8;
const tableName = process.env.restaurants_table;

function* getRestaurants(count) {
  let req = {
		TableName: tableName,
		Limit: count
	};

  let resp = yield cloudwatch.trackExecTime(
		'DyanmoDBScanLatency',
		() => dynamodb.scan(req).promise()
	);
  return resp.Items;
}

module.exports.handler = co.wrap(function* (event, context, callback) {
	let restaurants = yield getRestaurants(defaultResults);

	// A DEBUG log after fetching the restaurants from DynamoDB
	log.debug(`[*] Fetched ${restaurants.length} restaurants`);

	cloudwatch.incrCount('RestaurantsReturned', restaurants.length);

	let response = {
		statusCode: 200,
		body: JSON.stringify(restaurants)
	}

  callback(null, response);
});