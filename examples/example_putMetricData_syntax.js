// Test Var Shape

const customMetricParams = {
    MetricData: [getTimeMetricData()],
    Namespace: ""
};

cloudwatch.putMetricData(customMetricParams, function(err, data) {
    if (err) {
        console.log(err, err.stack);
    } else {
        console.log(data);
    }
});