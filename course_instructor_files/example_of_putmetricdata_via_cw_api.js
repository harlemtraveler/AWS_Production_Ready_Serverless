var params = {
  MetricData: [ /* required */
    {
      MetricName: 'STRING_VALUE', /* required */
      Counts: [
        'NUMBER_VALUE',
        /* more items */
      ],
      Dimensions: [
        {
          Name: 'STRING_VALUE', /* required */
          Value: 'STRING_VALUE' /* required */
        },
        /* more items */
      ],
      StatisticValues: {
        Maximum: 'NUMBER_VALUE', /* required */
        Minimum: 'NUMBER_VALUE', /* required */
        SampleCount: 'NUMBER_VALUE', /* required */
        Sum: 'NUMBER_VALUE' /* required */
      },
      StorageResolution: 'NUMBER_VALUE',
      Timestamp: new Date || 'Wed Dec 31 1969 16:00:00 GMT-0800 (PST)' || 123456789,
      Unit: Seconds | Microseconds | Milliseconds | Bytes | Kilobytes | Megabytes | Gigabytes | Terabytes | Bits | Kilobits | Megabits | Gigabits | Terabits | Percent | Count | Bytes/Second | Kilobytes/Second | Megabytes/Second | Gigabytes/Second | Terabytes/Second | Bits/Second | Kilobits/Second | Megabits/Second | Gigabits/Second | Terabits/Second | Count/Second | None,
      Value: 'NUMBER_VALUE',
      Values: [
        'NUMBER_VALUE',
        /* more items */
      ]
    },
    /* more items */
  ],
  Namespace: 'STRING_VALUE' /* required */
};
cloudwatch.putMetricData(params, function(err, data) {
  if (err) console.log(err, err.stack); // an error occurred
  else     console.log(data);           // successful response
});