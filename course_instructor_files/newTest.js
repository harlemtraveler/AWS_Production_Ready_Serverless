// v1.1.2
var co = require('co');
var _ = require('lodash');
var zlib = require('zlib');
var AWS = require('aws-sdk');
var https = require('https');
var crypto = require('crypto');
var client = new AWS.CloudWatch();

var endpoint = 'search-business-search-es-2-opf7zpaw5ookhjm6aqrpjthdpy.us-east-1.es.amazonaws.com';

// Set this to true if you want to debug why data isn't making it to 
// your Elasticsearch cluster. This will enable logging of failed items
// to CloudWatch Logs.
var logFailedResponses = false;

exports.handler = function(input, context) {
    // decode input from base64
    var zippedInput = new Buffer.from(input.awslogs.data, 'base64');

    // decompress the input
    zlib.gunzip(zippedInput, function(error, buffer) {
        if (error) { context.fail(error); return; }

        // parse the input from Binary to String, then from String to JSON
        var awslogsData = JSON.parse(buffer.toString('utf8'));

        // transform the input to Elasticsearch documents
        var elasticsearchBulkData = transform(awslogsData)[bulkRequestBody];
        var customMetricBulkData = transform(awslogsData)[customMetricsBody];
        var usageMetricBulkData = transform(awslogsData)[usageMetricsBody];
        var allMetricBulkData = customMetricBulkData.concat(usageMetricBulkData); 

        // skip control messages
        if (!elasticsearchBulkData) {
            console.log('Received a control message');
            context.succeed('Control message handled successfully');
            return;
        }

        // Publish both Custom & Usage Metrics
        publishMetrics(allMetricBulkData);

        // post documents to the Amazon Elasticsearch Service
        post(elasticsearchBulkData, function(error, success, statusCode, failedItems) {
            console.log('Response: ' + JSON.stringify({ 
                "statusCode": statusCode 
            }));

            if (error) {
                logFailure(error, failedItems);
                context.fail(JSON.stringify(error));
            } else {
                console.log('Success: ' + JSON.stringify(success));
                context.succeed('Success');
            }
        });
    });
};

