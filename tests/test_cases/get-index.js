'use strict';

const co = require('co');
const expect = require('chai').expect;
const when = require('../steps/when');
const init = require('../steps/init').init;
const cheerio = require('cheerio');


describe(`When we invoke the GET / endpoint`, co.wrap(function* () {
  // Call the "init" function first to test initializations:
  before(co.wrap(function* () {
    yield init();
  }));

  // Test - "get-index":
  it(`Should return the index page with 8 restaurants`, co.wrap(function* () {
    let res = yield when.we_invoke_get_index();

    expect(res.statusCode).to.equal(200);
    expect(res.headers['content-type']).to.equal('text/html; charset=UTF-8'); // Changed "UTF-8" to "utf-8"
    expect(res.body).to.not.be.null;

    console.log(res.body);

    let $ = cheerio.load(res.body);
    let restaurants = $('.restaurant', '#restaurantsUl'); // "restaurantsUl" = restaurants unsorted list
    expect(restaurants.length).to.equal(8);

  }));

}));