'use strict';

const co         = require('co');
const AWS        = require('aws-sdk');
const log        = require('./log');
const cloudwatch = new AWS.CloudWatch();
const kinesis = new AWS.Kinesis();

// How to Exec a "PutRecord" request
// (e.g. "putRecord(params = {}, callback) => AWS.Request")
// 
// kinesis.putRecord(params = {}, function (err, data) {});

// the value is hardcoded for the purpose of the demo applicaiton
const namespace = 'business-search';
const async = (process.env.async_metrics || 'false') === 'true';

// the Lambda execution environment defines a number of env variables:
//    https://docs.aws.amazon.com/lambda/latest/dg/current-supported-versions.html
// and the serverless framework also defines a STAGE env variable too
const dimensions = 
  [
    { Name: 'Function', Value: process.env.AWS_LAMBDA_FUNCTION_NAME	},
    { Name: 'Version', Value: process.env.AWS_LAMBDA_FUNCTION_VERSION	},
    { Name: 'Stage', Value: process.env.STAGE	}
  ]
  .filter(dim => dim.Value);

let countMetrics = {};
let timeMetrics  = {};

function getCountMetricData(name, value) {
  return {
    MetricName : name,
    Dimensions : dimensions,
    Unit       : 'Count',
    Value      : value
  };
}

function getTimeMetricData(name, statsValues) {
  return {
    MetricName      : name,
    Dimensions      : dimensions,
    Unit            : 'Milliseconds',
    StatisticValues : statsValues
  };
}

function getCountMetricDatum() {
  let keys = Object.keys(countMetrics);
  if (keys.length === 0) {
    return [];
  }

  let metricDatum = keys.map(key => getCountMetricData(key, countMetrics[key]));
  countMetrics = {}; // zero out the recorded count metrics
  return metricDatum;
}

function getTimeMetricDatum() {
  let keys = Object.keys(timeMetrics);
  if (keys.length === 0) {
    return [];
  }

  let metricDatum = keys.map(key => getTimeMetricData(key, timeMetrics[key]));
  timeMetrics = {}; // zero out the recorded time metrics
  return metricDatum;
}


// TEST - Print Passed Obj's Props
// function printObjProps(obj, prefix) {
//   for (let [key, value] of Object.entries(obj)) {
//     log.debug(`[KEY_${prefix}]${key}: [VALUE_${prefix}]${value}`);
//   }
// };

function isObj(val) {
  typeof val === 'object' && val !== 'null' ? true : false;
};

const getNestedObj = (nestedObj, pathArr) => {
  return pathArr.reduce((obj, key) =>
    (obj && obj[key] !== 'undefined') ? obj[key] : undefined, nestedObj
  );
};

// function getDimensions(dim, n) {
//   results = [];
//   for (let key in dim) {}
// };

// const objDimensions = getNestedObj(metric, ['Dimensions']);

function putCustomMetric(obj) {
  
};


// function printObjProps(obj, prefix) {
//   for (let [key, value] of Object.entries(obj)) {
//     if (isObj(value)) {
//       log.debug(`[TEST_KEY_${prefix}]${key}: [TEST_VALUE_${prefix}]` + Object.entries(value));
//     }
//     log.debug(`[TEST_KEY_${prefix}]${key}: [TEST_VALUE_${prefix}]${value}`);
//   }
// };



// This below code successfully logs "StatisticValues", but fails to log "Dimensions" properly
// function printObjProps(obj, prefix) {
//     for (let [key, value] of Object.entries(obj)) {
//       if (typeof value === 'object' && value !== 'null') {
//         log.debug(`[TEST_KEY_${prefix}]${key}: [TEST_VALUE_${prefix}]` + Object.entries(value));
//       }
//       log.debug(`[TEST_KEY_${prefix}]${key}: [TEST_VALUE_${prefix}]${value}`);
//   }
// };

// TEST - CODE ENDS HERE


