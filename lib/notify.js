'use strict';

const _ = require('lodash');
const co = require('co');
const AWS = require('aws-sdk');
const kinesis = new AWS.Kinesis();
const sns = new AWS.SNS();
const chance = require('chance').Chance();
const cloudwatch = require('./cloudwatch');

const streamName = process.env.order_events_stream;
const restaurantTopicArn = process.env.restaurants_notification_topic;



let notifyRestaurantOfOrder = co.wrap(function* (order) {
  try{
    if (chance.bool({ likelihood:75 })) { // 75% chance of failure 
      throw new Error('[!] Boom Shakka Lakka!');
    }
    
    let pubReq = {
      Message: JSON.stringify(order),
      TopicArn: restaurantTopicArn
    };
    
    // Publish to SNS & record "the time to publish to SNS" in the custom metric "SnsPublishLatency"
    // If the application is runnig slow, this will help us to determine if the SNS step is the culprit
    yield cloudwatch.trackExecTime(
      'SnsPublishLatency',
      () => sns.publish(pubReq).promise()
    );
    
    console.log(`[+] notified restaurant [${order.restaurantName}] of order [${order.orderId}]`);
    
    let data = _.clone(order);
    data.eventType = 'restaurant_notified';
    
    let putRecordReq = {
      Data: JSON.stringify(data),
      PartitionKey: order.orderId,
      StreamName: streamName
    };
    
    // invoke a Kinesis PUT event
    yield cloudwatch.trackExecTime(
      'KinesisPutRecordLatency',
      () => kinesis.putRecord(putRecordReq).promise()
    );
    
    console.log(`published 'restaurant_notified' event in Kinesis`);
    
    cloudwatch.incrCount('NotifyRestaurantSuccess');
  } catch(err) {
    cloudwatch.incrCount('NotifyRestaurantFailed');
    throw err;
  }
});

module.exports = {
  restaurantOfOrder: notifyRestaurantOfOrder
};