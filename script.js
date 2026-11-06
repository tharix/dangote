const moduleTitles = {
  dashboard: 'Dashboard overview',
  calculators: 'Load & cable sizing',
  'load-schedule': 'Load schedule & design checks',
  'motor-design': 'Three-phase motor feeder estimate',
  installation: 'Installation & commissioning record',
  components: 'Component selection wizard',
  boq: 'Bill of quantities',
  'circuit-builder': 'Interactive circuit builder',
  'plc-lab': 'PLC ladder logic simulator',
  troubleshooting: 'Fault troubleshooting simulator',
  'station-diagnostics': 'Power-station diagnostics lab',
  'electronics-lab': 'Electronics design & troubleshooting',
  library: 'Datasheet library',
  review: 'Instructor review',
  profile: 'Offline profile'
};

let lastCalculation = null;
let componentId = 0;
let isSimulating = false;
let restoringBOQ = false;
let connectMode = false;
let pendingConnection = null;
let circuitConnections = [];
let simulationSeconds = 0;
let simulationTimer = null;
let circuitFault = 'none';
let circuitHistory = [];
let circuitRedo = [];
let restoringCircuit = false;
let lastScheduleResult = null;
let lastMotorDesign = null;
let selectedComponentId = null;
let simulationSamples = [];
let projectsChangedDuringStartup = false;
let circuitWalkthroughIndex = -1;
const phaseConductors = ['line', 'phase-a', 'phase-b', 'phase-c'];
const conductorTypes = [...phaseConductors, 'neutral', 'earth'];
const circuitWalkthroughSteps = [
  { prompt: 'Place one source (AC mains, battery, or bench supply) on the canvas.', hint: 'Drag a source from the component toolbox.', check: components => components.some(item => ['source-ac', 'battery', 'bench-supply'].includes(item.dataset.type)) },
  { prompt: 'Add one MCB to protect the line path.', hint: 'Drag an MCB onto the canvas. RCDs are important in real designs but this exercise uses an MCB.', check: components => components.some(item => item.dataset.type === 'mcb') },
  { prompt: 'Add a lamp as the circuit load.', hint: 'Drag a lamp from the Loads section of the toolbox.', check: components => components.some(item => item.dataset.type === 'lamp') },
  { prompt: 'Connect source output → MCB input using a line/phase conductor.', hint: 'Enable Connect components, choose Line / phase, then select the source output and MCB input terminals.', check: (components, wires) => hasWalkthroughConnection(components, wires, ['source-ac', 'battery', 'bench-supply'], ['mcb'], phaseConductors) },
  { prompt: 'Connect MCB output → lamp input using a line/phase conductor.', hint: 'Keep the MCB in series on the line side. Select MCB output and lamp input.', check: (components, wires) => hasWalkthroughConnection(components, wires, ['mcb'], ['lamp'], phaseConductors) },
  { prompt: 'Complete the return: lamp output → source input using neutral.', hint: 'Choose Neutral, then select the lamp output and source input. This is a simplified learning diagram.', check: (components, wires) => hasWalkthroughConnection(components, wires, ['lamp'], ['source-ac', 'battery', 'bench-supply'], ['neutral']) }
];
const projectDatabaseName = 'dangote-academy-projects';
const projectDatabaseVersion = 1;
const browserTestMode = new URLSearchParams(window.location.search).get('browser-test') === '1';

const componentCatalog = [
  { name: 'Miniature circuit breaker', category: 'protection', icon: 'fa-toggle-on', description: 'Protects final circuits from overload and short circuit conditions.', tags: ['Type C', '1-63 A'] },
  { name: 'Residual current device', category: 'protection', icon: 'fa-shield-halved', description: 'Provides additional earth leakage protection for people and equipment.', tags: ['30 mA', '2 pole'] },
  { name: 'Contactor', category: 'control', icon: 'fa-power-off', description: 'Electromagnetic switching device for motors and larger loads.', tags: ['AC-3', '3 pole'] },
  { name: 'PVC single-core cable', category: 'cabling', icon: 'fa-cable-car', description: 'Insulated copper conductor for conduit and trunking installations.', tags: ['1.5-50 mm²', '450/750 V'] },
  { name: 'LED bulkhead light', category: 'lighting', icon: 'fa-lightbulb', description: 'Efficient enclosed luminaire for industrial and service areas.', tags: ['18 W', 'IP65'] },
  { name: 'Emergency stop button', category: 'control', icon: 'fa-hand', description: 'Manual control device for quickly stopping hazardous machinery.', tags: ['Red', 'Twist reset'] },
  { name: 'Fixed resistor', category: 'passives', icon: 'fa-grip-lines', description: 'Limits current or sets voltage in a low-voltage DC training circuit.', tags: ['1 kΩ default', 'Value adjustable'] },
  { name: 'Capacitor', category: 'passives', icon: 'fa-grip-lines-vertical', description: 'Stores charge and supports first-order RC timing and filter exercises.', tags: ['10 µF default', 'Value adjustable'] },
  { name: 'Rectifier diode', category: 'semiconductors', icon: 'fa-arrow-right', description: 'Introduces forward/reverse polarity and rectification concepts.', tags: ['Approx. 0.7 V model', 'Polarity sensitive'] },
  { name: 'LED indicator', category: 'semiconductors', icon: 'fa-lightbulb', description: 'Low-voltage indicator load; use a current-limiting series resistor.', tags: ['10 mA model', 'DC only'] },
  { name: 'NPN transistor', category: 'semiconductors', icon: 'fa-code-branch', description: 'Switching-device training part; verify pinout and ratings from its datasheet.', tags: ['Low-voltage exercise', 'Datasheet required'] },
  { name: 'Control transformer', category: 'conversion', icon: 'fa-right-left', description: 'Illustrative turns-ratio component for diagram and topology exercises.', tags: ['Ratio adjustable', 'Not a transformer design tool'] },
  { name: 'Fuse', category: 'protection', icon: 'fa-bolt', description: 'Simplified protective component for topology and fault-response exercises.', tags: ['1 A default', 'Value adjustable'] },
  { name: 'Isolator', category: 'control', icon: 'fa-power-off', description: 'Manual isolation symbol with an interactive open/closed state in the model.', tags: ['Switchable state', 'Training model'] }
];
const circuitComponentTypes = ['source-ac', 'battery', 'bench-supply', 'mcb', 'rcd', 'fuse', 'isolator', 'switch-1way', 'timer', 'relay', 'contactor', 'junction', 'transformer', 'resistor', 'capacitor', 'diode', 'led', 'transistor', 'lamp', 'socket', 'motor'];
const circuitSourceTypes = ['source-ac', 'battery', 'bench-supply'];
const circuitLoadTypes = ['lamp', 'socket', 'motor', 'led'];
const componentValueDefaults = {
  fuse: { value: 1, unit: 'A', min: .1, max: 100 },
  transformer: { value: 2, unit: ':1 ratio', min: .1, max: 100 },
  resistor: { value: 1000, unit: 'Ω', min: 1, max: 1000000 },
  capacitor: { value: 10, unit: 'µF', min: .001, max: 1000 },
  diode: { value: .7, unit: 'V drop', min: .1, max: 2 },
  led: { value: 10, unit: 'mA', min: 1, max: 30 },
  transistor: { value: 100, unit: 'β model', min: 1, max: 1000 },
  motor: { value: 1.5, unit: 'kW', min: .1, max: 1000 }
};
const plcInputCatalog = [
  { tag: 'I0.0', label: 'Start pushbutton', initial: false },
  { tag: 'I0.1', label: 'Stop loop healthy', initial: true },
  { tag: 'I0.2', label: 'Overload healthy', initial: true },
  { tag: 'I0.3', label: 'Guard closed', initial: true },
  { tag: 'I0.4', label: 'Conveyor clear / low level', initial: false },
  { tag: 'I0.5', label: 'High level reached', initial: false }
];
const plcOutputCatalog = [
  { tag: 'Q0.0', label: 'Motor / pump coil' },
  { tag: 'Q0.1', label: 'Fault indicator' },
  { tag: 'Q0.2', label: 'Fill valve' }
];
const plcAnalogInputCatalog = [
  { tag: 'AI0', label: 'Tank level', unit: '%', initial: 20 },
  { tag: 'AI1', label: 'Flow feedback', unit: '%', initial: 0 }
];
const plcPrograms = {
  'motor-starter': {
    title: 'Motor starter · seal-in and overload',
    rungs: [
      { branches: [[{ tag: 'I0.0', normallyClosed: false }, { tag: 'I0.1', normallyClosed: false }, { tag: 'I0.2', normallyClosed: false }, { tag: 'I0.3', normallyClosed: false }], [{ tag: 'Q0.0', normallyClosed: false }, { tag: 'I0.1', normallyClosed: false }, { tag: 'I0.2', normallyClosed: false }, { tag: 'I0.3', normallyClosed: false }]], coil: 'Q0.0' },
      { branches: [[{ tag: 'I0.2', normallyClosed: true }]], coil: 'Q0.1' }
    ]
  },
  conveyor: {
    title: 'Conveyor · guard and jam interlocks',
    rungs: [
      { branches: [[{ tag: 'I0.0', normallyClosed: false }, { tag: 'I0.1', normallyClosed: false }, { tag: 'I0.3', normallyClosed: false }, { tag: 'I0.4', normallyClosed: false }], [{ tag: 'Q0.0', normallyClosed: false }, { tag: 'I0.1', normallyClosed: false }, { tag: 'I0.3', normallyClosed: false }, { tag: 'I0.4', normallyClosed: false }]], coil: 'Q0.0' },
      { branches: [[{ tag: 'I0.3', normallyClosed: true }]], coil: 'Q0.1' }
    ]
  },
  'tank-pump': {
    title: 'Tank pump · level demand',
    rungs: [
      { branches: [[{ tag: 'I0.4', normallyClosed: false }, { tag: 'I0.5', normallyClosed: true }, { tag: 'I0.1', normallyClosed: false }, { tag: 'I0.2', normallyClosed: false }], [{ tag: 'Q0.0', normallyClosed: false }, { tag: 'I0.5', normallyClosed: true }, { tag: 'I0.1', normallyClosed: false }, { tag: 'I0.2', normallyClosed: false }]], coil: 'Q0.0' },
      { branches: [[{ tag: 'I0.2', normallyClosed: true }]], coil: 'Q0.1' },
      { branches: [[{ tag: 'Q0.0', normallyClosed: false }]], coil: 'Q0.2' }
    ]
  },
  'analog-level': {
    title: 'Analog level · comparator and valve command',
    rungs: [
      { branches: [[{ tag: 'AI0', normallyClosed: false, analogOperator: 'lte', threshold: 30 }]], coil: 'Q0.2', analogOutput: { tag: 'AQ0', value: 65 } },
      { branches: [[{ tag: 'AI0', normallyClosed: false, analogOperator: 'gte', threshold: 90 }]], coil: 'Q0.1' }
    ]
  }
};
const plcChallenges = [
  {
    id: 'plc-seal-in', title: 'Build a seal-in starter', programId: 'motor-starter',
    objective: 'Start seals the output in; the stop loop or overload must drop it out.',
    hint: 'Use parallel start and output-hold branches, then place stop-loop and overload contacts in series.',
    steps: [
      { inputs: { 'I0.0': true, 'I0.1': true, 'I0.2': true, 'I0.3': true }, outputs: { 'Q0.0': true } },
      { inputs: { 'I0.0': false, 'I0.1': true, 'I0.2': true, 'I0.3': true }, outputs: { 'Q0.0': true } },
      { inputs: { 'I0.0': false, 'I0.1': false, 'I0.2': true, 'I0.3': true }, outputs: { 'Q0.0': false } },
      { inputs: { 'I0.0': true, 'I0.1': true, 'I0.2': false, 'I0.3': true }, outputs: { 'Q0.0': false, 'Q0.1': true } }
    ]
  },
  {
    id: 'plc-guard-interlock', title: 'Add a guard interlock', programId: 'conveyor',
    objective: 'The conveyor must stop when the guard opens and signal the guard fault.',
    hint: 'Put the guard-closed contact in series with both the start path and seal-in path.',
    steps: [
      { inputs: { 'I0.0': true, 'I0.1': true, 'I0.3': true, 'I0.4': true }, outputs: { 'Q0.0': true, 'Q0.1': false } },
      { inputs: { 'I0.0': false, 'I0.1': true, 'I0.3': true, 'I0.4': true }, outputs: { 'Q0.0': true } },
      { inputs: { 'I0.0': false, 'I0.1': true, 'I0.3': false, 'I0.4': true }, outputs: { 'Q0.0': false, 'Q0.1': true } }
    ]
  },
  {
    id: 'plc-analog-control', title: 'Create an analog level response', programId: 'analog-level',
    objective: 'Enable the valve command below 30% level and raise a high-level alarm at 90%.',
    hint: 'Set the analog contact comparison and assign the analog output value on its rung.',
    steps: [
      { inputs: {}, analogInputs: { AI0: 20 }, outputs: { 'Q0.2': true }, analogOutputs: { AQ0: 65 } },
      { inputs: {}, analogInputs: { AI0: 60 }, outputs: { 'Q0.2': false }, analogOutputs: { AQ0: 0 } },
      { inputs: {}, analogInputs: { AI0: 95 }, outputs: { 'Q0.1': true } }
    ]
  }
];
const plcTroubleshootingCases = [
  { id: 'plc-stop-loop', title: 'Starter drops out immediately', symptom: 'Start input is visible, but the motor output drops on the next scan.', options: ['Check the stop-loop healthy input and its series contact in both start and seal paths', 'Increase the timer preset', 'Force the output coil on'], answer: 0, rationale: 'A healthy stop loop is commonly represented by an energized input and a normally-open logical contact; loss of that permissive breaks both paths.' },
  { id: 'plc-guard', title: 'Conveyor will not restart', symptom: 'The guard appears closed, but the PLC input image remains OFF.', options: ['Compare the field signal indication with the input image and verify the interlock path in the program', 'Bridge the guard switch input', 'Disable the guard fault rung'], answer: 0, rationale: 'Compare the simulated field input, input image, and rung state. Never bypass a real guard or safety circuit.' },
  { id: 'plc-analog', title: 'Valve command stays at zero', symptom: 'Tank level is below the demand threshold, but the analog output remains at 0%.', options: ['Check AI scaling/range, comparator direction and threshold, rung power flow, and AQ assignment', 'Raise the high-level alarm threshold', 'Force the valve output on'], answer: 0, rationale: 'Trace the scaled analog input, comparison, rung, and output assignment in sequence.' }
];
const plcStorageKey = 'dangote-academy-plc';
const plcChallengeStorageKey = 'dangote-academy-plc-challenges';
const plcTroubleshootingStorageKey = 'dangote-academy-plc-troubleshooting';
let plcProgramId = 'motor-starter';
let plcModel = null;
let plcInputs = Object.fromEntries(plcInputCatalog.map(input => [input.tag, input.initial]));
let plcOutputs = Object.fromEntries(plcOutputCatalog.map(output => [output.tag, false]));
let plcAnalogInputs = Object.fromEntries(plcAnalogInputCatalog.map(input => [input.tag, input.initial]));
let plcAnalogOutputs = { AQ0: 0 };
let plcRuntimeState = { timers: {}, counters: {} };
let plcRungStates = [];
let plcScanCount = 0;
let plcScanTimer = null;
let plcTrendSamples = [];
let plcFault = 'none';
let plcFaultTarget = 'I0.2';
let plcLastExplanations = [];

const troubleshootingScenarios = [
  { title: 'Motor starter will not run', symptom: 'The supply is present, but the contactor does not pull in when the start button is pressed.', options: ['Check the control fuse and overload contact', 'Replace the motor bearings', 'Increase the motor cable size'], answer: 0 },
  { title: 'Lamp trips the MCB', symptom: 'A lighting circuit trips immediately when a lamp is switched on.', options: ['Inspect for a short circuit in the lamp holder', 'Reduce the diversity factor', 'Change the neutral wire colour'], answer: 0 },
  { title: 'RCD trips during testing', symptom: 'The RCD trips when a portable appliance is connected to an outlet.', options: ['Check the appliance insulation and earth leakage', 'Install a larger MCB', 'Remove the circuit earth conductor'], answer: 0 },
  { title: 'Timer does not start the load', symptom: 'The timer display advances, but the controlled lamp remains off after the delay.', options: ['Check timer supply, output contact, and delay setting', 'Increase the lamp wattage', 'Remove the protective earth'], answer: 0 },
  { title: 'Relay chatters repeatedly', symptom: 'A control relay rapidly makes and breaks instead of holding in.', options: ['Check coil voltage, control wiring, and contact feedback', 'Fit a smaller cable', 'Bypass the MCB'], answer: 0 },
  { id: 'motor-overload', title: 'Three-phase motor overload trips', symptom: 'A motor trips on overload during acceleration after maintenance; the supply and load appear normal.', options: ['Keep resetting it until the motor runs', 'Isolate safely; verify nameplate/settings, phase supply, mechanical load, and recorded current with a qualified person', 'Increase the overload setting above the motor nameplate'], answer: 1 },
  { id: 'intermittent-lighting', title: 'Intermittent lighting in one area', symptom: 'Several lights on one building circuit flicker while nearby circuits remain steady.', options: ['Arrange safe isolation and inspection of that circuit’s connections, neutral, and protective device by a competent person', 'Replace every lamp before checking the circuit', 'Bridge the protective device to prevent interruptions'], answer: 0 },
  { id: 'warm-socket', title: 'Socket outlet shows heat damage', symptom: 'A socket faceplate is discoloured and the connected load has been intermittent.', options: ['Continue using it at a lower load', 'Remove it from service, isolate the circuit, and have the outlet, terminations, and circuit loading assessed', 'Fit a higher-rated fuse without inspection'], answer: 1 }
];
const stationDiagnosticScenarios = [
  {
    id: 'station-generator-differential',
    system: 'Generator protection',
    title: 'Generator differential protection operates',
    symptom: 'A generator unit is disconnected following a differential-protection operation during a disturbance.',
    evidence: 'Correlate the sequence-of-events record, disturbance waveform, relay target, unit condition indicators, and approved protection/event records. Preserve evidence; do not infer an internal fault from one indication alone.',
    options: ['Treat it as nuisance operation and return the unit to service', 'Keep the unit unavailable under the approved incident process; have protection and generator specialists assess the event evidence before any return-to-service decision', 'Change differential settings until the alarm clears'],
    answer: 1,
    rationale: 'Differential operation may indicate an internal fault or a measurement/protection-system issue. Both require formal evidence review; repeated trips must not be bypassed.',
    safeResponse: 'Keep the unit in its approved safe status, notify the control room and responsible protection/generator engineers, preserve event records, and follow the site incident and clearance process.'
  },
  {
    id: 'station-generator-voltage',
    system: 'Excitation and voltage regulation',
    title: 'Generator voltage is unstable',
    symptom: 'Bus voltage trends fluctuate while the unit is carrying a changing reactive-power demand.',
    evidence: 'Compare independent voltage indications, reactive-power trend, excitation/AVR alarms, operating mode, and disturbance/event records within the approved control-room process.',
    options: ['Increase excitation settings immediately from the panel', 'Correlate independent measurements and AVR/excitation indications with the load and event trend; escalate to the generator controls engineer', 'Disable voltage protection to prevent another alarm'],
    answer: 1,
    rationale: 'Voltage behavior depends on excitation, sensing, reactive loading, and system conditions. A trend and indication cross-check helps separate these causes without adjusting controls by guesswork.',
    safeResponse: 'Keep monitoring and operating decisions with authorized control-room personnel under approved limits; escalate abnormal trends to the controls and electrical teams.'
  },
  {
    id: 'station-reverse-power',
    system: 'Prime mover and generator',
    title: 'Reverse-power protection operates',
    symptom: 'A generator records reverse-power protection during a prime-mover disturbance or after a rapid change in unit output.',
    evidence: 'Review synchronized generator MW, breaker/protection event chronology, prime-mover alarms, and measurement/CT channel health using approved records.',
    options: ['Bridge the reverse-power protection and reconnect the generator', 'Treat the operation as evidence of possible loss of prime-mover input or a measurement/protection issue; keep reconnection under the approved operator and engineering process', 'Raise the reverse-power threshold until the event stops'],
    answer: 1,
    rationale: 'Reverse power can indicate that the generator is motoring or that measurements/protection have failed. It is not safe to assume a nuisance trip or alter protection thresholds.',
    safeResponse: 'Do not defeat protection or attempt reconnection. Notify authorized operations and protection/prime-mover specialists and preserve the event sequence for review.'
  },
  {
    id: 'station-transformer-differential',
    system: 'Transformer protection',
    title: 'Power transformer differential trip',
    symptom: 'A transformer differential trip is recorded, with an associated sudden-pressure or gas alarm under investigation.',
    evidence: 'Correlate relay targets and disturbance/event records with transformer alarms, available condition-monitoring information, and the utility incident process.',
    options: ['Re-energize once to confirm whether the alarm returns', 'Keep the transformer unavailable pending authorized review of protection and condition evidence by the transformer and protection teams', 'Raise differential pickup to avoid further trips'],
    answer: 1,
    rationale: 'A differential trip with additional transformer indications can represent serious internal damage. Re-energization or setting changes without investigation can increase the hazard and damage.',
    safeResponse: 'Do not re-energize or alter protection. Notify authorized operations, follow the site emergency/incident procedure, and arrange specialist assessment.'
  },
  {
    id: 'station-transformer-temperature',
    system: 'Transformer cooling',
    title: 'Transformer temperature rises unexpectedly',
    symptom: 'Transformer temperature indications rise above their recent trend during an otherwise steady loading period.',
    evidence: 'Compare independent temperature indications, loading/history, ambient conditions, cooling-system status/alarm records, and available oil/condition-monitoring records.',
    options: ['Assume the sensor is faulty and suppress the alarm', 'Correlate temperature, load, ambient and cooling-system records; notify authorized operations and the transformer team of the abnormal trend', 'Increase the transformer loading to test the cooling system'],
    answer: 1,
    rationale: 'Loading, cooling performance, ambient conditions, and instrumentation can all affect temperature. Comparing independent records is more reliable than suppressing an alarm or deliberately stressing equipment.',
    safeResponse: 'Follow the site operating limits and escalation process. Leave loading and equipment-state decisions to authorized operators and qualified transformer personnel.'
  },
  {
    id: 'station-turbine-vibration',
    system: 'Turbine and rotating equipment',
    title: 'Turbine vibration trend increases',
    symptom: 'A unit vibration trend increases across multiple monitoring points and an alarm is raised.',
    evidence: 'Review validated sensor channels, vibration trend and frequency information, bearing temperature, lube-oil and process alarms, and recent maintenance/event history.',
    options: ['Continue raising output to see whether the vibration settles', 'Treat corroborated increasing vibration as an equipment-protection concern; inform the control room and rotating-equipment specialists and follow approved response limits', 'Disable the vibration alarm because the unit is still producing power'],
    answer: 1,
    rationale: 'A rising multi-channel vibration trend can precede rotating-equipment damage. Its cause requires specialist analysis; increasing load or defeating monitoring is not an acceptable diagnostic method.',
    safeResponse: 'Use only the plant-approved alarm response and operating limits. Authorized operations and turbine specialists decide whether a controlled unit response is required.'
  },
  {
    id: 'station-cooling-auxiliary',
    system: 'Station auxiliary systems',
    title: 'Cooling or lubrication auxiliary alarm',
    symptom: 'A unit receives a cooling-water or lube-oil auxiliary alarm while process temperatures or equipment condition indicators trend abnormally.',
    evidence: 'Review redundant indication and alarm chronology, auxiliary-system availability, filter/pressure/flow trends, and affected-unit condition records through approved monitoring systems.',
    options: ['Reset the alarm repeatedly so the unit remains online', 'Assess the affected unit and auxiliary-system alarm together; escalate to authorized operations and maintenance specialists under the plant response procedure', 'Bypass the auxiliary interlock to restore operation'],
    answer: 1,
    rationale: 'Auxiliary systems protect primary plant equipment. A repeated alarm combined with abnormal condition trends needs coordinated assessment rather than alarm suppression or an interlock bypass.',
    safeResponse: 'Do not bypass an interlock or perform live intervention. Follow the approved plant response, access controls, permits, and isolation requirements.'
  },
  {
    id: 'station-grid-frequency',
    system: 'Grid interface and switchyard',
    title: 'Grid frequency or voltage disturbance',
    symptom: 'Several units or feeders register an under/over-frequency or voltage event within the same time window.',
    evidence: 'Compare time-synchronized relay/event records, bus and feeder indications, the control-room event timeline, and available grid-operator disturbance information.',
    options: ['Change protection settings on individual units to ride through the next event', 'Determine whether the event is system-wide by correlating time-aligned indications, then coordinate authorized operators and the grid/system operator', 'Close a feeder to check if the bus voltage recovers'],
    answer: 1,
    rationale: 'Concurrent time-aligned events can indicate a grid disturbance rather than independent unit faults. Coordination and verified event records are needed before any operational response.',
    safeResponse: 'Keep switching and unit-control decisions with authorized control-room personnel and the system operator under approved grid and plant procedures.'
  }
];
const electronicsDiagnosticScenarios = [
  {
    id: 'electronics-led-open',
    title: 'Indicator LED remains dark',
    symptom: 'A low-voltage status LED does not illuminate after a prototype was reassembled.',
    evidence: 'With power removed, compare LED polarity and series-resistor placement with the schematic; then verify supply and current-limited test readings within the component ratings.',
    options: ['Raise the supply voltage until the LED turns on', 'Power down, verify polarity and resistor path against the schematic, then check the current-limited supply and component ratings', 'Short the LED terminals briefly to test it'],
    answer: 1,
    rationale: 'An open path, reversed polarity, missing resistor, or supply issue can all produce a dark LED. Check the circuit against the design before applying power.',
    safeResponse: 'Use an isolated, current-limited low-voltage supply and a correctly sized series resistor; never connect the prototype to mains.'
  },
  {
    id: 'electronics-divider-loaded',
    title: 'Divider output falls when sensor is connected',
    symptom: 'A divider produces the expected no-load voltage, but its output drops after a sensor input is connected.',
    evidence: 'Compare input impedance and divider current with the sensor datasheet; record unloaded and loaded voltages using the same reference point.',
    options: ['Increase the input supply until the output recovers', 'Check whether the sensor input loads the divider; recalculate under load or use a suitably designed buffer', 'Connect the divider output directly to the supply rail'],
    answer: 1,
    rationale: 'The basic divider equation assumes a high-impedance load. A connected input forms a loaded network and changes the output.',
    safeResponse: 'Keep the prototype within its documented low-voltage ratings and confirm the sensor input limits before reconnecting.'
  },
  {
    id: 'electronics-rc-timing',
    title: 'RC delay is shorter than expected',
    symptom: 'A low-voltage RC timing prototype reaches its threshold well before the design estimate.',
    evidence: 'Check the resistor and capacitor markings against the schematic, capacitor tolerance and condition, threshold definition, and the actual charge/discharge path while de-energized.',
    options: ['Install the largest capacitor available without checking its rating', 'Verify component values, tolerances, threshold, and circuit path against the datasheets and timing model', 'Bypass the timing resistor to test the delay'],
    answer: 1,
    rationale: 'RC time depends on the actual resistance, capacitance, threshold, and circuit loading. Component tolerances and topology matter.',
    safeResponse: 'Remove power before changing components; observe capacitor polarity and voltage ratings where applicable.'
  },
  {
    id: 'electronics-opamp-saturation',
    title: 'Op-amp output stays near a supply rail',
    symptom: 'A sensor amplifier output remains close to one rail for the full input range.',
    evidence: 'Compare supply rails and input common-mode range with the device datasheet; review input polarity, feedback continuity, and expected output limits.',
    options: ['Increase the supply beyond the datasheet maximum', 'Check supply and common-mode limits, input polarity, and feedback path against the device datasheet', 'Disconnect feedback while powered and touch the inputs together'],
    answer: 1,
    rationale: 'Rail saturation can result from input range violations, incorrect feedback, polarity, or supply problems; a device swap is not the first diagnosis.',
    safeResponse: 'Power down before rewiring and keep all supply and input levels within the manufacturer ratings.'
  },
  {
    id: 'electronics-transistor-switch',
    title: 'Transistor switch runs hot',
    symptom: 'A small low-voltage transistor switch becomes hot while driving a prototype indicator load.',
    evidence: 'Review transistor pinout and datasheet limits, load current, base/gate drive, series resistor, and thermal conditions; inspect wiring with power removed.',
    options: ['Continue operating it to see if it stabilizes', 'Remove power and check pinout, drive resistor, load current, and device dissipation against the datasheet', 'Replace it with any larger transistor without checking compatibility'],
    answer: 1,
    rationale: 'Incorrect pinout, insufficient drive, excessive load, or unsuitable dissipation can overheat a switching device.',
    safeResponse: 'Stop powered testing, allow components to cool, and verify the design and ratings before using a current-limited low-voltage supply.'
  },
  {
    id: 'electronics-noisy-sensor',
    title: 'Sensor reading is unstable',
    symptom: 'A low-voltage sensor signal fluctuates when a nearby digital output changes state.',
    evidence: 'Compare signal and supply traces, grounding and return paths, decoupling placement, wiring layout, and measurement setup with the schematic.',
    options: ['Suppress the measured fluctuation in software without checking the circuit', 'Correlate the sensor, supply, and switching event; inspect grounding, decoupling, and layout before changing the design', 'Increase the sensor supply above its rated voltage'],
    answer: 1,
    rationale: 'Coupled switching noise, supply disturbance, grounding, and measurement setup can all affect a sensor signal. Correlated evidence helps distinguish them.',
    safeResponse: 'Make wiring changes only with power removed and keep supply levels within each component datasheet.'
  }
];
const commissioningChecks = [
  { id: 'design', title: 'Design and circuit schedule', description: 'Approved drawings, circuit references, load schedule, and design changes reviewed.' },
  { id: 'routes', title: 'Routes and containment', description: 'Building routes, segregation, support, mechanical protection, and environmental conditions reviewed.' },
  { id: 'conductors', title: 'Conductors and terminations', description: 'Conductor identification, terminations, and manufacturer-specified tightening records checked.' },
  { id: 'protection', title: 'Protective devices', description: 'Device types, ratings, settings, and coordination checked against the approved design.' },
  { id: 'earthing', title: 'Earthing and bonding', description: 'Protective conductor continuity and bonding results recorded by a competent person.' },
  { id: 'insulation', title: 'Insulation resistance', description: 'Test result and method recorded in the approved test documentation.' },
  { id: 'polarity', title: 'Polarity and identification', description: 'Polarity, circuit identification, and labels verified and documented.' },
  { id: 'loop-impedance', title: 'Fault protection assessment', description: 'Earth-fault loop or equivalent protective-disconnection assessment recorded.' },
  { id: 'rcd-test', title: 'RCD / RCBO tests', description: 'Operation test results recorded where these devices are specified.' },
  { id: 'functional-test', title: 'Functional checks', description: 'Switching, controls, interlocks, and emergency-stop functions checked as applicable.' },
  { id: 'handover', title: 'Records and handover', description: 'As-built drawings, schedules, labels, certificates, and outstanding actions handed over.' }
];
const commissioningStatuses = ['not-recorded', 'recorded', 'review'];
const standardsReviewChecks = [
  { id: 'design-basis', title: 'Design basis and assumptions', description: 'Confirm the project scope, supply characteristics, design assumptions, and applicable documents.' },
  { id: 'demand', title: 'Load assessment', description: 'Review connected loads, demand assumptions, diversity, phase allocation, and schedules.' },
  { id: 'conductors', title: 'Conductors and voltage drop', description: 'Review conductor material, installation conditions, correction factors, capacity, and voltage drop.' },
  { id: 'protection', title: 'Overcurrent and fault protection', description: 'Review protective-device selection, coordination, disconnection, and fault calculations.' },
  { id: 'earthing', title: 'Earthing and bonding', description: 'Review earthing arrangement, protective conductors, bonding, and associated evidence.' },
  { id: 'special-locations', title: 'Environmental and special conditions', description: 'Review external influences, locations, equipment ratings, and any project-specific requirements.' },
  { id: 'verification', title: 'Inspection and verification', description: 'Review inspection, testing, measured results, methods, and records required for the project.' },
  { id: 'documentation', title: 'Drawings and handover', description: 'Review drawings, schedules, labels, certificates, deviations, and outstanding actions.' }
];
const standardsReviewCrosswalk = [
  {
    topic: 'Load, current, and schedule demand',
    model: 'Load sizing and load schedule apply nominal 230/400 V assumptions, power factor, and user-entered diversity.',
    references: 'NESIS 2015 sections 7.2.2, 7.2.11.5-7.2.11.6 (PDF pp. 162, 204-205).',
    review: 'Confirm supply basis and circuit category. NESIS distinguishes final sub-circuits from other circuits for diversity; verify whether the model applies diversity in a justified way for each use.'
  },
  {
    topic: 'Cable capacity, installation, and voltage drop',
    model: 'Cable ampacity, installation-method capacity, ambient/grouping factors, and voltage-drop constants are demonstration tables.',
    references: 'NESIS 2015 section 7.2.3 (PDF pp. 162-164); section 10.3.1(c) (PDF pp. 246-247).',
    review: 'Identify the governing NIS/IEC or other adopted tables and editions; verify conductor type, installation method, correction factors, circuit conditions, and voltage-drop criteria. Current demo constants have no verified standards source.'
  },
  {
    topic: 'Overcurrent and fault protection',
    model: 'Breaker selection compares load current with the demo cable-capacity table; the app does not calculate prospective fault current or device curves.',
    references: 'NESIS 2015 sections 7.2.11.2, 7.2.14.1 (PDF pp. 200-202, 219-220).',
    review: 'Assess breaking capacity, short-circuit withstand, discrimination/coordination, conductor protection, device characteristics, and required disconnection conditions. A nominal rating match alone is insufficient evidence.'
  },
  {
    topic: 'Motor feeder and starting',
    model: 'Motor estimate uses power, efficiency, power factor, and a user-selected starting-current multiplier.',
    references: 'NESIS 2015 sections 7.2.11.9, 7.2.14.2 (PDF pp. 209-210, 220).',
    review: 'Verify the applicable motor and starter rules, nameplate data, starting conditions, conductor sizing, overload/fault protection, isolation, and coordination. The demo multiplier is not a verified limit.'
  },
  {
    topic: 'Earthing, bonding, and earth-leakage protection',
    model: 'Circuit checks are topology heuristics; the app does not calculate earthing, electrode resistance, loop impedance, or RCD trip performance.',
    references: 'NESIS 2015 Chapter 11, including sections 11.1, 11.5, 11.6 (PDF pp. 252-256); section 10.3.2 (PDF p. 247 onward).',
    review: 'Identify the applicable earthing arrangement and adopted rules; independently review conductor sizing, bonding, fault protection, device selection, and required measured test evidence.'
  },
  {
    topic: 'Inspection and verification',
    model: 'The application stores user-entered installation notes and produces training reports; it performs no physical inspection or electrical tests.',
    references: 'NESIS 2015 sections 10.3.1-10.3.2 (PDF pp. 246-248 onward).',
    review: 'Have an authorized competent person determine applicable inspection, test methods, sequence, acceptance criteria, certification, and authority approvals for the actual installation.'
  },
  {
    topic: 'Document status and applicable editions',
    model: 'The supplied NESIS document is a 2015 publication; its normative references list BS 7671:2008 and several NIS IEC documents.',
    references: 'NESIS 2015 sections 1.2-1.3 (PDF pp. 12-15); current NEMSA regulations page: https://web.nemsa.gov.ng/regulations.',
    review: 'Confirm current legal status, amendments, referenced national adoptions, and replacement editions with the relevant Nigerian authority before using any clause as a current design basis.'
  },
  {
    topic: 'ECOWAS source supplied',
    model: 'The supplied ECOWAS PDF identifies itself as the ECOWAS Energy Policy, updated version (69 PDF pages). It is policy context, not a wiring-installation code.',
    references: 'ECOWAS Energy Policy, updated version, supplied PDF: https://eis.ecowas.int/assets/front/medias/doc/media_20231011104957.pdf.',
    review: 'Do not use this policy document as a source for cable ampacity, protection, or installation acceptance criteria. Identify any separate adopted ECOWAS/NIS technical standards if applicable.'
  }
];
const standardsReviewStatuses = ['not-reviewed', 'reviewed-acceptable', 'action-required', 'awaiting-evidence', 'not-applicable'];
const standardsReviewStorageKey = 'dangote-academy-standards-review';
const guidedLessons = [
  { id: 'safe-topology', title: 'Build a protected lighting circuit', objective: 'Create a valid source → MCB → lamp circuit using a phase conductor.', hint: 'Use AC mains, MCB, and Lamp, then connect both wires as line or Phase A/B/C.', check: () => validateCircuit() },
  { id: 'balanced-phases', title: 'Balance a three-phase schedule', objective: 'Assign equal diversified loads to Phase A, Phase B, and Phase C.', hint: 'Open Load Schedule, choose three-phase, and use equal loads on each phase.', check: () => Number($('#schedule-phase')?.value) === 3 && ['phase-a', 'phase-b', 'phase-c'].every(phase => $$('.schedule-row-phase').some(select => select.value === phase)) },
  { id: 'fault-response', title: 'Diagnose an earth-leakage fault', objective: 'Enable earth leakage and verify that an RCD and earth path are present.', hint: 'Build a circuit with an RCD and an earth conductor, then select Earth leakage.', check: () => $('#circuit-fault')?.value === 'earth-leakage' && validateCircuit() }
];
const profileStorageKey = 'dangote-academy-profile';
const profileDirectoryKey = 'dangote-academy-profiles';
const cloudSessionStorageKey = 'dangote-academy-cloud-session';
const troubleshootingStorageKey = 'dangote-academy-troubleshooting';
const stationDiagnosticsStorageKey = 'dangote-academy-station-diagnostics';
const electronicsDiagnosticsStorageKey = 'dangote-academy-electronics-diagnostics';
let cloudContext = null;
const workspaceBackupStorageKeys = [
  'dangote-academy-profile',
  'dangote-academy-profiles',
  'dangote-academy-projects',
  'dangote-academy-boq',
  'dangote-academy-circuit',
  'dangote-academy-installation',
  'dangote-academy-standards-review',
  'dangote-academy-lessons',
  'dangote-academy-troubleshooting',
  'dangote-academy-station-diagnostics',
  'dangote-academy-electronics-diagnostics',
  'dangote-academy-plc',
  'dangote-academy-plc-challenges',
  'dangote-academy-plc-troubleshooting'
];

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function switchModule(moduleId) {
  if (moduleId !== 'plc-lab') stopPlcScans();
  $$('.nav-item').forEach(item => {
    const active = item.dataset.module === moduleId;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $$('.module').forEach(module => module.classList.toggle('active', module.id === `module-${moduleId}`));
  $('#module-title').textContent = moduleTitles[moduleId] || moduleTitles.dashboard;
  $('#sidebar').classList.remove('open');
}

function hasWalkthroughConnection(components, wires, fromTypes, toTypes, conductors) {
  const fromIds = new Set(components.filter(item => fromTypes.includes(item.dataset.type)).map(item => item.id));
  const toIds = new Set(components.filter(item => toTypes.includes(item.dataset.type)).map(item => item.id));
  return wires.some(wire => fromIds.has(wire.from) && toIds.has(wire.to) && conductors.includes(wire.conductor));
}

function renderCircuitWalkthrough() {
  const step = $('#walkthrough-step');
  const count = $('#walkthrough-count');
  const progress = $('#walkthrough-progress');
  const hint = $('#walkthrough-hint');
  const checkButton = $('#walkthrough-check');
  if (!step || !count || !progress || !hint || !checkButton) return;
  const complete = circuitWalkthroughIndex >= circuitWalkthroughSteps.length;
  const started = circuitWalkthroughIndex >= 0;
  count.textContent = complete ? 'Complete' : started
    ? `Step ${circuitWalkthroughIndex + 1} of ${circuitWalkthroughSteps.length}`
    : 'Ready';
  step.textContent = complete
    ? 'Walkthrough complete. Validate the finished topology, then run the training simulation.'
    : started
      ? circuitWalkthroughSteps[circuitWalkthroughIndex].prompt
      : 'Start when ready. Place a source, MCB and lamp, then make the three guided connections.';
  hint.textContent = complete || !started
    ? 'Use the component toolbox, then enable Connect components. Your existing canvas will be preserved.'
    : circuitWalkthroughSteps[circuitWalkthroughIndex].hint;
  checkButton.disabled = !started || complete;
  progress.innerHTML = circuitWalkthroughSteps.map((item, index) =>
    `<span class="${index < circuitWalkthroughIndex ? 'done' : index === circuitWalkthroughIndex ? 'current' : ''}" aria-label="Step ${index + 1}${index < circuitWalkthroughIndex ? ' complete' : ''}">${index < circuitWalkthroughIndex ? '<i class="fa-solid fa-check"></i>' : index + 1}</span>`
  ).join('');
}

function startCircuitWalkthrough() {
  circuitWalkthroughIndex = 0;
  renderCircuitWalkthrough();
}

function checkCircuitWalkthroughStep() {
  if (circuitWalkthroughIndex < 0 || circuitWalkthroughIndex >= circuitWalkthroughSteps.length) return;
  const components = $$('.circuit-component');
  const step = circuitWalkthroughSteps[circuitWalkthroughIndex];
  if (!step.check(components, circuitConnections)) {
    $('#walkthrough-hint').textContent = step.hint;
    showToast('Complete the highlighted walkthrough step, then check again.');
    return;
  }
  circuitWalkthroughIndex += 1;
  renderCircuitWalkthrough();
  if (circuitWalkthroughIndex === circuitWalkthroughSteps.length) {
    validateCircuit();
    showToast('Circuit walkthrough complete.');
  }
}

function clearEngineeringPlot(id, message = 'Run the calculation to plot these values.') {
  const target = $(`#${id}`);
  if (!target) return;
  target.setAttribute('aria-label', message);
  target.innerHTML = `<p class="plot-placeholder">${escapeHtml(message)}</p>`;
}

function renderEngineeringPlot(id, { xLabel, yLabel, series }) {
  const target = $(`#${id}`);
  if (!target) return;
  const validSeries = (Array.isArray(series) ? series : []).map(item => ({
    name: item.name,
    points: (Array.isArray(item.points) ? item.points : []).filter(point =>
      Number.isFinite(point.x) && Number.isFinite(point.y)
    )
  })).filter(item => item.points.length > 0);
  if (!validSeries.length) {
    clearEngineeringPlot(id);
    return;
  }
  const allPoints = validSeries.flatMap(item => item.points);
  const xMin = Math.min(0, ...allPoints.map(point => point.x));
  const xMax = Math.max(...allPoints.map(point => point.x));
  const yMin = Math.min(0, ...allPoints.map(point => point.y));
  const yMax = Math.max(...allPoints.map(point => point.y), 1e-9);
  const left = 52, top = 12, width = 630, height = 150;
  const x = value => left + (value - xMin) / (xMax - xMin || 1) * width;
  const y = value => top + height - (value - yMin) / (yMax - yMin || 1) * height;
  const colors = ['#117fa2', '#d59624', '#31966c', '#806bd1'];
  const grid = Array.from({ length: 5 }, (_, index) => {
    const py = top + index * height / 4;
    const value = yMax - index * (yMax - yMin) / 4;
    return `<path class="plot-grid-line" d="M${left} ${py}H${left + width}"/><text class="plot-tick" x="${left - 7}" y="${py + 3}" text-anchor="end">${value.toPrecision(3)}</text>`;
  }).join('');
  const paths = validSeries.map((item, index) => {
    const d = item.points.map((point, pointIndex) =>
      `${pointIndex ? 'L' : 'M'}${x(point.x).toFixed(1)} ${y(point.y).toFixed(1)}`
    ).join('');
    const marker = item.points.length === 1
      ? `<circle class="plot-marker" fill="${colors[index % colors.length]}" cx="${x(item.points[0].x)}" cy="${y(item.points[0].y)}" r="4"/>`
      : '';
    return `<path class="plot-series" stroke="${colors[index % colors.length]}" d="${d}"/>${marker}`;
  }).join('');
  const legend = validSeries.map((item, index) =>
    `<span><i style="--plot-color:${colors[index % colors.length]}"></i>${escapeHtml(item.name)}</span>`
  ).join('');
  target.innerHTML = `<svg class="plot-svg" viewBox="0 0 720 205" role="img" aria-label="${escapeHtml(`${yLabel} by ${xLabel}`)}"><g>${grid}</g><path class="plot-axis" d="M${left} ${top}V${top + height}H${left + width}"/><text class="plot-axis-label" x="12" y="18">${escapeHtml(yLabel)}</text><text class="plot-axis-label" x="${left + width / 2}" y="184" text-anchor="middle">${escapeHtml(xLabel)}</text>${paths}<text class="plot-tick" x="${left}" y="${top + height + 14}" text-anchor="middle">${xMin.toPrecision(3)}</text><text class="plot-tick" x="${left + width}" y="${top + height + 14}" text-anchor="middle">${xMax.toPrecision(3)}</text></svg><div class="plot-legend">${legend}</div>`;
  target.setAttribute('aria-label', `${yLabel} plotted against ${xLabel}.`);
}

function getVirtualMeterReading() {
  const mode = $('#meter-measurement')?.value || 'source-voltage';
  const source = $$('.circuit-component').find(item => circuitSourceTypes.includes(item.dataset.type));
  const sourceVoltage = source?.dataset.type === 'battery' ? 12 : source?.dataset.type === 'bench-supply' ? 5 : source ? 230 : 0;
  const valid = $('#circuit-validation')?.textContent === 'Circuit valid';
  if (mode === 'continuity') {
    if (isSimulating) return { value: 'STOP', unit: '', note: 'Stop the training simulation before checking virtual continuity.' };
    return valid
      ? { value: 'CLOSED', unit: '', note: 'Complete training topology only; not a physical continuity test.' }
      : { value: 'OPEN', unit: '', note: 'The training topology is incomplete; this is not a physical continuity test.' };
  }
  if (!isSimulating) return { value: '—', unit: '', note: 'Run the training simulation to view model readings.' };
  const fault = $('#circuit-fault')?.value || 'none';
  const reading = {
    'source-voltage': { value: valid ? sourceVoltage : 0, unit: 'V', note: 'Nominal source value from the simplified training model.' },
    'load-voltage': { value: valid && fault === 'none' && isCircuitControlPathClosed() ? sourceVoltage : 0, unit: 'V', note: 'Modeled load-terminal voltage; topology and fault mode affect the result.' },
    'circuit-current': { value: Number($('#sim-i').textContent) || 0, unit: 'A', note: 'Same estimated current shown by the circuit simulator.' },
    'circuit-power': { value: Number($('#sim-p').textContent) || 0, unit: 'W', note: 'Model estimate calculated from displayed voltage and current.' }
  }[mode];
  return reading || { value: '—', unit: '', note: 'Choose a supported measurement.' };
}

function isCircuitControlPathClosed() {
  return $$('.circuit-component')
    .filter(item => ['switch-1way', 'mcb', 'rcd', 'fuse', 'isolator', 'relay', 'contactor', 'timer'].includes(item.dataset.type))
    .every(item => item.dataset.state === 'on');
}

function renderVirtualInstruments() {
  const output = $('#meter-reading');
  if (!output) return;
  const reading = getVirtualMeterReading();
  $('#meter-value').textContent = String(reading.value);
  $('#meter-unit').textContent = reading.unit;
  $('#meter-note').textContent = reading.note;
  $('#meter-reading').classList.toggle('meter-alert', ['STOP', 'OPEN'].includes(String(reading.value)));

  const source = $$('.circuit-component').find(item => circuitSourceTypes.includes(item.dataset.type));
  const valid = $('#circuit-validation')?.textContent === 'Circuit valid';
  const fault = $('#circuit-fault')?.value || 'none';
  const energized = isSimulating && valid && fault === 'none' && isCircuitControlPathClosed();
  const acSignal = energized && source?.dataset.type === 'source-ac';
  const dcSignal = energized && ['battery', 'bench-supply'].includes(source?.dataset.type);
  const sourceVoltage = source?.dataset.type === 'bench-supply' ? 5 : source?.dataset.type === 'battery' ? 12 : 230;
  const amplitude = energized ? Math.min(48, sourceVoltage / 230 * 39) : 0;
  const baseline = dcSignal ? 36 : 60;
  const path = Array.from({ length: 73 }, (_, index) => {
    const x = index * 5;
    const y = baseline - (acSignal ? amplitude * Math.sin(index / 72 * Math.PI * 4) : amplitude);
    return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('');
  $('#scope-trace').setAttribute('d', path);
  $('#scope-mode').textContent = acSignal ? 'AC · 50 Hz model' : dcSignal ? 'DC · steady model' : 'No energized signal';
  $('#scope-signal').textContent = acSignal ? '230 V AC model' : dcSignal ? `${sourceVoltage} V DC model` : 'No signal';
  $('#scope-vpp').textContent = acSignal ? `${(sourceVoltage * Math.sqrt(2)).toFixed(0)} V (modeled)` : dcSignal ? '0 V ripple (idealized)' : '0 V';
}

function getCloudConfiguration() {
  const config = window.DANGOTE_SUPABASE_CONFIG;
  if (!config || typeof config.url !== 'string' || typeof config.anonKey !== 'string' ||
    !config.url.trim() || !config.anonKey.trim()) return null;
  const endpoint = new URL(config.url);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.supabase.co') ||
    endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('Supabase URL must be an HTTPS Supabase project URL.');
  }
  return { url: endpoint.origin, anonKey: config.anonKey.trim() };
}

function getCloudSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(cloudSessionStorageKey) || 'null');
    if (session?.accessToken && session?.refreshToken && session?.user?.id) return session;
    return null;
  } catch (error) {
    console.error('Cloud sign-in session could not be read.', error);
    sessionStorage.removeItem(cloudSessionStorageKey);
    return null;
  }
}

