const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateLoadSizing, calculateScheduleSizing, calculateMotorDesign,
  calculateLedResistor, calculateTransistorBaseResistor,
  calculateVoltageDivider, calculateRcNetwork, validatePlcProgram, calculatePlcScan
} = require('../core.js');

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

  test('PLC scans evaluate series and parallel branches and latch from the prior output image', () => {
    const program = {
      rungs: [{
        branches: [
          [{ tag: 'I0.0', normallyClosed: false }, { tag: 'I0.1', normallyClosed: false }],
          [{ tag: 'Q0.0', normallyClosed: false }, { tag: 'I0.1', normallyClosed: false }]
        ],
        coil: 'Q0.0'
      }]
    };
    assert.equal(validatePlcProgram(program).valid, true);
    const started = calculatePlcScan(program, { 'I0.0': true, 'I0.1': true }, {});
    assert.equal(started.outputs['Q0.0'], true);
    const held = calculatePlcScan(program, { 'I0.0': false, 'I0.1': true }, started.outputs);
    assert.equal(held.outputs['Q0.0'], true);
    const stopped = calculatePlcScan(program, { 'I0.0': false, 'I0.1': false }, held.outputs);
    assert.equal(stopped.outputs['Q0.0'], false);
  });

  test('PLC scan supports normally-closed contacts and rejects invalid programs or images', () => {
    const program = { rungs: [{ branches: [[{ tag: 'I0.2', normallyClosed: true }]], coil: 'Q0.1' }] };
    assert.equal(calculatePlcScan(program, { 'I0.2': false }, {}).outputs['Q0.1'], true);
    assert.equal(calculatePlcScan(program, { 'I0.2': true }, {}).outputs['Q0.1'], false);
    assert.equal(calculatePlcScan(program, { 'I0.2': 1 }, {}).valid, false);
    assert.equal(validatePlcProgram({ rungs: [
      { branches: [[{ tag: 'I0.0', normallyClosed: false }]], coil: 'Q0.0' },
      { branches: [[{ tag: 'I0.1', normallyClosed: false }]], coil: 'Q0.0' }
    ] }).valid, false);
  });

  test('PLC later rungs read outputs evaluated earlier in the same scan', () => {
    const result = calculatePlcScan({
      rungs: [
        { branches: [[{ tag: 'I0.0', normallyClosed: false }]], coil: 'Q0.0' },
        { branches: [[{ tag: 'Q0.0', normallyClosed: false }]], coil: 'Q0.1' }
      ]
    }, { 'I0.0': true }, {});
    assert.equal(result.outputs['Q0.0'], true);
    assert.equal(result.outputs['Q0.1'], true);
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

test('sizes a three-phase motor feeder from output power and efficiency', () => {
  const result = calculateMotorDesign({
    powerKw: 15, voltage: 400, powerFactor: .85, efficiency: .9,
    startingCurrentMultiple: 6, cableLength: 40, installMethod: 'tray'
  });
  assert.equal(result.valid, true);
  assert.equal(result.current, 28.3);
  assert.equal(result.startingCurrent, 169.81);
  assert.equal(result.cableLength, 40);
  assert.equal(result.withinCapacity, true);
  assert.equal(result.protectionCoordinated, true);
});

test('rejects unsupported motor design inputs and oversized feeder demand', () => {
  const base = {
    powerKw: 15, voltage: 400, powerFactor: .85, efficiency: .9,
    startingCurrentMultiple: 6, cableLength: 40, installMethod: 'tray'
  };
  for (const input of [
    { ...base, voltage: 230 },
    { ...base, powerFactor: 0 },
    { ...base, efficiency: 1.1 },
    { ...base, startingCurrentMultiple: 21 },
    { ...base, powerKw: Number.MAX_VALUE }
  ]) {
    assert.equal(calculateMotorDesign(input).valid, false);
  }
  const unsupported = calculateMotorDesign({
    ...base, powerKw: 1000, startingCurrentMultiple: 20
  });
  assert.equal(unsupported.valid, true);
  assert.equal(unsupported.withinCapacity, false);
});

test('sizes an LED resistor using the next higher E12 value and power margin', () => {
  const result = calculateLedResistor({ supplyVoltage: 5, ledVoltage: 2, targetCurrentMa: 10 });
  assert.equal(result.valid, true);
  assert.equal(result.minimumResistance, 300);
  assert.equal(result.standardResistance, 330);
  assert.equal(result.actualCurrentMa, 9.09);
  assert.equal(result.recommendedPowerRating, .125);
});

test('rejects unsafe or impossible LED resistor inputs', () => {
  for (const input of [
    { supplyVoltage: 5, ledVoltage: 5, targetCurrentMa: 10 },
    { supplyVoltage: 48, ledVoltage: 2, targetCurrentMa: 10 },
    { supplyVoltage: 5, ledVoltage: 2, targetCurrentMa: 0 },
    { supplyVoltage: Number.MAX_VALUE, ledVoltage: 2, targetCurrentMa: 10 }
  ]) assert.equal(calculateLedResistor(input).valid, false);
});

test('sizes a transistor base resistor conservatively from forced beta', () => {
  const result = calculateTransistorBaseResistor({
    controlVoltage: 3.3, baseEmitterVoltage: .7, collectorCurrentMa: 20, forcedBeta: 10
  });
  assert.equal(result.valid, true);
  assert.equal(result.maximumResistance, 1300);
  assert.equal(result.standardResistance, 1200);
  assert.equal(result.actualBaseCurrentMa, 2.167);
  assert.equal(result.availableCollectorCurrentMa, 21.67);
  assert.equal(result.recommendedPowerRating, .125);
});

test('rejects unsafe transistor base-drive inputs', () => {
  for (const input of [
    { controlVoltage: 24, baseEmitterVoltage: 24, collectorCurrentMa: 20, forcedBeta: 10 },
    { controlVoltage: 48, baseEmitterVoltage: .7, collectorCurrentMa: 20, forcedBeta: 10 },
    { controlVoltage: 3.3, baseEmitterVoltage: .7, collectorCurrentMa: 20, forcedBeta: 21 }
  ]) assert.equal(calculateTransistorBaseResistor(input).valid, false);
});

test('calculates an unloaded voltage divider and resistor dissipation', () => {
  const result = calculateVoltageDivider({
    inputVoltage: 12, upperResistance: 10000, lowerResistance: 10000
  });
  assert.equal(result.valid, true);
  assert.equal(result.outputVoltage, 6);
  assert.equal(result.currentMa, .6);
  assert.equal(result.upperPowerMw, 3.6);
  assert.equal(result.unloaded, true);
});

test('rejects out-of-range divider inputs', () => {
  assert.equal(calculateVoltageDivider({
    inputVoltage: 48, upperResistance: 10000, lowerResistance: 10000
  }).valid, false);
});

test('calculates RC time constant, settling estimate, and cutoff frequency', () => {
  const result = calculateRcNetwork({ resistance: 10000, capacitance: .00001 });
  assert.equal(result.valid, true);
  assert.equal(result.timeConstant, .1);
  assert.equal(result.approximateSettlingTime, .5);
  assert.equal(result.cutoffFrequency, 15.915);
});

test('rejects RC values outside supported low-voltage learning ranges', () => {
  assert.equal(calculateRcNetwork({ resistance: 999, capacitance: .00001 }).valid, false);
  assert.equal(calculateRcNetwork({ resistance: 10000, capacitance: Infinity }).valid, false);
});
