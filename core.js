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
  const digitalInputs = new Set(Array.from({ length: 6 }, (_, index) => `I0.${index}`));
  const digitalOutputs = new Set(Array.from({ length: 3 }, (_, index) => `Q0.${index}`));
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

  function calculateTransistorBaseResistor(input = {}) {
    const { controlVoltage, baseEmitterVoltage, collectorCurrentMa, forcedBeta } = input || {};
    if (!Number.isFinite(controlVoltage) || controlVoltage < 1 || controlVoltage > 24 ||
      !Number.isFinite(baseEmitterVoltage) || baseEmitterVoltage < .5 || baseEmitterVoltage > 1.2 ||
      baseEmitterVoltage >= controlVoltage ||
      !Number.isFinite(collectorCurrentMa) || collectorCurrentMa < .1 || collectorCurrentMa > 1000 ||
      !Number.isFinite(forcedBeta) || forcedBeta < 5 || forcedBeta > 20) {
      return { valid: false, error: 'Use a 1–24 V control supply above the 0.5–1.2 V base-emitter drop, 0.1–1000 mA collector current, and forced beta from 5 to 20.' };
    }
    const requiredBaseCurrentMa = collectorCurrentMa / forcedBeta;
    const maximumResistance = (controlVoltage - baseEmitterVoltage) / (requiredBaseCurrentMa / 1000);
    const e12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
    let standardResistance = null;
    for (let decade = 1; decade <= 1e6; decade *= 10) {
      const candidates = e12.map(value => value * decade).filter(value => value <= maximumResistance);
      if (!candidates.length) break;
      standardResistance = candidates.at(-1);
    }
    if (!Number.isFinite(maximumResistance) || !standardResistance) {
      return { valid: false, error: 'The required base resistor is outside the supported range.' };
    }
    const actualBaseCurrentMa = (controlVoltage - baseEmitterVoltage) / standardResistance * 1000;
    const availableCollectorCurrentMa = actualBaseCurrentMa * forcedBeta;
    const resistorPower = (controlVoltage - baseEmitterVoltage) ** 2 / standardResistance;
    const powerRating = [.125, .25, .5, 1, 2].find(rating => rating >= resistorPower * 2);
    if (![actualBaseCurrentMa, availableCollectorCurrentMa, resistorPower].every(Number.isFinite) || !powerRating) {
      return { valid: false, error: 'The calculated base-drive resistor dissipation exceeds the supported range.' };
    }
    return {
      valid: true,
      maximumResistance: round(maximumResistance, 1),
      standardResistance,
      requiredBaseCurrentMa: round(requiredBaseCurrentMa, 3),
      actualBaseCurrentMa: round(actualBaseCurrentMa, 3),
      availableCollectorCurrentMa: round(availableCollectorCurrentMa, 2),
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

  function validatePlcProgram(program) {
    if (!program || !Array.isArray(program.rungs) || program.rungs.length < 1 || program.rungs.length > 8) {
      return { valid: false, error: 'A PLC program must contain between 1 and 8 rungs.' };
    }
    const coils = new Set();
    const timerTags = new Set();
    const counterTags = new Set();
    const analogOutputs = new Set();
    for (const rung of program.rungs) {
      if (!rung || !Array.isArray(rung.branches) || rung.branches.length < 1 || rung.branches.length > 4 ||
        typeof rung.coil !== 'string' || !digitalOutputs.has(rung.coil)) {
        return { valid: false, error: 'Each rung needs 1–4 branches and one valid output coil.' };
      }
      if (coils.has(rung.coil)) return { valid: false, error: `Output ${rung.coil} is assigned to more than one rung.` };
      coils.add(rung.coil);
      if (rung.timer && rung.counter) {
        return { valid: false, error: 'A rung can contain one timer or one counter, not both.' };
      }
      if (rung.timer) {
        if (!/^T\d{1,2}$/.test(rung.timer.tag) || !Number.isInteger(rung.timer.presetScans) ||
          rung.timer.presetScans < 1 || rung.timer.presetScans > 120 || timerTags.has(rung.timer.tag)) {
          return { valid: false, error: 'Timer tags must be unique and presets must be 1–120 scans.' };
        }
        timerTags.add(rung.timer.tag);
      }
      if (rung.counter) {
        if (!/^C\d{1,2}$/.test(rung.counter.tag) || !Number.isInteger(rung.counter.preset) ||
          rung.counter.preset < 1 || rung.counter.preset > 999 ||
          !digitalInputs.has(rung.counter.resetTag) || counterTags.has(rung.counter.tag)) {
          return { valid: false, error: 'Counter tags must be unique, presets 1–999, and reset from a digital input.' };
        }
        counterTags.add(rung.counter.tag);
      }
      if (rung.analogOutput) {
        if (rung.analogOutput.tag !== 'AQ0' || !Number.isFinite(rung.analogOutput.value) ||
          rung.analogOutput.value < 0 || rung.analogOutput.value > 100 || analogOutputs.has(rung.analogOutput.tag)) {
          return { valid: false, error: 'Analog output must be uniquely assigned AQ0 with a 0–100% setpoint.' };
        }
        analogOutputs.add(rung.analogOutput.tag);
      }
      for (const branch of rung.branches) {
        if (!Array.isArray(branch) || branch.length < 1 || branch.length > 6) {
          return { valid: false, error: 'Each ladder branch needs between 1 and 6 contacts.' };
        }
        for (const contact of branch) {
          if (!contact || typeof contact.tag !== 'string' ||
            !(digitalInputs.has(contact.tag) || digitalOutputs.has(contact.tag) || ['AI0', 'AI1'].includes(contact.tag) ||
              /^T\d{1,2}\.DN$/.test(contact.tag) || /^C\d{1,2}\.DN$/.test(contact.tag)) ||
            typeof contact.normallyClosed !== 'boolean') {
            return { valid: false, error: 'Contacts need a valid I/O tag and contact type.' };
          }
          if (contact.tag.startsWith('AI') && (!['gte', 'lte'].includes(contact.analogOperator) ||
            !Number.isFinite(contact.threshold) || contact.threshold < 0 || contact.threshold > 100)) {
            return { valid: false, error: 'Analog compare contacts need a >= or <= threshold from 0–100%.' };
          }
          if (contact.tag.startsWith('T') && !/^T\d{1,2}\.DN$/.test(contact.tag)) {
            return { valid: false, error: 'Timer contacts must use a .DN done bit.' };
          }
          if (contact.tag.startsWith('C') && !/^C\d{1,2}\.DN$/.test(contact.tag)) {
            return { valid: false, error: 'Counter contacts must use a .DN done bit.' };
          }
        }
      }
    }
    const validContacts = new Set([
      ...Array.from({ length: 100 }, (_, index) => `T${index}.DN`),
      ...Array.from({ length: 100 }, (_, index) => `C${index}.DN`)
    ]);
    const configuredTimers = new Set(program.rungs.filter(rung => rung.timer).map(rung => `${rung.timer.tag}.DN`));
    const configuredCounters = new Set(program.rungs.filter(rung => rung.counter).map(rung => `${rung.counter.tag}.DN`));
    for (const rung of program.rungs) for (const branch of rung.branches) for (const contact of branch) {
      if (validContacts.has(contact.tag) &&
        !configuredTimers.has(contact.tag) && !configuredCounters.has(contact.tag)) {
        return { valid: false, error: `Contact ${contact.tag} has no matching timer or counter instruction.` };
      }
    }
    return { valid: true };
  }

  function calculatePlcScan(program, inputImage = {}, previousOutputs = {}, runtimeState = {}, analogInputs = {}) {
    const validation = validatePlcProgram(program);
    if (!validation.valid) return validation;
    if (!inputImage || typeof inputImage !== 'object' || Array.isArray(inputImage) ||
      !previousOutputs || typeof previousOutputs !== 'object' || Array.isArray(previousOutputs) ||
      !runtimeState || typeof runtimeState !== 'object' || Array.isArray(runtimeState) ||
      !analogInputs || typeof analogInputs !== 'object' || Array.isArray(analogInputs)) {
      return { valid: false, error: 'PLC I/O images and runtime state must be objects.' };
    }
    if ([inputImage, previousOutputs].some(image =>
      Object.values(image).some(value => typeof value !== 'boolean'))) {
      return { valid: false, error: 'PLC input and output image values must be boolean.' };
    }
    if (Object.keys(inputImage).some(tag => !digitalInputs.has(tag)) ||
      Object.keys(previousOutputs).some(tag => !digitalOutputs.has(tag))) {
      return { valid: false, error: 'PLC digital I/O image contains an unsupported tag.' };
    }
    if (Object.entries(analogInputs).some(([tag, value]) =>
      !/^AI\d{1,2}$/.test(tag) || !Number.isFinite(value) || value < 0 || value > 100)) {
      return { valid: false, error: 'Analog input values must be tagged AI points from 0–100%.' };
    }
    if (runtimeState.timers && (typeof runtimeState.timers !== 'object' || Array.isArray(runtimeState.timers)) ||
      runtimeState.counters && (typeof runtimeState.counters !== 'object' || Array.isArray(runtimeState.counters))) {
      return { valid: false, error: 'PLC timer and counter state must be tag/value objects.' };
    }
    const timers = { ...(runtimeState.timers || {}) };
    const counters = { ...(runtimeState.counters || {}) };
    const analogOutputs = {};

    const outputs = { ...previousOutputs };
    const readContact = contact => {
      let signal;
      if (contact.tag.startsWith('I')) signal = inputImage[contact.tag] === true;
      else if (contact.tag.startsWith('Q')) signal = outputs[contact.tag] === true;
      else if (contact.tag.startsWith('AI')) {
        const value = analogInputs[contact.tag] || 0;
        signal = contact.analogOperator === 'gte' ? value >= contact.threshold : value <= contact.threshold;
      } else if (contact.tag.startsWith('T')) signal = timers[contact.tag.slice(0, -3)]?.done === true;
      else signal = (counters[contact.tag.slice(0, -3)]?.count || 0) >=
        (program.rungs.find(rung => rung.counter?.tag === contact.tag.slice(0, -3))?.counter.preset || Infinity);
      return contact.normallyClosed ? !signal : signal;
    };
    const rungStates = program.rungs.map(rung => {
      const branchResults = rung.branches.map(branch => ({
        energised: branch.every(readContact),
        contacts: branch.map(contact => ({
          tag: contact.tag,
          closed: readContact(contact),
          normallyClosed: contact.normallyClosed,
          ...(contact.tag.startsWith('AI')
            ? { value: analogInputs[contact.tag] || 0, operator: contact.analogOperator, threshold: contact.threshold }
            : {})
        }))
      }));
      const branches = branchResults.map(branch => branch.energised);
      const energised = branches.some(Boolean);
      outputs[rung.coil] = energised;
      let instruction = null;
      if (rung.timer) {
        const current = timers[rung.timer.tag] || { elapsedScans: 0, done: false };
        const priorScans = Number.isInteger(current.elapsedScans) && current.elapsedScans >= 0
          ? current.elapsedScans
          : 0;
        const elapsedScans = energised ? Math.min(rung.timer.presetScans, priorScans + 1) : 0;
        const done = elapsedScans >= rung.timer.presetScans;
        timers[rung.timer.tag] = { elapsedScans, done };
        instruction = { type: 'TON', tag: rung.timer.tag, elapsedScans, presetScans: rung.timer.presetScans, done };
      }
      if (rung.counter) {
        const current = counters[rung.counter.tag] || { count: 0, previousRung: false };
        const reset = inputImage[rung.counter.resetTag] === true;
        const priorCount = Number.isInteger(current.count) && current.count >= 0 ? current.count : 0;
        const priorRung = current.previousRung === true;
        const count = reset ? 0 : Math.min(rung.counter.preset, priorCount +
          (energised && !priorRung ? 1 : 0));
        const done = count >= rung.counter.preset;
        counters[rung.counter.tag] = { count, previousRung: energised };
        instruction = { type: 'CTU', tag: rung.counter.tag, count, preset: rung.counter.preset, reset, done };
      }
      if (rung.analogOutput) {
        analogOutputs[rung.analogOutput.tag] = energised ? rung.analogOutput.value : 0;
      }
      return {
        branches, branchResults, energised, coil: rung.coil, instruction,
        analogOutput: rung.analogOutput
          ? { tag: rung.analogOutput.tag, value: energised ? rung.analogOutput.value : 0 }
          : null
      };
    });
    const programOutputs = Object.fromEntries(program.rungs.map(rung => [rung.coil, outputs[rung.coil]]));
    return {
      valid: true, rungStates, outputs: programOutputs,
      runtimeState: { timers, counters }, analogOutputs
    };
  }

  return {
    calculateLoadSizing, calculateScheduleSizing, calculateMotorDesign,
    calculateLedResistor, calculateTransistorBaseResistor,
    calculateVoltageDivider, calculateRcNetwork,
    validatePlcProgram, calculatePlcScan
  };
}));
