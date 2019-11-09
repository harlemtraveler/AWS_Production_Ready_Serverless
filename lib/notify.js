'use strict';

const _ = require('lodash');
const co = require('co');
const AWS = require('aws-sdk');
const kinesis = new AWS.Kinesis();
const sns = new AWS.SNS();
const chance = require('chance').Chance();

const streamName = process.env.order_events_stream;
const restaurantTopicArn = process.env.restaurants_notification_topic;



let notifyRestaurantOfOrder = co.wrap(function* (order) {
  if (chance.bool({ likelihood:75 })) { // 75% chance of failure 
    throw new Error('[!] Boom Shakka Lakka!');
  }

  let pubReq = {
    Message: JSON.stringify(order),
    TopicArn: restaurantTopicArn
  };
  
  // publish to SNS
  yield sns.publish(pubReq).promise();
  
  console.log(`[+] notified restaurant [${order.restaurantName}] of order [${order.orderId}]`);
  
  let data = _.clone(order);
  data.eventType = 'restaurant_notified';
  
  let putRecordReq = {
    Data: JSON.stringify(data),
    PartitionKey: order.orderId,
    StreamName: streamName
  };
  
  // invoke a Kinesis PUT event
  yield kinesis.putRecord(putRecordReq).promise();
  
  console.log(`published 'restaurant_notified' event in Kinesis`);
});

module.exports = {
  restaurantOfOrder: notifyRestaurantOfOrder
};