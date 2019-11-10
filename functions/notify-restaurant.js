'use strict';

const co = require('co');
const getRecords = require('../lib/kinesis').getRecords;
const notify = require('../lib/notify').restaurantOfOrder;
const retry = require('../lib/retry');

module.exports.handler = co.wrap(function* (event, context, callback) {
  // Placeholder function to get our example record, "notify-restaurant.json"
  let records = getRecords(event);
  // Use a filter to obtain ONLY the 'order_placed' events:
  let orderPlaced = records.filter(r => r.eventType === 'order_placed');

  // For each "orderPlaced" event, we'll publish something to SNS:
  for (let order of orderPlaced) {
    try {
      yield notify.restaurantOfOrder(order);
    } catch (err) {
      yield retry.restaurantNotification(order);
    }
  }

  callback(null, '[*] All Done!');

});