function saveCloudSession(session, requiresPasswordUpdate = false) {
  const safeSession = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: Number(session.expires_at) || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
    user: { id: session.user.id, email: session.user.email || '' },
    requiresPasswordUpdate
  };
  if (!safeSession.accessToken || !safeSession.refreshToken || !safeSession.user.id) {
    throw new Error('The sign-in response did not contain a valid session.');
  }
  sessionStorage.setItem(cloudSessionStorageKey, JSON.stringify(safeSession));
  return safeSession;
}

async function sendCloudRequest(path, { method = 'GET', body, token, prefer } = {}) {
  const config = getCloudConfiguration();
  if (!config) throw new Error('Cloud accounts are not configured.');
  const headers = { apikey: config.anonKey, Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${config.url}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let result = null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch (error) {
      console.error('Cloud service returned malformed JSON.', error);
      throw new Error('Cloud service returned an unreadable response.');
    }
  }
  if (!response.ok) {
    const message = result?.msg || result?.message || result?.hint || result?.error_description;
    const requestError = new Error(message || `Cloud request failed (${response.status}).`);
    requestError.status = response.status;
    throw requestError;
  }
  return result;
}

async function refreshCloudSession(session) {
  const result = await sendCloudRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: session.refreshToken }
  });
  return saveCloudSession(result, session.requiresPasswordUpdate === true);
}

function clearCloudAuthCallback() {
  const url = new URL(window.location.href);
  ['token_hash', 'type', 'error', 'error_code', 'error_description'].forEach(key => url.searchParams.delete(key));
  url.hash = '';
  const cleanUrl = `${url.pathname}${url.search}`;
  window.history.replaceState(null, document.title, cleanUrl);
}

async function processCloudAuthCallback() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const fragmentType = fragment.get('type');
  if (fragment.get('access_token') && fragment.get('refresh_token') &&
    ['invite', 'recovery', 'signup'].includes(fragmentType)) {
    const accessToken = fragment.get('access_token');
    const user = await sendCloudRequest('/auth/v1/user', { token: accessToken });
    const session = saveCloudSession({
      access_token: accessToken,
      refresh_token: fragment.get('refresh_token'),
      expires_at: Number(fragment.get('expires_at')) || undefined,
      expires_in: Number(fragment.get('expires_in')) || 3600,
      user
    }, true);
    clearCloudAuthCallback();
    return session;
  }
  const query = new URLSearchParams(window.location.search);
  const tokenHash = query.get('token_hash');
  const queryType = query.get('type');
  if (tokenHash && ['invite', 'recovery', 'signup'].includes(queryType)) {
    const session = await sendCloudRequest('/auth/v1/verify', {
      method: 'POST',
      body: { token_hash: tokenHash, type: queryType }
    });
    const saved = saveCloudSession(session, true);
    clearCloudAuthCallback();
    return saved;
  }
  return null;
}

async function cloudRequest(path, options = {}) {
  let session = getCloudSession();
  if (!session) throw new Error('Sign in to use the cloud workspace.');
  if (session.expiresAt <= Math.floor(Date.now() / 1000) + 60) {
    session = await refreshCloudSession(session);
  }
  try {
    return await sendCloudRequest(path, { ...options, token: session.accessToken });
  } catch (error) {
    if (error.status !== 401) throw error;
    session = await refreshCloudSession(session);
    return sendCloudRequest(path, { ...options, token: session.accessToken });
  }
}

function setCloudStatus(message, state) {
  $('#cloud-status').textContent = message;
  $('#cloud-state').textContent = state;
}

function getApiCollectionPath(table, filters = {}) {
  const query = new URLSearchParams({ select: '*', ...filters });
  return `/rest/v1/${table}?${query.toString()}`;
}

async function renderCloudWorkspace() {
  const signInForm = $('#cloud-signin-form');
  const account = $('#cloud-account');
  if (!signInForm || !account) return;
  let config;
  try {
    config = getCloudConfiguration();
  } catch (error) {
    setCloudStatus(error.message, 'Configuration error');
    signInForm.hidden = true;
    account.hidden = true;
    return;
  }
  if (!config) {
    $('#cloud-submit-cohort-wrap').hidden = true;
    setCloudStatus('Cloud accounts are unavailable until a Supabase URL and public anon key are configured. Offline features continue to work.', 'Not configured');
    signInForm.hidden = true;
    account.hidden = true;
    return;
  }

  let session;
  try {
    session = await processCloudAuthCallback() || getCloudSession();
  } catch (error) {
    console.error('Cloud account callback could not be verified.', error);
    signInForm.hidden = false;
    account.hidden = true;
    setCloudStatus(`Account link could not be verified: ${error.message}`, 'Verification failed');
    return;
  }
  if (!session) {
    cloudContext = null;
    $('#cloud-submit-cohort-wrap').hidden = true;
    $('#cloud-cohorts').replaceChildren();
    signInForm.hidden = false;
    account.hidden = true;
    setCloudStatus('Sign in with an account invited by your academy administrator. Cloud permissions are enforced by Supabase policies.', 'Signed out');
    return;
  }

  signInForm.hidden = true;
  account.hidden = false;
  cloudContext = null;
  $('#cloud-submit-cohort-wrap').hidden = true;
  $('#cloud-cohorts').replaceChildren();
  setCloudStatus('Loading account and class information...', 'Connecting');
  try {
    const profilePath = getApiCollectionPath('profiles', { user_id: `eq.${session.user.id}` });
    const profiles = await cloudRequest(profilePath);
    const profile = profiles?.[0];
    if (!profile || !['student', 'instructor', 'administrator'].includes(profile.role)) {
      throw new Error('Your account does not have an academy profile. Ask an administrator to provision it.');
    }
    const membershipPath = getApiCollectionPath('cohort_members', {
      user_id: `eq.${session.user.id}`,
      select: 'cohort_id,member_role,cohort:cohorts(id,name)'
    });
    const memberships = await cloudRequest(membershipPath);
    const cohorts = [];
    for (const membership of memberships || []) {
      const cohort = Array.isArray(membership.cohort) ? membership.cohort[0] : membership.cohort;
      if (!cohort) continue;
      const projectPath = getApiCollectionPath('projects', {
        cohort_id: `eq.${cohort.id}`,
        order: 'updated_at.desc'
      });
      const projects = await cloudRequest(projectPath);
      let members = [];
      let inviteCode = '';
      if (membership.member_role === 'instructor' || profile.role === 'administrator') {
        const memberPath = getApiCollectionPath('cohort_members', {
          cohort_id: `eq.${cohort.id}`,
          select: 'user_id,member_role,profile:profiles(display_name)'
        });
        members = await cloudRequest(memberPath);
        const invitePath = getApiCollectionPath('cohort_invites', {
          cohort_id: `eq.${cohort.id}`,
          select: 'invite_code'
        });
        inviteCode = (await cloudRequest(invitePath))?.[0]?.invite_code || '';
      }
      cohorts.push({ ...cohort, memberRole: membership.member_role, projects: projects || [], members, inviteCode });
    }
    cloudContext = { profile, cohorts };
    $('#cloud-account-name').textContent = `${profile.display_name || session.user.email} (${profile.role})`;
    $('#cloud-display-name').value = profile.display_name || '';
    const needsPassword = session.requiresPasswordUpdate === true;
    $('#cloud-profile-form').hidden = needsPassword;
    $('#cloud-set-password-form').hidden = !needsPassword;
    if (needsPassword) $('#cloud-submit-cohort-wrap').hidden = true;
    $('#cloud-create-cohort-form').hidden = needsPassword || !['instructor', 'administrator'].includes(profile.role);
    $('#cloud-join-cohort-form').hidden = needsPassword || profile.role !== 'student';
    if (needsPassword) {
      setCloudStatus('Choose a new password to complete the account invitation or recovery.', 'Password update required');
      $('#cloud-cohorts').replaceChildren();
      return;
    }
    renderCloudCohorts();
    setCloudStatus('Cloud workspace connected. Account permissions and project access are checked by the server.', 'Connected');
  } catch (error) {
    console.error('Cloud workspace could not be loaded.', error);
    if ([400, 401].includes(error.status)) {
      sessionStorage.removeItem(cloudSessionStorageKey);
      cloudContext = null;
      signInForm.hidden = false;
      account.hidden = true;
      setCloudStatus('Cloud session expired or is no longer valid. Sign in again.', 'Signed out');
      return;
    }
    setCloudStatus(`Cloud workspace could not be loaded: ${error.message}`, 'Connection error');
  }
}

function renderCloudCohorts() {
  const target = $('#cloud-cohorts');
  if (!target || !cloudContext) return;
  const cohortSelect = $('#cloud-submit-cohort');
  const previousCohort = cohortSelect.value;
  const studentCohorts = cloudContext.cohorts.filter(cohort => cohort.memberRole === 'student');
  cohortSelect.innerHTML = '<option value="">Choose a class</option>';
  studentCohorts.forEach(cohort => {
    const option = document.createElement('option');
    option.value = cohort.id;
    option.textContent = cohort.name;
    cohortSelect.appendChild(option);
  });
  cohortSelect.value = studentCohorts.some(cohort => cohort.id === previousCohort)
    ? previousCohort
    : studentCohorts.length === 1 ? studentCohorts[0].id : '';
  $('#cloud-submit-cohort-wrap').hidden = cloudContext.profile.role !== 'student' || !studentCohorts.length;
  target.innerHTML = cloudContext.cohorts.length ? cloudContext.cohorts.map(cohort => {
    const staff = cohort.memberRole === 'instructor' || cloudContext.profile.role === 'administrator';
    const membersById = new Map((cohort.members || []).map(member => {
      const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
      return [member.user_id, profile?.display_name || 'Learner'];
    }));
    const pending = cohort.projects.filter(project => project.status === 'submitted').length;
    const projectRows = cohort.projects.length ? cohort.projects.map(project => {
      const actions = staff && project.status === 'submitted'
        ? `<textarea maxlength="500" aria-label="Review comment for ${escapeHtml(project.name)}" data-cloud-comment="${escapeHtml(project.id)}" placeholder="Optional feedback"></textarea><button class="secondary-button cloud-review-action" data-cloud-project="${escapeHtml(project.id)}" data-cloud-status="approved">Approve</button><button class="secondary-button cloud-review-action" data-cloud-project="${escapeHtml(project.id)}" data-cloud-status="changes-requested">Request changes</button>`
        : '';
      const ownerAction = project.owner_id === getCloudSession()?.user.id
        ? `<button class="secondary-button cloud-project-load" data-cloud-project="${escapeHtml(project.id)}">Load to this device</button>`
        : '';
      const progress = project.workspace?.learningProgress;
      const progressText = progress
        ? `<small>${Number(progress.lessonsCompleted) || 0}/${Number(progress.lessonsTotal) || 0} lessons | ${Number(progress.scenariosCompleted) || 0}/${Number(progress.scenariosTotal) || 0} building cases</small>`
        : '';
      const feedback = project.review_comment
        ? `<small>Instructor feedback: ${escapeHtml(project.review_comment)}</small>`
        : '';
      const evidence = staff
        ? `<details class="cloud-project-evidence"><summary>Project evidence</summary><pre>${escapeHtml(JSON.stringify({ boq: project.rows, workspace: project.workspace }, null, 2))}</pre></details>`
        : '';
      return `<div class="cloud-project-row"><span>${escapeHtml(membersById.get(project.owner_id) || (project.owner_id === getCloudSession()?.user.id ? cloudContext.profile.display_name || 'You' : 'Learner'))} - ${escapeHtml(project.name)}${progressText}${feedback}</span><span class="status ${project.status === 'approved' ? 'success' : project.status === 'changes-requested' ? 'danger' : 'info'}">${escapeHtml(project.status)}</span>${actions}${ownerAction}${evidence}</div>`;
    }).join('') : '<p class="muted">No cloud projects in this cohort yet.</p>';
    return `<article class="cloud-cohort-card"><div><h4>${escapeHtml(cohort.name)}</h4><p class="muted">${staff ? `${cohort.members.length} members | ${pending} awaiting review` : `${cohort.projects.length} of your projects`}</p>${staff && cohort.inviteCode ? `<p>Student invite code: <code>${escapeHtml(cohort.inviteCode)}</code></p>` : ''}</div>${projectRows}</article>`;
  }).join('') : '<p class="muted">No cohorts yet. Join with an invite code or create a cohort if your account has instructor permissions.</p>';
}

async function signInToCloud(event) {
  event.preventDefault();
  const email = $('#cloud-email').value.trim();
  const password = $('#cloud-password').value;
  try {
    const result = await sendCloudRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password }
    });
    saveCloudSession(result);
    $('#cloud-password').value = '';
    await renderCloudWorkspace();
  } catch (error) {
    console.error('Cloud sign-in failed.', error);
    setCloudStatus(`Sign-in failed: ${error.message}`, 'Sign-in failed');
  }
}

async function setCloudPassword(event) {
  event.preventDefault();
  const password = $('#cloud-new-password').value;
  if (password !== $('#cloud-confirm-password').value) {
    setCloudStatus('The password fields do not match.', 'Check password');
    return;
  }
  if (password.length < 12) {
    setCloudStatus('Use a password with at least 12 characters.', 'Check password');
    return;
  }
  const session = getCloudSession();
  if (!session) {
    setCloudStatus('The account link has expired. Request a new invite or recovery link.', 'Link expired');
    return;
  }
  try {
    await cloudRequest('/auth/v1/user', {
      method: 'PUT',
      body: { password }
    });
    const refreshedSession = getCloudSession();
    if (!refreshedSession) throw new Error('The account session ended before the password update completed.');
    refreshedSession.requiresPasswordUpdate = false;
    sessionStorage.setItem(cloudSessionStorageKey, JSON.stringify(refreshedSession));
    $('#cloud-set-password-form').reset();
    await renderCloudWorkspace();
    showToast('Account password updated.');
  } catch (error) {
    console.error('Cloud account password update failed.', error);
    setCloudStatus(`Password could not be updated: ${error.message}`, 'Update failed');
  }
}

async function signOutOfCloud() {
  let revokeError = null;
  if (getCloudSession()) {
    try {
      await cloudRequest('/auth/v1/logout', { method: 'POST' });
    } catch (error) {
      revokeError = error;
      console.error('Remote cloud sign-out failed.', error);
    }
  }
  sessionStorage.removeItem(cloudSessionStorageKey);
  cloudContext = null;
  $('#cloud-cohorts').replaceChildren();
  renderCloudWorkspace();
  if (revokeError) showToast(`Signed out on this device. Remote session revocation failed: ${revokeError.message}`);
  else showToast('Signed out of the cloud workspace.');
}

async function createCloudCohort(event) {
  event.preventDefault();
  const name = $('#cloud-new-cohort-name').value.trim();
  if (!name) return;
  try {
    await cloudRequest('/rest/v1/rpc/create_academy_cohort', { method: 'POST', body: { cohort_name: name } });
    $('#cloud-new-cohort-name').value = '';
    await renderCloudWorkspace();
    showToast('Cohort created. Share its invite code with enrolled students.');
  } catch (error) {
    console.error('Cohort creation failed.', error);
    setCloudStatus(`Cohort could not be created: ${error.message}`, 'Request failed');
  }
}

async function updateCloudProfile(event) {
  event.preventDefault();
  const displayName = $('#cloud-display-name').value.trim();
  if (!displayName || displayName.length > 80) {
    setCloudStatus('Enter a display name between 1 and 80 characters.', 'Invalid name');
    return;
  }
  try {
    const userId = getCloudSession()?.user.id;
    if (!userId) throw new Error('Sign in before updating your class name.');
    const params = new URLSearchParams({ user_id: `eq.${userId}` });
    await cloudRequest(`/rest/v1/profiles?${params}`, {
      method: 'PATCH',
      body: { display_name: displayName },
      prefer: 'return=minimal'
    });
    await renderCloudWorkspace();
    showToast('Class display name updated.');
  } catch (error) {
    console.error('Cloud profile update failed.', error);
    setCloudStatus(`Display name could not be updated: ${error.message}`, 'Update failed');
  }
}

async function joinCloudCohort(event) {
  event.preventDefault();
  const code = $('#cloud-invite-code').value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
    setCloudStatus('Enter the complete cohort invite code.', 'Invalid invite');
    return;
  }
  try {
    await cloudRequest('/rest/v1/rpc/join_academy_cohort', { method: 'POST', body: { invite_code: code } });
    $('#cloud-invite-code').value = '';
    await renderCloudWorkspace();
    showToast('Joined the cohort.');
  } catch (error) {
    console.error('Joining the cohort failed.', error);
    setCloudStatus(`Could not join the cohort: ${error.message}`, 'Request failed');
  }
}

