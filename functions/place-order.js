'use strict';

const co = require('co');
const AWS = require('aws-sdk');
const kinesis = new AWS.Kinesis();
const chance = require('chance').Chance(); // installed as a prod dependency!!!
const streamName = process.env.order_events_stream;

module.exports.handler = co.wrap(function* (event, context, callback) {
  // Here, we're assuming that the restaurant's name is passed in body of POST
  let restaurantName = JSON.parse(event.body).restaurantName;

  // When the req is auth'd by Cognito User Pools, populate the "request Context" of an event with the user's email
  let userEmail = event.requestContext.authorizer.claims.email;

  // Generate a new "orderId"
  let orderId = chance.guid();
  console.log(`placing order ID [${orderId}] to [${restaurantName}] from user [${userEmail}]`);

	// The shape of the data blob
  let data = {
    orderId,
    userEmail,
    restaurantName,
    eventType: 'order_placed'
  };

  // For the "putRecord" request, we need to: send JSON data && sue "orderId" as the partitionKey
  // This is so all Events for thos order are processed in the same sequence (also all data is base64 auto encoded).
  let putReq = {
    Data: JSON.stringify(data),
    PartitionKey: orderId,
    StreamName: streamName
  };


  // Publish the Events to Kinesis using the "putRecord" function...which can yield on its Promise:
  yield kinesis.putRecord(putReq).promise();

  console.log("published 'order_palced' event to Kinesis");

	// Repsonse body expected
  let response = {
    statusCode: 200,
    body: JSON.stringify({ orderId })
  };

  callback(null, response);
});