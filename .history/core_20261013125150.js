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
  const breakerOptions = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
  const round = (value, digits = 2) => Number(value.toFixed(digits));

  function chooseCable(current, derating) {
    const candidates = cableOptions.map(cable => {
      const adjustedCapacity = cable.capacity * derating;
      const breakerRating = breakerOptions.find(rating => rating >= current && rating <= adjustedCapacity);
      return { cable, adjustedCapacity, breakerRating };
    });
    return candidates.find(candidate => candidate.adjustedCapacity >= current && candidate.breakerRating) ||
      candidates.find(candidate => candidate.adjustedCapacity >= current) ||
      candidates[candidates.length - 1];
  }

  function calculateLoadSizing(input = {}) {
    const {
      phase, loadType, loadValue, pf, diversity, installMethod,
      cableLength = 50, ambientFactor = 1, groupingFactor = 1
    } = input || {};
    if (![1, 3].includes(phase) || !['kw', 'hp', 'amps'].includes(loadType) ||
      !['clipped', 'conduit', 'tray', 'ground'].includes(installMethod) ||
      !Number.isFinite(loadValue) || loadValue <= 0 || !Number.isFinite(pf) || pf <= 0 || pf > 1 ||
      !Number.isFinite(diversity) || diversity <= 0 || diversity > 1 ||
      !Number.isFinite(cableLength) || cableLength <= 0 ||
      !Number.isFinite(ambientFactor) || ambientFactor <= 0 || ambientFactor > 1 ||
      !Number.isFinite(groupingFactor) || groupingFactor <= 0 || groupingFactor > 1) {
      return { valid: false, error: 'Enter a supported phase, load type, installation method, and valid load factors.' };
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
    if (!Number.isFinite(current) || !Number.isFinite(derating)) {
      return { valid: false, error: 'The calculated load exceeds the supported numeric range.' };
    }
    const selection = chooseCable(current, derating);
    const { cable, breakerRating } = selection;
    const actualCapacity = round(selection.adjustedCapacity, 1);
    const voltageDrop = round(cable.drop * current * cableLength / 1000);
    if (!Number.isFinite(voltageDrop)) {
      return { valid: false, error: 'The calculated voltage drop exceeds the supported numeric range.' };
    }
    return {
      valid: true,
      current: round(current),
      cable,
      breakerRating,
      voltageDrop,
      actualCapacity,
      withinCapacity: current <= selection.adjustedCapacity,
      protectionCoordinated: Boolean(breakerRating),
      methodLabel: { clipped: 'Clipped direct', conduit: 'In conduit', tray: 'Cable tray', ground: 'Direct ground' }[installMethod],
      derating,
      cableLength,
      voltageDropPercent: voltageDrop / voltage * 100,
      voltage
    };
  }

  function calculateScheduleSizing(input = {}) {
    const { rows, phase, method, rcd } = input || {};
    if (![1, 3].includes(phase) || !Object.hasOwn(deratingFactors, method) ||
      !['recommended', 'not-required'].includes(rcd) || !Array.isArray(rows) || rows.length === 0) {
      return { valid: false, error: 'Choose supported schedule options and add at least one load.' };
    }
    let connected = 0;
    let demand = 0;
    let apparentDemand = 0;
    const phaseLoads = { 'phase-a': 0, 'phase-b': 0, 'phase-c': 0 };
    const phaseApparentLoads = { 'phase-a': 0, 'phase-b': 0, 'phase-c': 0 };
    for (const row of rows) {
      if (!row || !Number.isFinite(row.load) || row.load <= 0 ||
        !Number.isFinite(row.quantity) || row.quantity < 1 || !Number.isInteger(row.quantity) ||
        !Number.isFinite(row.pf) || !Number.isFinite(row.diversity)) {
        return { valid: false, error: 'Check load schedule values and power factors.' };
      }
      const assignedPhase = row.phase || 'phase-a';
      if (row.pf <= 0 || row.pf > 1 || row.diversity <= 0 || row.diversity > 1 ||
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
      if (![connected, demand, apparentDemand, phaseLoads[assignedPhase], phaseApparentLoads[assignedPhase]].every(Number.isFinite)) {
        return { valid: false, error: 'The load schedule exceeds the supported numeric range.' };
      }
    }
    const voltage = phase === 3 ? 400 : 230;
    const current = apparentDemand * 1000 / (phase === 3 ? Math.sqrt(3) * voltage : voltage);
    const derating = deratingFactors[method];
    if (!Number.isFinite(current)) return { valid: false, error: 'The calculated schedule current exceeds the supported numeric range.' };
    const selection = chooseCable(current, derating);
    const { cable, breakerRating } = selection;
    const withinCapacity = current <= selection.adjustedCapacity;
    const coordinationOk = withinCapacity && Boolean(breakerRating);
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
      breakerRating,
      deratedCapacity: selection.adjustedCapacity,
      withinCapacity,
      coordinationOk,
      rcdRecommended: rcd === 'recommended',
      needsReview: current > 125 || !coordinationOk || cable === cableOptions.at(-1) || balancePercent > 20 || phaseWarnings.length > 0,
      phaseLoads,
      phaseCurrents,
      neutralCurrent: round(neutralCurrent),
      balancePercent: round(balancePercent),
      phaseWarnings
    };
  }

  function calculateMotorDesign(input = {}) {
    const {
      powerKw, voltage = 400, powerFactor, efficiency, startingCurrentMultiple,
      cableLength = 50, installMethod, ambientFactor = 1, groupingFactor = 1
    } = input || {};
    if (!Number.isFinite(powerKw) || powerKw <= 0 || powerKw > 1000 ||
      ![380, 400, 415].includes(voltage) ||
      !Number.isFinite(powerFactor) || powerFactor <= 0 || powerFactor > 1 ||
      !Number.isFinite(efficiency) || efficiency <= 0 || efficiency > 1 ||
      !Number.isFinite(startingCurrentMultiple) || startingCurrentMultiple < 1 || startingCurrentMultiple > 20) {
      return { valid: false, error: 'Enter a supported motor rating, supply voltage, power factor, efficiency, and starting-current multiplier.' };
    }
    const current = powerKw * 1000 / (Math.sqrt(3) * voltage * powerFactor * efficiency);
    const startingCurrent = current * startingCurrentMultiple;
    if (!Number.isFinite(current) || !Number.isFinite(startingCurrent)) {
      return { valid: false, error: 'The calculated motor current exceeds the supported numeric range.' };
    }
    const cable = calculateLoadSizing({
      phase: 3,
      loadType: 'amps',
      loadValue: current,
      pf: 1,
      diversity: 1,
      installMethod,
      cableLength,
      ambientFactor,
      groupingFactor
    });
    if (!cable.valid) return cable;
    return {
      valid: true,
      powerKw,
      voltage,
      powerFactor,
      efficiency,
      current: round(current),
      startingCurrentMultiple,
      startingCurrent: round(startingCurrent),
      cable: cable.cable,
      breakerRating: cable.breakerRating,
      actualCapacity: cable.actualCapacity,
      withinCapacity: cable.withinCapacity,
      protectionCoordinated: cable.protectionCoordinated,
      voltageDrop: cable.voltageDrop,
      voltageDropPercent: cable.voltageDropPercent,
      cableLength,
      methodLabel: cable.methodLabel,
      derating: cable.derating
    };
  }

  function calculateLedResistor(input = {}) {
    const { supplyVoltage, ledVoltage, targetCurrentMa } = input || {};
    if (!Number.isFinite(supplyVoltage) || supplyVoltage <= 0 || supplyVoltage > 24 ||
      !Number.isFinite(ledVoltage) || ledVoltage <= 0 || ledVoltage > 5 ||
      ledVoltage >= supplyVoltage ||
      !Number.isFinite(targetCurrentMa) || targetCurrentMa < 1 || targetCurrentMa > 30) {
      return { valid: false, error: 'Use a 1–24 V supply, an LED drop below the supply and no greater than 5 V, and a target current of 1–30 mA.' };
    }
    const currentAmps = targetCurrentMa / 1000;
    const voltageAcrossResistor = supplyVoltage - ledVoltage;
    const minimumResistance = voltageAcrossResistor / currentAmps;
    const e12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
    let standardResistance = null;
    for (let decade = 1; decade <= 1e6 && standardResistance === null; decade *= 10) {
      standardResistance = e12.map(value => value * decade).find(value => value >= minimumResistance) || null;
    }
    if (!Number.isFinite(minimumResistance) || !standardResistance) {
      return { valid: false, error: 'The required resistor is outside the supported range.' };
    }
    const actualCurrentMa = voltageAcrossResistor / standardResistance * 1000;
    const resistorPower = voltageAcrossResistor ** 2 / standardResistance;
    const powerRating = [.125, .25, .5, 1, 2].find(rating => rating >= resistorPower * 2);
    if (![actualCurrentMa, resistorPower].every(Number.isFinite) || !powerRating) {
      return { valid: false, error: 'The calculated resistor dissipation exceeds the supported range.' };
    }
    return {
      valid: true,
      minimumResistance: round(minimumResistance, 1),
      standardResistance,
      actualCurrentMa: round(actualCurrentMa, 2),
      resistorPower: round(resistorPower, 4),
      recommendedPowerRating: powerRating
    };
  }

  function calculateVoltageDivider(input = {}) {
    const { inputVoltage, upperResistance, lowerResistance } = input || {};
    if (!Number.isFinite(inputVoltage) || inputVoltage <= 0 || inputVoltage > 24 ||
      !Number.isFinite(upperResistance) || upperResistance < 100 || upperResistance > 1e6 ||
      !Number.isFinite(lowerResistance) || lowerResistance < 100 || lowerResistance > 1e6) {
      return { valid: false, error: 'Use a 1–24 V input and resistor values from 100 Ω to 1 MΩ.' };
    }
    const totalResistance = upperResistance + lowerResistance;
    const outputVoltage = inputVoltage * lowerResistance / totalResistance;
    const currentMa = inputVoltage / totalResistance * 1000;
    const upperPower = (inputVoltage - outputVoltage) ** 2 / upperResistance;
    const lowerPower = outputVoltage ** 2 / lowerResistance;
    if (![outputVoltage, currentMa, upperPower, lowerPower].every(Number.isFinite)) {
      return { valid: false, error: 'The divider result exceeds the supported numeric range.' };
    }
    return {
      valid: true,
      outputVoltage: round(outputVoltage, 3),
      currentMa: round(currentMa, 3),
      upperPowerMw: round(upperPower * 1000, 3),
      lowerPowerMw: round(lowerPower * 1000, 3),
      unloaded: true
    };
  }

  function calculateRcNetwork(input = {}) {
    const { resistance, capacitance } = input || {};
    if (!Number.isFinite(resistance) || resistance < 1000 || resistance > 1e6 ||
      !Number.isFinite(capacitance) || capacitance < 1e-9 || capacitance > 1e-3) {
      return { valid: false, error: 'Use resistance from 1 kΩ to 1 MΩ and capacitance from 1 nF to 1000 µF.' };
    }
    const timeConstant = resistance * capacitance;
    const cutoffFrequency = 1 / (2 * Math.PI * (timeConstant / 10));
    if (![timeConstant, cutoffFrequency].every(Number.isFinite)) {
      return { valid: false, error: 'The RC result exceeds the supported numeric range.' };
    }
    return {
      valid: true,
      timeConstant: round(timeConstant, 6),
      approximateSettlingTime: round(timeConstant * 5, 6),
      cutoffFrequency: round(cutoffFrequency, 3)
    };
  }

  return {
    calculateLoadSizing, calculateScheduleSizing, calculateMotorDesign,
    calculateLedResistor, calculateVoltageDivider, calculateRcNetwork
  };
}));