async function reviewCloudProject(event) {
  const loadButton = event.target.closest('.cloud-project-load');
  if (loadButton) {
    loadCloudProjectToDevice(loadButton.dataset.cloudProject);
    return;
  }
  const button = event.target.closest('.cloud-review-action');
  if (!button || !cloudContext || !['approved', 'changes-requested'].includes(button.dataset.cloudStatus)) return;
  button.disabled = true;
  try {
    const comment = $$('[data-cloud-comment]', $('#cloud-cohorts'))
      .find(input => input.dataset.cloudComment === button.dataset.cloudProject)?.value.trim() || '';
    const params = new URLSearchParams({ id: `eq.${button.dataset.cloudProject}` });
    await cloudRequest(`/rest/v1/projects?${params}`, {
      method: 'PATCH',
      body: { status: button.dataset.cloudStatus, review_comment: comment },
      prefer: 'return=minimal'
    });
    await renderCloudWorkspace();
    showToast(`Cloud project marked ${button.dataset.cloudStatus}.`);
  } catch (error) {
    console.error('Cloud project review failed.', error);
    setCloudStatus(`Review could not be saved: ${error.message}`, 'Review failed');
    button.disabled = false;
  }
}

function loadCloudProjectToDevice(projectId) {
  if (!cloudContext || typeof projectId !== 'string') return false;
  const session = getCloudSession();
  const remote = cloudContext.cohorts
    .flatMap(cohort => cohort.projects)
    .find(project => project.id === projectId && project.owner_id === session?.user.id);
  if (!remote || !remote.workspace || !Array.isArray(remote.rows)) {
    showToast('This cloud project is unavailable or is not owned by your account.');
    return false;
  }
  const existing = getSavedProjects().find(project => project.name === remote.name);
  if (existing && !window.confirm('Replace the local project with this cloud copy? The existing local version will be kept as a revision.')) return false;
  const revisions = [...(Array.isArray(existing?.revisions) ? existing.revisions : [])];
  if (existing) {
    revisions.push({
      revisionId: `r-${Date.now()}`,
      savedAt: existing.savedAt || new Date().toISOString(),
      rows: existing.rows,
      circuit: existing.circuit,
      plc: existing.plc || null,
      schedule: existing.schedule || null,
      calculationInputs: existing.calculationInputs || null,
      motorDesignInputs: existing.motorDesignInputs || null,
      calculation: existing.calculation || null,
      motorDesign: existing.motorDesign || null,
      commissioning: existing.commissioning || getDefaultCommissioningSnapshot(),
      standardsReview: existing.standardsReview || getDefaultStandardsReviewSnapshot(),
      status: existing.status || 'draft'
    });
  }
  const sessionProfile = cloudContext.profile;
  const restored = {
    name: remote.name,
    savedAt: remote.updated_at || new Date().toISOString(),
    rows: remote.rows,
    circuit: remote.workspace.circuit,
    plc: remote.workspace.plc || null,
    schedule: remote.workspace.schedule || null,
    calculationInputs: remote.workspace.calculationInputs || null,
    motorDesignInputs: remote.workspace.motorDesignInputs || null,
    commissioning: remote.workspace.commissioning || getDefaultCommissioningSnapshot(),
    standardsReview: remote.workspace.standardsReview || getDefaultStandardsReviewSnapshot(),
    owner: { name: sessionProfile.display_name || getCloudSession()?.user.email || 'Learner', role: sessionProfile.role },
    cloudUserId: remote.owner_id,
    cloudCohortId: remote.cohort_id,
    status: normalizeProjectStatus(remote.status),
    comments: remote.review_comment || '',
    reviewHistory: Array.isArray(remote.review_history) ? remote.review_history.map(item => ({
      action: item.action || 'Reviewed',
      actor: item.actor_id === session?.user.id ? sessionProfile.display_name || 'You' : 'Instructor',
      at: item.at || remote.updated_at,
      comment: item.comment || ''
    })) : [],
    revisions: revisions.slice(-10),
    resubmissionCount: Array.isArray(remote.review_history)
      ? remote.review_history.filter(item => item.action === 'Resubmitted').length
      : existing?.resubmissionCount || 0
  };
  try {
    validateProjectWorkspace(restored);
    const projects = getSavedProjects().filter(project => project.name !== restored.name);
    projects.push(restored);
    localStorage.setItem('dangote-academy-projects', JSON.stringify(projects));
    projectsChangedDuringStartup = true;
    persistProjects(projects);
    refreshProjectList();
    $('#project-list').value = restored.name;
    renderRevisionControls(restored.name);
    loadNamedProject();
    renderReview();
    showToast(`Cloud project loaded on this device: ${restored.name}`);
    return true;
  } catch (error) {
    console.error('Cloud project could not be restored to this device.', error);
    showToast('Cloud project is invalid and was not loaded.');
    return false;
  }
}

async function syncSubmittedProjectToCloud(project) {
  try {
    if (!getCloudConfiguration()) return;
    const session = getCloudSession();
    if (!session) {
      showToast('Project submitted on this device. Sign in to send it to a class.');
      return;
    }
    if (!cloudContext) await renderCloudWorkspace();
    const membership = cloudContext?.cohorts.find(cohort =>
      cohort.memberRole === 'student' && cohort.id === $('#cloud-submit-cohort').value
    );
    if (!membership) {
      showToast('Project is saved locally. Join a class in Profile before sending it to the cloud.');
      return;
    }
    const params = new URLSearchParams({
      owner_id: `eq.${session.user.id}`,
      cohort_id: `eq.${membership.id}`,
      name: `eq.${project.name}`,
      select: 'id,status'
    });
    const matches = await cloudRequest(`/rest/v1/projects?${params}`);
    const workspace = {
      circuit: project.circuit,
      plc: project.plc,
      schedule: project.schedule,
      calculationInputs: project.calculationInputs,
      motorDesignInputs: project.motorDesignInputs,
      commissioning: project.commissioning,
      standardsReview: project.standardsReview || getDefaultStandardsReviewSnapshot(),
      learningProgress: getStudentProgressSummary()
    };
    let remoteProject = matches?.[0];
    if (!remoteProject) {
      const created = await cloudRequest('/rest/v1/projects', {
        method: 'POST',
        body: {
          owner_id: session.user.id,
          cohort_id: membership.id,
          name: project.name,
          rows: project.rows,
          workspace,
          status: 'draft'
        },
        prefer: 'return=representation'
      });
      remoteProject = created?.[0];
    } else {
      if (remoteProject.status === 'approved') {
        throw new Error('This cloud project was approved. Save a new project name to submit a separate design.');
      }
      await cloudRequest(`/rest/v1/projects?id=eq.${encodeURIComponent(remoteProject.id)}`, {
        method: 'PATCH',
        body: { rows: project.rows, workspace, status: 'draft' },
        prefer: 'return=minimal'
      });
    }
    if (!remoteProject?.id) throw new Error('Cloud project was saved without a project identifier.');
    await cloudRequest(`/rest/v1/projects?id=eq.${encodeURIComponent(remoteProject.id)}`, {
      method: 'PATCH',
      body: { status: 'submitted' },
      prefer: 'return=minimal'
    });
    await renderCloudWorkspace();
    showToast('Project submitted to the cloud class dashboard.');
  } catch (error) {
    console.error('Cloud project submission failed.', error);
    showToast(`Project remains submitted on this device; cloud sync failed: ${error.message}`);
  }
}

function getProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(profileStorageKey) || 'null');
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Invalid saved profile.');
    return {
      name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Engr. Ahmed',
      studentId: typeof profile.studentId === 'string' ? profile.studentId : '',
      role: ['student', 'instructor', 'administrator'].includes(profile.role) ? profile.role : 'student'
    };
  } catch {
    return { name: 'Engr. Ahmed', studentId: '', role: 'instructor' };
  }
}

function saveProfile() {
  const profile = {
    name: $('#profile-name').value.trim() || 'Unnamed learner',
    studentId: $('#profile-student-id').value.trim(),
    role: ['student', 'instructor', 'administrator'].includes($('#profile-role').value)
      ? $('#profile-role').value
      : 'student'
  };
  localStorage.setItem(profileStorageKey, JSON.stringify(profile));
  const profiles = getStoredProfiles().filter(item => profile.studentId
    ? item.studentId !== profile.studentId
    : item.name !== profile.name);
  profiles.push({ ...profile, updatedAt: new Date().toISOString() });
  localStorage.setItem(profileDirectoryKey, JSON.stringify(profiles.slice(-100)));
  $('#profile-name-display').textContent = profile.name;
  $('#profile-role-display').textContent = `${profile.role[0].toUpperCase()}${profile.role.slice(1)} role`;
  applyRoleControls();
  renderReview();
  renderAdminTools();
  showToast('Offline profile saved.');
}

function getStoredProfiles() {
  try {
    const profiles = JSON.parse(localStorage.getItem(profileDirectoryKey) || '[]');
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    return [];
  }
}

function getRole() {
  return getProfile().role || 'student';
}

function canReviewProjects() {
  return ['instructor', 'administrator'].includes(getRole());
}

function canManageWorkspace() {
  return getRole() === 'administrator';
}

function applyRoleControls() {
  const role = getRole();
  $$('[data-role]').forEach(control => {
    if (!control) return;
    const roles = (control.dataset.role || '').split(',').map(item => item.trim()).filter(Boolean);
    control.hidden = roles.length > 0 && !roles.includes(role);
  });
  $$('[data-student-only]').forEach(control => { if (control) control.hidden = role !== 'student'; });
  const roleHint = $('#role-control-hint');
  if (roleHint) roleHint.textContent = role === 'student'
    ? 'Students can save and submit projects for instructor review.'
    : role === 'administrator'
      ? 'Administrators can manage local profiles and project records.'
      : 'Instructors can review submissions and return them for changes.';
}

function getTroubleshootingProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem(troubleshootingStorageKey) || '{}');
    return progress && typeof progress === 'object' ? progress : {};
  } catch {
    return {};
  }
}

function getStationDiagnosticsProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem(stationDiagnosticsStorageKey) || '{}');
    return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  } catch {
    return {};
  }
}

function getElectronicsDiagnosticsProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem(electronicsDiagnosticsStorageKey) || '{}');
    return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  } catch {
    return {};
  }
}

function getPlcChallengeProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem(plcChallengeStorageKey) || '{}');
    return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  } catch {
    return {};
  }
}

function getPlcTroubleshootingProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem(plcTroubleshootingStorageKey) || '{}');
    return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
  } catch {
    return {};
  }
}

function getStudentProgressSummary() {
  const lessons = getLessonProgress();
  const troubleshooting = getTroubleshootingProgress();
  const stationDiagnostics = getStationDiagnosticsProgress();
  const electronicsDiagnostics = getElectronicsDiagnosticsProgress();
  const plcChallengesProgress = getPlcChallengeProgress();
  const plcDiagnosticsProgress = getPlcTroubleshootingProgress();
  const projects = getSavedProjects();
  return {
    lessonsCompleted: guidedLessons.filter(lesson => lessons[lesson.id]).length,
    lessonsTotal: guidedLessons.length,
    scenariosCompleted: troubleshootingScenarios.filter((scenario, index) => troubleshooting[scenario.id || `scenario-${index}`]?.completed).length,
    scenariosTotal: troubleshootingScenarios.length,
    attempts: troubleshootingScenarios.reduce((total, scenario, index) => total + (troubleshooting[scenario.id || `scenario-${index}`]?.attempts || 0), 0),
    stationScenariosCompleted: stationDiagnosticScenarios.filter(scenario => stationDiagnostics[scenario.id]?.completed).length,
    stationScenariosTotal: stationDiagnosticScenarios.length,
    stationAttempts: stationDiagnosticScenarios.reduce((total, scenario) => total + (Number(stationDiagnostics[scenario.id]?.attempts) || 0), 0),
    electronicsScenariosCompleted: electronicsDiagnosticScenarios.filter(scenario => electronicsDiagnostics[scenario.id]?.completed).length,
    electronicsScenariosTotal: electronicsDiagnosticScenarios.length,
    electronicsAttempts: electronicsDiagnosticScenarios.reduce((total, scenario) => total + (Number(electronicsDiagnostics[scenario.id]?.attempts) || 0), 0),
    plcChallengesCompleted: plcChallenges.filter(challenge => plcChallengesProgress[challenge.id]?.completed).length,
    plcChallengesTotal: plcChallenges.length,
    plcChallengesAttempts: plcChallenges.reduce((total, challenge) => total + (Number(plcChallengesProgress[challenge.id]?.attempts) || 0), 0),
    plcScenariosCompleted: plcTroubleshootingCases.filter(scenario => plcDiagnosticsProgress[scenario.id]?.completed).length,
    plcScenariosTotal: plcTroubleshootingCases.length,
    plcScenarioAttempts: plcTroubleshootingCases.reduce((total, scenario) => total + (Number(plcDiagnosticsProgress[scenario.id]?.attempts) || 0), 0),
    projectsSubmitted: projects.filter(project => ['submitted', 'approved', 'changes-requested'].includes(project.status)).length,
    projectsApproved: projects.filter(project => project.status === 'approved').length
  };
}

function renderDashboard() {
  const date = $('#dashboard-date');
  const greeting = $('#dashboard-greeting');
  const activity = $('#dashboard-activity');
  if (!date || !greeting || !activity) return;

  const now = new Date();
  const hour = now.getHours();
  const greetingPrefix = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  date.textContent = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(now);
  greeting.textContent = `${greetingPrefix}, ${getProfile().name}.`;

  const projects = getSavedProjects().filter(project =>
    project && typeof project.name === 'string' && project.name.trim()
  );
  const lessons = getLessonProgress();
  const troubleshooting = getTroubleshootingProgress();
  const stationDiagnostics = getStationDiagnosticsProgress();
  const electronicsDiagnostics = getElectronicsDiagnosticsProgress();
  const plcChallengeProgress = getPlcChallengeProgress();
  const completedLessons = guidedLessons.filter(lesson => lessons[lesson.id]).length;
  const completedScenarios = troubleshootingScenarios.filter((scenario, index) =>
    troubleshooting[scenario.id || `scenario-${index}`]?.completed
  ).length;

  $('#dashboard-project-count').textContent = String(projects.length);
  $('#dashboard-lesson-count').textContent = `${completedLessons} / ${guidedLessons.length}`;
  $('#dashboard-scenario-count').textContent = `${completedScenarios} / ${troubleshootingScenarios.length}`;
  const completedStationCases = stationDiagnosticScenarios.filter(scenario =>
    stationDiagnostics[scenario.id]?.completed
  ).length;
  $('#dashboard-station-count').textContent = `Power-station cases ${completedStationCases} / ${stationDiagnosticScenarios.length}`;
  $('#dashboard-electronics-count').textContent = `Electronics cases ${electronicsDiagnosticScenarios.filter(scenario => electronicsDiagnostics[scenario.id]?.completed).length} / ${electronicsDiagnosticScenarios.length}`;
  const plcCompleted = plcChallenges.filter(challenge => plcChallengeProgress[challenge.id]?.completed).length;
  $('#dashboard-plc-count').textContent = `PLC challenges ${plcCompleted} / ${plcChallenges.length}`;
  $('#dashboard-boq-count').textContent = String($$('#boq-body tr').length);

  const events = projects
    .filter(project => Number.isFinite(Date.parse(project.savedAt)))
    .map(project => ({
      title: `Project saved: ${project.name}`,
      detail: `Project · ${project.status || 'draft'}`,
      at: project.savedAt,
      icon: 'fa-folder-open',
      color: 'blue-bg'
    }));
  guidedLessons.forEach(lesson => {
    const at = lessons[lesson.id]?.completedAt;
    if (Number.isFinite(Date.parse(at))) {
      events.push({
        title: `Lesson completed: ${lesson.title}`,
        detail: 'Guided learning',
        at,
        icon: 'fa-graduation-cap',
        color: 'violet-bg'
      });
    }
  });
  troubleshootingScenarios.forEach((scenario, index) => {
    const progress = troubleshooting[scenario.id || `scenario-${index}`];
    if (progress?.completed && Number.isFinite(Date.parse(progress.completedAt))) {
      events.push({
        title: `Scenario solved: ${scenario.title}`,
        detail: `Troubleshooting · ${Number(progress.attempts) || 0} attempt${Number(progress.attempts) === 1 ? '' : 's'}`,
        at: progress.completedAt,
        icon: 'fa-screwdriver-wrench',
        color: 'yellow-bg'
      });
    }
  });
  stationDiagnosticScenarios.forEach(scenario => {
    const progress = stationDiagnostics[scenario.id];
    if (progress?.completed && Number.isFinite(Date.parse(progress.completedAt))) {
      events.push({
        title: `Power-station case solved: ${scenario.title}`,
        detail: `${scenario.system} · ${Number(progress.attempts) || 0} attempt${Number(progress.attempts) === 1 ? '' : 's'}`,
        at: progress.completedAt,
        icon: 'fa-industry',
        color: 'yellow-bg'
      });
    }
  });
  electronicsDiagnosticScenarios.forEach(scenario => {
    const progress = electronicsDiagnostics[scenario.id];
    if (progress?.completed && Number.isFinite(Date.parse(progress.completedAt))) {
      events.push({
        title: `Electronics case solved: ${scenario.title}`,
        detail: `Electronics diagnostics · ${Number(progress.attempts) || 0} attempt${Number(progress.attempts) === 1 ? '' : 's'}`,
        at: progress.completedAt,
        icon: 'fa-microchip',
        color: 'violet-bg'
      });
    }
  });
  const plcProgress = getPlcChallengeProgress();
  plcChallenges.forEach(challenge => {
    const completed = plcProgress[challenge.id];
    if (completed?.completed && Number.isFinite(Date.parse(completed.completedAt))) {
      events.push({
        title: `PLC challenge passed: ${challenge.title}`,
        detail: `PLC training · ${Number(completed.attempts) || 0} attempt${Number(completed.attempts) === 1 ? '' : 's'}`,
        at: completed.completedAt,
        icon: 'fa-microchip',
        color: 'violet-bg'
      });
    }
  });

  events.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  activity.innerHTML = events.length
    ? events.slice(0, 5).map(event => `<div class="activity"><span class="activity-icon ${event.color}"><i class="fa-solid ${event.icon}"></i></span><div><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail)} · ${escapeHtml(new Date(event.at).toLocaleString())}</small></div></div>`).join('')
    : '<p class="dashboard-empty">Your saved projects, completed lessons, and solved scenarios will appear here.</p>';
}

function renderStudentProgressSummary() {
  const summary = getStudentProgressSummary();
  const target = $('#student-progress-summary');
  if (target) target.innerHTML = `<span>Lessons <b>${summary.lessonsCompleted}/${summary.lessonsTotal}</b></span><span>Building scenarios <b>${summary.scenariosCompleted}/${summary.scenariosTotal}</b></span><span>Power-station cases <b>${summary.stationScenariosCompleted}/${summary.stationScenariosTotal}</b></span><span>Electronics cases <b>${summary.electronicsScenariosCompleted}/${summary.electronicsScenariosTotal}</b></span><span>PLC challenges <b>${summary.plcChallengesCompleted}/${summary.plcChallengesTotal}</b></span><span>PLC cases <b>${summary.plcScenariosCompleted}/${summary.plcScenariosTotal}</b></span><span>Attempts <b>${summary.attempts + summary.stationAttempts + summary.electronicsAttempts + summary.plcChallengesAttempts + summary.plcScenarioAttempts}</b></span><span>Submitted <b>${summary.projectsSubmitted}</b></span>`;
  renderDashboard();
}

function normalizeProjectStatus(status, fallback = 'draft') {
  const allowed = new Set(['draft', 'submitted', 'changes-requested', 'approved']);
  return allowed.has(status) ? status : fallback;
}

function getProjectReviewSummary(projects) {
  const summary = { total: projects.length, draft: 0, submitted: 0, changesRequested: 0, approved: 0 };
  projects.forEach(project => {
    const status = normalizeProjectStatus(project.status, 'draft');
    if (status === 'draft') summary.draft += 1;
    if (status === 'submitted') summary.submitted += 1;
    if (status === 'changes-requested') summary.changesRequested += 1;
    if (status === 'approved') summary.approved += 1;
  });
  return summary;
}

function renderReview() {
  const projects = getSavedProjects();
  const progress = getLessonProgress();
  const summary = getProjectReviewSummary(projects);
  const summaryText = `${projects.length} saved project${projects.length === 1 ? '' : 's'} · ${summary.submitted} awaiting review · ${summary.changesRequested} needs changes · ${summary.approved} approved · ${Object.keys(progress).length}/${guidedLessons.length} lessons complete`;
  $('#review-summary').textContent = summaryText;

  const queueSummary = $('#review-queue-summary');
  if (!queueSummary) {
    const root = $('#module-review');
    if (root) {
      const summaryNode = document.createElement('div');
      summaryNode.id = 'review-queue-summary';
      summaryNode.className = 'review-summary-row';
      root.insertBefore(summaryNode, root.querySelector('.review-grid'));
    }
  }
  const summaryContainer = $('#review-queue-summary');
  if (summaryContainer) {
    summaryContainer.innerHTML = `
      <span class="status-pill pending">Awaiting review: <strong>${summary.submitted}</strong></span>
      <span class="status-pill warning">Changes requested: <strong>${summary.changesRequested}</strong></span>
      <span class="status-pill success">Approved: <strong>${summary.approved}</strong></span>
      <span class="status-pill neutral">Drafts: <strong>${summary.draft}</strong></span>
    `;
  }

  $('#review-projects').innerHTML = projects.length ? projects.map(project => {
    const history = Array.isArray(project.reviewHistory) ? project.reviewHistory : [];
    const status = normalizeProjectStatus(project.status, 'draft');
    const plcSummary = project.plc
      ? `<small>PLC: ${escapeHtml(plcPrograms[project.plc.programId]?.title || 'Saved ladder')} · ${project.plc.model.rungs.length} rung${project.plc.model.rungs.length === 1 ? '' : 's'}</small>`
      : '';
    return `<article class="review-card" data-project="${escapeHtml(project.name)}"><div><strong>${escapeHtml(project.name)}</strong><small>Owner: ${escapeHtml(project.owner?.name || 'Local learner')} · Saved ${escapeHtml(new Date(project.savedAt).toLocaleString())}</small>${plcSummary}<span class="status ${status === 'approved' ? 'success' : status === 'changes-requested' ? 'danger' : status === 'submitted' ? 'info' : 'info'}">${escapeHtml(status)}</span><small>${project.resubmissionCount || 0} resubmission${project.resubmissionCount === 1 ? '' : 's'} · ${history.length} review event${history.length === 1 ? '' : 's'}</small>${project.comments ? `<p class="review-comment"><strong>Latest feedback:</strong> ${escapeHtml(project.comments)}</p>` : ''}<details><summary>Review history</summary><ul>${history.length ? history.map(event => `<li>${escapeHtml(event.action)} · ${escapeHtml(event.actor || 'Unknown')} · ${escapeHtml(new Date(event.at).toLocaleString())}${event.comment ? ` — ${escapeHtml(event.comment)}` : ''}</li>`).join('') : '<li>No history yet.</li>'}</ul></details></div><div class="review-actions"><textarea class="review-comment-input" data-role="instructor,administrator" data-name="${escapeHtml(project.name)}" maxlength="500" placeholder="Comment for the student" ${status !== 'submitted' ? 'disabled' : ''}>${escapeHtml(project.comments || '')}</textarea><div class="button-row" data-role="instructor,administrator"><button class="secondary-button review-action" data-name="${escapeHtml(project.name)}" data-status="approved" ${status !== 'submitted' ? 'disabled' : ''}>Approve</button><button class="secondary-button review-action" data-name="${escapeHtml(project.name)}" data-status="changes-requested" ${status !== 'submitted' ? 'disabled' : ''}>Request changes</button></div></div></article>`;
  }).join('') : '<div class="review-empty-state" data-role="instructor,administrator"><p class="muted">Save a project to review it here.</p></div>';
  applyRoleControls();
  renderStudentProgressSummary();
}

function updateProjectReviewStatus(name, status) {
  if (!canReviewProjects()) {
    showToast('Only instructors and administrators can review projects.');
    return false;
  }
  if (!['approved', 'changes-requested'].includes(status)) {
    showToast('Choose a valid review status.');
    return false;
  }
  const project = getSavedProjects().find(item => item.name === name);
  if (!project || project.status !== 'submitted') {
    showToast('Only submitted projects can be reviewed.');
    return false;
  }
  const commentInput = $$('.review-comment-input').find(input => input.dataset.name === name);
  const comment = commentInput?.value.trim() || project.comments || '';
  const now = new Date().toISOString();
  const projects = getSavedProjects().map(project => {
    if (project.name !== name) return project;
    const history = Array.isArray(project.reviewHistory) ? project.reviewHistory : [];
    return { ...project, status, comments: comment, reviewedAt: now, reviewer: getProfile().name, reviewHistory: [...history, { action: status === 'approved' ? 'Approved' : 'Requested changes', actor: getProfile().name, at: now, comment }] };
  });
  localStorage.setItem('dangote-academy-projects', JSON.stringify(projects));
  projectsChangedDuringStartup = true;
  persistProjects(projects);
  renderReview();
  showToast(`Project marked ${status}.`);
  return true;
}

function submitNamedProject() {
  if (getRole() !== 'student') {
    showToast('Only student profiles can submit projects.');
    return false;
  }
  const name = $('#project-name')?.value.trim();
  if (!name) {
    showToast('Enter a project name before submitting.');
    return false;
  }
  const project = getSavedProjects().find(item => item.name === name);
  if (!project) {
    showToast('Save the project before submitting it.');
    return false;
  }
  const activeSnapshot = projectSnapshot(name);
  if (JSON.stringify(project.rows || []) !== JSON.stringify(activeSnapshot.rows) ||
    JSON.stringify(project.circuit || {}) !== JSON.stringify(activeSnapshot.circuit) ||
    JSON.stringify(project.schedule || null) !== JSON.stringify(activeSnapshot.schedule) ||
    JSON.stringify(project.calculationInputs || null) !== JSON.stringify(activeSnapshot.calculationInputs) ||
    JSON.stringify(project.motorDesignInputs || null) !== JSON.stringify(activeSnapshot.motorDesignInputs) ||
    JSON.stringify(project.commissioning || getDefaultCommissioningSnapshot()) !== JSON.stringify(activeSnapshot.commissioning) ||
    JSON.stringify(project.standardsReview || getDefaultStandardsReviewSnapshot()) !== JSON.stringify(activeSnapshot.standardsReview)) {
    showToast('Save the latest project changes before submitting.');
    return false;
  }
  if (project.owner?.studentId
    ? project.owner.studentId !== getProfile().studentId
    : project.owner?.name && project.owner.name !== getProfile().name) {
    showToast('You can only submit projects owned by your profile.');
    return false;
  }
  if (['submitted', 'approved'].includes(project.status)) {
    showToast('This project is already submitted or approved.');
    return false;
  }
  const now = new Date().toISOString();
  const resubmission = project.status === 'changes-requested';
  const updated = getSavedProjects().map(item => item.name === name ? {
    ...item,
    status: 'submitted',
    submittedAt: now,
    submittedBy: getProfile().name,
    resubmissionCount: (item.resubmissionCount || 0) + (resubmission ? 1 : 0),
    reviewHistory: [...(Array.isArray(item.reviewHistory) ? item.reviewHistory : []), { action: resubmission ? 'Resubmitted' : 'Submitted', actor: getProfile().name, at: now }]
  } : item);
  localStorage.setItem('dangote-academy-projects', JSON.stringify(updated));
  projectsChangedDuringStartup = true;
  persistProjects(updated);
  renderReview();
  renderStudentProgressSummary();
  showToast(resubmission ? 'Project resubmitted for instructor review.' : 'Project submitted for instructor review.');
  syncSubmittedProjectToCloud(updated.find(item => item.name === name));
  return true;
}

function renderAdminTools() {
  const target = $('#admin-management');
  if (!target) return;
  const profiles = getStoredProfiles();
  const projects = getSavedProjects();
  target.innerHTML = `<p class="muted">${profiles.length} local profile${profiles.length === 1 ? '' : 's'} · ${projects.length} project${projects.length === 1 ? '' : 's'} stored offline.</p><div class="admin-list">${profiles.map(profile => `<span>${escapeHtml(profile.name)} · ${escapeHtml(profile.role)}${profile.studentId ? ` · ${escapeHtml(profile.studentId)}` : ''}</span>`).join('') || '<span>No additional profiles saved.</span>'}</div>`;
}

function insertLoadScheduleModule() {
  const section = document.createElement('section');
  section.className = 'module';
  section.id = 'module-load-schedule';
  section.innerHTML = `<div class="section-heading"><div><p class="eyebrow accent">Engineering tools</p><h2>Load schedule & design checks</h2><p class="muted">Build a training load schedule and review diversified demand before cable selection.</p></div><span class="demo-note"><i class="fa-solid fa-circle-info"></i> Training estimate</span></div><div class="schedule-toolbar"><label>System phase<select id="schedule-phase"><option value="1">Single phase · 230 V</option><option value="3">Three phase · 400 V</option></select></label><label>Installation method<select id="schedule-method"><option value="clipped">Clipped direct</option><option value="conduit">Enclosed in conduit</option><option value="tray">Cable tray</option><option value="ground">Direct in ground</option></select></label><label>RCD protection<select id="schedule-rcd"><option value="recommended">Recommended</option><option value="not-required">Not required for this exercise</option></select></label><button class="secondary-button" id="add-load-row"><i class="fa-solid fa-plus"></i> Add circuit</button><button class="primary-button" id="calculate-schedule"><i class="fa-solid fa-calculator"></i> Recalculate schedule</button></div><article class="panel table-panel"><div class="table-scroll"><table class="schedule-table"><thead><tr><th>Circuit</th><th>Load (kW)</th><th>Qty</th><th>Power factor</th><th>Diversity</th><th>Phase</th><th>Action</th></tr></thead><tbody id="schedule-body"></tbody></table></div></article><div class="schedule-results"><article class="stat-card blue"><span>Connected load</span><strong id="schedule-connected">0.00 kW</strong><small>Total installed load</small></article><article class="stat-card yellow"><span>Diversified demand</span><strong id="schedule-demand">0.00 kW</strong><small>After diversity factors</small></article><article class="stat-card green"><span>Estimated design current</span><strong id="schedule-current">0.00 A</strong><small>Based on selected phase</small></article><article class="protection-card" id="protection-result"><div><span>Protection review</span><strong id="schedule-protection">--</strong></div><small id="schedule-capacity">Cable capacity: --</small><small id="schedule-rcd-result">RCD: --</small><small id="schedule-balance-result">Phase balance: --</small><small id="schedule-neutral-result">Estimated neutral: --</small></article><article class="schedule-status" id="schedule-status"><i class="fa-solid fa-circle-check"></i><div><strong>Ready for review</strong><p>Check protective devices and installation conditions against the applicable standard.</p></div></article></div><article class="panel plot-panel"><div class="panel-heading"><div><p class="eyebrow">Phase analysis</p><h3>Estimated current by phase</h3></div><span class="demo-note">Schedule model</span></div><div id="schedule-phase-plot" class="engineering-plot" role="img" aria-label="Phase current plot appears after schedule calculation."></div><p class="plot-note">Phase current is estimated from schedule demand and power factor. Verify conductor and neutral calculations to the applicable standard.</p></article>`;
  $('.page-content').appendChild(section);
  [['Lighting circuit', 1.2, 1, .95, .8], ['Socket outlets', 3, 1, .9, .6], ['Small motor', 4, 1, .82, .7]].forEach(row => addScheduleRow(...row));
}

function addScheduleRow(name = 'New circuit', load = 1, quantity = 1, pf = .9, diversity = .8, phase = 'phase-a') {
  const row = document.createElement('tr');
  row.innerHTML = `<td><input class="schedule-name" value="${escapeHtml(name)}" maxlength="60"></td><td><input class="schedule-load" type="number" value="${escapeHtml(load)}" min="0" step="0.1"></td><td><input class="schedule-qty" type="number" value="${escapeHtml(quantity)}" min="1" step="1"></td><td><input class="schedule-pf" type="number" value="${escapeHtml(pf)}" min="0.01" max="1" step="0.01"></td><td><input class="schedule-diversity" type="number" value="${escapeHtml(diversity)}" min="0.01" max="1" step="0.01"></td><td><select class="schedule-row-phase" aria-label="Circuit phase"><option value="phase-a">Phase A</option><option value="phase-b">Phase B</option><option value="phase-c">Phase C</option></select></td><td><button class="delete-schedule-row" aria-label="Delete circuit"><i class="fa-solid fa-trash"></i></button></td>`;
  $('#schedule-body').appendChild(row);
  $('.schedule-row-phase', row).value = phase;
}

