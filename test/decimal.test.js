'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQbDecimal } = require('../src/decimal');

test('US / invariant output', () => {
  assert.equal(parseQbDecimal('12345.67'), 12345.67);
  assert.equal(parseQbDecimal('-250.00'), -250);
  assert.equal(parseQbDecimal('12,345.67'), 12345.67);
});

test('comma-decimal locales (e.g. South Africa, much of Europe)', () => {
  assert.equal(parseQbDecimal('12 345,67'), 12345.67);
  assert.equal(parseQbDecimal('12\u00a0345,67'), 12345.67);   // non-breaking space
  assert.equal(parseQbDecimal('12.345,67'), 12345.67);
  assert.equal(parseQbDecimal('1,5'), 1.5);
  assert.equal(parseQbDecimal('-48 120,75'), -48120.75);
});

test('thousands separators only', () => {
  assert.equal(parseQbDecimal('1,234,567'), 1234567);
  assert.equal(parseQbDecimal("1'234.50"), 1234.5);
});

test('empty and junk become 0, numbers pass through', () => {
  for (const v of [null, undefined, '', '   ', 'abc', '12abc', NaN]) assert.equal(parseQbDecimal(v), 0);
  assert.equal(parseQbDecimal(42.5), 42.5);
});

test('parseFloat really does lose the cents (why this exists)', () => {
  assert.equal(parseFloat('12345,67'), 12345);
  assert.equal(parseFloat('12 345,67'), 12);
});
