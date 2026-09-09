(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DangoteAcademyCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const cableOptions = [
    { size: 1.5, capacity: 17.5, breaker: 10, drop: 18 },
    { size: 2.5, capacity: 24, breaker: 20, drop: 18 },
    { size: 4, capacity: 32, breaker: 32, drop: 7 },
    { size: 6, capacity: 41, breaker: 40, drop: 7 },
    { size: 10, capacity: 57, breaker: 50, drop: 2.8 },
    { size: 16, capacity: 76, breaker: 63, drop: 2.8 },
    { size: 25, capacity: 101, breaker: 80, drop: 1.5 },
    { size: 35, capacity: 125, breaker: 100, drop: 1.5 },
    { size: 50, capacity: 151, breaker: 125, drop: 1.5 }
  ];

  const deratingFactors = { clipped: 1, conduit: .8, tray: .9, ground: .7 };

  function calculateLoadSizing({ phase, loadType, loadValue, pf, diversity, installMethod }) {
    if (!Number.isFinite(loadValue) || loadValue <= 0 || pf <= 0 || pf > 1 || diversity <= 0 || diversity > 1) {
      return { valid: false, error: 'Enter valid load, power factor, and diversity values.' };
    }
    const voltage = phase === 1 ? 230 : 400;
    const powerWatts = loadType === 'kw'
      ? loadValue * 1000
      : loadType === 'hp'
        ? loadValue * 746
        : loadValue * voltage * pf * (phase === 3 ? Math.sqrt(3) : 1);
    const diversifiedPower = powerWatts * diversity;
    const current = loadType === 'amps'
      ? loadValue * diversity
      : diversifiedPower / (phase === 1 ? voltage * pf : Math.sqrt(3) * voltage * pf);
    const derating = deratingFactors[installMethod];
    const cable = cableOptions.find(item => item.capacity >= current / derating) || cableOptions.at(-1);
    const voltageDrop = Math.round(cable.drop * current * 50 / 1000 * 100) / 100;
    return {
      valid: true,
      current: Math.round(current * 100) / 100,
      cable,
      voltageDrop,
      actualCapacity: Math.round(cable.capacity * derating * 10) / 10,
      methodLabel: { clipped: 'Clipped direct', conduit: 'In conduit', tray: 'Cable tray', ground: 'Direct ground' }[installMethod],
      voltage
    };
  }

  function calculateScheduleSizing({ rows, phase, method, rcd }) {
    let connected = 0;
    let demand = 0;
    let apparentDemand = 0;
    for (const row of rows) {
      if (row.load < 0 || row.quantity < 1 || row.pf <= 0 || row.pf > 1 || row.diversity <= 0 || row.diversity > 1) {
        return { valid: false, error: 'Check load schedule values and power factors.' };
      }
      connected += row.load * row.quantity;
      demand += row.load * row.quantity * row.diversity;
      apparentDemand += row.load * row.quantity * row.diversity / Math.max(row.pf, .01);
    }
    if (!Number.isFinite(connected)) return { valid: false, error: 'Check load schedule values and power factors.' };
    const voltage = phase === 3 ? 400 : 230;
    const current = apparentDemand * 1000 / (phase === 3 ? Math.sqrt(3) * voltage : voltage);
    const derating = deratingFactors[method];
    const cable = cableOptions.find(option => option.capacity * derating >= current) || cableOptions.at(-1);
    const coordinationOk = cable.breaker >= current && cable.breaker <= cable.capacity * derating;
    return {
      valid: true,
      connected,
      demand,
      current,
      cable,
      deratedCapacity: cable.capacity * derating,
      coordinationOk,
      rcdRecommended: rcd === 'recommended',
      needsReview: current > 125 || !coordinationOk || cable === cableOptions.at(-1)
    };
  }

  return { calculateLoadSizing, calculateScheduleSizing };
}));
