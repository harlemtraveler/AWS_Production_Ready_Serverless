'use strict';

const co = require('co');
const expect = require('chai').expect;

// First test case:
describe(`When we invoke the GET / endpoint`, co.wrap(function* () {
  it(`Should return the index page with 8 restaurants`, co.wrap(function* () {
    let res = yield when.we_invoke_get_index();

    expect(res.statusCode).to.equal(200);
    expect(res.headers['Content-Type']).to.equal('text/html; charset=UTF-8');
    expect(res.body).to.not.be.null;
    
  }));
}));