'use strict';

const co = require('co');
// ERROR: Course module incorrectly required the "restaurantOfOrder" function with the below format:
// i.e. => const notify = require('../lib/notify').restaurantOfOrder;
// And invoked it as so:
// i.e. => yield notify.restaurantOfOrder(order);
// SOLUTION: Remove "restaurantOfOrder" either from the "require" statement OR the invocation
const notify = require('../lib/notify');
const middy = require('middy');
const sampleLogging = require('../middleware/sample-logging');
const flushMetrics = require('../middleware/flush-metrics');

const handler = co.wrap(function* (event, context, callback) {
  let order = JSON.parse(event.Records[0].Sns.Message);
  order.retried = true;

  try {
    yield notify.restaurantOfOrder(order);
    callback(null, "[+] All Done!");
  } catch (err) {
    callback(err);
  }
});

module.exports.handler = middy(handler)
  .use(sampleLogging({ sampleRate: 0.01 }))
  .use(flushMetrics);