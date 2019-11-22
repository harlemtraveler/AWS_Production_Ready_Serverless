'use strict';

const log = require('../lib/log');

module.exports = (config) => {
  let oldLogLevel = undefined;
  return {
    before: (handler, next) => {
      if (config.sampleRate && Math.random() <= config.sampleRate) {
        oldLogLevel = process.env.log_level;
        process.env.log_level = 'DEBUG';
      }

      next();
    },
    after: (handler, next) => {
      // Rollback the log_level
      if (oldLogLevel) {
        process.env.log_level = oldLogLevel;
      }

      next();
    },
    onError: (handler, next) => {
      let awsRequestId = handler.context.awsRequestId;
      let invocationEvent = JSON.stringify(handler.event);
      log.error('[!] Invocation Failed', { awsRequestId, invocationEvent }, handler.error);
      
      next(handler.error);
    }
  };
};