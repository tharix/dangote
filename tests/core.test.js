const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLoadSizing, calculateScheduleSizing } = require('../core.js');

test('selects a derated cable for a single-phase load', () => {
  const result = calculateLoadSizing({
    phase: 1, loadType: 'kw', loadValue: 10, pf: .85, diversity: .8, installMethod: 'conduit'
  });
  assert.equal(result.valid, true);
  assert.equal(result.cable.size, 16);
  assert.equal(result.actualCapacity, 60.8);
  assert.equal(result.current, 40.92);
  assert.equal(result.breakerRating, 50);
  assert.equal(result.protectionCoordinated, true);
});

test('rejects invalid load factors', () => {
  const result = calculateLoadSizing({
    phase: 1, loadType: 'kw', loadValue: 10, pf: 1.2, diversity: .8, installMethod: 'clipped'
  });
  assert.equal(result.valid, false);
});

test('rejects unsupported phase, load type, and installation method', () => {
  for (const input of [
    { phase: 2, loadType: 'kw', installMethod: 'clipped' },
    { phase: 1, loadType: 'watts', installMethod: 'clipped' },
    { phase: 1, loadType: 'kw', installMethod: 'unknown' }
  ]) {
    const result = calculateLoadSizing({
      phase: 1, loadType: 'kw', loadValue: 1, pf: .9, diversity: 1, installMethod: 'clipped',
      ...input
    });
    assert.equal(result.valid, false);
  }
});

test('rejects non-finite input and reports demand above available cable capacity', () => {
  assert.equal(calculateLoadSizing({
    phase: 1, loadType: 'kw', loadValue: Infinity, pf: .9, diversity: 1, installMethod: 'clipped'
  }).valid, false);
  const result = calculateLoadSizing({
    phase: 3, loadType: 'kw', loadValue: 2000, pf: .9, diversity: 1, installMethod: 'clipped'
  });
  assert.equal(result.valid, true);
  assert.equal(result.withinCapacity, false);
});

test('rejects finite load inputs whose derived values overflow', () => {
  const result = calculateLoadSizing({
    phase: 1, loadType: 'kw', loadValue: Number.MAX_VALUE, pf: 1, diversity: 1,
    installMethod: 'clipped'
  });
  assert.equal(result.valid, false);
});

test('accounts for cable length and correction factors', () => {
  const result = calculateLoadSizing({
    phase: 1, loadType: 'kw', loadValue: 10, pf: .85, diversity: .8,
    installMethod: 'conduit', cableLength: 75, ambientFactor: .94, groupingFactor: .8
  });
  assert.equal(result.valid, true);
  assert.equal(result.cable.size, 25);
  assert.equal(result.derating, .6016);
  assert.equal(result.cableLength, 75);
  assert.equal(result.voltageDropPercent > 0, true);
});

test('rejects invalid correction inputs', () => {
  const result = calculateLoadSizing({
    phase: 1, loadType: 'kw', loadValue: 10, pf: .85, diversity: .8,
    installMethod: 'conduit', cableLength: 0, ambientFactor: 1, groupingFactor: .8
  });
  assert.equal(result.valid, false);
});

test('calculates three-phase current using line voltage', () => {
  const result = calculateLoadSizing({
    phase: 3, loadType: 'kw', loadValue: 15, pf: .9, diversity: 1,
    installMethod: 'tray'
  });
  assert.equal(result.valid, true);
  assert.equal(result.voltage, 400);
  assert.equal(result.current, 24.06);
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

test('estimates three-phase balance and neutral current', () => {
  const result = calculateScheduleSizing({
    phase: 3, method: 'clipped', rcd: 'recommended',
    rows: [
      { load: 3, quantity: 1, pf: 1, diversity: 1, phase: 'phase-a' },
      { load: 2, quantity: 1, pf: 1, diversity: 1, phase: 'phase-b' },
      { load: 1, quantity: 1, pf: 1, diversity: 1, phase: 'phase-c' }
    ]
  });
  assert.equal(result.valid, true);
  assert.equal(result.phaseLoads['phase-a'], 3);
  assert.equal(result.phaseLoads['phase-c'], 1);
  assert.equal(result.neutralCurrent > 0, true);
  assert.equal(result.balancePercent > 0, true);
});

test('reports near-zero neutral current for balanced phases', () => {
  const result = calculateScheduleSizing({
    phase: 3, method: 'clipped', rcd: 'recommended',
    rows: [
      { load: 3, quantity: 1, pf: 1, diversity: 1, phase: 'phase-a' },
      { load: 3, quantity: 1, pf: 1, diversity: 1, phase: 'phase-b' },
      { load: 3, quantity: 1, pf: 1, diversity: 1, phase: 'phase-c' }
    ]
  });
  assert.equal(result.valid, true);
  assert.equal(result.balancePercent, 0);
  assert.equal(result.neutralCurrent, 0);
});

test('rejects unsupported phase assignment', () => {
  const result = calculateScheduleSizing({
    phase: 3, method: 'clipped', rcd: 'recommended',
    rows: [{ load: 1, quantity: 1, pf: .9, diversity: 1, phase: 'neutral' }]
  });
  assert.equal(result.valid, false);
});

test('rejects empty or malformed schedules', () => {
  assert.equal(calculateScheduleSizing({
    phase: 1, method: 'clipped', rcd: 'recommended', rows: []
  }).valid, false);
  assert.equal(calculateScheduleSizing({
    phase: 1, method: 'clipped', rcd: 'recommended',
    rows: [{ load: NaN, quantity: 1, pf: .9, diversity: 1 }]
  }).valid, false);
});

test('rejects schedules whose aggregate demand overflows', () => {
  const result = calculateScheduleSizing({
    phase: 1, method: 'clipped', rcd: 'recommended',
    rows: [{ load: Number.MAX_VALUE, quantity: 1, pf: .01, diversity: 1 }]
  });
  assert.equal(result.valid, false);
});
