'use strict';

const co = require('co');
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const middy = require('middy');
const sampleLogging = require('../middleware/sample-logging');

const defaultResults = process.env.defaultResults || 8;
const tableName = process.env.restaurants_table;

function* findRestaurantsByTheme(theme, count) {
  let req = {
		TableName: tableName,
		Limit: count,
    	ExpressionAttributeValues: { ':theme': theme },
    	FilterExpression: 'contains(themes, :theme)'
	};

	let resp = yield dynamodb.scan(req).promise();
  return resp.Items;
}

const handler = co.wrap(function* (event, context, callback) {
  let req = JSON.parse(event.body);
	let restaurants = yield findRestaurantsByTheme(req.theme, defaultResults);
	let response = {
		statusCode: 200,
		body: JSON.stringify(restaurants)
	};

  callback(null, response);
});

module.exports.handler = middy(handler).use(sampleLogging({ sampleRate: 0.01 }));