// The "transform()" func is the equivalent of "parse.js"
function transform(payload) {
    if (payload.messageType === 'CONTROL_MESSAGE') {
        return null;
    }

    var bulkRequestBody = '';
    var customMetricsBody = '';
    var usageMetricsBody = '';

    var logGroup = payload.logGroup;
    var logStream = payload.logStream;
    var logEvents = payload.logEvents;

    var pricePerGbSecond = 0.00001667;

    // The below func is the equivalent of "processAll()" in the "lib.js" file
    payload.logEvents.forEach(function(logEvent) {
        var timestamp = new Date(1 * logEvent.timestamp);

        // index name format: cwl-YYYY.MM.DD
        var indexName = [
            'cwl-' + timestamp.getUTCFullYear(),              // year
            ('0' + (timestamp.getUTCMonth() + 1)).slice(-2),  // month
            ('0' + timestamp.getUTCDate()).slice(-2)          // day
        ].join('.');

        // NEW CODE
        // #1
        var parseLogMessage = function (logGroup, logStream, functionName, lambdaVersion, logEvent) {
            if (logEvent.message.startsWith('START RequestId') || 
                logEvent.message.startsWith('END RequestId') || 
                logEvent.message.startsWith('REPORT RequestId')) {
                return null;
            }

            var parts = logEvent.message.split('\t', 3);
            var timestamp = parts[0];
            var requestId = parts[1];
            var event = parts[2];

            if (event.startsWith("MONITORING|")) {
                return null;
            }

            var log = {
                logGroup,
                logStream,
                functionName,
                lambdaVersion,
                '@timestamp': new Date(timestamp),
                type: 'cloudwatch'
            };

            var fields = tryParseJson(event);
            if (fields) {
                fields.requestId = requestId;

                var level = (fields.level || 'debug').toLowerCase();
                var message = fields.message;

                // level and message are lifted out, so no need to keep them there
                delete fields.level;
                delete fields.message;

                log.level = level;
                log.message = message;
                log.fields = fields;
            } else {
                log.level = 'debug';
                log.message = event;
                log.fields = {};
            }

            return log;
        };

        // #2
        var parseCustomMetric = function (functionName, version, logEvent) {
            if (logEvent.message.startsWith('START RequestId') || 
                logEvent.message.startsWith('END RequestId') || 
                logEvent.message.startsWith('REPORT RequestId')) {
                return null;
            }

            var parts = logEvent.message.split('\t', 3);
            var timestamp = parts[0];
            var requestId = parts[1];
            var event = parts[2];

            if (!event.startsWith("MONITORING|")) {
                return null;
            }

            // MONITORING|metric_value|metric_unit|metric_name|namespace|dimension1=value1, dimension2=value2, ...
            var metricData = event.split('|');
            var metricValue = parseFloat(metricData[1]);
            var metricUnit = toCamelCase(metricData[2].trim());
            var metricName = metricData[3].trim();
            var namespace = metricData[3].trim();

            var dimensions = [
                { Name: "Function", Value: functionName },
                { Name: "Version", Value: version }
            ];

            if (metricData.length > 5) {
                var dimensionKVs = metricData[5].trim();
                var customDimensions = dimensionKVs
                    .map(kvp => {
                        var kv = kvp.trim().split('=');
                        return kv.length == 2 ? { Name: kv[0], Value: kv[1] } : null;
                    })
                    .filter(x => x != null && x != undefined && x.Name != "Function" && x.Name != "Version");
                // "dimensions" looks like this: [{ Name: "Function", Value: functionName },{ Name: "Function", Value: functionName },...]
                dimensions = dimensions.concat(customDimensions);
            }

            // Our new metrics looks like this: {Value: metricValue,Unit: toCamelCase(metricUnit),MetricName: metricName,Dimensions: [{ Name: "Function", Value: functionName },...],Namespace: namespace,Timestamp: timestamp ? new Date(timestamp) : new Date()};
            return makeMetric(metricValue, metricUnit, metricName, dimensions, namespace, timestamp);
        };

        // #3
        var parseUsageMetrics = function (functionName, version, logEvent) {
            if (logEvent.message.startsWith("REPORT RequestId:")) {
                var parts = logEvent.message.split('\t', 5);

                var billedDuration = parseFloatWith(/Billed Duration: (.*) ms/i, parts[2]);
                var memorySize = parseFloatWith(/Memory Size: (.*) MB/i, parts[3]);
                var memoryUsed = parseFloatWith(/Max Memory Used: (.*) MB/i, parts[4]);
                var cost = calCostForInvocation(memorySize, billedDuration);

                var dimensions = [
                    { Name: "Function", Value: functionName },
                    { Name: "Version", Value: version }
                ];

                var namespace = 'AWS/Lambda';

                return [
                    makeMetric(billedDuration, "milliseconds", "BilledDuration", dimensions, namespace),
                    makeMetric(memorySize, "megabytes", "MemorySize", dimensions, namespace),
                    makeMetric(memoryUsed, "megabytes", "MemoryUsed", dimensions, namespace),
                    makeMetric(cost, "milliseconds", "CostInDollars", dimensions, namespace),
                ];
            }
            // returns a list of custom metric Objs (*e.g. [{metricObj-01},{metricObj-02},{metricObj03},...])
            return [];
        };

        // #4
        var parseAll = function (logGroup, logStream, logEvents) {
            var lambdaVersion = parseLambdaVersion(logStream);
            var functionName = parseFunctionName(logGroup);

            var logs = logEvents
                .map(e => parseLogMessage(logGroup, logStream, functionName, lambdaVersion, e))
                .filter(log => log != null && log != undefined);

            var customMetrics = logEvents
                .map(e => parseCustomMetric(functionName, lambdaVersion, e))
                .filter(metric => metric != null && metric != undefined);

            var usageMetrics = logEvents
                .map(e => parseUsageMetrics(functionName, lambdaVersion, e))
                .filter((acc, metrics) => acc.concat(metrics), []);

            // Each returned variable is an Array of Obj (*i.e. log Obj, custom metric Obj, or usage metric Obj)
            customMetricsBody += customMetricsBody.concat(customMetrics);
            usageMetricsBody += usageMetricsBody.concat(usageMetrics);
        };

        parseAll(logEvent.logGroup, logEvent.logStream, logEvent.logEvents);
        // END NEW

        var source = buildSource(logEvent.message, logEvent.extractedFields);
        source['@id'] = logEvent.id;
        source['@timestamp'] = new Date(1 * logEvent.timestamp).toISOString();
        source['@message'] = logEvent.message;
        source['@owner'] = payload.owner;
        source['@log_group'] = payload.logGroup;
        source['@log_stream'] = payload.logStream;

        var action = { "index": {} };
        action.index._index = indexName;
        action.index._type = payload.logGroup;
        action.index._id = logEvent.id;
        
        bulkRequestBody += [ 
            JSON.stringify(action), 
            JSON.stringify(source),
        ].join('\n') + '\n';
    });
    return { bulkRequestBody, customMetricsBody, usageMetricsBody };
}