function getLoadScheduleSnapshot() {
  return {
    phase: Number($('#schedule-phase').value),
    method: $('#schedule-method').value,
    rcd: $('#schedule-rcd').value,
    rows: $$('#schedule-body tr').map(row => ({
      name: $('.schedule-name', row).value,
      load: $('.schedule-load', row).value,
      quantity: $('.schedule-qty', row).value,
      pf: $('.schedule-pf', row).value,
      diversity: $('.schedule-diversity', row).value,
      phase: $('.schedule-row-phase', row).value
    }))
  };
}

function getLoadSizingInputs() {
  return {
    phase: $('#calc-phase').value,
    loadType: $('#calc-load-type').value,
    loadValue: $('#calc-load-value').value,
    pf: $('#calc-pf').value,
    diversity: $('#calc-diversity').value,
    cableLength: $('#calc-length').value,
    ambientFactor: $('#calc-ambient').value,
    groupingFactor: $('#calc-grouping').value,
    installMethod: $('#calc-install-method').value
  };
}

function setFieldValidity(field, valid, message = '') {
  if (!field) return false;
  field.setAttribute('aria-invalid', String(!valid));
  if (typeof field.setCustomValidity === 'function') {
    field.setCustomValidity(message);
  }
  return valid;
}

function validateFormField(field, { label, min, max, integer = false, required = true } = {}) {
  if (!field) return false;
  const value = Number(field.value);
  const hasValue = field.value !== '' && field.value.trim() !== '';
  const validNumber = hasValue && Number.isFinite(value);
  const validRange = validNumber && (!Number.isFinite(min) || value >= min) && (!Number.isFinite(max) || value <= max) &&
    (!integer || Number.isInteger(value));
  const needsInput = required ? hasValue : true;
  const valid = needsInput && validRange;
  const message = `${label} must be ${integer ? 'a whole number' : 'a valid value'}${Number.isFinite(min) && Number.isFinite(max) ? ` between ${min} and ${max}` : Number.isFinite(min) ? ` greater than or equal to ${min}` : Number.isFinite(max) ? ` less than or equal to ${max}` : ''}.`;
  const ok = setFieldValidity(field, valid, valid ? '' : message);
  if (!ok && typeof field.reportValidity === 'function') field.reportValidity();
  return ok;
}

function validateLoadSizingField(field, { label, min, max, integer = false } = {}) {
  return validateFormField(field, { label, min, max, integer });
}

function isValidLoadSizingInputs(inputs) {
  const numericDraft = value => (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length <= 32 && (value === '' || Number.isFinite(Number(value))));
  return Boolean(inputs && typeof inputs === 'object' && !Array.isArray(inputs) &&
    [1, 3].includes(Number(inputs.phase)) && ['kw', 'hp', 'amps'].includes(inputs.loadType) &&
    ['clipped', 'conduit', 'tray', 'ground'].includes(inputs.installMethod) &&
    [1, .94, .87].includes(Number(inputs.ambientFactor)) &&
    [1, .8, .7].includes(Number(inputs.groupingFactor)) &&
    ['loadValue', 'pf', 'diversity', 'cableLength'].every(key => numericDraft(inputs[key])));
}

function invalidateLoadSizingResult() {
  lastCalculation = null;
  if ($('#add-to-boq')) $('#add-to-boq').disabled = true;
  if ($('#res-capacity-warning')) {
    $('#res-capacity-warning').textContent = 'Inputs changed; recalculate before using this result.';
    $('#res-capacity-warning').className = 'warning';
  }
}

function restoreLoadSizingInputs(inputs) {
  if (!isValidLoadSizingInputs(inputs)) throw new Error('Invalid load sizing inputs.');
  $('#calc-phase').value = String(inputs.phase);
  $('#calc-load-type').value = inputs.loadType;
  $('#calc-load-value').value = inputs.loadValue;
  $('#calc-pf').value = inputs.pf;
  $('#calc-diversity').value = inputs.diversity;
  $('#calc-length').value = inputs.cableLength;
  $('#calc-ambient').value = ['1', '.94', '.87'].find(value => Number(value) === Number(inputs.ambientFactor));
  $('#calc-grouping').value = ['1', '.8', '.7'].find(value => Number(value) === Number(inputs.groupingFactor));
  $('#calc-install-method').value = inputs.installMethod;
  calculateLoad({ preventDefault() {} });
}

function isValidLoadScheduleSnapshot(schedule) {
  const numericDraft = value => (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length <= 32 && (value === '' || Number.isFinite(Number(value))));
  return Boolean(schedule && typeof schedule === 'object' && !Array.isArray(schedule) &&
    [1, 3].includes(schedule.phase) &&
    ['clipped', 'conduit', 'tray', 'ground'].includes(schedule.method) &&
    ['recommended', 'not-required'].includes(schedule.rcd) &&
    Array.isArray(schedule.rows) && schedule.rows.length <= 500 &&
    schedule.rows.every(row => row && typeof row.name === 'string' && row.name.length <= 60 &&
      numericDraft(row.load) && numericDraft(row.quantity) &&
      numericDraft(row.pf) && numericDraft(row.diversity) &&
      ['phase-a', 'phase-b', 'phase-c'].includes(row.phase)));
}

function restoreLoadSchedule(schedule) {
  if (!isValidLoadScheduleSnapshot(schedule)) throw new Error('Invalid load schedule.');
  $('#schedule-phase').value = String(schedule.phase);
  $('#schedule-method').value = schedule.method;
  $('#schedule-rcd').value = schedule.rcd;
  $('#schedule-body').innerHTML = '';
  schedule.rows.forEach(row => addScheduleRow(
    row.name, row.load, row.quantity, row.pf, row.diversity, row.phase
  ));
  if (schedule.rows.length) calculateSchedule();
  else clearScheduleResults();
}

function resetLoadSchedule() {
  $('#schedule-phase').value = '1';
  $('#schedule-method').value = 'clipped';
  $('#schedule-rcd').value = 'recommended';
  $('#schedule-body').innerHTML = '';
  clearScheduleResults();
}

function clearScheduleResults() {
  lastScheduleResult = null;
  $('#schedule-connected').textContent = '--';
  $('#schedule-demand').textContent = '--';
  $('#schedule-current').textContent = '--';
  $('#schedule-protection').textContent = 'No saved schedule';
  $('#schedule-capacity').textContent = 'Add a load circuit to calculate capacity.';
  $('#schedule-rcd-result').textContent = 'RCD: --';
  $('#schedule-balance-result').textContent = 'Phase balance: --';
  $('#schedule-neutral-result').textContent = 'Estimated neutral: --';
  $('#schedule-status').className = 'schedule-status';
  $('#schedule-status').querySelector('strong').textContent = 'Ready for review';
  $('#schedule-status').querySelector('p').textContent = 'Add a load circuit to calculate a schedule. Verify the applicable standard before use.';
}

function calculateSchedule() {
  clearEngineeringPlot('schedule-phase-plot', 'Correct the schedule inputs to plot phase currents.');
  const scheduleRows = $$('#schedule-body tr');
  const validRows = scheduleRows.length > 0 && scheduleRows.every(row => {
    const load = Number($('.schedule-load', row).value);
    const qty = Number($('.schedule-qty', row).value);
    const pf = Number($('.schedule-pf', row).value);
    const diversity = Number($('.schedule-diversity', row).value);
    const fields = [
      { field: $('.schedule-load', row), label: 'Circuit load', min: 0, max: Number.MAX_SAFE_INTEGER },
      { field: $('.schedule-qty', row), label: 'Circuit quantity', min: 1 },
      { field: $('.schedule-pf', row), label: 'Circuit power factor', min: 0.01, max: 1 },
      { field: $('.schedule-diversity', row), label: 'Circuit diversity', min: 0.01, max: 1 }
    ];
    return fields.every(item => validateFormField(item.field, item)) && [load, qty, pf, diversity].every(value => Number.isFinite(value));
  });
  if (!validRows) {
    lastScheduleResult = null;
    $('#schedule-connected').textContent = '--';
    $('#schedule-demand').textContent = '--';
    $('#schedule-current').textContent = '--';
    $('#schedule-protection').textContent = 'Review inputs';
    $('#schedule-capacity').textContent = 'Check the highlighted circuit values before calculating.';
    $('#schedule-status').className = 'schedule-status review';
    $('#schedule-status').querySelector('strong').textContent = 'Review required';
    $('#schedule-status').querySelector('p').textContent = 'Fix the highlighted circuit values before calculating this schedule.';
    return;
  }
  const result = window.DangoteAcademyCore.calculateScheduleSizing({
    phase: Number($('#schedule-phase').value),
    method: $('#schedule-method').value,
    rcd: $('#schedule-rcd').value,
    rows: scheduleRows.map(row => ({
      load: Number($('.schedule-load', row).value),
      quantity: Number($('.schedule-qty', row).value),
      pf: Number($('.schedule-pf', row).value),
      diversity: Number($('.schedule-diversity', row).value),
      phase: $('.schedule-row-phase', row).value
    }))
  });
  if (!result.valid) {
    lastScheduleResult = null;
    $('#schedule-connected').textContent = '--';
    $('#schedule-demand').textContent = '--';
    $('#schedule-current').textContent = '--';
    $('#schedule-protection').textContent = 'Review inputs';
    $('#schedule-capacity').textContent = result.error;
    $('#schedule-status').className = 'schedule-status review';
    $('#schedule-status').querySelector('strong').textContent = 'Review required';
    $('#schedule-status').querySelector('p').textContent = result.error;
    showToast(result.error);
    return;
  }
  lastScheduleResult = result;
  renderEngineeringPlot('schedule-phase-plot', {
    xLabel: 'Phase index',
    yLabel: 'Estimated current (A)',
    series: [{
      name: 'Phase A / B / C',
      points: ['phase-a', 'phase-b', 'phase-c'].map((phase, index) => ({
        x: index + 1,
        y: Number(result.phaseCurrents[phase]) || 0
      }))
    }]
  });
  $('#schedule-connected').textContent = `${result.connected.toFixed(2)} kW`;
  $('#schedule-demand').textContent = `${result.demand.toFixed(2)} kW`;
  $('#schedule-current').textContent = `${result.current.toFixed(2)} A`;
  $('#schedule-protection').textContent = `${result.breakerRating ? `${result.breakerRating}A Type C` : 'No coordinated breaker'} · ${result.cable.size} mm²`;
  $('#schedule-capacity').textContent = `Derated cable capacity: ${result.deratedCapacity.toFixed(1)} A`;
  $('#schedule-rcd-result').textContent = `RCD: ${$('#schedule-rcd').value === 'recommended' ? '30 mA protection recommended' : 'Confirm requirement separately'}`;
  $('#schedule-balance-result').textContent = `Phase balance: ${result.balancePercent.toFixed(1)}% spread`;
  $('#schedule-neutral-result').textContent = `Estimated neutral: ${result.neutralCurrent.toFixed(2)} A`;
  const status = $('#schedule-status');
  status.className = `schedule-status ${result.needsReview ? 'review' : ''}`;
  status.querySelector('strong').textContent = result.needsReview ? 'Review required' : 'Protection coordinated for exercise';
  status.querySelector('p').textContent = result.needsReview ? `Verify feeder protection, cable capacity, phase balance, and applicable standards before use.${result.phaseWarnings.length ? ` ${result.phaseWarnings.join('. ')}.` : ''}` : 'The training breaker is within the selected cable capacity after derating.';
}

function getMotorDesignInputs() {
  return {
    powerKw: $('#motor-power').value,
    voltage: $('#motor-voltage').value,
    powerFactor: $('#motor-pf').value,
    efficiency: $('#motor-efficiency').value,
    startingCurrentMultiple: $('#motor-start-multiple').value,
    cableLength: $('#motor-length').value,
    installMethod: $('#motor-install-method').value,
    ambientFactor: $('#motor-ambient').value,
    groupingFactor: $('#motor-grouping').value
  };
}

function isValidMotorDesignInputs(inputs) {
  const numericDraft = value => (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length <= 32 && value !== '' && Number.isFinite(Number(value)));
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) ||
    !['powerKw', 'voltage', 'powerFactor', 'efficiency', 'startingCurrentMultiple', 'cableLength', 'ambientFactor', 'groupingFactor'].every(key => numericDraft(inputs[key])) ||
    !['clipped', 'conduit', 'tray', 'ground'].includes(inputs.installMethod)) {
    return false;
  }
  const numericInputs = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [
    key,
    key === 'installMethod' ? value : Number(value)
  ]));
  return window.DangoteAcademyCore.calculateMotorDesign(numericInputs).valid;
}

function calculateMotorFeeder(event) {
  event?.preventDefault();
  clearEngineeringPlot('motor-design-plot', 'Enter valid motor inputs to plot the feeder estimate.');
  const rawInputs = getMotorDesignInputs();
  const fieldChecks = [
    { field: $('#motor-power'), label: 'Motor output', min: 0.1 },
    { field: $('#motor-voltage'), label: 'Supply voltage', min: 1 },
    { field: $('#motor-pf'), label: 'Power factor', min: 0.01, max: 1 },
    { field: $('#motor-efficiency'), label: 'Efficiency', min: 0.01, max: 1 },
    { field: $('#motor-start-multiple'), label: 'Starting current multiple', min: 1 },
    { field: $('#motor-length'), label: 'Cable length', min: 1 },
    { field: $('#motor-ambient'), label: 'Ambient factor', min: 0.01, max: 1 },
    { field: $('#motor-grouping'), label: 'Grouping factor', min: 0.01, max: 1 }
  ];
  const allFieldsValid = fieldChecks.every(item => validateFormField(item.field, item));
  if (!allFieldsValid) {
    $('#motor-result-current').textContent = '--';
    $('#motor-result-start').textContent = '--';
    $('#motor-result-cable').textContent = '--';
    $('#motor-result-breaker').textContent = '--';
    $('#motor-result-drop').textContent = '--';
    $('#motor-result-capacity').textContent = 'Check the highlighted motor inputs.';
    $('#motor-result-warning').textContent = 'Check the highlighted motor inputs before using the estimate.';
    $('#motor-result-warning').className = 'warning';
    return false;
  }
  const inputs = Object.fromEntries(Object.entries(rawInputs).map(([key, value]) => [
    key,
    key === 'installMethod' ? value : Number(value)
  ]));
  const result = window.DangoteAcademyCore.calculateMotorDesign(inputs);
  lastMotorDesign = null;
  if (!result.valid) {
    $('#motor-result-current').textContent = '--';
    $('#motor-result-start').textContent = '--';
    $('#motor-result-cable').textContent = '--';
    $('#motor-result-breaker').textContent = '--';
    $('#motor-result-drop').textContent = '--';
    $('#motor-result-capacity').textContent = result.error;
    $('#motor-result-warning').textContent = result.error;
    $('#motor-result-warning').className = 'warning';
    return false;
  }
  $('#motor-result-current').textContent = result.current.toFixed(2);
  $('#motor-result-start').textContent = result.startingCurrent.toFixed(2);
  $('#motor-result-start-note').textContent = `${result.startingCurrentMultiple}× multiplier · confirm from motor/starter data`;
  $('#motor-result-cable').textContent = `${result.cable.size} mm²`;
  $('#motor-result-breaker').textContent = result.breakerRating ? `${result.breakerRating} A (training table)` : 'No coordinated rating';
  $('#motor-result-drop').textContent = `${result.voltageDrop} V · ${result.voltageDropPercent.toFixed(2)}%`;
  $('#motor-result-capacity').textContent = `Derated capacity ${result.actualCapacity} A · ${result.methodLabel} · ${result.cableLength} m`;
  const adequate = result.withinCapacity && result.protectionCoordinated;
  $('#motor-result-warning').textContent = adequate
    ? 'Training estimate only. Confirm motor nameplate current, starting conditions, fault protection, and applicable installation requirements before design approval.'
    : 'No adequate cable and breaker combination is available in this training table. Recheck inputs and have the design reviewed.';
  $('#motor-result-warning').className = adequate ? 'muted' : 'warning';
  const powerMax = inputs.powerKw;
  const motorPoints = Array.from({ length: 11 }, (_, index) => {
    const powerKw = powerMax * (index + 1) / 10;
    const curve = window.DangoteAcademyCore.calculateMotorDesign({ ...inputs, powerKw });
    return curve.valid ? { x: powerKw, y: curve.current } : null;
  }).filter(Boolean);
  renderEngineeringPlot('motor-design-plot', {
    xLabel: 'Motor output (kW)',
    yLabel: 'Estimated current (A)',
    series: [{ name: 'Full-load current', points: motorPoints }]
  });
  lastMotorDesign = { inputs: rawInputs, ...result };
  return true;
}

function restoreMotorDesignInputs(inputs) {
  if (!isValidMotorDesignInputs(inputs)) throw new Error('Invalid motor design inputs.');
  $('#motor-power').value = inputs.powerKw;
  $('#motor-voltage').value = inputs.voltage;
  $('#motor-pf').value = inputs.powerFactor;
  $('#motor-efficiency').value = inputs.efficiency;
  $('#motor-start-multiple').value = inputs.startingCurrentMultiple;
  $('#motor-length').value = inputs.cableLength;
  $('#motor-install-method').value = inputs.installMethod;
  $('#motor-ambient').value = String(inputs.ambientFactor);
  $('#motor-grouping').value = String(inputs.groupingFactor);
  if (!calculateMotorFeeder()) throw new Error('Invalid motor design inputs.');
}

function getDefaultCommissioningSnapshot() {
  return commissioningChecks.map(check => ({ id: check.id, status: 'not-recorded', note: '' }));
}

function getCommissioningSnapshot() {
  return commissioningChecks.map(check => {
    const card = $(`[data-commissioning-check="${check.id}"]`);
    return {
      id: check.id,
      status: $('.commissioning-status', card)?.value || 'not-recorded',
      note: $('.commissioning-note', card)?.value || ''
    };
  });
}

function isValidCommissioningSnapshot(checks) {
  return Array.isArray(checks) && checks.length === commissioningChecks.length &&
    new Set(checks.map(item => item?.id)).size === commissioningChecks.length &&
    checks.every(item => commissioningChecks.some(check => check.id === item?.id) &&
      commissioningStatuses.includes(item.status) &&
      typeof item.note === 'string' && item.note.length <= 500);
}

function renderCommissioningChecks(checks = getDefaultCommissioningSnapshot()) {
  if (!isValidCommissioningSnapshot(checks)) throw new Error('Invalid installation record.');
  const byId = new Map(checks.map(item => [item.id, item]));
  $('#commissioning-checks').innerHTML = commissioningChecks.map(check => {
    const item = byId.get(check.id);
    return `<article class="commissioning-card" data-commissioning-check="${check.id}"><div><h4>${escapeHtml(check.title)}</h4><p>${escapeHtml(check.description)}</p></div><label>Status<select class="commissioning-status"><option value="not-recorded" ${item.status === 'not-recorded' ? 'selected' : ''}>Not recorded</option><option value="recorded" ${item.status === 'recorded' ? 'selected' : ''}>Recorded by competent person</option><option value="review" ${item.status === 'review' ? 'selected' : ''}>Needs review</option></select></label><label>Evidence reference or action note<textarea class="commissioning-note" maxlength="500" rows="2" placeholder="e.g. test sheet reference or outstanding action">${escapeHtml(item.note)}</textarea></label></article>`;
  }).join('');
  updateCommissioningProgress();
}

function updateCommissioningProgress() {
  if (!$('#commissioning-checks')) return;
  const checks = getCommissioningSnapshot();
  const recorded = checks.filter(item => item.status === 'recorded').length;
  const review = checks.filter(item => item.status === 'review').length;
  $('#installation-progress').textContent = `${recorded} / ${commissioningChecks.length} recorded`;
  $('#installation-progress').parentElement.setAttribute('aria-label', `${recorded} checks recorded by a competent person, ${review} need review`);
}

function persistCommissioningDraft() {
  const checks = getCommissioningSnapshot();
  localStorage.setItem('dangote-academy-installation', JSON.stringify(checks));
  updateCommissioningProgress();
}

function restoreCommissioningChecks(checks) {
  const restored = checks || getDefaultCommissioningSnapshot();
  renderCommissioningChecks(restored);
  persistCommissioningDraft();
}

function getSavedCommissioningDraft() {
  const saved = localStorage.getItem('dangote-academy-installation');
  if (!saved) return getDefaultCommissioningSnapshot();
  try {
    const checks = JSON.parse(saved);
    if (!isValidCommissioningSnapshot(checks)) throw new Error('Saved installation record has an unsupported format.');
    return checks;
  } catch (error) {
    console.error('Saved installation record could not be restored.', error);
    showToast('Saved installation records are invalid; a new checklist was opened.');
    return getDefaultCommissioningSnapshot();
  }
}

function getDefaultStandardsReviewSnapshot() {
  return {
    jurisdiction: 'Nigeria',
    standard: 'NESIS Regulations (proposed basis; applicability to be confirmed)',
    edition: '2015',
    amendments: '',
    reviewerName: '',
    reviewerQualification: '',
    reviewerOrganization: '',
    reviewDate: '',
    sourceReferences: [
      'NEMSA NESIS Regulations 2015: https://nemsa.gov.ng/wp-content/uploads/2019/11/NESIS-Regulations-2015-1-1.pdf',
      'NEMSA standards, policies and guidelines: https://web.nemsa.gov.ng/regulations',
      'IEC: https://www.iec.ch',
      'ECOWAS document supplied for review: https://eis.ecowas.int/assets/front/medias/doc/media_20231011104957.pdf',
      'Standards Organisation of Nigeria: https://son.gov.ng/',
      'ECREEE: https://www.ecreee.org/'
    ].join('\n'),
    reviewerDeclaration: false,
    checks: standardsReviewChecks.map(check => ({ id: check.id, status: 'not-reviewed', note: '' }))
  };
}

function getStandardsReviewCrosswalk() {
  return standardsReviewCrosswalk.map(item => ({ ...item }));
}

function isValidStandardsReviewSnapshot(review) {
  const textLimits = {
    jurisdiction: 120,
    standard: 180,
    edition: 100,
    amendments: 300,
    reviewerName: 100,
    reviewerQualification: 160,
    reviewerOrganization: 140,
    sourceReferences: 600
  };
  return Boolean(review && typeof review === 'object' && !Array.isArray(review) &&
    Object.entries(textLimits).every(([key, maxLength]) =>
      typeof review[key] === 'string' && review[key].length <= maxLength) &&
    typeof review.reviewerDeclaration === 'boolean' &&
    typeof review.reviewDate === 'string' &&
    (review.reviewDate === '' || /^\d{4}-\d{2}-\d{2}$/.test(review.reviewDate)) &&
    Array.isArray(review.checks) && review.checks.length === standardsReviewChecks.length &&
    new Set(review.checks.map(item => item?.id)).size === standardsReviewChecks.length &&
    review.checks.every(item => standardsReviewChecks.some(check => check.id === item?.id) &&
      standardsReviewStatuses.includes(item.status) &&
      typeof item.note === 'string' && item.note.length <= 500));
}

function getStandardsReviewSnapshot() {
  const checks = standardsReviewChecks.map(check => {
    const card = $(`[data-standards-check="${check.id}"]`);
    return {
      id: check.id,
      status: $('.standards-review-status', card)?.value || 'not-reviewed',
      note: $('.standards-review-note', card)?.value || ''
    };
  });
  return {
    jurisdiction: $('#standards-jurisdiction')?.value.trim() || '',
    standard: $('#standards-name')?.value.trim() || '',
    edition: $('#standards-edition')?.value.trim() || '',
    amendments: $('#standards-amendments')?.value.trim() || '',
    reviewerName: $('#standards-reviewer-name')?.value.trim() || '',
    reviewerQualification: $('#standards-reviewer-qualification')?.value.trim() || '',
    reviewerOrganization: $('#standards-reviewer-organization')?.value.trim() || '',
    reviewDate: $('#standards-review-date')?.value || '',
    sourceReferences: $('#standards-source-references')?.value.trim() || '',
    reviewerDeclaration: $('#standards-reviewer-declaration')?.checked || false,
    checks
  };
}

function standardsReviewRecordStatus(review) {
  const completeBasis = Boolean(review.jurisdiction && review.standard && review.edition);
  const completeReviewer = Boolean(review.reviewerName && review.reviewerQualification &&
    review.reviewDate && review.reviewerDeclaration);
  const resolvedChecks = review.checks.every(item =>
    ['reviewed-acceptable', 'action-required', 'not-applicable'].includes(item.status));
  if (!completeBasis || !completeReviewer || !resolvedChecks) return 'Record incomplete';
  return 'External review recorded; compliance not verified by this app';
}

function renderStandardsReview(review = getDefaultStandardsReviewSnapshot()) {
  if (!isValidStandardsReviewSnapshot(review)) throw new Error('Invalid standards review record.');
  $('#standards-jurisdiction').value = review.jurisdiction;
  $('#standards-name').value = review.standard;
  $('#standards-edition').value = review.edition;
  $('#standards-amendments').value = review.amendments;
  $('#standards-reviewer-name').value = review.reviewerName;
  $('#standards-reviewer-qualification').value = review.reviewerQualification;
  $('#standards-reviewer-organization').value = review.reviewerOrganization;
  $('#standards-review-date').value = review.reviewDate;
  $('#standards-source-references').value = review.sourceReferences;
  $('#standards-reviewer-declaration').checked = review.reviewerDeclaration;
  $('#standards-crosswalk-list').innerHTML = standardsReviewCrosswalk.map(item =>
    `<article class="standards-crosswalk-item"><h5>${escapeHtml(item.topic)}</h5><p><strong>Current model:</strong> ${escapeHtml(item.model)}</p><p><strong>Source pointers:</strong> ${escapeHtml(item.references)}</p><p><strong>Reviewer action:</strong> ${escapeHtml(item.review)}</p><span class="demo-note">Review required; no compliance conclusion</span></article>`
  ).join('');
  const byId = new Map(review.checks.map(item => [item.id, item]));
  $('#standards-review-checks').innerHTML = standardsReviewChecks.map(check => {
    const item = byId.get(check.id);
    return `<article class="standards-review-card" data-standards-check="${check.id}"><div><h4>${escapeHtml(check.title)}</h4><p>${escapeHtml(check.description)}</p></div><label>Reviewer-entered outcome<select class="standards-review-status"><option value="not-reviewed" ${item.status === 'not-reviewed' ? 'selected' : ''}>Not reviewed</option><option value="reviewed-acceptable" ${item.status === 'reviewed-acceptable' ? 'selected' : ''}>Reviewer marked acceptable</option><option value="action-required" ${item.status === 'action-required' ? 'selected' : ''}>Action required</option><option value="awaiting-evidence" ${item.status === 'awaiting-evidence' ? 'selected' : ''}>Awaiting evidence</option><option value="not-applicable" ${item.status === 'not-applicable' ? 'selected' : ''}>Not applicable (reviewer decision)</option></select></label><label>Evidence reference or action note<textarea class="standards-review-note" maxlength="500" rows="2" placeholder="Use a drawing, calculation, test record, or action reference; avoid confidential data">${escapeHtml(item.note)}</textarea></label></article>`;
  }).join('');
  updateStandardsReviewStatus();
}

function updateStandardsReviewStatus() {
  const review = getStandardsReviewSnapshot();
  const counts = standardsReviewStatuses.reduce((result, status) => {
    result[status] = review.checks.filter(item => item.status === status).length;
    return result;
  }, {});
  const done = counts['reviewed-acceptable'] + counts['action-required'] + counts['not-applicable'];
  $('#standards-review-progress').textContent =
    `${done} / ${standardsReviewChecks.length} topics recorded · ${counts['action-required']} actions · ${counts['awaiting-evidence']} awaiting evidence`;
  $('#standards-review-record-status').textContent = standardsReviewRecordStatus(review);
}

function persistStandardsReviewDraft() {
  const review = getStandardsReviewSnapshot();
  localStorage.setItem(standardsReviewStorageKey, JSON.stringify(review));
  updateStandardsReviewStatus();
}

function restoreStandardsReview(review) {
  const restored = review || getDefaultStandardsReviewSnapshot();
  if (!isValidStandardsReviewSnapshot(restored)) throw new Error('Invalid standards review record.');
  renderStandardsReview(restored);
  persistStandardsReviewDraft();
}

function getSavedStandardsReviewDraft() {
  const saved = localStorage.getItem(standardsReviewStorageKey);
  if (!saved) return getDefaultStandardsReviewSnapshot();
  try {
    const review = JSON.parse(saved);
    if (!isValidStandardsReviewSnapshot(review)) throw new Error('Saved standards review has an unsupported format.');
    return review;
  } catch (error) {
    console.error('Saved standards review could not be restored.', error);
    showToast('Saved standards review data is invalid; a new review record was opened.');
    return getDefaultStandardsReviewSnapshot();
  }
}

function calculateLoad(event) {
  event?.preventDefault();
  clearEngineeringPlot('load-sizing-plot', 'Enter valid load inputs to plot the design current.');

  const phaseField = $('#calc-phase');
  const loadTypeField = $('#calc-load-type');
  const loadValueField = $('#calc-load-value');
  const pfField = $('#calc-pf');
  const diversityField = $('#calc-diversity');
  const cableLengthField = $('#calc-length');
  const ambientField = $('#calc-ambient');
  const groupingField = $('#calc-grouping');
  const installMethodField = $('#calc-install-method');

  const fields = [
    { field: loadValueField, label: 'Load value', min: 0.01 },
    { field: pfField, label: 'Power factor', min: 0.01, max: 1 },
    { field: diversityField, label: 'Diversity factor', min: 0.01, max: 1 },
    { field: cableLengthField, label: 'Cable length', min: 1 },
    { field: ambientField, label: 'Ambient factor', min: 0.01, max: 1 },
    { field: groupingField, label: 'Grouping factor', min: 0.01, max: 1 }
  ];
  const allFieldsValid = fields.every(item => validateLoadSizingField(item.field, item)) &&
    [phaseField, loadTypeField, installMethodField].every(field => field && field.value && field.value !== '');

  if (!allFieldsValid) {
    lastCalculation = null;
    $('#add-to-boq').disabled = true;
    $('#res-capacity-warning').textContent = 'Check the highlighted fields before using the result.';
    $('#res-capacity-warning').className = 'warning';
    return;
  }

  const phase = Number($('#calc-phase').value);
  const loadType = $('#calc-load-type').value;
  const loadValue = Number($('#calc-load-value').value);
  const pf = Number($('#calc-pf').value);
  const diversity = Number($('#calc-diversity').value);
  const cableLength = Number($('#calc-length').value);
  const ambientFactor = Number($('#calc-ambient').value);
  const groupingFactor = Number($('#calc-grouping').value);
  const installMethod = $('#calc-install-method').value;
  const result = window.DangoteAcademyCore.calculateLoadSizing({ phase, loadType, loadValue, pf, diversity, installMethod, cableLength, ambientFactor, groupingFactor });
  if (!result.valid) {
    lastCalculation = null;
    $('#add-to-boq').disabled = true;
    $('#res-capacity-warning').textContent = result.error;
    $('#res-capacity-warning').className = 'warning';
    showToast(result.error);
    return;
  }
  const loadCurve = Array.from({ length: 11 }, (_, index) => {
    const value = loadValue * (index + 1) / 10;
    const point = window.DangoteAcademyCore.calculateLoadSizing({
      phase, loadType, loadValue: value, pf, diversity, installMethod,
      cableLength, ambientFactor, groupingFactor
    });
    return point.valid ? { x: value, y: point.current } : null;
  }).filter(Boolean);
  renderEngineeringPlot('load-sizing-plot', {
    xLabel: `Connected load (${loadType})`,
    yLabel: 'Estimated current (A)',
    series: [{ name: 'Design current', points: loadCurve }]
  });
  lastCalculation = null;
  $('#add-to-boq').disabled = !result.withinCapacity || !result.protectionCoordinated;
  $('#res-current').textContent = result.current.toFixed(2);
  $('#res-cable').textContent = result.cable.size;
  $('#res-capacity').textContent = result.actualCapacity;
  $('#res-capacity-warning').textContent = result.withinCapacity && result.protectionCoordinated
    ? ''
    : !result.withinCapacity
      ? `No listed cable is adequate for ${result.current.toFixed(2)} A at the selected correction factors.`
      : 'No listed breaker rating coordinates with this cable and design current.';
  $('#res-capacity-warning').className = result.withinCapacity && result.protectionCoordinated ? '' : 'warning';
  $('#res-method-txt').textContent = result.methodLabel;
  $('#res-breaker').textContent = result.breakerRating ? `${result.breakerRating}A Type C` : 'No coordinated breaker';
  $('#res-vdrop').textContent = `${result.voltageDrop} V`;
  $('#res-vdrop').className = result.voltageDrop > result.voltage * .05 ? 'warning' : 'safe';
  const derating = Number.isFinite(result.derating) ? result.derating : result.actualCapacity / result.cable.capacity;
  const voltageDropPercent = Number.isFinite(result.voltageDropPercent) ? result.voltageDropPercent : result.voltageDrop / result.voltage * 100;
  $('#res-derating').textContent = `${(derating * 100).toFixed(0)}`;
  $('#res-vdrop-percent').textContent = voltageDropPercent.toFixed(2);
  if (result.withinCapacity && result.protectionCoordinated) {
    lastCalculation = {
      inputs: getLoadSizingInputs(),
      current: result.current,
      cable: result.cable,
      breaker: `${result.breakerRating}A Type C`,
      breakerRating: result.breakerRating,
      derating: result.derating,
      actualCapacity: result.actualCapacity,
      cableLength: result.cableLength,
      voltageDrop: result.voltageDrop,
      voltageDropPercent: result.voltageDropPercent,
      voltage: result.voltage,
      withinCapacity: result.withinCapacity,
      protectionCoordinated: result.protectionCoordinated
    };
    showToast('Cable sizing result updated.');
  } else {
    showToast('No coordinated cable and breaker combination is available. Review the load and installation.');
  }
}

