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

  function calculateLoadSizing({ phase, loadType, loadValue, pf, diversity, installMethod, cableLength = 50, ambientFactor = 1, groupingFactor = 1 }) {
    if (!Number.isFinite(loadValue) || loadValue <= 0 || pf <= 0 || pf > 1 || diversity <= 0 || diversity > 1 ||
      !Number.isFinite(cableLength) || cableLength <= 0 || ambientFactor <= 0 || ambientFactor > 1 || groupingFactor <= 0 || groupingFactor > 1) {
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
    const derating = deratingFactors[installMethod] * ambientFactor * groupingFactor;
    const cable = cableOptions.find(item => item.capacity >= current / derating) || cableOptions.at(-1);
    const voltageDrop = Math.round(cable.drop * current * cableLength / 1000 * 100) / 100;
    return {
      valid: true,
      current: Math.round(current * 100) / 100,
      cable,
      voltageDrop,
      actualCapacity: Math.round(cable.capacity * derating * 10) / 10,
      methodLabel: { clipped: 'Clipped direct', conduit: 'In conduit', tray: 'Cable tray', ground: 'Direct ground' }[installMethod],
      derating,
      cableLength,
      voltageDropPercent: voltageDrop / voltage * 100,
      voltage
    };
  }

  function calculateScheduleSizing({ rows, phase, method, rcd }) {
    let connected = 0;
    let demand = 0;
    let apparentDemand = 0;
    const phaseLoads = { 'phase-a': 0, 'phase-b': 0, 'phase-c': 0 };
    const phaseApparentLoads = { 'phase-a': 0, 'phase-b': 0, 'phase-c': 0 };
    for (const row of rows) {
      const assignedPhase = row.phase || 'phase-a';
      if (row.load < 0 || row.quantity < 1 || row.pf <= 0 || row.pf > 1 || row.diversity <= 0 || row.diversity > 1 ||
        (phase === 3 && !Object.hasOwn(phaseLoads, assignedPhase))) {
        return { valid: false, error: 'Check load schedule values and power factors.' };
      }
      connected += row.load * row.quantity;
      const rowDemand = row.load * row.quantity * row.diversity;
      const rowApparentDemand = rowDemand / Math.max(row.pf, .01);
      demand += rowDemand;
      apparentDemand += rowApparentDemand;
      phaseLoads[assignedPhase] += rowDemand;
      phaseApparentLoads[assignedPhase] += rowApparentDemand;
    }
    if (!Number.isFinite(connected)) return { valid: false, error: 'Check load schedule values and power factors.' };
    const voltage = phase === 3 ? 400 : 230;
    const current = apparentDemand * 1000 / (phase === 3 ? Math.sqrt(3) * voltage : voltage);
    const derating = deratingFactors[method];
    const cable = cableOptions.find(option => option.capacity * derating >= current) || cableOptions.at(-1);
    const coordinationOk = cable.breaker >= current && cable.breaker <= cable.capacity * derating;
    const phaseCurrents = Object.fromEntries(Object.entries(phaseApparentLoads).map(([name, load]) => [name, load * 1000 / 230]));
    const activePhaseCurrents = phase === 3 ? Object.values(phaseCurrents) : [current];
    const highestPhaseCurrent = Math.max(...activePhaseCurrents);
    const lowestPhaseCurrent = Math.min(...activePhaseCurrents);
    const averagePhaseCurrent = activePhaseCurrents.reduce((sum, value) => sum + value, 0) / activePhaseCurrents.length;
    const balancePercent = averagePhaseCurrent ? (highestPhaseCurrent - lowestPhaseCurrent) / averagePhaseCurrent * 100 : 0;
    const neutralCurrent = phase === 3
      ? Math.sqrt(
        Math.pow(phaseCurrents['phase-a'] - .5 * phaseCurrents['phase-b'] - .5 * phaseCurrents['phase-c'], 2) +
        Math.pow(Math.sqrt(3) / 2 * (phaseCurrents['phase-b'] - phaseCurrents['phase-c']), 2)
      )
      : 0;
    const phaseWarnings = phase === 3
      ? Object.entries(phaseCurrents).filter(([, value]) => value > cable.capacity * derating).map(([name]) => `${name} exceeds adjusted cable capacity`)
      : [];
    return {
      valid: true,
      connected,
      demand,
      current,
      cable,
      deratedCapacity: cable.capacity * derating,
      coordinationOk,
      rcdRecommended: rcd === 'recommended',
      needsReview: current > 125 || !coordinationOk || cable === cableOptions.at(-1) || balancePercent > 20 || phaseWarnings.length > 0,
      phaseLoads,
      phaseCurrents,
      neutralCurrent: Math.round(neutralCurrent * 100) / 100,
      balancePercent: Math.round(balancePercent * 100) / 100,
      phaseWarnings
    };
  }

  return { calculateLoadSizing, calculateScheduleSizing };
}));
