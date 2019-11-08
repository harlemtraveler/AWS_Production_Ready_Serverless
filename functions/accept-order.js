'use strict';

const co = require('co');
const AWS = require('aws-sdk');
const kinesis = new AWS.Kinesis();
const streamName = process.env.order_events_stream;

module.exports.handler = co.wrap(function* (event, context, callback) {
  let body = JSON.parse(event.body);
  let restaurantName = body.restaurantName;
  let orderId = body.orderId;
  let userEmail = body.userEmail;

  console.log(`[+] restaurant [${restaurantName}] accepted order ID [${orderId}] from user [${userEmail}]`);

  let data = {
    orderId,
    userEmail,
    restaurantName,
    eventType: 'order_accepted'
  }

  let req = {
    Data: JSON.stringify(data), // the SDK will base64encode this for us
    PartitionKey: orderId,
    StreamName: streamName
  };

  yield kinesis.putRecord(req).promise();

  console.log(`[+] published 'order_accepted' event into Kinesis`);

  let response = {
    statusCode: 200,
    body: JSON.stringify({ orderId })
  }

  callback(null, response);
});