function buildSource(message, extractedFields) {
    if (extractedFields) {
        var source = {};

        for (var key in extractedFields) {
            if (extractedFields.hasOwnProperty(key) && extractedFields[key]) {
                var value = extractedFields[key];

                if (isNumeric(value)) {
                    source[key] = 1 * value;
                    continue;
                }

                jsonSubString = extractJson(value);
                if (jsonSubString !== null) {
                    source['$' + key] = JSON.parse(jsonSubString);
                }

                source[key] = value;
            }
        }
        return source;
    }

    jsonSubString = extractJson(message);
    if (jsonSubString !== null) { 
        return JSON.parse(jsonSubString); 
    }

    return {};
}

// takes value of iterated key from "extractedFields" & parse to json
function extractJson(message) {
    var jsonStart = message.indexOf('{');
    if (jsonStart < 0) return null;
    var jsonSubString = message.substring(jsonStart);
    return isValidJson(jsonSubString) ? jsonSubString : null;
}

function isValidJson(message) {
    try {
        JSON.parse(message);
    } catch (e) { return false; }
    return true;
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

// This "post" func performs same functionality as "socket.write()" in "lib.js"
function post(body, callback) {
    var requestParams = buildRequest(endpoint, body);

    var request = https.request(requestParams, function(response) {
        var responseBody = '';
        response.on('data', function(chunk) {
            responseBody += chunk;
        });

        response.on('end', function() {
            var info = JSON.parse(responseBody);
            var failedItems;
            var success;
            var error;
            
            if (response.statusCode >= 200 && response.statusCode < 299) {
                failedItems = info.items.filter(function(x) {
                    return x.index.status >= 300;
                });

                success = { 
                    "attemptedItems": info.items.length,
                    "successfulItems": info.items.length - failedItems.length,
                    "failedItems": failedItems.length
                };
            }

            if (response.statusCode !== 200 || info.errors === true) {
                // prevents logging of failed entries, but allows logging 
                // of other errors such as access restrictions
                delete info.items;
                error = {
                    statusCode: response.statusCode,
                    responseBody: info
                };
            }

            callback(error, success, response.statusCode, failedItems);
        });
    }).on('error', function(e) {
        callback(e);
    });
    request.end(requestParams.body);
}

function buildRequest(endpoint, body) {
    var endpointParts = endpoint.match(/^([^\.]+)\.?([^\.]*)\.?([^\.]*)\.amazonaws\.com$/);
    var region = endpointParts[2];
    var service = endpointParts[3];
    var datetime = (new Date()).toISOString().replace(/[:\-]|\.\d{3}/g, '');
    var date = datetime.substr(0, 8);
    var kDate = hmac('AWS4' + process.env.AWS_SECRET_ACCESS_KEY, date);
    var kRegion = hmac(kDate, region);
    var kService = hmac(kRegion, service);
    var kSigning = hmac(kService, 'aws4_request');
    
    var request = {
        host: endpoint,
        method: 'POST',
        path: '/_bulk',
        body: body,
        headers: { 
            'Content-Type': 'application/json',
            'Host': endpoint,
            'Content-Length': Buffer.byteLength(body),
            'X-Amz-Security-Token': process.env.AWS_SESSION_TOKEN,
            'X-Amz-Date': datetime
        }
    };

    var canonicalHeaders = Object.keys(request.headers)
        .sort(function(a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; })
        .map(function(k) { return k.toLowerCase() + ':' + request.headers[k]; })
        .join('\n');

    var signedHeaders = Object.keys(request.headers)
        .map(function(k) { return k.toLowerCase(); })
        .sort()
        .join(';');

    var canonicalString = [
        request.method,
        request.path, '',
        canonicalHeaders, '',
        signedHeaders,
        hash(request.body, 'hex'),
    ].join('\n');

    var credentialString = [ date, region, service, 'aws4_request' ].join('/');

    var stringToSign = [
        'AWS4-HMAC-SHA256',
        datetime,
        credentialString,
        hash(canonicalString, 'hex')
    ] .join('\n');

    request.headers.Authorization = [
        'AWS4-HMAC-SHA256 Credential=' + process.env.AWS_ACCESS_KEY_ID + '/' + credentialString,
        'SignedHeaders=' + signedHeaders,
        'Signature=' + hmac(kSigning, stringToSign, 'hex')
    ].join(', ');

    return request;
}

function hmac(key, str, encoding) {
    return crypto.createHmac('sha256', key).update(str, 'utf8').digest(encoding);
}

function hash(str, encoding) {
    return crypto.createHash('sha256').update(str, 'utf8').digest(encoding);
}

function logFailure(error, failedItems) {
    if (logFailedResponses) {
        console.log('Error: ' + JSON.stringify(error, null, 2));

        if (failedItems && failedItems.length > 0) {
            console.log("Failed Items: " +
                JSON.stringify(failedItems, null, 2));
        }
    }
}

//*********************/
/* NEW UTIL FUNCTIONS */
//*********************/

var publish = co.wrap(function* (metricDatum, namespace) {
    var metricData = metricDatum.map(m => {
      return {
        MetricName : m.MetricName,
        Dimensions : m.Dimensions,
        Timestamp  : m.Timestamp,
        Unit       : m.Unit,
        Value      : m.Value
      };
    });
  
    // cloudwatch only allows 20 metrics per request
    var chunks = _.chunk(metricData, 20);
  
    for (var chunk of chunks) {
      var req = {
        MetricData: chunk,
        Namespace: namespace
      };
    
      yield client.putMetricData(req).promise();
    }  
});

var publishMetrics = co.wrap(function* (metrics) {
    var metricDatumByNamespace = _.groupBy(metrics, m => m.Namespace);
    var namespaces = _.keys(metricDatumByNamespace);
    for (var namespace of namespaces) {
      var datum = metricDatumByNamespace[namespace];
  
      try {
        yield publish(datum, namespace);
      } catch (err) {
        console.error("failed to publish metrics", err.message);
        console.error(JSON.stringify(datum));
      }
    }
});

// 

var calCostForInvocation = function (memorySize, billedDuration) {
    var raw = pricePerGbSecond * (memorySize / 1024) * (billedDuration / 1000);
    return parseFloat(raw.toFixed(9));
}

// logGroup looks like this:
//    "logGroup": "/aws/lambda/service-env-funcName"
var parseFunctionName = function (logGroup) {
    return logGroup.split('/').reverse()[0];
};

// logStream looks like this:
//    "logStream": "2016/08/17/[76]afe5c000d5344c33b5d88be7a4c55816"
var parseLambdaVersion = function(logStream) {
    var start = logStream.indexOf('[');
    var end = logStream.indexOf(']');
    return logStream.substring(start+1, end);
};

var tryParseJson = function (str) {
    try {
        return JSON.parse(str)
    } catch (e) {
        return null;
    }
};

// NOTE: this won't work for some units like Bits/Second, Count/Second, etc.
var toCamelCase = function(str) {
    return str.substr( 0, 1 ).toUpperCase() + str.substr( 1 );
}

var makeMetric = (value, unit, name, dimensions, namespace, timestamp) => {
    return {
        Value: value,
        Unit: toCamelCase(unit),
        MetricName: name,
        Dimensions: dimensions,
        Namespace: namespace,
        Timestamp: timestamp ? new Date(timestamp) : new Date()
    };
}

var parseFloatWith = (regex, input) => {
    var res = regex.exec(input);
    return parseFloat(res[1]);
}