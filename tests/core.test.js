const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLoadSizing, calculateScheduleSizing } = require('../core.js');

test('selects a derated cable for a single-phase load', () => {
  const result = calculateLoadSizing({
    phase: 1, loadType: 'kw', loadValue: 10, pf: .85, diversity: .8, installMethod: 'conduit'
  });
  assert.equal(result.valid, true);
  assert.equal(result.cable.size, 10);
  assert.equal(result.actualCapacity, 45.6);
  assert.equal(result.current, 40.92);
});

test('rejects invalid load factors', () => {
  const result = calculateLoadSizing({
    phase: 1, loadType: 'kw', loadValue: 10, pf: 1.2, diversity: .8, installMethod: 'clipped'
  });
  assert.equal(result.valid, false);
});

test('calculates diversified schedule demand', () => {
  const result = calculateScheduleSizing({
    phase: 1, method: 'clipped', rcd: 'recommended',
    rows: [
      { load: 1.2, quantity: 1, pf: .95, diversity: .8 },
      { load: 3, quantity: 1, pf: .9, diversity: .6 }
    ]
  });
  assert.equal(result.valid, true);
  assert.equal(result.connected, 4.2);
  assert.equal(result.demand, 2.76);
  assert.equal(result.rcdRecommended, true);
});