function updateBOQ() {
  let total = 0;
  $$('#boq-body tr').forEach(row => {
    const input = $('.qty-input', row);
    const value = Number(input?.value);
    const qty = Number.isFinite(value) && value >= 0 ? value : 0;
    if (input && qty !== value) input.value = String(qty);
    const unitPrice = Number($('.unit-price', row)?.textContent.replace(/,/g, '')) || 0;
    const rowTotal = qty * unitPrice;
    $('.item-total', row).textContent = rowTotal.toLocaleString('en-US');
    total += rowTotal;
  });
  $('#boq-total').textContent = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!restoringBOQ) saveBOQ();
  renderDashboard();
}

function saveBOQ() {
  const rows = $$('#boq-body tr').map(row => ({
    description: $('td strong', row)?.textContent || '',
    category: row.cells[1]?.textContent || '',
    quantity: $('.qty-input', row)?.value || 0,
    unit: row.cells[3]?.textContent || '',
    price: Number($('.unit-price', row)?.textContent.replace(/,/g, '')) || 0
  }));
  localStorage.setItem('dangote-academy-boq', JSON.stringify(rows));
}

function getBOQRows() {
  return $$('#boq-body tr').map(row => ({
    description: $('td strong', row)?.textContent || '',
    category: row.cells[1]?.textContent || '',
    quantity: $('.qty-input', row)?.value || 0,
    unit: row.cells[3]?.textContent || '',
    price: Number($('.unit-price', row)?.textContent.replace(/,/g, '')) || 0
  }));
}

function getSavedProjects() {
  try {
    const projects = JSON.parse(localStorage.getItem('dangote-academy-projects') || '[]');
    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
}

function getPlcSnapshot() {
  return JSON.parse(JSON.stringify({
    schemaVersion: 1,
    programId: plcProgramId,
    model: plcModel || clonePlcProgram(plcPrograms[plcProgramId]),
    inputs: plcInputs,
    outputs: plcOutputs,
    analogInputs: plcAnalogInputs,
    analogOutputs: plcAnalogOutputs,
    runtimeState: plcRuntimeState,
    scanCount: plcScanCount
  }));
}

function validatePlcSnapshot(snapshot) {
  const rungs = Array.isArray(snapshot?.model?.rungs) ? snapshot.model.rungs : [];
  const timerPresets = Object.fromEntries(rungs.filter(rung => rung?.timer)
    .map(rung => [rung.timer.tag, rung.timer.presetScans]));
  const counterPresets = Object.fromEntries(rungs.filter(rung => rung?.counter)
    .map(rung => [rung.counter.tag, rung.counter.preset]));
  const runtimeState = snapshot?.runtimeState || { timers: {}, counters: {} };
  if (!snapshot || snapshot.schemaVersion !== 1 ||
    !Object.prototype.hasOwnProperty.call(plcPrograms, snapshot.programId) ||
    !window.DangoteAcademyCore.validatePlcProgram(snapshot.model).valid ||
    !snapshot.inputs || typeof snapshot.inputs !== 'object' || Array.isArray(snapshot.inputs) ||
    Object.keys(snapshot.inputs).some(tag => !plcInputCatalog.some(input => input.tag === tag)) ||
    Object.values(snapshot.inputs).some(value => typeof value !== 'boolean') ||
    !snapshot.outputs || typeof snapshot.outputs !== 'object' || Array.isArray(snapshot.outputs) ||
    Object.keys(snapshot.outputs).some(tag => !plcOutputCatalog.some(output => output.tag === tag)) ||
    Object.values(snapshot.outputs).some(value => typeof value !== 'boolean') ||
    !snapshot.analogInputs || typeof snapshot.analogInputs !== 'object' || Array.isArray(snapshot.analogInputs) ||
    Object.entries(snapshot.analogInputs).some(([tag, value]) =>
      !plcAnalogInputCatalog.some(input => input.tag === tag) || !Number.isFinite(value) || value < 0 || value > 100) ||
    !snapshot.analogOutputs || typeof snapshot.analogOutputs !== 'object' || Array.isArray(snapshot.analogOutputs) ||
    Object.entries(snapshot.analogOutputs).some(([tag, value]) =>
      tag !== 'AQ0' || !Number.isFinite(value) || value < 0 || value > 100) ||
    !runtimeState.timers || typeof runtimeState.timers !== 'object' || Array.isArray(runtimeState.timers) ||
    Object.entries(runtimeState.timers).some(([tag, state]) =>
      !Object.prototype.hasOwnProperty.call(timerPresets, tag) || !state ||
      !Number.isInteger(state.elapsedScans) || state.elapsedScans < 0 ||
      state.elapsedScans > timerPresets[tag] || typeof state.done !== 'boolean' ||
      state.done !== (state.elapsedScans >= timerPresets[tag])) ||
    !runtimeState.counters || typeof runtimeState.counters !== 'object' || Array.isArray(runtimeState.counters) ||
    Object.entries(runtimeState.counters).some(([tag, state]) =>
      !Object.prototype.hasOwnProperty.call(counterPresets, tag) || !state ||
      !Number.isInteger(state.count) || state.count < 0 || state.count > counterPresets[tag] ||
      typeof state.previousRung !== 'boolean') ||
    !Number.isInteger(snapshot.scanCount) || snapshot.scanCount < 0) {
    throw new Error('Invalid PLC workspace.');
  }
  const stateCheck = window.DangoteAcademyCore.calculatePlcScan(
    snapshot.model, snapshot.inputs, snapshot.outputs, runtimeState,
    snapshot.analogInputs
  );
  if (!stateCheck.valid) throw new Error(stateCheck.error);
}

function restorePlcSnapshot(snapshot) {
  validatePlcSnapshot(snapshot);
  stopPlcScans();
  plcProgramId = snapshot.programId;
  plcModel = clonePlcProgram(snapshot.model);
  plcInputs = Object.fromEntries(plcInputCatalog.map(input =>
    [input.tag, snapshot.inputs[input.tag] ?? input.initial]));
  plcOutputs = Object.fromEntries(plcOutputCatalog.map(output =>
    [output.tag, snapshot.outputs[output.tag] === true]));
  plcAnalogInputs = Object.fromEntries(plcAnalogInputCatalog.map(input =>
    [input.tag, Number.isFinite(snapshot.analogInputs[input.tag]) ? snapshot.analogInputs[input.tag] : input.initial]));
  plcAnalogOutputs = { AQ0: Number.isFinite(snapshot.analogOutputs.AQ0) ? snapshot.analogOutputs.AQ0 : 0 };
  plcRuntimeState = clonePlcProgram(snapshot.runtimeState || { timers: {}, counters: {} });
  plcScanCount = snapshot.scanCount;
  plcRungStates = [];
  plcTrendSamples = [];
  plcFault = 'none';
  $('#plc-fault').value = 'none';
  renderPlcWorkspace();
  savePlcState();
}

function openProjectDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is unavailable.'));
        return;
      }
      const request = indexedDB.open(projectDatabaseName, projectDatabaseVersion);
      request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'name' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Project database could not be opened.'));
    });
  }

async function persistProjects(projects) {
    if (browserTestMode) return;
    try {
      const database = await openProjectDatabase();
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction('projects', 'readwrite');
          transaction.objectStore('projects').clear();
          projects.forEach(project => transaction.objectStore('projects').put(project));
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error('Project database write failed.'));
          transaction.onabort = () => reject(transaction.error || new Error('Project database write was aborted.'));
        });
      } finally {
        database.close();
      }
    } catch (error) {
      console.warn('IndexedDB project persistence unavailable; localStorage remains active.', error);
    }
}

async function restoreProjectsFromDatabase() {
      try {
        const database = await openProjectDatabase();
        let databaseProjects;
        try {
          databaseProjects = await new Promise((resolve, reject) => {
            const request = database.transaction('projects', 'readonly').objectStore('projects').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Project database read failed.'));
          });
        } finally {
          database.close();
        }
        if (projectsChangedDuringStartup) return;
        const localSnapshot = localStorage.getItem('dangote-academy-projects');
        let localProjects = null;
        if (localSnapshot !== null) {
          try {
            localProjects = JSON.parse(localSnapshot);
            if (!Array.isArray(localProjects)) throw new Error('Saved project list is not an array.');
            localProjects.forEach(validateProjectWorkspace);
          } catch (error) {
            console.error('Local project snapshot could not be restored; checking IndexedDB.', error);
            localProjects = null;
          }
        }
        if (localProjects !== null) {
          await persistProjects(localProjects);
        } else if (databaseProjects.length) {
          databaseProjects.forEach(validateProjectWorkspace);
          localStorage.setItem('dangote-academy-projects', JSON.stringify(databaseProjects));
          refreshProjectList();
          renderRevisionControls();
          renderReview();
        }
      } catch (error) {
        console.warn('IndexedDB project restore unavailable; localStorage remains active.', error);
      }
}

function projectSnapshot(name) {
    return {
      name,
      savedAt: new Date().toISOString(),
      rows: getBOQRows(),
      circuit: serialiseCircuit(),
      plc: getPlcSnapshot(),
      schedule: getLoadScheduleSnapshot(),
      calculationInputs: getLoadSizingInputs(),
      motorDesignInputs: getMotorDesignInputs(),
      calculation: lastCalculation,
      motorDesign: lastMotorDesign,
      commissioning: getCommissioningSnapshot(),
      standardsReview: getStandardsReviewSnapshot(),
      owner: getProfile(),
      status: 'draft',
      comments: '',
      reviewHistory: [],
      resubmissionCount: 0,
      revisions: []
    };
}

function validateProjectWorkspace(project) {
  if (!project || !Array.isArray(project.rows) || !project.circuit) {
    throw new Error('Invalid project workspace.');
  }
  if (project.rows.some(row => !row || typeof row.description !== 'string' ||
    typeof row.category !== 'string' || typeof row.unit !== 'string' ||
    !Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 0 ||
    !Number.isFinite(Number(row.price)) || Number(row.price) < 0)) {
    throw new Error('Invalid project BOQ.');
  }
  validateCircuitData(project.circuit);
  if (project.plc) validatePlcSnapshot(project.plc);
  if (project.schedule && !isValidLoadScheduleSnapshot(project.schedule)) {
    throw new Error('Invalid project load schedule.');
  }
  if (project.calculationInputs && !isValidLoadSizingInputs(project.calculationInputs)) {
    throw new Error('Invalid project calculation inputs.');
  }
  if (project.motorDesignInputs && !isValidMotorDesignInputs(project.motorDesignInputs)) {
    throw new Error('Invalid project motor design inputs.');
  }
  if (project.commissioning && !isValidCommissioningSnapshot(project.commissioning)) {
    throw new Error('Invalid project installation record.');
  }
  if (project.standardsReview && !isValidStandardsReviewSnapshot(project.standardsReview)) {
    throw new Error('Invalid project standards review record.');
  }
}

function refreshProjectList() {
  const list = $('#project-list');
  list.innerHTML = '<option value="">Choose a project</option>';
  getSavedProjects().forEach(project => {
    const option = document.createElement('option');
    option.value = project.name;
    option.textContent = project.name;
    list.appendChild(option);
  });
}

function saveNamedProject() {
  const name = $('#project-name').value.trim();
  if (!name) {
    showToast('Enter a project name before saving.');
    return;
  }
  const existingProjects = getSavedProjects();
  const previous = existingProjects.find(project => project.name === name);
  const project = projectSnapshot(name);
  const changed = Boolean(previous && (
    JSON.stringify(previous.rows || []) !== JSON.stringify(project.rows) ||
    JSON.stringify(previous.circuit || {}) !== JSON.stringify(project.circuit) ||
    JSON.stringify(previous.schedule || null) !== JSON.stringify(project.schedule) ||
    JSON.stringify(previous.calculationInputs || null) !== JSON.stringify(project.calculationInputs) ||
    JSON.stringify(previous.motorDesignInputs || null) !== JSON.stringify(project.motorDesignInputs) ||
    JSON.stringify(previous.commissioning || getDefaultCommissioningSnapshot()) !== JSON.stringify(project.commissioning) ||
    JSON.stringify(previous.standardsReview || getDefaultStandardsReviewSnapshot()) !== JSON.stringify(project.standardsReview) ||
    JSON.stringify(previous.plc || null) !== JSON.stringify(project.plc)
  ));
  project.status = changed && ['submitted', 'approved'].includes(previous?.status)
    ? 'draft'
    : previous?.status || 'draft';
  project.comments = changed ? '' : previous?.comments || '';
  project.reviewHistory = Array.isArray(previous?.reviewHistory) ? [...previous.reviewHistory] : [];
  project.resubmissionCount = previous?.resubmissionCount || 0;
  project.owner = previous?.owner || getProfile();
  project.revisions = Array.isArray(previous?.revisions) ? [...previous.revisions] : [];
  if (previous && changed) {
    project.revisions.push({
      revisionId: `r-${Date.now()}`,
      savedAt: previous.savedAt || project.savedAt,
      rows: previous.rows || [],
      circuit: previous.circuit || { version: 2, components: [], connections: [] },
      plc: previous.plc || null,
      schedule: previous.schedule || null,
      calculationInputs: previous.calculationInputs || null,
      motorDesignInputs: previous.motorDesignInputs || null,
      calculation: previous.calculation || null,
      motorDesign: previous.motorDesign || null,
      commissioning: previous.commissioning || getDefaultCommissioningSnapshot(),
      standardsReview: previous.standardsReview || getDefaultStandardsReviewSnapshot(),
      status: previous.status || 'draft'
    });
    if (['submitted', 'approved'].includes(previous.status)) {
      project.reviewHistory.push({
        action: 'Updated after review; returned to draft',
        actor: getProfile().name,
        at: project.savedAt
      });
    }
  }
  project.revisions = project.revisions.slice(-10);
  const projects = existingProjects.filter(item => item.name !== name);
  projects.push(project);
  localStorage.setItem('dangote-academy-projects', JSON.stringify(projects));
  projectsChangedDuringStartup = true;
  persistProjects(projects);
  refreshProjectList();
  $('#project-list').value = name;
  renderRevisionControls(name);
  renderReview();
  showToast(`Project saved: ${name}`);
}

function renderRevisionControls(name = $('#project-list')?.value) {
  const list = $('#project-revision-list');
  const project = getSavedProjects().find(item => item.name === name);
  if (!list) return;
  list.innerHTML = '<option value="">Choose a revision</option>';
  (project?.revisions || []).forEach((revision, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `Revision ${index + 1} · ${new Date(revision.savedAt).toLocaleString()}`;
    list.appendChild(option);
  });
}

function compareProjectRevisions() {
  const name = $('#project-list')?.value;
  const project = getSavedProjects().find(item => item.name === name);
  const selectedRevision = $('#project-revision-list')?.value;
  const index = selectedRevision === '' ? -1 : Number(selectedRevision);
  const target = project?.revisions?.[index];
  const output = $('#revision-comparison');
  if (!project || !target || !output) {
    if (output) output.textContent = 'Choose a project and revision to compare.';
    return null;
  }
  const currentRows = project.rows || [];
  const currentComponents = project.circuit?.components || [];
  const currentConnections = project.circuit?.connections || [];
  const targetRows = target.rows || [];
  const targetComponents = target.circuit?.components || [];
  const targetConnections = target.circuit?.connections || [];
  const result = {
    project: name,
    revision: index,
    boqChanged: JSON.stringify(currentRows) !== JSON.stringify(targetRows),
    circuitChanged: JSON.stringify(project.circuit || {}) !== JSON.stringify(target.circuit || {}),
    scheduleChanged: JSON.stringify(project.schedule || null) !== JSON.stringify(target.schedule || null),
    calculationChanged: JSON.stringify(project.calculationInputs || null) !== JSON.stringify(target.calculationInputs || null),
    motorDesignChanged: JSON.stringify(project.motorDesignInputs || null) !== JSON.stringify(target.motorDesignInputs || null),
    commissioningChanged: JSON.stringify(project.commissioning || getDefaultCommissioningSnapshot()) !== JSON.stringify(target.commissioning || getDefaultCommissioningSnapshot()),
    standardsReviewChanged: JSON.stringify(project.standardsReview || getDefaultStandardsReviewSnapshot()) !== JSON.stringify(target.standardsReview || getDefaultStandardsReviewSnapshot()),
    plcChanged: JSON.stringify(project.plc || null) !== JSON.stringify(target.plc || null),
    reviewStatusChanged: (project.status || 'draft') !== (target.status || 'draft'),
    boqItems: `${targetRows.length} → ${currentRows.length}`,
    components: `${targetComponents.length} → ${currentComponents.length}`,
    connections: `${targetConnections.length} → ${currentConnections.length}`,
    loads: `${target.schedule?.rows?.length || 0} → ${project.schedule?.rows?.length || 0}`
  };
  output.textContent = `Revision ${index + 1}: ${result.boqChanged ? 'BOQ changed' : 'BOQ unchanged'} · ${result.circuitChanged ? 'Circuit changed' : 'Circuit unchanged'} · ${result.plcChanged ? 'PLC program changed' : 'PLC program unchanged'} · ${result.scheduleChanged ? 'Load schedule changed' : 'Load schedule unchanged'} · ${result.calculationChanged ? 'Sizing inputs changed' : 'Sizing inputs unchanged'} · ${result.motorDesignChanged ? 'Motor design changed' : 'Motor design unchanged'} · ${result.commissioningChanged ? 'Installation record changed' : 'Installation record unchanged'} · standards review ${result.standardsReviewChanged ? 'changed' : 'unchanged'} · review status ${result.reviewStatusChanged ? 'changed' : 'unchanged'} · items ${result.boqItems} · components ${result.components} · connections ${result.connections} · schedule rows ${result.loads}`;
  return result;
}

function restoreProjectRevision() {
  const name = $('#project-list')?.value;
  const selectedRevision = $('#project-revision-list')?.value;
  const index = selectedRevision === '' ? -1 : Number(selectedRevision);
  const project = getSavedProjects().find(item => item.name === name);
  const revision = project?.revisions?.[index];
  if (!project || !revision) {
    showToast('Choose a saved revision first.');
    return;
  }
  try {
    validateProjectWorkspace(revision);
  } catch (error) {
    console.error('Project revision could not be restored.', error);
    showToast('The selected project revision is invalid.');
    return;
  }

  restoringBOQ = true;
  $('#project-name').value = project.name;
  $('#boq-body').innerHTML = '';
  (revision.rows || []).forEach(item => addBoqRow(item.description, item.category, item.quantity, item.unit, item.price));
  restoringBOQ = false;
  updateBOQ();
  if (revision.circuit) restoreCircuit(revision.circuit);
  if (revision.schedule) restoreLoadSchedule(revision.schedule);
  else resetLoadSchedule();
  if (revision.calculationInputs) restoreLoadSizingInputs(revision.calculationInputs);
  else invalidateLoadSizingResult();
  if (revision.motorDesignInputs) restoreMotorDesignInputs(revision.motorDesignInputs);
  else calculateMotorFeeder();
  restoreCommissioningChecks(revision.commissioning || getDefaultCommissioningSnapshot());
  restoreStandardsReview(revision.standardsReview || getDefaultStandardsReviewSnapshot());
  if (revision.plc) restorePlcSnapshot(revision.plc);
  showToast(`Revision ${index + 1} restored to the workspace. Save the project to keep it.`);
}

function loadNamedProject() {
  const name = $('#project-list').value;
  const project = getSavedProjects().find(item => item.name === name);
  if (!project) return;
  try {
    validateProjectWorkspace(project);
  } catch (error) {
    console.error('Saved project could not be loaded.', error);
    showToast('The selected saved project is invalid.');
    return;
  }
  restoringBOQ = true;
  $('#project-name').value = project.name;
  $('#boq-body').innerHTML = '';
  project.rows.forEach(item => addBoqRow(item.description, item.category, item.quantity, item.unit, item.price));
  restoringBOQ = false;
  updateBOQ();
  if (project.circuit) restoreCircuit(project.circuit);
  if (project.schedule) restoreLoadSchedule(project.schedule);
  else resetLoadSchedule();
  if (project.calculationInputs) restoreLoadSizingInputs(project.calculationInputs);
  else invalidateLoadSizingResult();
  if (project.motorDesignInputs) restoreMotorDesignInputs(project.motorDesignInputs);
  else calculateMotorFeeder();
  restoreCommissioningChecks(project.commissioning || getDefaultCommissioningSnapshot());
  restoreStandardsReview(project.standardsReview || getDefaultStandardsReviewSnapshot());
  if (project.plc) restorePlcSnapshot(project.plc);
  showToast(`Project loaded: ${project.name}`);
}

function deleteNamedProject() {
  if (!canManageWorkspace()) {
    showToast('Only administrators can delete saved projects.');
    return false;
  }
  const name = $('#project-list').value;
  if (!name) {
    showToast('Choose a saved project first.');
    return false;
  }
  const projects = getSavedProjects().filter(project => project.name !== name);
  localStorage.setItem('dangote-academy-projects', JSON.stringify(projects));
  projectsChangedDuringStartup = true;
  persistProjects(projects);
  refreshProjectList();
  renderRevisionControls();
  renderReview();
  renderAdminTools();
  showToast(`Project deleted: ${name}`);
  return true;
}

function exportProject() {
  const name = $('#project-name').value.trim() || 'Electrical Academy Project';
  const project = projectSnapshot(name);
  const saved = getSavedProjects().find(item => item.name === name);
  if (saved) {
    project.status = saved.status || 'draft';
    project.comments = saved.comments || '';
    project.reviewHistory = saved.reviewHistory || [];
    project.revisions = saved.revisions || [];
    project.resubmissionCount = saved.resubmissionCount || 0;
  }
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'project'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function createWorkspaceBackup() {
  const storage = {};
  workspaceBackupStorageKeys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value !== null) storage[key] = value;
  });
  return {
    format: 'dangote-electrical-academy-backup',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    storage
  };
}

function validateWorkspaceBackup(backup) {
  if (!backup || backup.format !== 'dangote-electrical-academy-backup' ||
    backup.schemaVersion !== 1 || !backup.storage ||
    typeof backup.storage !== 'object' || Array.isArray(backup.storage)) {
    throw new Error('Unsupported or invalid workspace backup.');
  }
  const allowedKeys = new Set(workspaceBackupStorageKeys);
  Object.entries(backup.storage).forEach(([key, value]) => {
    if (!allowedKeys.has(key) || typeof value !== 'string') {
      throw new Error('Workspace backup contains an unsupported data entry.');
    }
    JSON.parse(value);
  });
  const projects = backup.storage['dangote-academy-projects'];
  if (projects !== undefined) {
    const parsedProjects = JSON.parse(projects);
    if (!Array.isArray(parsedProjects)) throw new Error('Workspace project list is invalid.');
    parsedProjects.forEach(project => {
      if (!project || typeof project.name !== 'string' || !project.name.trim()) {
        throw new Error('Workspace contains a project with an invalid name.');
      }
      validateProjectWorkspace(project);
    });
  }
  return backup;
}

function applyWorkspaceBackup(backup) {
  validateWorkspaceBackup(backup);
  const previous = Object.fromEntries(workspaceBackupStorageKeys.map(key => [key, localStorage.getItem(key)]));
  try {
    workspaceBackupStorageKeys.forEach(key => localStorage.removeItem(key));
    Object.entries(backup.storage).forEach(([key, value]) => localStorage.setItem(key, value));
  } catch (error) {
    try {
      workspaceBackupStorageKeys.forEach(key => {
        if (previous[key] === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous[key]);
      });
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
      console.error('Previous local data could not be fully restored after a backup failure.', rollbackError);
    }
    throw error;
  }
}

