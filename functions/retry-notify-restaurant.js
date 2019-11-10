'use strict';

const co = require('co');
const notify = require('../lib/notify').restaurantOfOrder;

module.exports.handler = co.wrap(function* (event, context, callback) {
  let order = JSON.parse(event.Records[0].Sns.Message);
  order.retried = true;

  try {
    yield notify.restaurantOfOrder(order);
    callback(null, "[+] All Done!");
  } catch (err) {
    callback(err);
  }
});