// The "flush()" function matches all collected metrics to make a single "putMetricData" API call
let flush = co.wrap(function* () {
  let countDatum = getCountMetricDatum();
  let timeDatum  = getTimeMetricDatum();
  // ***** FIND OUT WHAT THE "allDatum" OBJ's SHAPE LOOKS LIKE: *****
  let allDatum   = countDatum.concat(timeDatum);
  // ***** We possibly exec a batch "putRecord" request using "timeDatum" as the data Obj to pass *****
  if (allDatum.length == 0) { return; }

  let metricNames = allDatum.map(x => x.MetricName).join(',');
  log.debug(`flushing [${allDatum.length}] metrics to CloudWatch: ${metricNames}`);

  var params = {
    MetricData: allDatum,
    Namespace: namespace
  };

  try {
    yield cloudwatch.putMetricData(params).promise();
    log.debug(`flushed [${allDatum.length}] metrics to CloudWatch: ${metricNames}`);
    countDatum.map(x => {
      printObjProps(x, "v1");
    });

    timeDatum.map(x => {
      printObjProps(x, "v2");
    });

  } catch (err) {
    log.warn(`couldn't flush [${allDatum.length}] CloudWatch metrics`, null, err);
  }  
});

// The "clear()" function is used to clear out the collected metrics WITHOUT publishing:
function clear() {
  countMetrics = {};
  timeMetrics = {};
}

// The "incrCount()" function is used to increment the "count" metric:
function incrCount(metricName, count) {
  count = count || 1;

  if (async) {
    console.log(`MONITORING|${count}|count|${metricName}|${namespace}`);
    console.log(`[DIMENSION:${metricName}=${count}]`);
  } else {
    if (countMetrics[metricName]) {
      countMetrics[metricName] += count;
    } else {
      countMetrics[metricName] = count;
    }
  }
}

// The "recordTimeInMillis()" function records time in a metric called "ms"
function recordTimeInMillis(metricName, ms) {
  if (!ms) {
    return;
  }

  log.debug(`new execution time for [${metricName}] : ${ms} milliseconds`);

  if (async) {
    console.log(`MONITORING|${ms}|milliseconds|${metricName}|${namespace}\n`);
    // NEW CODE INSERT BELOW
    log.debug(`[*DEMO*] ${metricName}: ${ms} ms`);
    console.log(`[DIMENSION:${metricName}=${ms} milliseconds]`);
  } else {
    if (timeMetrics[metricName]) {
      let metric = timeMetrics[metricName];
      metric.Sum         += ms;
      metric.Maximum     = Math.max(metric.Maximum, ms);
      metric.Minimum     = Math.min(metric.Minimum, ms);
      metric.SampleCount += 1;
    } else {
      let statsValues = {
        Maximum     : ms,
        Minimum     : ms,
        SampleCount : 1,
        Sum         : ms
      };
      timeMetrics[metricName] = statsValues;
    }
  }
}

// The "trackExecTime()" function records how long a function takes to execute, stored in a metric called "f"
function trackExecTime(metricName, f) {
  if (!f || typeof f !== "function") {
    throw new Error('cloudWatch.trackExecTime requires a function, eg. () => 42');
  }

  if (!metricName) {
    throw new Error('cloudWatch.trackExecTime requires a metric name, eg. "CloudSearch-latency"');
  }

  let start = new Date().getTime(), end;
  let res = f();
  
  // anything with a 'then' function can be considered a Promise...
  // http://stackoverflow.com/a/27746324/55074
  if (!res.hasOwnProperty('then')) {
    end = new Date().getTime();
    recordTimeInMillis(metricName, end-start);
    return res;
  } else {
    return res.then(x => {
      end = new Date().getTime();
      recordTimeInMillis(metricName, end-start);
      return x;
    });
  }
}

module.exports = {
  flush,
  clear,
  incrCount,
  trackExecTime,
  recordTimeInMillis
};