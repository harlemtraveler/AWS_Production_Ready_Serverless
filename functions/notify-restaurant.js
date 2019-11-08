'use strict';

const _ = require('lodash');
const co = require('co');
const AWS = require('aws-sdk');
const kinesis = new AWS.Kinesis();
const sns = new AWS.SNS();
const getRecords = require('../lib/kinesis').getRecords;
const streamName = process.env.order_events_stream;
const topicArn = process.env.restaurants_notification_topic;

module.exports.handler = co.wrap(function* (event, context, callback) {
  // Placeholder function to get our example record, "notify-restaurant.json"
  let records = getRecords(event);
  // Use a filter to obtain ONLY the order_placed events:
  let orderPlaced = records.filter(r => r.eventType === 'order_placed');

  // For each "orderPlaced" event, we'll publish something to SNS:
  for (let order of orderPlaced) {
    let pubReq = {
      Message: JSON.stringify(order),
      TopicArn: topicArn
    };
    // We're sending the "order_placed" event to the SNS Topic we just created for the time being:
    yield sns.publish(pubReq).promise();

    // adding a simple log message
    console.log(`[+] notified restaurant [${order.restaurantsName}] of order [${order.orderId}]`);

    // Use lodash to reate a copy of the "order_placed" event
    let data = _.clone(order);
    // Use "data" (i.e. clone of "order_placed" events) as the basis of "restaurant_notified" events
    data.eventType = 'restaurant_notified';

    // Using the "orderId" as the partitionKey 
    // (i.e. this is so that events related to the same order always process in sequence)
    let putRecordReq = {
      Data: JSON.stringify(data),
      PartitionKey: order.orderId,
      StreamName: streamName
    };

    // Push the "restaurant_notified" event to SNS
    yield kinesis.putRecord(putRecordReq).promise();

    console.log(`published 'restaurant_notified' event in Kinesis`);
  }

  callback(null, '[*] All Done!');

});