function exportWorkspaceBackup() {
  try {
    const backup = createWorkspaceBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `dangote-academy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Full offline backup exported.');
    return backup;
  } catch (error) {
    console.error('Workspace backup export failed.', error);
    showToast('Backup could not be created. Check the browser storage and try again.');
    return null;
  }
}

function restoreWorkspaceBackup(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) {
    showToast('Backup is too large to restore (maximum 25 MB).');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => {
    console.error('Workspace backup file could not be read.', reader.error);
    showToast('Backup file could not be read.');
    input.value = '';
  };
  reader.onload = async () => {
    let backup;
    try {
      backup = validateWorkspaceBackup(JSON.parse(reader.result));
    } catch (error) {
      console.error('Workspace backup failed validation.', error);
      showToast('Backup is invalid or from an unsupported version; no data was changed.');
      input.value = '';
      return;
    }
    if (!window.confirm('Restoring this backup replaces this device’s academy data. Export a backup of the current data first if you may need it. Continue?')) {
      input.value = '';
      return;
    }

    try {
      applyWorkspaceBackup(backup);
      projectsChangedDuringStartup = true;
      await persistProjects(JSON.parse(backup.storage['dangote-academy-projects'] || '[]'));
      showToast('Backup restored. Reloading the workspace.');
      window.location.reload();
    } catch (error) {
      console.error('Workspace backup restore failed.', error);
      showToast(error.rollbackError
        ? 'Backup failed and rollback was incomplete. Check this device data before continuing.'
        : 'Backup could not be restored; the previous local data was kept.');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function buildEngineeringReport() {
  const projectName = $('#project-name')?.value.trim() || 'Electrical Academy Project';
  const progress = getStudentProgressSummary();
  const scheduleInputs = getLoadScheduleSnapshot();
  const scheduleResult = window.DangoteAcademyCore.calculateScheduleSizing({
    ...scheduleInputs,
    rows: scheduleInputs.rows.map(row => ({
      ...row,
      load: Number(row.load),
      quantity: Number(row.quantity),
      pf: Number(row.pf),
      diversity: Number(row.diversity)
    }))
  });
  const circuitValid = validateCircuit();
  return {
    schemaVersion: 1,
    reportType: 'unified-engineering-report',
    exportedAt: new Date().toISOString(),
    engineeringNotice: 'Educational estimates only; no qualified engineering or standards-compliance validation has been completed.',
    project: {
      name: projectName,
      owner: getProfile(),
      status: getSavedProjects().find(project => project.name === projectName)?.status || 'draft',
      boq: getBOQRows(),
      total: $('#boq-total')?.textContent || '0.00',
      circuit: serialiseCircuit(),
      plc: getPlcSnapshot(),
      scheduleInputs: getLoadScheduleSnapshot(),
      circuitValidation: {
        valid: circuitValid,
        message: $('#circuit-message')?.textContent || ''
      },
      calculation: lastCalculation,
      schedule: scheduleResult.valid ? scheduleResult : null,
      motorDesign: lastMotorDesign ? { inputs: lastMotorDesign.inputs, estimate: lastMotorDesign } : null,
      commissioning: getCommissioningSnapshot(),
      standardsReview: {
        ...getStandardsReviewSnapshot(),
        recordStatus: standardsReviewRecordStatus(getStandardsReviewSnapshot()),
        formulaCrosswalk: standardsReviewCrosswalk
      },
      commissioningSummary: {
        total: commissioningChecks.length,
        recorded: getCommissioningSnapshot().filter(item => item.status === 'recorded').length,
        needsReview: getCommissioningSnapshot().filter(item => item.status === 'review').length,
        outstanding: getCommissioningSnapshot().filter(item => item.status === 'not-recorded').length
      },
      scheduleValidation: {
        valid: scheduleResult.valid,
        message: scheduleResult.error || ''
      },
      review: getSavedProjects().find(project => project.name === projectName)?.reviewHistory || []
    },
    learning: {
      lessons: getLessonProgress(),
      troubleshooting: getTroubleshootingProgress(),
      stationDiagnostics: getStationDiagnosticsProgress(),
      electronicsDiagnostics: getElectronicsDiagnosticsProgress(),
      plcChallenges: getPlcChallengeProgress(),
      plcTroubleshooting: getPlcTroubleshootingProgress(),
      progress
    }
  };
}

function exportEngineeringReport() {
  const report = buildEngineeringReport();
  const name = report.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'engineering-report';
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${name}-engineering-report.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Unified engineering report exported.');
  return report;
}

function importProject(event) {
  if (!canManageWorkspace()) {
    showToast('Only administrators can import saved projects.');
    event.target.value = '';
    return;
  }
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const project = JSON.parse(reader.result);
      if (!project || typeof project.name !== 'string' || !project.name.trim()) {
        throw new Error('Invalid project.');
      }
      validateProjectWorkspace(project);
      const projects = getSavedProjects().filter(item => item.name !== project.name);
      projects.push(project);
      localStorage.setItem('dangote-academy-projects', JSON.stringify(projects));
      projectsChangedDuringStartup = true;
      persistProjects(projects);
      refreshProjectList();
      $('#project-list').value = project.name;
      renderRevisionControls(project.name);
      renderReview();
      loadNamedProject();
      showToast(`Project imported: ${project.name}`);
    } catch (error) {
      console.error('Project import failed validation.', error);
      showToast('The selected project file is invalid.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function restoreBOQ() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem('dangote-academy-boq') || 'null');
  } catch {
    showToast('Saved BOQ data could not be restored.');
    return;
  }
  if (!Array.isArray(saved) || !saved.length) return;
  if (saved.some(item => !item || typeof item.description !== 'string' ||
    typeof item.category !== 'string' || typeof item.unit !== 'string' ||
    !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 0 ||
    !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
    showToast('Saved BOQ contains invalid entries and was not restored.');
    return;
  }
  restoringBOQ = true;
  try {
    $('#boq-body').innerHTML = '';
    saved.forEach(item => addBoqRow(item.description, item.category, item.quantity, item.unit, item.price));
  } finally {
    restoringBOQ = false;
  }
}

function addBoqRow(description, category, quantity, unit, price) {
  const row = document.createElement('tr');
  row.innerHTML = `<td><strong>${escapeHtml(description)}</strong></td><td>${escapeHtml(category)}</td><td><input class="qty-input" type="number" value="${escapeHtml(quantity)}" min="0" step="1"></td><td>${escapeHtml(unit)}</td><td class="unit-price">${Number(price).toLocaleString('en-US')}</td><td class="item-total">0</td><td><button class="delete-row" aria-label="Delete item"><i class="fa-solid fa-trash"></i></button></td>`;
  $('#boq-body').appendChild(row);
  updateBOQ();
}

function exportPdf() {
  if (!window.jspdf?.jsPDF || typeof window.jspdf.jsPDF.API?.autoTable !== 'function') {
    showToast('PDF export is unavailable because the bundled PDF libraries did not load.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setTextColor(16, 41, 66); doc.setFontSize(18); doc.text('Dangote Electrical Academy', 14, 20);
  doc.setTextColor(95, 105, 115); doc.setFontSize(10); doc.text('Bill of Quantities Report', 14, 28); doc.text(`Date: ${$('#boq-date').textContent}`, 14, 38);
  const data = $$('#boq-body tr').map(row => [...row.cells].slice(0, 6).map((cell, index) => index === 2 ? $('.qty-input', cell).value : cell.textContent.trim()));
  doc.autoTable({ startY: 48, head: [['Description', 'Category', 'Qty', 'Unit', 'Unit price', 'Total']], body: data, theme: 'striped', headStyles: { fillColor: [16, 41, 66] }, styles: { fontSize: 8 } });
  doc.setFontSize(11); doc.setTextColor(16, 41, 66); doc.text(`Total estimate: N ${$('#boq-total').textContent}`, 14, doc.lastAutoTable.finalY + 10); doc.save('Electrical_BOQ_Report.pdf');
}

function addEngineeringPdfTable(doc, title, rows, columns = ['Item', 'Details']) {
  let startY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 42;
  if (startY > 260) {
    doc.addPage();
    startY = 25;
  }
  doc.setFontSize(12);
  doc.setTextColor(16, 41, 66);
  doc.text(title, 14, startY);
  doc.autoTable({
    startY: startY + 4,
    head: [columns],
    body: rows.length ? rows : [['No data', 'Not recorded']],
    theme: 'striped',
    headStyles: { fillColor: [16, 41, 66] },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    margin: { left: 14, right: 14 }
  });
}

function reportRows(value, prefix = '', depth = 0) {
  if (depth > 2 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item, index) => [
      prefix ? `${prefix} ${index + 1}` : `Item ${index + 1}`,
      typeof item === 'object' ? JSON.stringify(item) : String(item)
    ]);
  }
  if (typeof value !== 'object') return [[prefix || 'Result', String(value)]];
  return Object.entries(value).flatMap(([key, item]) => {
    const label = prefix ? `${prefix} · ${key}` : key;
    if (item && typeof item === 'object') return reportRows(item, label, depth + 1);
    return [[label, item === null ? 'Not available' : String(item)]];
  }).slice(0, 24);
}

function addCircuitDiagramPage(doc, circuit) {
  doc.addPage();
  doc.setFontSize(12);
  doc.setTextColor(16, 41, 66);
  doc.text('Circuit layout (simplified, not to scale)', 14, 24);
  const components = circuit?.components || [];
  const connections = circuit?.connections || [];
  if (!components.length) {
    doc.setFontSize(10);
    doc.text('No circuit components are recorded in this project.', 14, 40);
    return;
  }
  const lefts = components.map(item => Number(item.left) || 0);
  const tops = components.map(item => Number(item.top) || 0);
  const minLeft = Math.min(...lefts);
  const maxLeft = Math.max(...lefts);
  const minTop = Math.min(...tops);
  const maxTop = Math.max(...tops);
  const positions = new Map(components.map(item => [item.id, {
    x: maxLeft === minLeft ? 105 : 22 + ((Number(item.left) - minLeft) / (maxLeft - minLeft)) * 166,
    y: maxTop === minTop ? 130 : 50 + ((Number(item.top) - minTop) / (maxTop - minTop)) * 175
  }]));
  const conductorColors = {
    line: [128, 79, 37],
    'phase-a': [128, 79, 37],
    'phase-b': [35, 91, 157],
    'phase-c': [105, 61, 143],
    neutral: [30, 116, 186],
    earth: [48, 125, 66]
  };
  connections.forEach(connection => {
    const from = positions.get(connection.from);
    const to = positions.get(connection.to);
    if (!from || !to) return;
    const color = conductorColors[connection.conductor] || [90, 100, 110];
    doc.setDrawColor(...color);
    doc.setLineWidth(1);
    doc.line(from.x, from.y, to.x, to.y);
  });
  components.forEach((component, index) => {
    const point = positions.get(component.id);
    doc.setDrawColor(16, 41, 66);
    doc.setFillColor(255, 255, 255);
    doc.rect(point.x - 19, point.y - 10, 38, 20, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(16, 41, 66);
    doc.text(String(component.type || `Part ${index + 1}`).slice(0, 15), point.x, point.y + 2, { align: 'center' });
  });
  doc.setFontSize(8);
  doc.setTextColor(85, 95, 105);
  doc.text(`${components.length} components | ${connections.length} connections`, 14, 260);
  doc.text('Conductor colors are illustrative only; this diagram is not an installation drawing.', 14, 267);
}

function exportEngineeringReportPdf() {
  if (!window.jspdf?.jsPDF || typeof window.jspdf.jsPDF.API?.autoTable !== 'function') {
    showToast('PDF export is unavailable because the bundled PDF libraries did not load.');
    return false;
  }
  try {
    const report = buildEngineeringReport();
    const project = report.project;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setTextColor(16, 41, 66);
    doc.setFontSize(17);
    doc.text('Dangote Electrical Academy', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(95, 105, 115);
    doc.text('Unified engineering training report', 14, 28);
    doc.text(`Project: ${project.name}`, 14, 35);
    addEngineeringPdfTable(doc, 'Project and review', [
      ['Owner', project.owner?.name || 'Not recorded'],
      ['Role', project.owner?.role || 'Not recorded'],
      ['Status', project.status],
      ['Exported', new Date(report.exportedAt).toLocaleString()],
      ['BOQ estimate (NGN)', project.total],
      ['Engineering validation', 'Not validated for standards compliance']
    ]);
    addEngineeringPdfTable(doc, 'Load and cable sizing', reportRows(project.calculation));
    addEngineeringPdfTable(doc, 'Load schedule', [
      ...reportRows(project.schedule),
      ['Validation', project.scheduleValidation.valid ? 'Valid in training model' : project.scheduleValidation.message || 'Incomplete']
    ]);
    addEngineeringPdfTable(doc, 'Motor feeder estimate', reportRows(project.motorDesign));
    addEngineeringPdfTable(doc, 'Circuit validation', [
      ['Result', project.circuitValidation.valid ? 'Valid in training model' : 'Not validated'],
      ['Details', project.circuitValidation.message || 'No validation message recorded'],
      ['Components', String(project.circuit?.components?.length || 0)],
      ['Connections', String(project.circuit?.connections?.length || 0)]
    ]);
    addEngineeringPdfTable(doc, 'Bill of quantities',
      project.boq.map(item => [
        item.description,
        `${item.category} | ${item.quantity} ${item.unit} | NGN ${Number(item.quantity * item.price).toLocaleString('en-NG')}`
      ]));
    addEngineeringPdfTable(doc, 'Installation record', project.commissioning.map(item => [
      item.label || item.name || item.id || 'Check',
      `${item.status || 'not-recorded'}${item.evidence ? ` | ${item.evidence}` : ''}`
    ]));
    addEngineeringPdfTable(doc, 'Standards basis and external review record', [
      ['Record status', project.standardsReview.recordStatus],
      ['Jurisdiction / authority', project.standardsReview.jurisdiction || 'Not recorded'],
      ['Standard / code', project.standardsReview.standard || 'Not recorded'],
      ['Edition / year', project.standardsReview.edition || 'Not recorded'],
      ['Amendments', project.standardsReview.amendments || 'Not recorded'],
      ['Reviewer', project.standardsReview.reviewerName || 'Not recorded'],
      ['Qualification / registration', project.standardsReview.reviewerQualification || 'Not recorded'],
      ['Organization', project.standardsReview.reviewerOrganization || 'Not recorded'],
      ['Review date', project.standardsReview.reviewDate || 'Not recorded'],
      ['Reviewer self-declaration', project.standardsReview.reviewerDeclaration ? 'Provided; not verified by the app' : 'Not provided'],
      ['Sources / evidence references', project.standardsReview.sourceReferences || 'Not recorded'],
      ...project.standardsReview.checks.map(item => {
        const check = standardsReviewChecks.find(entry => entry.id === item.id);
        return [check?.title || item.id, `${item.status}${item.note ? ` | ${item.note}` : ''}`];
      }),
      ...project.standardsReview.formulaCrosswalk.map(item => [
        `Review map: ${item.topic}`,
        `${item.references} ${item.review}`
      ])
    ]);
    addEngineeringPdfTable(doc, 'Learner progress', reportRows(report.learning.progress));
    addEngineeringPdfTable(doc, 'Review history', (project.review || []).map(item => [
      `${item.action} | ${item.actor || 'Unknown'}`,
      `${item.at ? new Date(item.at).toLocaleString() : ''}${item.comment ? ` | ${item.comment}` : ''}`
    ]));
    addCircuitDiagramPage(doc, project.circuit);
    const pageCount = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.text('Training estimates only - not certified engineering advice or authorization to install or energize.', 14, 289);
      doc.text(`Page ${page} of ${pageCount}`, 196, 289, { align: 'right' });
    }
    const name = project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'engineering-report';
    doc.save(`${name}-engineering-report.pdf`);
    showToast('Engineering report PDF exported.');
    return true;
  } catch (error) {
    console.error('Engineering report PDF export failed.', error);
    showToast('Engineering report PDF could not be generated.');
    return false;
  }
}

function createComponent(type, x, y, preferredId) {
  if (!circuitComponentTypes.includes(type)) throw new Error('Unsupported circuit component.');
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) throw new Error('Component position must be numeric.');
  if (!restoringCircuit) pushCircuitHistory();
  const usePreferredId = restoringCircuit && typeof preferredId === 'string' &&
    /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(preferredId) && !document.getElementById(preferredId);
  let id = usePreferredId ? preferredId : '';
  while (!id) {
    const candidate = `component-${componentId++}`;
    if (!document.getElementById(candidate)) id = candidate;
  }
  const labels = {
    'source-ac': ['AC mains', '∿'], battery: ['Battery', '＋'], 'bench-supply': ['Bench supply', '5V'],
    mcb: ['MCB', 'M'], rcd: ['RCD', 'R'], fuse: ['Fuse', 'F'], isolator: ['Isolator', 'I'],
    'switch-1way': ['Switch', '╱'], timer: ['Timer', 'T'], relay: ['Relay', 'K'],
    contactor: ['Contactor', 'K'], junction: ['Junction', '＋'], transformer: ['Transformer', 'T'],
    resistor: ['Resistor', 'R'], capacitor: ['Capacitor', 'C'], diode: ['Diode', '▷'],
    led: ['LED', '◉'], transistor: ['NPN transistor', 'Q'], lamp: ['Lamp', '◉'],
    socket: ['Socket', 'S'], motor: ['Motor', 'M']
  };
  const [label, symbol] = labels[type] || [type, '?'];
  const element = document.createElement('div');
  element.className = 'circuit-component'; element.id = id; element.dataset.type = type; element.dataset.state = ['mcb', 'rcd', 'fuse', 'isolator'].includes(type) ? 'on' : 'off'; element.dataset.timerSeconds = type === 'timer' ? '5' : '';
  if (componentValueDefaults[type]) element.dataset.value = String(componentValueDefaults[type].value);
  element.draggable = true; element.style.left = `${Math.max(0, x)}px`; element.style.top = `${Math.max(0, y)}px`;
  const extraTerminal = type === 'junction'
    ? '<button class="circuit-terminal terminal-branch-a" data-terminal="branch-a" aria-label="Junction branch A terminal"></button><button class="circuit-terminal terminal-branch-b" data-terminal="branch-b" aria-label="Junction branch B terminal"></button>'
    : '';
  element.innerHTML = `<button class="circuit-terminal terminal-in" data-terminal="in" aria-label="${label} input terminal"></button><div class="component-symbol">${symbol}</div><span class="component-label">${label}</span><button class="circuit-terminal terminal-out" data-terminal="out" aria-label="${label} output terminal"></button>${extraTerminal}<button class="remove-component" aria-label="Remove component"><i class="fa-solid fa-xmark"></i></button>`;
  element.addEventListener('dragstart', event => { const rect = element.getBoundingClientRect(); event.dataTransfer.setData('existing-id', id); event.dataTransfer.setData('offset-x', event.clientX - rect.left); event.dataTransfer.setData('offset-y', event.clientY - rect.top); });
  element.addEventListener('click', event => {
    if (event.target.closest('.remove-component')) { removeComponent(id); return; }
    const terminal = event.target.closest('.circuit-terminal');
    if (terminal && connectMode) { selectConnectionEndpoint(id, terminal.dataset.terminal); return; }
    if (connectMode) { selectConnectionEndpoint(id); return; }
    if (['switch-1way', 'mcb', 'rcd', 'fuse', 'isolator', 'relay', 'contactor'].includes(type)) {
      element.dataset.state = element.dataset.state === 'on' ? 'off' : 'on';
      checkCircuitLogic();
    } else {
      selectCircuitComponent(id);
    }
  });
  $('#circuit-canvas').appendChild(element);
  $('#canvas-instruction')?.remove();
  updateCircuitSummary();
  return id;
}

function selectCircuitComponent(id) {
  const component = $(`#${id}`);
  if (!component) return;
  $$('.selected-component').forEach(item => item.classList.remove('selected-component'));
  component.classList.add('selected-component');
  selectedComponentId = id;
  const type = component.dataset.type;
  const definition = componentValueDefaults[type];
  const panel = $('#component-properties');
  if (!panel) return;
  panel.hidden = !definition;
  if (!definition) return;
  $('#component-properties-title').textContent = `${component.querySelector('.component-label')?.textContent || type} properties`;
  $('#component-value-label').firstChild.textContent = `Value (${definition.unit})`;
  $('#component-value-input').min = String(definition.min);
  $('#component-value-input').max = String(definition.max);
  $('#component-value-input').value = component.dataset.value || String(definition.value);
  $('#component-properties-status').textContent = `Allowed range: ${definition.min}–${definition.max} ${definition.unit}.`;
}

function applyCircuitComponentValue() {
  const component = selectedComponentId ? $(`#${selectedComponentId}`) : null;
  const definition = component && componentValueDefaults[component.dataset.type];
  const input = $('#component-value-input');
  if (!component || !definition) {
    showToast('Select an adjustable component first.');
    return false;
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < definition.min || value > definition.max) {
    input.setCustomValidity(`Enter a value from ${definition.min} to ${definition.max} ${definition.unit}.`);
    input.reportValidity();
    return false;
  }
  input.setCustomValidity('');
  pushCircuitHistory();
  component.dataset.value = String(value);
  $('#component-properties-status').textContent = `Value set to ${value} ${definition.unit}.`;
  showToast('Component training value updated.');
  checkCircuitLogic();
  return true;
}

function dropComponent(event) {
  event.preventDefault();
  const canvas = $('#circuit-canvas'); const rect = canvas.getBoundingClientRect();
  const existingId = event.dataTransfer.getData('existing-id');
  const x = Math.round((event.clientX - rect.left - (Number(event.dataTransfer.getData('offset-x')) || 0)) / 20) * 20;
  const y = Math.round((event.clientY - rect.top - (Number(event.dataTransfer.getData('offset-y')) || 0)) / 20) * 20;
  if (existingId) { const item = $(`#${existingId}`); if (item) { pushCircuitHistory(); item.style.left = `${Math.max(0, x)}px`; item.style.top = `${Math.max(0, y)}px`; renderCircuitWires(); } return; }
  const type = event.dataTransfer.getData('type'); if (type) createComponent(type, x, y);
}

function removeComponent(id) {
  pushCircuitHistory();
  circuitConnections = circuitConnections.filter(connection => connection.from !== id && connection.to !== id);
  $(`#${id}`)?.remove();
  if (selectedComponentId === id) {
    selectedComponentId = null;
    $('#component-properties').hidden = true;
  }
  pendingConnection = null;
  renderCircuitWires();
  updateCircuitSummary();
  checkCircuitLogic();
}

function selectConnectionEndpoint(id, terminal = 'out') {
  if (!pendingConnection) {
    pendingConnection = { id, terminal };
    $(`#${id}`).classList.add('connection-selected');
    showToast('Select a destination terminal to create a wire.');
    return;
  }
  if (pendingConnection.id === id) return;
  const connection = { from: pendingConnection.id, fromTerminal: pendingConnection.terminal, to: id, toTerminal: terminal, conductor: $('#circuit-conductor')?.value || 'line' };
  const duplicate = circuitConnections.some(item => item.from === connection.from && item.fromTerminal === connection.fromTerminal && item.to === connection.to && item.toTerminal === connection.toTerminal && item.conductor === connection.conductor);
  if (!duplicate) { pushCircuitHistory(); circuitConnections.push(connection); }
  $$('.connection-selected').forEach(item => item.classList.remove('connection-selected'));
  pendingConnection = null;
  renderCircuitWires();
  updateCircuitSummary();
  checkCircuitLogic();
}

function renderCircuitWires() {
  const svg = $('#circuit-wires');
  if (!svg) return;
  const canvas = $('#circuit-canvas');
  svg.setAttribute('width', canvas.scrollWidth);
  svg.setAttribute('height', canvas.scrollHeight);
  svg.innerHTML = circuitConnections.map((connection, index) => {
    const from = $(`#${connection.from}`);
    const to = $(`#${connection.to}`);
    if (!from || !to) return '';
    const fromTerminal = $(`#${connection.from} .circuit-terminal[data-terminal="${connection.fromTerminal || 'out'}"]`);
    const toTerminal = $(`#${connection.to} .circuit-terminal[data-terminal="${connection.toTerminal || 'in'}"]`);
    const x1 = from.offsetLeft + (fromTerminal ? fromTerminal.offsetLeft + fromTerminal.offsetWidth / 2 : from.offsetWidth / 2);
    const y1 = from.offsetTop + (fromTerminal ? fromTerminal.offsetTop + fromTerminal.offsetHeight / 2 : from.offsetHeight / 2);
    const x2 = to.offsetLeft + (toTerminal ? toTerminal.offsetLeft + toTerminal.offsetWidth / 2 : to.offsetWidth / 2);
    const y2 = to.offsetTop + (toTerminal ? toTerminal.offsetTop + toTerminal.offsetHeight / 2 : to.offsetHeight / 2);
    const conductor = conductorTypes.includes(connection.conductor) ? connection.conductor : 'line';
    return `<line class="circuit-wire conductor-${conductor}" data-connection="${index}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
  }).join('');
}

function updateCircuitSummary() {
  $('#circuit-component-count').textContent = $$('.circuit-component').length;
  $('#circuit-connection-count').textContent = circuitConnections.length;
  validateCircuit();
  renderCircuitWalkthrough();
  renderVirtualInstruments();
}

function updateCircuitHistoryControls() {
  $('#undo-circuit').disabled = circuitHistory.length === 0;
  $('#redo-circuit').disabled = circuitRedo.length === 0;
}

function pushCircuitHistory() {
  if (restoringCircuit) return;
  circuitHistory.push(JSON.stringify(serialiseCircuit()));
  if (circuitHistory.length > 50) circuitHistory.shift();
  circuitRedo = [];
  updateCircuitHistoryControls();
}

function undoCircuit() {
  if (!circuitHistory.length) return;
  circuitRedo.push(JSON.stringify(serialiseCircuit()));
  restoreCircuit(JSON.parse(circuitHistory.pop()), true);
  updateCircuitHistoryControls();
}

function redoCircuit() {
  if (!circuitRedo.length) return;
  circuitHistory.push(JSON.stringify(serialiseCircuit()));
  restoreCircuit(JSON.parse(circuitRedo.pop()), true);
  updateCircuitHistoryControls();
}

function findSeriesResistorForLed(ledId, sourceId) {
  const graph = new Map($$('.circuit-component').map(item => [item.id, []]));
  circuitConnections.filter(connection => phaseConductors.includes(connection.conductor)).forEach(connection => {
    graph.get(connection.from)?.push(connection.to);
    graph.get(connection.to)?.push(connection.from);
  });
  const queue = [{ id: sourceId, resistorId: null }];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    const component = $(`#${current.id}`);
    const resistorId = current.resistorId || (component?.dataset.type === 'resistor' ? component.id : null);
    if (current.id === ledId && resistorId) return resistorId;
    const key = `${current.id}:${resistorId || ''}`;
    if (visited.has(key)) continue;
    visited.add(key);
    (graph.get(current.id) || []).forEach(id => queue.push({ id, resistorId }));
  }
  return null;
}

function validateCircuit() {
  const components = $$('.circuit-component');
  const sources = components.filter(item => circuitSourceTypes.includes(item.dataset.type));
  const source = sources[0];
  const loads = components.filter(item => circuitLoadTypes.includes(item.dataset.type));
  const leds = components.filter(item => item.dataset.type === 'led');
  const protectedTypes = ['mcb', 'rcd', 'fuse'];
  const hasProtection = components.some(item => protectedTypes.includes(item.dataset.type));
  const graph = new Map(components.map(item => [item.id, []]));
  circuitConnections.forEach(connection => { graph.get(connection.from)?.push(connection.to); graph.get(connection.to)?.push(connection.from); });
  const reachable = new Set(source ? [source.id] : []);
  const queue = source ? [source.id] : [];
  while (queue.length) graph.get(queue.shift()).forEach(id => { if (!reachable.has(id)) { reachable.add(id); queue.push(id); } });
  const allComponentsConnected = reachable.size === components.length;
  const connectedLoad = loads.some(load => reachable.has(load.id));
  const lineGraph = new Map(components.map(item => [item.id, []]));
  circuitConnections.filter(connection => phaseConductors.includes(connection.conductor)).forEach(connection => {
    lineGraph.get(connection.from)?.push(connection.to);
    lineGraph.get(connection.to)?.push(connection.from);
  });
  const ledCircuitReady = leds.length === 0 || (['battery', 'bench-supply'].includes(source?.dataset.type) &&
    leds.every(led => findSeriesResistorForLed(led.id, source.id) !== null));
  const lineReachable = new Set(source ? [source.id] : []);
  const lineQueue = source ? [source.id] : [];
  while (lineQueue.length) lineGraph.get(lineQueue.shift()).forEach(id => { if (!lineReachable.has(id)) { lineReachable.add(id); lineQueue.push(id); } });
  const lineConnectedLoad = loads.some(load => lineReachable.has(load.id));
  const protectedLineStates = new Set();
  const protectedLineQueue = source ? [{ id: source.id, protected: false }] : [];
  let protectedLinePath = false;
  while (protectedLineQueue.length) {
    const current = protectedLineQueue.shift();
    const stateKey = `${current.id}:${current.protected}`;
    if (protectedLineStates.has(stateKey)) continue;
    protectedLineStates.add(stateKey);
    const component = $(`#${current.id}`);
    const hasReachedProtection = current.protected || protectedTypes.includes(component?.dataset.type);
    if (hasReachedProtection && loads.some(load => load.id === current.id)) {
      protectedLinePath = true;
      break;
    }
    lineGraph.get(current.id).forEach(id => {
      protectedLineQueue.push({ id, protected: hasReachedProtection });
    });
  }
  const fault = $('#circuit-fault')?.value || circuitFault;
  const hasRcd = components.some(item => item.dataset.type === 'rcd');
  const hasEarthPath = circuitConnections.some(connection => connection.conductor === 'earth');
  const terminalConnections = circuitConnections.filter(connection => connection.fromTerminal && connection.toTerminal);
  const terminalRules = circuitConnections.every(connection => {
    const from = $(`#${connection.from}`);
    const to = $(`#${connection.to}`);
    if (!from || !to) return false;
    const fromTerminals = $$('.circuit-terminal', from).map(item => item.dataset.terminal);
    const toTerminals = $$('.circuit-terminal', to).map(item => item.dataset.terminal);
    return fromTerminals.includes(connection.fromTerminal) && toTerminals.includes(connection.toTerminal);
  });
  const destinationUse = new Map();
  circuitConnections.forEach(connection => {
    const key = `${connection.to}:${connection.toTerminal}:${connection.conductor || 'line'}`;
    destinationUse.set(key, (destinationUse.get(key) || 0) + 1);
  });
  const destinationsUnique = [...destinationUse.values()].every(count => count === 1);
  const terminalsComplete = terminalConnections.length === circuitConnections.length && terminalRules;
  const junctions = components.filter(item => item.dataset.type === 'junction');
  const junctionsComplete = junctions.every(junction => {
    const links = circuitConnections.filter(connection => connection.from === junction.id || connection.to === junction.id);
    return links.length >= 3 && links.some(connection => connection.from === junction.id && connection.fromTerminal === 'branch-a') &&
      links.some(connection => connection.from === junction.id && connection.fromTerminal === 'branch-b');
  });
  const earthLeakageReady = fault !== 'earth-leakage' || (hasRcd && hasEarthPath);
  const complete = Boolean(sources.length === 1 && loads.length && hasProtection && protectedLinePath &&
    connectedLoad && lineConnectedLoad && allComponentsConnected && terminalsComplete && ledCircuitReady &&
    destinationsUnique && junctionsComplete && earthLeakageReady);
  const message = sources.length === 0
    ? 'Add a source.'
    : sources.length > 1
      ? 'Use one source per training circuit.'
      : !loads.length
        ? 'Add at least one load.'
        : !hasProtection
            ? 'Add an MCB, RCD, or fuse.'
          : !protectedLinePath
            ? 'Connect an MCB or RCD on the line / phase path.'
            : !connectedLoad
              ? 'Connect the source path to a load.'
              : !lineConnectedLoad
                ? 'Add a line / phase conductor path to a load.'
                : !allComponentsConnected
                  ? 'Connect every component into the source circuit.'
                  : !terminalsComplete
                    ? 'Use valid terminals for every wire.'
                      : !ledCircuitReady
                        ? 'An LED exercise needs a battery or 5 V bench supply and a series resistor.'
                      : !destinationsUnique
                      ? 'Do not duplicate a destination terminal on the same conductor.'
                      : !junctionsComplete
                        ? 'Connect each junction input and both branch terminals.'
                        : !earthLeakageReady
                          ? 'Earth leakage requires an RCD and protective-earth path.'
                          : 'Topology is complete for this training exercise.';
  $('#circuit-validation').textContent = complete ? 'Circuit valid' : 'Review required';
  $('#circuit-validation').className = complete ? 'validation-good' : 'validation-warning';
  $('#circuit-message').textContent = message;
  return complete;
}

function serialiseCircuit() {
  return {
    version: 2,
    components: $$('.circuit-component').map(item => ({
      id: item.id,
      type: item.dataset.type,
      state: item.dataset.state,
      ...(item.dataset.value !== undefined ? { value: Number(item.dataset.value) } : {}),
      timerSeconds: item.dataset.type === 'timer' ? Number(item.dataset.timerSeconds || 5) : undefined,
      left: parseInt(item.style.left, 10),
      top: parseInt(item.style.top, 10)
    })),
    connections: circuitConnections.map(connection => ({ ...connection }))
  };
}

function validateCircuitData(data) {
  if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.components) || !Array.isArray(data.connections)) {
    throw new Error('Unsupported circuit file.');
  }
  if (data.components.length > 500 || data.connections.length > 2000) {
    throw new Error('Circuit file exceeds the supported size.');
  }
  const ids = new Set();
  const componentMap = new Map();
  data.components.forEach(component => {
    if (!component || typeof component.id !== 'string' || !component.id || ids.has(component.id) ||
      !circuitComponentTypes.includes(component.type) ||
      !Number.isFinite(Number(component.left)) || !Number.isFinite(Number(component.top)) ||
      Number(component.left) < 0 || Number(component.top) < 0 ||
      (component.state !== undefined && !['on', 'off'].includes(component.state)) ||
      (component.value !== undefined &&
        (!componentValueDefaults[component.type] ||
          !Number.isFinite(Number(component.value)) ||
          Number(component.value) < componentValueDefaults[component.type].min ||
          Number(component.value) > componentValueDefaults[component.type].max)) ||
      (component.type === 'timer' && component.timerSeconds !== undefined &&
        (!Number.isFinite(Number(component.timerSeconds)) || Number(component.timerSeconds) < 0))) {
      throw new Error('Invalid circuit component.');
    }
    ids.add(component.id);
    componentMap.set(component.id, component.type);
  });
  const destinationUse = new Set();
  data.connections.forEach(connection => {
    if (!connection || !componentMap.has(connection.from) || !componentMap.has(connection.to) ||
      connection.from === connection.to) {
      throw new Error('Invalid circuit connection reference.');
    }
    if (!conductorTypes.includes(connection.conductor || 'line')) {
      throw new Error('Unsupported conductor type.');
    }
    const fromTerminals = componentMap.get(connection.from) === 'junction'
      ? ['in', 'out', 'branch-a', 'branch-b']
      : ['in', 'out'];
    const toTerminals = componentMap.get(connection.to) === 'junction'
      ? ['in', 'out', 'branch-a', 'branch-b']
      : ['in', 'out'];
    const fromTerminal = connection.fromTerminal || 'out';
    const toTerminal = connection.toTerminal || 'in';
    if (!fromTerminals.includes(fromTerminal) || !toTerminals.includes(toTerminal)) {
      throw new Error('Invalid circuit terminal.');
    }
    const destination = `${connection.to}:${toTerminal}:${connection.conductor || 'line'}`;
    if (destinationUse.has(destination)) throw new Error('Duplicate destination terminal.');
    destinationUse.add(destination);
  });
  return true;
}

function restoreCircuit(data) {
  validateCircuitData(data);
  restoringCircuit = true;
  try {
    selectedComponentId = null;
    $('#component-properties').hidden = true;
    $('#circuit-canvas').querySelectorAll('.circuit-component').forEach(item => item.remove());
    circuitConnections = [];
    const ids = data.components.map(item => createComponent(item.type, item.left, item.top, item.id));
    const idMap = new Map(data.components.map((item, index) => [item.id, ids[index]]));
    data.components.forEach((item, index) => {
      const element = $(`#${ids[index]}`);
      if (!element) return;
      element.dataset.state = item.state || element.dataset.state;
      if (item.value !== undefined) element.dataset.value = String(item.value);
      if (item.type === 'timer' && Number.isFinite(Number(item.timerSeconds))) element.dataset.timerSeconds = String(Math.max(0, Number(item.timerSeconds)));
    });
    data.connections.forEach(connection => {
      circuitConnections.push({ from: idMap.get(connection.from), fromTerminal: connection.fromTerminal || 'out', to: idMap.get(connection.to), toTerminal: connection.toTerminal || 'in', conductor: connection.conductor || 'line' });
    });
    renderCircuitWires();
    updateCircuitSummary();
    validateCircuit();
  } finally {
    restoringCircuit = false;
  }
}

function saveCircuit() {
  localStorage.setItem('dangote-academy-circuit', JSON.stringify(serialiseCircuit()));
  showToast('Circuit diagram saved.');
}

function loadCircuit() {
  const saved = localStorage.getItem('dangote-academy-circuit');
  if (!saved) { showToast('No saved circuit diagram found.'); return; }
  try { restoreCircuit(JSON.parse(saved)); showToast('Circuit diagram loaded.'); } catch { showToast('Saved circuit diagram is invalid.'); }
}

function exportCircuit() {
  const blob = new Blob([JSON.stringify(serialiseCircuit(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = 'dangote-circuit.json'; link.click(); URL.revokeObjectURL(link.href);
}

function importCircuit(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { try { restoreCircuit(JSON.parse(reader.result)); showToast('Circuit diagram imported.'); } catch { showToast('The selected file is not a valid circuit diagram.'); } };
  reader.readAsText(file);
  event.target.value = '';
}

function checkCircuitLogic() {
  if (!isSimulating) return;
  const valid = validateCircuit();
  const components = $$('.circuit-component');
  const source = components.find(item => circuitSourceTypes.includes(item.dataset.type));
  const loads = components.filter(item => circuitLoadTypes.includes(item.dataset.type));
  const closed = components.filter(item => ['switch-1way', 'mcb', 'rcd', 'fuse', 'isolator', 'relay', 'contactor', 'timer'].includes(item.dataset.type)).every(item => item.dataset.state === 'on');
  const fault = $('#circuit-fault')?.value || circuitFault;
  const leakage = fault === 'earth-leakage' && valid;
  const modelFault = ['none', 'earth-leakage'].includes(fault) || fault === 'loose-connection';
  const powered = valid && closed && modelFault;
  const nominalVoltage = source?.dataset.type === 'battery' ? 12 : source?.dataset.type === 'bench-supply' ? 5 : 230;
  const voltage = powered ? nominalVoltage : 0;
  const normalCurrent = loads.reduce((total, item) => {
    if (item.dataset.type === 'led') {
      const ledCurrentMa = Number(item.dataset.value) || 10;
      const resistorId = source ? findSeriesResistorForLed(item.id, source.id) : null;
      const resistance = Number(resistorId ? $(`#${resistorId}`)?.dataset.value : 0);
      return total + (resistance > 0 ? Math.min(ledCurrentMa / 1000, Math.max(0, nominalVoltage - 2) / resistance) : 0);
    }
    return total + ({ lamp: .5, socket: 5, motor: 6 }[item.dataset.type] || 0);
  }, 0);
  const current = fault === 'short' && valid ? 80
    : leakage ? .03
      : fault === 'reverse-polarity' && loads.some(item => item.dataset.type === 'led') ? 0
        : powered ? normalCurrent * (fault === 'loose-connection' ? .5 : 1) : 0;
  const statusText = {
    open: 'Fault: open circuit',
    short: 'Fault: short circuit',
    'earth-leakage': 'Fault: earth leakage',
    'loose-connection': 'Fault: loose connection',
    'reverse-polarity': 'Fault: reversed polarity',
    'component-failure': 'Fault: component failure'
  }[fault] || 'Simulation running';
  $('#sim-status').textContent = statusText;
  const faultVoltage = leakage ? nominalVoltage : voltage;
  const currentDisplay = fault === 'short' ? current.toFixed(1)
    : fault === 'earth-leakage' ? current.toFixed(2)
      : current < .1 ? current.toFixed(3) : current.toFixed(1);
  const power = faultVoltage * current;
  $('#sim-v').textContent = faultVoltage;
  $('#sim-i').textContent = currentDisplay;
  $('#sim-p').textContent = power < 10 ? power.toFixed(2) : power.toFixed(0);
  const phaseCounts = Object.fromEntries(phaseConductors.map(conductor => [conductor, circuitConnections.filter(connection => connection.conductor === conductor).length]));
  const activePhase = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'line';
  $('#sim-phase-current').textContent = `${activePhase.replace('phase-', 'Phase ').toUpperCase()} ${current.toFixed(2)} A`;
  loads.forEach(load => load.dataset.powered = powered && current > 0 ? 'true' : 'false');
  const faultMessages = {
    open: 'Open-circuit fault injected; no load current should flow.',
    short: 'Short-circuit fault injected; protective devices should be reviewed. This is an abstract fault current, not a real fault calculation.',
    'earth-leakage': 'Earth-leakage fault injected; verify RCD protection and the protective-earth path.',
    'loose-connection': 'Loose-connection fault injected; the model reduces current by half to support trend-based diagnosis.',
    'reverse-polarity': 'Polarity fault injected; the simplified model suppresses LED load current.',
    'component-failure': 'Component-failure fault injected; the model suppresses load current.'
  };
  $('#circuit-message').textContent = faultMessages[fault] || (loads.some(item => item.dataset.type === 'led') &&
    (!source || loads.filter(item => item.dataset.type === 'led').some(item => !findSeriesResistorForLed(item.id, source.id)))
    ? 'LED load has no series resistor; add one before running the low-voltage training model.'
    : $('#circuit-message').textContent);
  renderVirtualInstruments();
}

function recordSimulationSample() {
  simulationSamples.push({
    time: simulationSeconds,
    voltage: Number($('#sim-v').textContent) || 0,
    current: Number($('#sim-i').textContent) || 0,
    power: Number($('#sim-p').textContent) || 0
  });
  simulationSamples = simulationSamples.slice(-60);
  renderCircuitTrend();
}

function renderCircuitTrend() {
  const measurement = $('#trend-measurement')?.value || 'voltage';
  const labels = { voltage: ['Voltage (V)', 'Voltage'], current: ['Current (A)', 'Current'], power: ['Power (W)', 'Power'] };
  const [yLabel, name] = labels[measurement] || labels.voltage;
  renderEngineeringPlot('circuit-trend-plot', {
    xLabel: 'Simulation time (s)',
    yLabel,
    series: [{ name, points: simulationSamples.map(sample => ({ x: sample.time, y: sample[measurement] })) }]
  });
}

function renderComponentCatalog() {
  const query = $('#component-search').value.trim().toLowerCase();
  const category = $('#component-category').value;
  const visible = componentCatalog.filter(item => (category === 'all' || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(query));
  $('#component-results').innerHTML = visible.length ? visible.map(item => `<article class="component-card"><i class="fa-solid ${escapeHtml(item.icon)}"></i><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div class="tag-row">${item.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></article>`).join('') : '<article class="panel"><p class="muted">No components match this search.</p></article>';
}

function renderTroubleshooting() {
  const progress = getTroubleshootingProgress();
  const completed = troubleshootingScenarios.filter((scenario, index) =>
    progress[scenario.id || `scenario-${index}`]?.completed
  ).length;
  $('#troubleshooting-results').innerHTML = troubleshootingScenarios.map((scenario, index) => {
    const id = scenario.id || `scenario-${index}`;
    const item = progress[id] || {};
    return `<article class="scenario-card ${item.completed ? 'completed' : ''}"><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.symptom)}</p><small class="scenario-attempts">Attempts: ${item.attempts || 0}${item.completed ? ' · Completed' : ''}</small><div class="scenario-options">${scenario.options.map((option, optionIndex) => `<button class="scenario-option" data-scenario="${index}" data-answer="${optionIndex}" ${item.completed ? 'disabled' : ''}>${escapeHtml(option)}</button>`).join('')}</div><p class="scenario-feedback" id="scenario-feedback-${index}">${item.completed ? 'Completed and saved offline.' : ''}</p></article>`;
  }).join('');
  $('#troubleshooting-score').textContent = completed;
  $('#troubleshooting-total').textContent = troubleshootingScenarios.length;
  renderStudentProgressSummary();
}

function renderStationDiagnostics() {
  const progress = getStationDiagnosticsProgress();
  const filter = $('#station-system-filter')?.value || 'all';
  const visibleScenarios = stationDiagnosticScenarios.filter(scenario =>
    filter === 'all' || scenario.system === filter
  );
  $('#station-diagnostic-results').innerHTML = visibleScenarios.map(scenario => {
    const item = progress[scenario.id] || {};
    const complete = item.completed === true;
    const options = scenario.options.map((option, index) => {
      const selected = Number(item.lastAnswer) === index;
      const stateClass = complete && index === scenario.answer ? ' correct' : !complete && selected ? ' incorrect' : '';
      return `<button class="scenario-option${stateClass}" data-station-scenario="${scenario.id}" data-answer="${index}" ${complete || selected ? 'disabled' : ''}>${escapeHtml(option)}</button>`;
    }).join('');
    const outcome = complete
      ? `<p class="scenario-feedback station-feedback">${escapeHtml(scenario.rationale)}<br><strong>Safe response:</strong> ${escapeHtml(scenario.safeResponse)}</p>`
      : item.lastAnswer !== undefined
        ? '<p class="scenario-feedback station-feedback">That is not the safest evidence-led response. Reassess the records and involve authorized site personnel; you can try another option.</p>'
        : '';
    return `<article class="scenario-card station-scenario-card"><span class="tag">${escapeHtml(scenario.system)}</span><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.symptom)}</p><details class="diagnostic-evidence"><summary>Evidence to correlate</summary><p>${escapeHtml(scenario.evidence)}</p></details><small class="scenario-attempts">Attempts: ${Number(item.attempts) || 0}${complete ? ' · Completed' : ''}</small><div class="scenario-options">${options}</div>${outcome}</article>`;
  }).join('') || '<article class="panel"><p class="muted">No power-station cases match this subsystem.</p></article>';
  $('#station-score').textContent = stationDiagnosticScenarios.filter(scenario =>
    progress[scenario.id]?.completed
  ).length;
  $('#station-total').textContent = stationDiagnosticScenarios.length;
  renderStudentProgressSummary();
}

function renderElectronicsDiagnostics() {
  const progress = getElectronicsDiagnosticsProgress();
  $('#electronics-diagnostic-results').innerHTML = electronicsDiagnosticScenarios.map(scenario => {
    const item = progress[scenario.id] || {};
    const complete = item.completed === true;
    const options = scenario.options.map((option, index) => {
      const selected = Number(item.lastAnswer) === index;
      const stateClass = complete && index === scenario.answer ? ' correct' : !complete && selected ? ' incorrect' : '';
      return `<button class="scenario-option${stateClass}" data-electronics-scenario="${scenario.id}" data-answer="${index}" ${complete || selected ? 'disabled' : ''}>${escapeHtml(option)}</button>`;
    }).join('');
    const outcome = complete
      ? `<p class="scenario-feedback electronics-feedback">${escapeHtml(scenario.rationale)}<br><strong>Safe practice:</strong> ${escapeHtml(scenario.safeResponse)}</p>`
      : item.lastAnswer !== undefined
        ? '<p class="scenario-feedback electronics-feedback">Not the strongest evidence-led diagnosis. Review the circuit evidence and low-voltage safety note, then try another response.</p>'
        : '';
    return `<article class="scenario-card electronics-scenario-card"><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.symptom)}</p><details class="diagnostic-evidence"><summary>Evidence to review</summary><p>${escapeHtml(scenario.evidence)}</p></details><small class="scenario-attempts">Attempts: ${Number(item.attempts) || 0}${complete ? ' · Completed' : ''}</small><div class="scenario-options">${options}</div>${outcome}</article>`;
  }).join('');
  $('#electronics-score').textContent = String(electronicsDiagnosticScenarios.filter(scenario =>
    progress[scenario.id]?.completed
  ).length);
  $('#electronics-total').textContent = String(electronicsDiagnosticScenarios.length);
  renderStudentProgressSummary();
}

function setElectronicsResultState(output, valid, message) {
  if (!output) return;
  output.textContent = message;
  output.classList.toggle('error', !valid);
  output.classList.toggle('success', valid);
  output.setAttribute('aria-invalid', String(!valid));
}

function readNumberInput(id, { label, min, max, transform = value => value } = {}) {
  const field = typeof id === 'string' ? document.getElementById(id) : id;
  if (!field) {
    return { valid: false, value: null, message: `${label || 'Field'} is unavailable.` };
  }
  const raw = field.value;
  const clean = typeof raw === 'string' ? raw.trim() : '';
  const value = Number(clean);
  if (clean === '' || !Number.isFinite(value)) {
    field.setCustomValidity(`${label || 'This field'} is required.`);
    field.setAttribute('aria-invalid', 'true');
    field.reportValidity();
    return { valid: false, value: null, message: `${label || 'This field'} requires a valid number.` };
  }
  const normalized = transform(value);
  if ((typeof min === 'number' && normalized < min) || (typeof max === 'number' && normalized > max)) {
    field.setCustomValidity(`${label || 'This field'} must be between ${min} and ${max}.`);
    field.setAttribute('aria-invalid', 'true');
    field.reportValidity();
    return { valid: false, value: null, message: `${label || 'This field'} must be between ${min} and ${max}.` };
  }
  field.setCustomValidity('');
  field.setAttribute('aria-invalid', 'false');
  return { valid: true, value: normalized, message: '' };
}

function calculateElectronicsDesign(formName) {
  const core = window.DangoteAcademyCore;
  const output = $(`#electronics-${formName}-result`);
  const plotId = `electronics-${formName}-plot`;
  clearEngineeringPlot(plotId, 'Check the inputs and calculate to update this plot.');
  let result;
  let message;

  if (formName === 'led') {
    const supply = readNumberInput('electronics-led-supply', { label: 'Supply voltage', min: 1, max: 24 });
    const ledVoltage = readNumberInput('electronics-led-voltage', { label: 'LED forward voltage', min: 0.1, max: 5 });
    const current = readNumberInput('electronics-led-current', { label: 'Target LED current', min: 1, max: 30, transform: value => value });
    if (!supply.valid || !ledVoltage.valid || !current.valid) {
      setElectronicsResultState(output, false, supply.valid && ledVoltage.valid && current.valid ? 'Check the highlighted values and try again.' : [supply, ledVoltage, current].find(item => !item.valid)?.message || 'Check the highlighted values and try again.');
      return;
    }
    result = core.calculateLedResistor({
      supplyVoltage: supply.value,
      ledVoltage: ledVoltage.value,
      targetCurrentMa: current.value
    });
    if (result.valid) {
      const points = Array.from({ length: 21 }, (_, index) => {
        const voltage = supply.value * index / 20;
        const currentMa = Math.max(0, voltage - ledVoltage.value) / result.standardResistance * 1000;
        return { x: voltage, y: currentMa };
      });
      renderEngineeringPlot(plotId, {
        xLabel: 'Supply voltage (V)',
        yLabel: 'LED current (mA)',
        series: [{ name: `Current with ${result.standardResistance} Ω`, points }]
      });
    }
    message = result.valid
      ? `Minimum ${result.minimumResistance} Ω; choose ${result.standardResistance} Ω (E12). Estimated current ${result.actualCurrentMa} mA; resistor dissipation ${result.resistorPower} W; use at least ${result.recommendedPowerRating} W.`
      : result.error;
  } else if (formName === 'divider') {
    const inputVoltage = readNumberInput('electronics-divider-input', { label: 'Input voltage', min: 1, max: 24 });
    const upperResistance = readNumberInput('electronics-divider-upper', { label: 'Upper resistor', min: 100, max: 1000000 });
    const lowerResistance = readNumberInput('electronics-divider-lower', { label: 'Lower resistor', min: 100, max: 1000000 });
    if (!inputVoltage.valid || !upperResistance.valid || !lowerResistance.valid) {
      setElectronicsResultState(output, false, [inputVoltage, upperResistance, lowerResistance].find(item => !item.valid)?.message || 'Check the highlighted values and try again.');
      return;
    }
    result = core.calculateVoltageDivider({
      inputVoltage: inputVoltage.value,
      upperResistance: upperResistance.value,
      lowerResistance: lowerResistance.value
    });
    if (result.valid) {
      const points = Array.from({ length: 21 }, (_, index) => {
        const ratio = index * .5;
        const loadResistance = ratio ? lowerResistance.value * ratio : lowerResistance.value * 1e6;
        const effectiveLower = lowerResistance.value * loadResistance /
          (lowerResistance.value + loadResistance);
        return { x: ratio, y: inputVoltage.value * effectiveLower / (upperResistance.value + effectiveLower) };
      });
      renderEngineeringPlot(plotId, {
        xLabel: 'Load resistance (× lower resistor)',
        yLabel: 'Divider output (V)',
        series: [{ name: 'Loaded output', points }]
      });
    }
    message = result.valid
      ? `Unloaded output ${result.outputVoltage} V; divider current ${result.currentMa} mA; upper/lower resistor dissipation ${result.upperPowerMw}/${result.lowerPowerMw} mW. A connected load lowers the output.`
      : result.error;
  } else if (formName === 'rc') {
    const resistance = readNumberInput('electronics-rc-resistance', { label: 'Resistance', min: 1, max: 1000 });
    const capacitance = readNumberInput('electronics-rc-capacitance', { label: 'Capacitance', min: 0.001, max: 1000 });
    if (!resistance.valid || !capacitance.valid) {
      setElectronicsResultState(output, false, [resistance, capacitance].find(item => !item.valid)?.message || 'Check the highlighted values and try again.');
      return;
    }
    result = core.calculateRcNetwork({
      resistance: resistance.value * 1000,
      capacitance: capacitance.value / 1e6
    });
    if (result.valid) {
      const points = Array.from({ length: 21 }, (_, index) => {
        const timeConstantMultiple = index / 4;
        return { x: timeConstantMultiple, y: (1 - Math.exp(-timeConstantMultiple)) * 100 };
      });
      renderEngineeringPlot(plotId, {
        xLabel: 'Elapsed time (τ)',
        yLabel: 'Charge (% of final value)',
        series: [{ name: `RC response · τ ${result.timeConstant} s`, points }]
      });
    }
    message = result.valid
      ? `Time constant τ = ${result.timeConstant} s; approximate 5τ settling = ${result.approximateSettlingTime} s; first-order cutoff = ${result.cutoffFrequency} Hz.`
      : result.error;
  } else {
    const controlVoltage = readNumberInput('electronics-bjt-control', { label: 'Control voltage', min: 1, max: 24 });
    const baseEmitterVoltage = readNumberInput('electronics-bjt-vbe', { label: 'Base-emitter drop', min: .5, max: 1.2 });
    const collectorCurrent = readNumberInput('electronics-bjt-load', { label: 'Collector load current', min: .1, max: 1000 });
    const forcedBeta = readNumberInput('electronics-bjt-beta', { label: 'Forced beta', min: 5, max: 20 });
    const fields = [controlVoltage, baseEmitterVoltage, collectorCurrent, forcedBeta];
    if (fields.some(item => !item.valid)) {
      setElectronicsResultState(output, false, fields.find(item => !item.valid)?.message || 'Check the highlighted values and try again.');
      return;
    }
    result = core.calculateTransistorBaseResistor({
      controlVoltage: controlVoltage.value,
      baseEmitterVoltage: baseEmitterVoltage.value,
      collectorCurrentMa: collectorCurrent.value,
      forcedBeta: forcedBeta.value
    });
    if (result.valid) {
      const points = Array.from({ length: 21 }, (_, index) => {
        const voltage = controlVoltage.value * index / 20;
        const driveCurrentMa = Math.max(0, voltage - baseEmitterVoltage.value) /
          result.standardResistance * 1000;
        return { x: voltage, y: driveCurrentMa * forcedBeta.value };
      });
      renderEngineeringPlot(plotId, {
        xLabel: 'Control voltage (V)',
        yLabel: 'Estimated collector current (mA)',
        series: [{ name: `Drive with ${result.standardResistance} Ω`, points }]
      });
    }
    message = result.valid
      ? `Choose ${result.standardResistance} Ω; required/estimated base drive ${result.requiredBaseCurrentMa}/${result.actualBaseCurrentMa} mA; estimated collector drive ${result.availableCollectorCurrentMa} mA; resistor dissipation ${result.resistorPower} W (use at least ${result.recommendedPowerRating} W). Verify transistor limits and the load path from its datasheet.`
      : result.error;
  }

  setElectronicsResultState(output, result.valid, message);
}

function answerElectronicsDiagnostic(event) {
  const option = event.target.closest('.scenario-option[data-electronics-scenario]');
  if (!option || option.disabled) return;
  const scenario = electronicsDiagnosticScenarios.find(item => item.id === option.dataset.electronicsScenario);
  if (!scenario) return;
  const selectedAnswer = Number(option.dataset.answer);
  if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0 || selectedAnswer >= scenario.options.length) return;
  const progress = getElectronicsDiagnosticsProgress();
  const record = progress[scenario.id] || { attempts: 0, completed: false };
  record.attempts = (Number(record.attempts) || 0) + 1;
  record.lastAnswer = selectedAnswer;
  if (selectedAnswer === scenario.answer) {
    record.completed = true;
    record.completedAt = new Date().toISOString();
  }
  progress[scenario.id] = record;
  localStorage.setItem(electronicsDiagnosticsStorageKey, JSON.stringify(progress));
  renderElectronicsDiagnostics();
}

function getLessonProgress() {
  try {
    const value = JSON.parse(localStorage.getItem('dangote-academy-lessons') || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function renderLessons() {
  const progress = getLessonProgress();
  $('#lesson-results').innerHTML = guidedLessons.map(lesson => {
    const completed = Boolean(progress[lesson.id]);
    return `<article class="lesson-card ${completed ? 'completed' : ''}"><div><span class="eyebrow">Exercise</span><h3>${escapeHtml(lesson.title)}</h3><p>${escapeHtml(lesson.objective)}</p><small><strong>Hint:</strong> ${escapeHtml(lesson.hint)}</small></div><button class="secondary-button lesson-check" data-lesson="${lesson.id}">${completed ? 'Completed' : 'Check exercise'}</button></article>`;
  }).join('');
  $('#lesson-score').textContent = guidedLessons.filter(lesson => progress[lesson.id]).length;
  renderStudentProgressSummary();
}

function checkLesson(id) {
  const lesson = guidedLessons.find(item => item.id === id);
  if (!lesson) return;
  if (!lesson.check()) {
    showToast('Exercise not complete yet. Review the hint and try again.');
    return;
  }
  const progress = getLessonProgress();
  progress[id] = { completedAt: new Date().toISOString() };
  localStorage.setItem('dangote-academy-lessons', JSON.stringify(progress));
  renderLessons();
  renderReview();
  showToast('Exercise completed and saved offline.');
}

function exportReview() {
  const review = {
    exportedAt: new Date().toISOString(),
    lessons: getLessonProgress(),
    troubleshootingScore: Number($('#troubleshooting-score').textContent),
    stationDiagnostics: getStationDiagnosticsProgress(),
    electronicsDiagnostics: getElectronicsDiagnosticsProgress(),
    plc: getPlcSnapshot(),
    plcChallenges: getPlcChallengeProgress(),
    plcTroubleshooting: getPlcTroubleshootingProgress(),
    project: $('#project-name')?.value || '',
    circuit: serialiseCircuit()
  };
  const blob = new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'dangote-training-review.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function answerTroubleshooting(event) {
  const option = event.target.closest('.scenario-option');
  if (!option || option.disabled) return;
  const scenario = troubleshootingScenarios[Number(option.dataset.scenario)];
  const correct = Number(option.dataset.answer) === scenario.answer;
  const scenarioId = scenario.id || `scenario-${option.dataset.scenario}`;
  const progress = getTroubleshootingProgress();
  const record = progress[scenarioId] || { attempts: 0, completed: false };
  record.attempts += 1;
  record.lastAnswer = Number(option.dataset.answer);
  if (correct) {
    record.completed = true;
    record.completedAt = new Date().toISOString();
  }
  progress[scenarioId] = record;
  localStorage.setItem(troubleshootingStorageKey, JSON.stringify(progress));
  const card = option.closest('.scenario-card');
  $$('.scenario-option', card).forEach(button => {
    if (correct) button.disabled = true;
    if (Number(button.dataset.answer) === scenario.answer) button.classList.add('correct');
  });
  option.disabled = correct;
  if (!correct) option.classList.add('incorrect');
  $(`#scenario-feedback-${option.dataset.scenario}`).textContent = correct ? 'Correct diagnosis.' : `Review: ${scenario.options[scenario.answer]}.`;
  if (correct) $('#troubleshooting-score').textContent = Number($('#troubleshooting-score').textContent) + 1;
  renderStudentProgressSummary();
}

function answerStationDiagnostic(event) {
  const option = event.target.closest('.scenario-option[data-station-scenario]');
  if (!option || option.disabled) return;
  const scenario = stationDiagnosticScenarios.find(item => item.id === option.dataset.stationScenario);
  if (!scenario) return;
  const selectedAnswer = Number(option.dataset.answer);
  if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0 || selectedAnswer >= scenario.options.length) return;
  const progress = getStationDiagnosticsProgress();
  const record = progress[scenario.id] || { attempts: 0, completed: false };
  record.attempts = (Number(record.attempts) || 0) + 1;
  record.lastAnswer = selectedAnswer;
  if (selectedAnswer === scenario.answer) {
    record.completed = true;
    record.completedAt = new Date().toISOString();
  }
  progress[scenario.id] = record;
  localStorage.setItem(stationDiagnosticsStorageKey, JSON.stringify(progress));
  renderStationDiagnostics();
}

function clonePlcProgram(program) {
  return JSON.parse(JSON.stringify(program));
}

function stopPlcScans() {
  clearInterval(plcScanTimer);
  plcScanTimer = null;
  const button = $('#plc-run');
  if (button) {
    button.innerHTML = '<i class="fa-solid fa-play"></i> Run scans';
    button.className = 'success-button';
  }
}

function savePlcState() {
  localStorage.setItem(plcStorageKey, JSON.stringify(getPlcSnapshot()));
}

function restorePlcState() {
  plcModel = clonePlcProgram(plcPrograms[plcProgramId]);
  try {
    const saved = JSON.parse(localStorage.getItem(plcStorageKey) || 'null');
    if (!saved) return;
    if (!Object.prototype.hasOwnProperty.call(plcPrograms, saved.programId) ||
      !window.DangoteAcademyCore.validatePlcProgram(saved.model).valid) {
      $('#plc-status-text').textContent = 'Saved PLC program is invalid; the default example is loaded.';
      return;
    }
    if (saved.schemaVersion === 1) {
      restorePlcSnapshot(saved);
      return;
    }
    plcProgramId = saved.programId;
    plcModel = saved.model;
    plcInputs = Object.fromEntries(plcInputCatalog.map(input => [
      input.tag, typeof saved.inputs?.[input.tag] === 'boolean' ? saved.inputs[input.tag] : input.initial
    ]));
  } catch {
    $('#plc-status-text').textContent = 'Saved PLC workspace could not be read; the default example is loaded.';
  }
}

function renderPlcInputs() {
  $('#plc-inputs').innerHTML = plcInputCatalog.map(input => {
    const on = plcInputs[input.tag];
    const forced = plcFault !== 'none' && plcFaultTarget === input.tag &&
      (plcFault === 'input-open' || plcFault === 'input-short');
    const effective = forced ? plcFault === 'input-short' : on;
    return `<button type="button" class="plc-io-point ${effective ? 'is-on' : ''}" data-plc-input="${input.tag}" aria-pressed="${on}" aria-label="${escapeHtml(input.tag)} ${escapeHtml(input.label)} ${on ? 'on' : 'off'}${forced ? ', fault forced' : ''}"><code>${input.tag}</code><span>${escapeHtml(input.label)}</span><b>${effective ? 'ON' : 'OFF'}${forced ? ' · FORCED' : ''}</b></button>`;
  }).join('');
}

function renderPlcWatchTable() {
  const container = $('#plc-watch-table');
  const inputs = plcAnalogInputCatalog.map(input => `
    <tr><th scope="row"><code>${input.tag}</code></th><td>${escapeHtml(input.label)}</td>
    <td><input type="range" min="0" max="100" step="1" value="${plcAnalogInputs[input.tag]}" data-plc-analog-input="${input.tag}" aria-label="${escapeHtml(input.label)} from 0 to 100 percent"></td>
    <td><output>${plcAnalogInputs[input.tag]} ${input.unit}</output></td></tr>`).join('');
  container.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Tag</th><th>Point</th><th>Simulated value</th><th>Value</th></tr></thead><tbody>${inputs}<tr><th scope="row"><code>AQ0</code></th><td>Control valve command</td><td><span class="plc-watch-meter"><i style="width:${plcAnalogOutputs.AQ0}%"></i></span></td><td><output>${plcAnalogOutputs.AQ0} %</output></td></tr></tbody></table></div>`;
}

function renderPlcOutputs() {
  const digital = plcOutputCatalog.map(output => {
    const inhibited = plcFault === 'output-inhibit' && plcFaultTarget === output.tag;
    const on = plcOutputs[output.tag] && !inhibited;
    return `<div class="plc-io-point plc-output-point ${on ? 'is-on' : ''}" data-plc-output="${output.tag}"><code>${output.tag}</code><span>${escapeHtml(output.label)}</span><b>${on ? 'ON' : 'OFF'}${inhibited ? ' · INHIBITED' : ''}</b></div>`;
  }).join('');
  const analog = `<div class="plc-io-point plc-output-point ${plcAnalogOutputs.AQ0 > 0 ? 'is-on' : ''}" data-plc-output="AQ0"><code>AQ0</code><span>Control valve command</span><b>${plcAnalogOutputs.AQ0}%</b></div>`;
  $('#plc-outputs').innerHTML = digital + analog;
}

function renderPlcFaultTargets() {
  const select = $('#plc-fault-target');
  const current = select.value;
  const options = plcFault === 'output-inhibit' ? plcOutputCatalog : plcInputCatalog;
  select.innerHTML = options.map(item => `<option value="${item.tag}">${item.tag} · ${escapeHtml(item.label)}</option>`).join('');
  if (options.some(item => item.tag === current)) select.value = current;
  else select.value = options[0].tag;
  plcFaultTarget = select.value;
}

function renderPlcLadder() {
  const timerContacts = plcModel.rungs.filter(rung => rung.timer).map(rung => ({
    tag: `${rung.timer.tag}.DN`, label: `${rung.timer.tag} done`
  }));
  const counterContacts = plcModel.rungs.filter(rung => rung.counter).map(rung => ({
    tag: `${rung.counter.tag}.DN`, label: `${rung.counter.tag} done`
  }));
  const contactTagOptions = [
    ...plcInputCatalog, ...plcOutputCatalog, ...plcAnalogInputCatalog,
    ...timerContacts, ...counterContacts
  ];
  const outputOptions = plcOutputCatalog;
  $('#plc-ladder').innerHTML = plcModel.rungs.map((rung, rungIndex) => {
    const state = plcRungStates[rungIndex];
    const branches = rung.branches.map((branch, branchIndex) => `<div class="plc-branch ${state?.branches[branchIndex] ? 'is-true' : ''}">
      <span class="plc-branch-label">${branchIndex === 0 ? 'Path' : 'OR'}</span>
      <div class="plc-contact-list">${branch.map((contact, contactIndex) => `<label class="plc-contact-editor ${state?.branches[branchIndex] ? 'is-true' : ''}">
        <select data-plc-contact-tag data-rung="${rungIndex}" data-branch="${branchIndex}" data-contact="${contactIndex}" aria-label="Rung ${rungIndex + 1} contact ${contactIndex + 1} tag">${contactTagOptions.map(item => `<option value="${item.tag}" ${contact.tag === item.tag ? 'selected' : ''}>${item.tag}</option>`).join('')}</select>
        <select data-plc-contact-type data-rung="${rungIndex}" data-branch="${branchIndex}" data-contact="${contactIndex}" aria-label="Rung ${rungIndex + 1} contact ${contactIndex + 1} type"><option value="no" ${contact.normallyClosed ? '' : 'selected'}>Normally open</option><option value="nc" ${contact.normallyClosed ? 'selected' : ''}>Normally closed</option></select>
        <span class="plc-analog-compare" ${contact.tag.startsWith('AI') ? '' : 'hidden'}>
          <select data-plc-analog-operator data-rung="${rungIndex}" data-branch="${branchIndex}" data-contact="${contactIndex}" aria-label="Analog compare operator"><option value="gte" ${contact.analogOperator === 'gte' ? 'selected' : ''}>&ge;</option><option value="lte" ${contact.analogOperator === 'lte' ? 'selected' : ''}>&le;</option></select>
          <input type="number" min="0" max="100" step="1" value="${Number.isFinite(contact.threshold) ? contact.threshold : 50}" data-plc-analog-threshold data-rung="${rungIndex}" data-branch="${branchIndex}" data-contact="${contactIndex}" aria-label="Analog compare threshold percent">
        </span>
        <button type="button" class="plc-remove-contact" data-plc-remove-contact data-rung="${rungIndex}" data-branch="${branchIndex}" data-contact="${contactIndex}" aria-label="Remove ${contact.tag} contact">×</button>
      </label>`).join('')}</div>
      <button type="button" class="plc-editor-action" data-plc-add-series data-rung="${rungIndex}" data-branch="${branchIndex}">+ Series</button>
    </div>`).join('');
    const instruction = rung.timer
      ? `<div class="plc-instruction ${state?.instruction?.done ? 'is-true' : ''}"><strong>TON ${rung.timer.tag}</strong><label>Preset scans<input type="number" min="1" max="120" step="1" value="${rung.timer.presetScans}" data-plc-timer-preset data-rung="${rungIndex}" aria-label="Timer preset scans"></label><span>${state?.instruction?.elapsedScans || 0}/${rung.timer.presetScans} scans · ${state?.instruction?.done ? 'DONE' : 'timing'}</span><button type="button" class="plc-editor-action danger" data-plc-remove-instruction data-rung="${rungIndex}">Remove</button></div>`
      : rung.counter
        ? `<div class="plc-instruction ${state?.instruction?.done ? 'is-true' : ''}"><strong>CTU ${rung.counter.tag}</strong><label>Preset<input type="number" min="1" max="999" step="1" value="${rung.counter.preset}" data-plc-counter-preset data-rung="${rungIndex}" aria-label="Counter preset"></label><label>Reset input<select data-plc-counter-reset data-rung="${rungIndex}" aria-label="Counter reset input">${plcInputCatalog.map(input => `<option value="${input.tag}" ${rung.counter.resetTag === input.tag ? 'selected' : ''}>${input.tag}</option>`).join('')}</select></label><span>${state?.instruction?.count || 0}/${rung.counter.preset} · ${state?.instruction?.done ? 'DONE' : 'counting'}</span><button type="button" class="plc-editor-action danger" data-plc-remove-instruction data-rung="${rungIndex}">Remove</button></div>`
        : '';
    const analogOutput = `<div class="plc-analog-output"><label>Analog output<select data-plc-analog-output data-rung="${rungIndex}" aria-label="Rung ${rungIndex + 1} analog output"><option value="" ${rung.analogOutput ? '' : 'selected'}>None</option><option value="AQ0" ${rung.analogOutput?.tag === 'AQ0' ? 'selected' : ''}>AQ0 · valve</option></select></label>${rung.analogOutput ? `<label>Setpoint %<input type="number" min="0" max="100" step="1" value="${rung.analogOutput.value}" data-plc-analog-setpoint data-rung="${rungIndex}" aria-label="Analog output setpoint percentage"></label>` : ''}</div>`;
    return `<div class="plc-rung ${state?.energised ? 'is-true' : ''}">
      <span class="plc-rung-number">Rung ${rungIndex + 1}</span>
      <div class="plc-rail" aria-hidden="true"></div>
      <div class="plc-branches">${branches}</div>
      <div class="plc-coil-editor"><span>Coil</span><select data-plc-coil data-rung="${rungIndex}" aria-label="Rung ${rungIndex + 1} output coil">${outputOptions.map(item => `<option value="${item.tag}" ${rung.coil === item.tag ? 'selected' : ''}>${item.tag} · ${escapeHtml(item.label)}</option>`).join('')}</select><b>${state?.energised ? 'ENERGIZED' : 'DE-ENERGIZED'}</b></div>
      <div class="plc-rail plc-rail-right" aria-hidden="true"></div>
      <div class="plc-rung-actions"><button type="button" class="plc-editor-action" data-plc-add-branch data-rung="${rungIndex}">+ Parallel branch</button><button type="button" class="plc-editor-action" data-plc-add-instruction="timer" data-rung="${rungIndex}" ${rung.timer || rung.counter ? 'disabled' : ''}>+ TON</button><button type="button" class="plc-editor-action" data-plc-add-instruction="counter" data-rung="${rungIndex}" ${rung.timer || rung.counter ? 'disabled' : ''}>+ CTU</button>${instruction}${analogOutput}<button type="button" class="plc-editor-action danger" data-plc-remove-rung data-rung="${rungIndex}">Remove rung</button></div>
    </div>`;
  }).join('');
  $('#plc-add-rung').disabled = plcModel.rungs.length >= 8;
}

function renderPlcExplanation() {
  const container = $('#plc-explanation');
  if (!plcLastExplanations.length) {
    container.innerHTML = '<p class="plot-placeholder">Run a scan to see contact, branch, timer, and counter decisions.</p>';
    return;
  }
  container.innerHTML = plcLastExplanations.map(item => {
    const branches = item.branchResults.map((branch, index) => {
      const contacts = branch.contacts.map(contact => {
        const status = contact.closed ? 'closed' : 'open';
        const test = contact.value === undefined ? '' :
          ` (${contact.value}% ${contact.operator === 'gte' ? '&ge;' : '&le;'} ${contact.threshold}%)`;
        return `${escapeHtml(contact.tag)} ${status}${test}`;
      }).join(' AND ');
      return `Path ${index + 1}: ${contacts} → ${branch.energised ? 'TRUE' : 'FALSE'}`;
    }).join('; ');
    const instruction = item.instruction
      ? ` · ${item.instruction.type} ${item.instruction.tag}: ${item.instruction.elapsedScans !== undefined ? `${item.instruction.elapsedScans}/${item.instruction.presetScans} scans` : `${item.instruction.count}/${item.instruction.preset}`} ${item.instruction.done ? 'DONE' : 'not done'}${item.instruction.reset ? ' · reset' : ''}`
      : '';
    const analogOutput = item.analogOutput
      ? ` · ${item.analogOutput.tag} = ${item.analogOutput.value}%`
      : '';
    return `<p class="plc-explanation-rung"><strong>${escapeHtml(item.coil)} ${item.energised ? 'energized' : 'de-energized'}</strong><span>${branches}${instruction}${analogOutput}</span></p>`;
  }).join('');
}

function renderPlcTrend() {
  const container = $('#plc-trend');
  if (!plcTrendSamples.length) {
    container.innerHTML = '<p class="plot-placeholder">Run one or more scans to plot output states.</p>';
    container.setAttribute('aria-label', 'Output state trend appears after PLC scans.');
    return;
  }
  const samples = plcTrendSamples.slice(-24);
  const colors = ['#1682c4', '#d84f55', '#1f9d70'];
  const width = 640; const height = 170; const left = 38; const right = 16; const top = 12; const bottom = 30;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const x = index => left + (samples.length < 2 ? plotWidth / 2 : index * plotWidth / (samples.length - 1));
  const series = plcOutputCatalog.map((output, outputIndex) => {
    const y = sample => top + (outputIndex * plotHeight / 3) + (sample.outputs[output.tag] ? 6 : plotHeight / 3 - 6);
    const points = samples.map((sample, index) => `${x(index)},${y(sample)}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${colors[outputIndex]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  const grid = [0, 1, 2, 3].map(index => {
    const y = top + index * plotHeight / 3;
    const label = plcOutputCatalog[index]?.tag || '';
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#e5edf1"/>${label ? `<text x="2" y="${y + plotHeight / 6 + 3}" fill="#68778b" font-size="9">${label}</text>` : ''}`;
  }).join('');
  const legend = plcOutputCatalog.map((output, index) => `<span style="--plot-color:${colors[index]}"><i></i>${output.tag}</span>`).join('');
  container.innerHTML = `<svg class="plc-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Digital output states over ${samples.length} PLC scans">${grid}${series}<text x="${left}" y="${height - 5}" fill="#68778b" font-size="10">Scan ${samples[0].scan}</text><text x="${width - right}" y="${height - 5}" text-anchor="end" fill="#68778b" font-size="10">Scan ${samples[samples.length - 1].scan}</text></svg><div class="plot-legend">${legend}</div>`;
  container.setAttribute('aria-label', `Digital output state trend for scans ${samples[0].scan} to ${samples[samples.length - 1].scan}.`);
}

function renderPlcWorkspace() {
  $('#plc-program').value = plcProgramId;
  renderPlcFaultTargets();
  renderPlcInputs();
  renderPlcOutputs();
  renderPlcWatchTable();
  renderPlcLadder();
  renderPlcExplanation();
  renderPlcTrend();
  $('#plc-scan-count').textContent = String(plcScanCount);
  renderPlcChallenges();
  renderPlcTroubleshooting();
}

function updatePlcScan() {
  const inputImage = { ...plcInputs };
  let inhibitedOutput = null;
  if (plcFault === 'input-open' && plcFaultTarget.startsWith('I')) inputImage[plcFaultTarget] = false;
  if (plcFault === 'input-short' && plcFaultTarget.startsWith('I')) inputImage[plcFaultTarget] = true;
  if (plcFault === 'output-inhibit' && plcFaultTarget.startsWith('Q')) inhibitedOutput = plcFaultTarget;
  const result = window.DangoteAcademyCore.calculatePlcScan(
    plcModel, inputImage, plcOutputs, plcRuntimeState, plcAnalogInputs
  );
  if (!result.valid) {
    stopPlcScans();
    $('#plc-status-text').textContent = `Program error: ${result.error}`;
    return false;
  }
  plcOutputs = { ...result.outputs };
  plcAnalogOutputs = { AQ0: result.analogOutputs.AQ0 || 0 };
  plcRuntimeState = result.runtimeState;
  plcRungStates = result.rungStates;
  plcLastExplanations = result.rungStates;
  plcScanCount += 1;
  plcTrendSamples.push({ scan: plcScanCount, outputs: { ...plcOutputs } });
  plcTrendSamples = plcTrendSamples.slice(-60);
  const energizedCount = Object.entries(plcOutputs)
    .filter(([tag, on]) => on && tag !== inhibitedOutput).length;
  $('#plc-status-text').textContent = `Scan complete · ${energizedCount} output${energizedCount === 1 ? '' : 's'} energized${plcFault === 'none' ? '' : ` · ${$('#plc-fault').selectedOptions[0].textContent}`}.`;
  savePlcState();
  renderPlcWorkspace();
  return true;
}

function selectPlcProgram(programId) {
  if (!Object.prototype.hasOwnProperty.call(plcPrograms, programId)) return;
  stopPlcScans();
  plcProgramId = programId;
  plcModel = clonePlcProgram(plcPrograms[programId]);
  plcInputs = Object.fromEntries(plcInputCatalog.map(input => [input.tag, input.initial]));
  plcAnalogInputs = Object.fromEntries(plcAnalogInputCatalog.map(input => [input.tag, input.initial]));
  plcOutputs = Object.fromEntries(plcOutputCatalog.map(output => [output.tag, false]));
  plcAnalogOutputs = { AQ0: 0 };
  plcRuntimeState = { timers: {}, counters: {} };
  plcRungStates = [];
  plcLastExplanations = [];
  plcScanCount = 0;
  plcTrendSamples = [];
  plcFault = 'none';
  $('#plc-fault').value = plcFault;
  renderPlcWorkspace();
  $('#plc-status-text').textContent = 'Example loaded. Toggle inputs, edit the ladder, then run a scan.';
  savePlcState();
}

function resetPlcProgram() {
  selectPlcProgram(plcProgramId);
}

function startPlcScans() {
  if (plcScanTimer) {
    stopPlcScans();
    $('#plc-status-text').textContent = 'PLC scan loop stopped.';
    return;
  }
  $('#plc-run').innerHTML = '<i class="fa-solid fa-stop"></i> Stop scans';
  $('#plc-run').className = 'secondary-button';
  if (!updatePlcScan()) return;
  plcScanTimer = setInterval(updatePlcScan, 500);
}

function updatePlcProgram(changeDescription) {
  const validation = window.DangoteAcademyCore.validatePlcProgram(plcModel);
  if (!validation.valid) {
    stopPlcScans();
    $('#plc-status-text').textContent = `Program error: ${validation.error}`;
    renderPlcLadder();
    return;
  }
  savePlcState();
  $('#plc-status-text').textContent = `${changeDescription} Run a scan to evaluate the edited program.`;
  updatePlcScan();
}

function handlePlcLadderEdit(event) {
  const target = event.target;
  const rungIndex = Number(target.dataset.rung);
  if (!Number.isInteger(rungIndex) || !plcModel.rungs[rungIndex]) return;
  if (target.matches('[data-plc-contact-tag], [data-plc-contact-type], [data-plc-analog-operator], [data-plc-analog-threshold]')) {
    const branchIndex = Number(target.dataset.branch);
    const contactIndex = Number(target.dataset.contact);
    const contact = plcModel.rungs[rungIndex].branches[branchIndex]?.[contactIndex];
    if (!contact) return;
    if (target.matches('[data-plc-contact-tag]')) {
      contact.tag = target.value;
      if (target.value.startsWith('AI')) {
        contact.analogOperator ||= 'gte';
        contact.threshold = Number.isFinite(contact.threshold) ? contact.threshold : 50;
      } else {
        delete contact.analogOperator;
        delete contact.threshold;
      }
    } else if (target.matches('[data-plc-contact-type]')) contact.normallyClosed = target.value === 'nc';
    else if (target.matches('[data-plc-analog-operator]')) contact.analogOperator = target.value;
    else {
      const threshold = target.valueAsNumber;
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
        $('#plc-status-text').textContent = 'Analog compare threshold must be between 0 and 100%.';
        return;
      }
      contact.threshold = threshold;
    }
    updatePlcProgram('Ladder contact updated.');
  } else if (target.matches('[data-plc-coil]')) {
    plcModel.rungs[rungIndex].coil = target.value;
    updatePlcProgram('Output coil updated.');
  } else if (target.matches('[data-plc-timer-preset]')) {
    plcModel.rungs[rungIndex].timer.presetScans = target.valueAsNumber;
    updatePlcProgram('Timer preset updated.');
  } else if (target.matches('[data-plc-counter-preset]')) {
    plcModel.rungs[rungIndex].counter.preset = target.valueAsNumber;
    updatePlcProgram('Counter preset updated.');
  } else if (target.matches('[data-plc-counter-reset]')) {
    plcModel.rungs[rungIndex].counter.resetTag = target.value;
    updatePlcProgram('Counter reset input updated.');
  } else if (target.matches('[data-plc-analog-output]')) {
    if (target.value) plcModel.rungs[rungIndex].analogOutput = { tag: target.value, value: 50 };
    else delete plcModel.rungs[rungIndex].analogOutput;
    updatePlcProgram('Analog output assignment updated.');
  } else if (target.matches('[data-plc-analog-setpoint]')) {
    plcModel.rungs[rungIndex].analogOutput.value = target.valueAsNumber;
    updatePlcProgram('Analog output setpoint updated.');
  }
}

function handlePlcLadderAction(event) {
  const button = event.target.closest('button[data-rung]');
  if (!button) return;
  const rungIndex = Number(button.dataset.rung);
  const rung = plcModel.rungs[rungIndex];
  if (button.matches('[data-plc-add-instruction]')) {
    if (!rung || rung.timer || rung.counter) return;
    const kind = button.dataset.plcAddInstruction;
    const used = new Set(plcModel.rungs.map(item => item.timer?.tag || item.counter?.tag).filter(Boolean));
    const prefix = kind === 'timer' ? 'T' : 'C';
    const tag = Array.from({ length: 100 }, (_, index) => `${prefix}${index}`).find(item => !used.has(item));
    if (!tag) {
      $('#plc-status-text').textContent = `No ${kind} identifiers remain.`;
      return;
    }
    if (kind === 'timer') rung.timer = { tag, presetScans: 5 };
    else rung.counter = { tag, preset: 3, resetTag: 'I0.5' };
    updatePlcProgram(`${kind === 'timer' ? 'TON timer' : 'CTU counter'} added.`);
  } else if (button.matches('[data-plc-remove-instruction]')) {
    if (!rung) return;
    const tag = rung.timer?.tag || rung.counter?.tag;
    for (const currentRung of plcModel.rungs) for (const branch of currentRung.branches) {
      for (let index = branch.length - 1; index >= 0; index--) {
        if (branch[index].tag === `${tag}.DN`) branch.splice(index, 1);
      }
      if (!branch.length) branch.push({ tag: 'I0.0', normallyClosed: false });
    }
    delete rung.timer;
    delete rung.counter;
    delete plcRuntimeState.timers[tag];
    delete plcRuntimeState.counters[tag];
    updatePlcProgram('Timer or counter instruction removed.');
  } else if (button.matches('[data-plc-add-series]')) {
    const branch = rung?.branches[Number(button.dataset.branch)];
    if (!branch || branch.length >= 6) {
      $('#plc-status-text').textContent = 'A branch is limited to 6 series contacts.';
      return;
    }
    branch.push({ tag: 'I0.0', normallyClosed: false });
    updatePlcProgram('Series contact added.');
  } else if (button.matches('[data-plc-add-branch]')) {
    if (!rung || rung.branches.length >= 4) {
      $('#plc-status-text').textContent = 'A rung is limited to 4 parallel branches.';
      return;
    }
    rung.branches.push([{ tag: 'I0.0', normallyClosed: false }]);
    updatePlcProgram('Parallel branch added.');
  } else if (button.matches('[data-plc-remove-contact]')) {
    const branch = rung?.branches[Number(button.dataset.branch)];
    if (!branch || branch.length <= 1) {
      $('#plc-status-text').textContent = 'Each branch must keep at least one contact.';
      return;
    }
    branch.splice(Number(button.dataset.contact), 1);
    updatePlcProgram('Contact removed.');
  } else if (button.matches('[data-plc-remove-rung]')) {
    if (!rung || plcModel.rungs.length <= 1) {
      $('#plc-status-text').textContent = 'A PLC program must keep at least one rung.';
      return;
    }
    plcModel.rungs.splice(rungIndex, 1);
    updatePlcProgram('Rung removed.');
  }
}

function renderPlcChallenges() {
  const select = $('#plc-challenge');
  const selected = select.value;
  select.innerHTML = plcChallenges.map(challenge =>
    `<option value="${challenge.id}">${escapeHtml(challenge.title)}</option>`
  ).join('');
  if (plcChallenges.some(challenge => challenge.id === selected)) select.value = selected;
  else select.value = plcChallenges[0].id;
  const challenge = plcChallenges.find(item => item.id === select.value);
  const progress = getPlcChallengeProgress();
  const record = progress[challenge.id] || { attempts: 0, completed: false };
  $('#plc-challenge-guidance').innerHTML = `<strong>Goal:</strong> ${escapeHtml(challenge.objective)} <span>Suggested example: ${escapeHtml(plcPrograms[challenge.programId].title)}. ${escapeHtml(challenge.hint)}</span>`;
  $('#plc-challenge-feedback').textContent = record.completed
    ? `Completed in ${record.attempts} attempt${record.attempts === 1 ? '' : 's'}.`
    : record.attempts ? `Attempts: ${record.attempts}. Adjust the ladder and check again.` : '';
  $('#plc-challenge-score').textContent = String(plcChallenges.filter(item => progress[item.id]?.completed).length);
  $('#plc-challenge-total').textContent = String(plcChallenges.length);
}

function checkPlcChallenge() {
  const challenge = plcChallenges.find(item => item.id === $('#plc-challenge').value);
  if (!challenge) return;
  const progress = getPlcChallengeProgress();
  const record = progress[challenge.id] || { attempts: 0, completed: false };
  record.attempts = (Number(record.attempts) || 0) + 1;
  let passed = true;
  let outputs = {};
  let runtimeState = { timers: {}, counters: {} };
  for (const step of challenge.steps) {
    const result = window.DangoteAcademyCore.calculatePlcScan(
      plcModel, step.inputs, outputs, runtimeState,
      { ...Object.fromEntries(plcAnalogInputCatalog.map(input => [input.tag, input.initial])), ...step.analogInputs }
    );
    if (!result.valid || Object.entries(step.outputs).some(([tag, value]) => result.outputs[tag] !== value) ||
      Object.entries(step.analogOutputs || {}).some(([tag, value]) => result.analogOutputs[tag] !== value)) {
      passed = false;
      break;
    }
    outputs = result.outputs;
    runtimeState = result.runtimeState;
  }
  if (passed) {
    record.completed = true;
    record.completedAt = new Date().toISOString();
  }
  progress[challenge.id] = record;
  localStorage.setItem(plcChallengeStorageKey, JSON.stringify(progress));
  renderPlcChallenges();
  renderStudentProgressSummary();
  $('#plc-challenge-feedback').textContent = passed
    ? `Challenge passed: ${challenge.objective}`
    : `Not yet. The active ladder did not meet every test case. Hint: ${challenge.hint}`;
}

function renderPlcTroubleshooting() {
  const progress = getPlcTroubleshootingProgress();
  $('#plc-diagnostic-results').innerHTML = plcTroubleshootingCases.map((scenario, index) => {
    const record = progress[scenario.id] || { attempts: 0, completed: false };
    const options = scenario.options.map((option, answer) => {
      const isCorrect = record.completed && answer === scenario.answer;
      const isSelected = !record.completed && answer === record.lastAnswer;
      return `<button class="scenario-option${isCorrect ? ' correct' : isSelected ? ' incorrect' : ''}" data-plc-diagnostic="${scenario.id}" data-answer="${answer}" ${record.completed ? 'disabled' : ''}>${escapeHtml(option)}</button>`;
    }).join('');
    const feedback = record.completed
      ? `<p class="scenario-feedback plc-diagnostic-feedback">${escapeHtml(scenario.rationale)}</p>`
      : record.lastAnswer !== undefined
        ? '<p class="scenario-feedback plc-diagnostic-feedback">Review the input image, contact state, rung path, and output image before trying again.</p>'
        : '';
    return `<article class="scenario-card plc-scenario-card"><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.symptom)}</p><small>Attempts: ${Number(record.attempts) || 0}${record.completed ? ' · Completed' : ''}</small><div class="scenario-options">${options}</div>${feedback}</article>`;
  }).join('');
  $('#plc-diagnostics-score').textContent = String(plcTroubleshootingCases.filter(item => progress[item.id]?.completed).length);
  $('#plc-diagnostics-total').textContent = String(plcTroubleshootingCases.length);
}

function answerPlcDiagnostic(event) {
  const option = event.target.closest('[data-plc-diagnostic]');
  if (!option || option.disabled) return;
  const scenario = plcTroubleshootingCases.find(item => item.id === option.dataset.plcDiagnostic);
  const selectedAnswer = Number(option.dataset.answer);
  if (!scenario || !Number.isInteger(selectedAnswer) || selectedAnswer < 0 || selectedAnswer >= scenario.options.length) return;
  const progress = getPlcTroubleshootingProgress();
  const record = progress[scenario.id] || { attempts: 0, completed: false };
  record.attempts = (Number(record.attempts) || 0) + 1;
  record.lastAnswer = selectedAnswer;
  if (selectedAnswer === scenario.answer) {
    record.completed = true;
    record.completedAt = new Date().toISOString();
  }
  progress[scenario.id] = record;
  localStorage.setItem(plcTroubleshootingStorageKey, JSON.stringify(progress));
  renderPlcTroubleshooting();
  renderStudentProgressSummary();
}

function exportPlcProgram() {
  const snapshot = getPlcSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `plc-${plcProgramId}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('PLC program exported as JSON.');
}

function importPlcProgram(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const snapshot = JSON.parse(reader.result);
      validatePlcSnapshot(snapshot);
      restorePlcSnapshot(snapshot);
      $('#plc-program').value = plcProgramId;
      $('#plc-status-text').textContent = 'PLC program imported and saved on this device.';
      showToast('PLC program imported.');
    } catch (error) {
      console.error('PLC program could not be imported.', error);
      showToast(error instanceof SyntaxError ? 'The selected file is not valid JSON.' : error.message || 'The PLC program is invalid.');
    } finally {
      event.target.value = '';
    }
  };
  reader.onerror = () => {
    console.error('PLC program file could not be read.', reader.error);
    showToast('The selected PLC program file could not be read.');
    event.target.value = '';
  };
  reader.readAsText(file);
}

function toggleSimulation() {
  isSimulating = !isSimulating;
  const button = $('#simulate-circuit'); const indicator = $('#sim-indicator');
  if (isSimulating) {
    simulationSeconds = 0;
    $('#sim-energy').textContent = '0.00 kWh';
    button.innerHTML = '<i class="fa-solid fa-stop"></i> Stop simulation';
    button.className = 'secondary-button';
    $('#sim-status').textContent = 'Simulation running';
    indicator.className = 'fa-solid fa-circle running';
    simulationTimer = setInterval(() => {
      simulationSeconds += 1;
      $$('.circuit-component[data-type="timer"]').forEach(timer => {
        const remaining = Math.max(0, Number(timer.dataset.timerSeconds ?? 5) - 1);
        timer.dataset.timerSeconds = String(remaining);
        if (remaining === 0) timer.dataset.state = 'on';
      });
      $('#sim-energy').textContent = `${((Number($('#sim-p').textContent) * simulationSeconds) / 3600000).toFixed(2)} kWh`;
      checkCircuitLogic();
      recordSimulationSample();
    }, 1000);
    checkCircuitLogic();
    simulationSamples = [];
    recordSimulationSample();
  } else {
    clearInterval(simulationTimer);
    simulationTimer = null;
    button.innerHTML = '<i class="fa-solid fa-play"></i> Run simulation';
    button.className = 'success-button';
    $('#sim-status').textContent = 'Simulation stopped';
    indicator.className = 'fa-solid fa-circle stopped';
    $('#sim-v').textContent = '0';
    $('#sim-i').textContent = '0';
    $('#sim-p').textContent = '0';
    $$('.circuit-component').forEach(item => item.dataset.powered = 'false');
    renderVirtualInstruments();
  }
}

function initialise() {
  const profile = getProfile();
  $('#profile-name').value = profile.name;
  $('#profile-student-id').value = profile.studentId || '';
  $('#profile-role').value = profile.role;
  $('#profile-name-display').textContent = profile.name;
  $('#profile-role-display').textContent = `${profile.role[0].toUpperCase()}${profile.role.slice(1)} role`;
  $('#boq-date').textContent = new Date().toLocaleDateString('en-GB');
  restorePlcState();
  renderPlcWorkspace();
  insertLoadScheduleModule();
  renderCommissioningChecks(getSavedCommissioningDraft());
  renderStandardsReview(getSavedStandardsReviewDraft());
  const capacityWarning = document.createElement('small');
  capacityWarning.id = 'res-capacity-warning';
  capacityWarning.setAttribute('role', 'status');
  $('#res-capacity').closest('small').after(capacityWarning);
  $('#add-to-boq').disabled = true;
  restoreBOQ();
  updateBOQ();
  refreshProjectList();
  if (!browserTestMode) restoreProjectsFromDatabase();
  renderComponentCatalog();
  renderTroubleshooting();
  renderStationDiagnostics();
  renderElectronicsDiagnostics();
  renderLessons();
  renderReview();
  applyRoleControls();
  renderAdminTools();
  $$('.nav-item').forEach(item => item.addEventListener('click', () => switchModule(item.dataset.module)));
  $$('[data-go]').forEach(item => item.addEventListener('click', () => switchModule(item.dataset.go)));
  $('#menu-toggle').addEventListener('click', event => {
    const open = $('#sidebar').classList.toggle('open');
    event.currentTarget.setAttribute('aria-expanded', String(open));
  });
  $('#calc-form').addEventListener('submit', calculateLoad);
  const invalidateCalculation = () => {
    invalidateLoadSizingResult();
    clearEngineeringPlot('load-sizing-plot', 'Inputs changed; recalculate to refresh the plot.');
  };
  $('#calc-form').addEventListener('input', invalidateCalculation);
  $('#calc-form').addEventListener('change', invalidateCalculation);
  $('#calc-form').addEventListener('invalid', event => { event.preventDefault(); showToast('Enter a load greater than zero and valid factor values.'); }, true);
  $('#add-to-boq').addEventListener('click', () => { if (!lastCalculation) { showToast('Run a calculation first.'); return; } addBoqRow(`${lastCalculation.cable.size}mm² Single Core Copper Wire`, 'Cabling', 1, 'Roll', lastCalculation.cable.size * 15000); addBoqRow(`${lastCalculation.breaker} MCB`, 'Protection', 1, 'Pcs', 4500); switchModule('boq'); showToast('Calculation added to the BOQ.'); });
  $('#boq-body').addEventListener('input', updateBOQ); $('#boq-body').addEventListener('click', event => { if (event.target.closest('.delete-row')) { event.target.closest('tr').remove(); updateBOQ(); } });
  $('#add-custom-item').addEventListener('click', () => addBoqRow('Custom electrical item', 'General', 1, 'Pcs', 0)); $('#export-pdf').addEventListener('click', exportPdf); $('#export-report-pdf').addEventListener('click', exportEngineeringReportPdf);
  $('#export-workspace-backup').addEventListener('click', exportWorkspaceBackup);
  $('#import-workspace-backup').addEventListener('click', () => $('#workspace-backup-file').click());
  $('#workspace-backup-file').addEventListener('change', restoreWorkspaceBackup);
  $('#save-project').addEventListener('click', saveNamedProject); $('#submit-project').addEventListener('click', submitNamedProject); $('#project-list').addEventListener('change', () => { loadNamedProject(); renderRevisionControls(); }); $('#delete-project').addEventListener('click', deleteNamedProject); $('#export-project').addEventListener('click', exportProject); $('#export-engineering-report').addEventListener('click', exportEngineeringReport); $('#import-project').addEventListener('click', () => $('#project-file').click()); $('#project-file').addEventListener('change', importProject);
  $('#project-revision-list').addEventListener('change', () => { $('#revision-comparison').textContent = 'Ready to compare selected revision.'; }); $('#compare-revision').addEventListener('click', compareProjectRevisions); $('#restore-revision').addEventListener('click', restoreProjectRevision);
  $('#component-search').addEventListener('input', renderComponentCatalog); $('#component-category').addEventListener('change', renderComponentCatalog);
  $('#motor-form').addEventListener('submit', calculateMotorFeeder);
  $('#motor-form').addEventListener('input', () => {
    lastMotorDesign = null;
    clearEngineeringPlot('motor-design-plot', 'Inputs changed; recalculate to refresh the plot.');
    $('#motor-result-warning').textContent = 'Inputs changed; recalculate before using the motor estimate.';
    $('#motor-result-warning').className = 'warning';
  });
  $('#motor-form').addEventListener('change', () => {
    lastMotorDesign = null;
    clearEngineeringPlot('motor-design-plot', 'Inputs changed; recalculate to refresh the plot.');
    $('#motor-result-warning').textContent = 'Inputs changed; recalculate before using the motor estimate.';
    $('#motor-result-warning').className = 'warning';
  });
  $('#commissioning-checks').addEventListener('input', persistCommissioningDraft);
  $('#commissioning-checks').addEventListener('change', persistCommissioningDraft);
  $('#standards-review-panel')?.addEventListener('input', persistStandardsReviewDraft);
  $('#standards-review-panel')?.addEventListener('change', persistStandardsReviewDraft);
  $('#calculate-schedule').addEventListener('click', calculateSchedule); $('#schedule-phase').addEventListener('change', calculateSchedule); $('#schedule-method').addEventListener('change', calculateSchedule); $('#schedule-rcd').addEventListener('change', calculateSchedule); $('#add-load-row').addEventListener('click', () => { addScheduleRow(); calculateSchedule(); }); $('#schedule-body').addEventListener('input', calculateSchedule); $('#schedule-body').addEventListener('click', event => { if (event.target.closest('.delete-schedule-row')) { event.target.closest('tr').remove(); calculateSchedule(); } });
  $('#troubleshooting-results').addEventListener('click', answerTroubleshooting);
  $('#station-diagnostic-results').addEventListener('click', answerStationDiagnostic);
  $('#plc-program').addEventListener('change', event => selectPlcProgram(event.target.value));
  $('#plc-inputs').addEventListener('click', event => {
    const button = event.target.closest('[data-plc-input]');
    if (!button) return;
    const tag = button.dataset.plcInput;
    plcInputs[tag] = !plcInputs[tag];
    savePlcState();
    updatePlcScan();
  });
  $('#plc-watch-table').addEventListener('change', event => {
    const input = event.target.closest('[data-plc-analog-input]');
    if (!input) return;
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      $('#plc-status-text').textContent = 'Analog input value must be between 0 and 100%.';
      return;
    }
    plcAnalogInputs[input.dataset.plcAnalogInput] = value;
    savePlcState();
    updatePlcScan();
  });
  $('#plc-fault').addEventListener('change', event => {
    plcFault = event.target.value;
    renderPlcFaultTargets();
    updatePlcScan();
  });
  $('#plc-fault-target').addEventListener('change', event => {
    plcFaultTarget = event.target.value;
    updatePlcScan();
  });
  $('#plc-scan').addEventListener('click', updatePlcScan);
  $('#plc-run').addEventListener('click', startPlcScans);
  $('#plc-add-rung').addEventListener('click', () => {
    if (plcModel.rungs.length >= 8) {
      $('#plc-status-text').textContent = 'A PLC program is limited to 8 rungs.';
      return;
    }
    const usedCoils = new Set(plcModel.rungs.map(rung => rung.coil));
    const coil = plcOutputCatalog.find(output => !usedCoils.has(output.tag))?.tag;
    if (!coil) {
      $('#plc-status-text').textContent = 'All available output coils are already assigned.';
      return;
    }
    plcModel.rungs.push({ branches: [[{ tag: 'I0.0', normallyClosed: false }]], coil });
    updatePlcProgram('Rung added.');
  });
  $('#plc-reset').addEventListener('click', resetPlcProgram);
  $('#plc-ladder').addEventListener('change', handlePlcLadderEdit);
  $('#plc-ladder').addEventListener('click', handlePlcLadderAction);
  $('#plc-challenge').addEventListener('change', renderPlcChallenges);
  $('#plc-check-challenge').addEventListener('click', checkPlcChallenge);
  $('#plc-diagnostic-results').addEventListener('click', answerPlcDiagnostic);
  $('#plc-export').addEventListener('click', exportPlcProgram);
  $('#plc-import').addEventListener('click', () => $('#plc-file').click());
  $('#plc-file').addEventListener('change', importPlcProgram);
  $('#walkthrough-check').addEventListener('click', checkCircuitWalkthroughStep);
  $('#walkthrough-reset').addEventListener('click', startCircuitWalkthrough);
  $('#meter-measurement').addEventListener('change', renderVirtualInstruments);
  $('#trend-measurement').addEventListener('change', renderCircuitTrend);
  renderCircuitWalkthrough();
  renderVirtualInstruments();
  $('#electronics-diagnostic-results').addEventListener('click', answerElectronicsDiagnostic);
  $('#electronics-led-form').addEventListener('submit', event => { event.preventDefault(); calculateElectronicsDesign('led'); });
  $('#electronics-divider-form').addEventListener('submit', event => { event.preventDefault(); calculateElectronicsDesign('divider'); });
  $('#electronics-rc-form').addEventListener('submit', event => { event.preventDefault(); calculateElectronicsDesign('rc'); });
  $('#electronics-bjt-form').addEventListener('submit', event => { event.preventDefault(); calculateElectronicsDesign('bjt'); });
  ['led', 'divider', 'rc', 'bjt'].forEach(name => {
    const form = $(`#electronics-${name}-form`);
    const invalidatePlot = () => clearEngineeringPlot(`electronics-${name}-plot`, 'Inputs changed; calculate again to refresh the plot.');
    form.addEventListener('input', invalidatePlot);
    form.addEventListener('change', invalidatePlot);
  });
  $('#station-system-filter').addEventListener('change', renderStationDiagnostics);
  $('#lesson-results').addEventListener('click', event => { const button = event.target.closest('.lesson-check'); if (button) checkLesson(button.dataset.lesson); });
  $('#export-review').addEventListener('click', exportReview);
  $('#save-profile').addEventListener('click', saveProfile);
  $('#cloud-signin-form').addEventListener('submit', signInToCloud);
  $('#cloud-set-password-form').addEventListener('submit', setCloudPassword);
  $('#cloud-profile-form').addEventListener('submit', updateCloudProfile);
  $('#cloud-signout').addEventListener('click', signOutOfCloud);
  $('#cloud-create-cohort-form').addEventListener('submit', createCloudCohort);
  $('#cloud-join-cohort-form').addEventListener('submit', joinCloudCohort);
  $('#cloud-cohorts').addEventListener('click', reviewCloudProject);
  $('#review-projects').addEventListener('click', event => { const button = event.target.closest('.review-action'); if (button) updateProjectReviewStatus(button.dataset.name, button.dataset.status); });
  $('#review-projects').addEventListener('input', event => {
    if (!event.target.matches('.review-comment-input') || !canReviewProjects()) return;
    const name = event.target.dataset.name;
    const projects = getSavedProjects().map(project => project.name === name && project.status === 'submitted'
      ? { ...project, comments: event.target.value }
      : project);
    localStorage.setItem('dangote-academy-projects', JSON.stringify(projects));
    projectsChangedDuringStartup = true;
    persistProjects(projects);
  });
  $$('[data-library-message]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.libraryMessage)));
  $$('.component-drag').forEach(item => item.addEventListener('dragstart', event => event.dataTransfer.setData('type', item.dataset.type)));
  $('#circuit-canvas').addEventListener('dragover', event => event.preventDefault()); $('#circuit-canvas').addEventListener('drop', dropComponent);
  $('#clear-canvas').addEventListener('click', () => { pushCircuitHistory(); $$('.circuit-component').forEach(item => item.remove()); circuitConnections = []; pendingConnection = null; selectedComponentId = null; $('#component-properties').hidden = true; renderCircuitWires(); updateCircuitSummary(); validateCircuit(); if (isSimulating) toggleSimulation(); });
  $('#simulate-circuit').addEventListener('click', toggleSimulation);
  $('#circuit-fault').addEventListener('change', event => {
    circuitFault = event.target.value;
    checkCircuitLogic();
    if (isSimulating) {
      simulationSamples = simulationSamples.filter(sample => sample.time < simulationSeconds);
      recordSimulationSample();
    }
  });
  $('#apply-component-value').addEventListener('click', applyCircuitComponentValue);
  $('#component-value-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') applyCircuitComponentValue();
  });
  $('#undo-circuit').addEventListener('click', undoCircuit); $('#redo-circuit').addEventListener('click', redoCircuit);
  $('#connect-mode').addEventListener('click', event => { connectMode = !connectMode; event.currentTarget.classList.toggle('active', connectMode); showToast(connectMode ? 'Connection mode enabled.' : 'Connection mode disabled.'); });
  $('#validate-circuit').addEventListener('click', validateCircuit);
  $('#save-circuit').addEventListener('click', saveCircuit); $('#load-circuit').addEventListener('click', loadCircuit); $('#export-circuit').addEventListener('click', exportCircuit); $('#import-circuit').addEventListener('click', () => $('#circuit-file').click()); $('#circuit-file').addEventListener('change', importCircuit);
  calculateLoad({ preventDefault() {} }); calculateSchedule(); calculateMotorFeeder(); updateCircuitSummary(); validateCircuit(); updateCircuitHistoryControls();
  renderCloudWorkspace();
}

document.addEventListener('DOMContentLoaded', initialise);
