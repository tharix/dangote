const moduleTitles = {
  dashboard: 'Dashboard overview',
  calculators: 'Load & cable sizing',
  'load-schedule': 'Load schedule & design checks',
  components: 'Component selection wizard',
  boq: 'Bill of quantities',
  'circuit-builder': 'Interactive circuit builder',
  troubleshooting: 'Fault troubleshooting simulator',
  library: 'Datasheet library'
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

const componentCatalog = [
  { name: 'Miniature circuit breaker', category: 'protection', icon: 'fa-toggle-on', description: 'Protects final circuits from overload and short circuit conditions.', tags: ['Type C', '1-63 A'] },
  { name: 'Residual current device', category: 'protection', icon: 'fa-shield-halved', description: 'Provides additional earth leakage protection for people and equipment.', tags: ['30 mA', '2 pole'] },
  { name: 'Contactor', category: 'control', icon: 'fa-power-off', description: 'Electromagnetic switching device for motors and larger loads.', tags: ['AC-3', '3 pole'] },
  { name: 'PVC single-core cable', category: 'cabling', icon: 'fa-cable-car', description: 'Insulated copper conductor for conduit and trunking installations.', tags: ['1.5-50 mm²', '450/750 V'] },
  { name: 'LED bulkhead light', category: 'lighting', icon: 'fa-lightbulb', description: 'Efficient enclosed luminaire for industrial and service areas.', tags: ['18 W', 'IP65'] },
  { name: 'Emergency stop button', category: 'control', icon: 'fa-hand', description: 'Manual control device for quickly stopping hazardous machinery.', tags: ['Red', 'Twist reset'] }
];

const troubleshootingScenarios = [
  { title: 'Motor starter will not run', symptom: 'The supply is present, but the contactor does not pull in when the start button is pressed.', options: ['Check the control fuse and overload contact', 'Replace the motor bearings', 'Increase the motor cable size'], answer: 0 },
  { title: 'Lamp trips the MCB', symptom: 'A lighting circuit trips immediately when a lamp is switched on.', options: ['Inspect for a short circuit in the lamp holder', 'Reduce the diversity factor', 'Change the neutral wire colour'], answer: 0 },
  { title: 'RCD trips during testing', symptom: 'The RCD trips when a portable appliance is connected to an outlet.', options: ['Check the appliance insulation and earth leakage', 'Install a larger MCB', 'Remove the circuit earth conductor'], answer: 0 }
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
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.module === moduleId));
  $$('.module').forEach(module => module.classList.toggle('active', module.id === `module-${moduleId}`));
  $('#module-title').textContent = moduleTitles[moduleId] || moduleTitles.dashboard;
  $('#sidebar').classList.remove('open');
}

function insertLoadScheduleModule() {
  const section = document.createElement('section');
  section.className = 'module';
  section.id = 'module-load-schedule';
  section.innerHTML = `<div class="section-heading"><div><p class="eyebrow accent">Engineering tools</p><h2>Load schedule & design checks</h2><p class="muted">Build a training load schedule and review diversified demand before cable selection.</p></div><span class="demo-note"><i class="fa-solid fa-circle-info"></i> Training estimate</span></div><div class="schedule-toolbar"><label>System phase<select id="schedule-phase"><option value="1">Single phase · 230 V</option><option value="3">Three phase · 400 V</option></select></label><label>Installation method<select id="schedule-method"><option value="clipped">Clipped direct</option><option value="conduit">Enclosed in conduit</option><option value="tray">Cable tray</option><option value="ground">Direct in ground</option></select></label><label>RCD protection<select id="schedule-rcd"><option value="recommended">Recommended</option><option value="not-required">Not required for this exercise</option></select></label><button class="secondary-button" id="add-load-row"><i class="fa-solid fa-plus"></i> Add circuit</button><button class="primary-button" id="calculate-schedule"><i class="fa-solid fa-calculator"></i> Recalculate schedule</button></div><article class="panel table-panel"><div class="table-scroll"><table class="schedule-table"><thead><tr><th>Circuit</th><th>Load (kW)</th><th>Qty</th><th>Power factor</th><th>Diversity</th><th>Action</th></tr></thead><tbody id="schedule-body"></tbody></table></div></article><div class="schedule-results"><article class="stat-card blue"><span>Connected load</span><strong id="schedule-connected">0.00 kW</strong><small>Total installed load</small></article><article class="stat-card yellow"><span>Diversified demand</span><strong id="schedule-demand">0.00 kW</strong><small>After diversity factors</small></article><article class="stat-card green"><span>Estimated design current</span><strong id="schedule-current">0.00 A</strong><small>Based on selected phase</small></article><article class="protection-card" id="protection-result"><div><span>Protection review</span><strong id="schedule-protection">--</strong></div><small id="schedule-capacity">Cable capacity: --</small><small id="schedule-rcd-result">RCD: --</small></article><article class="schedule-status" id="schedule-status"><i class="fa-solid fa-circle-check"></i><div><strong>Ready for review</strong><p>Check protective devices and installation conditions against the applicable standard.</p></div></article></div>`;
  $('.page-content').appendChild(section);
  [['Lighting circuit', 1.2, 1, .95, .8], ['Socket outlets', 3, 1, .9, .6], ['Small motor', 4, 1, .82, .7]].forEach(row => addScheduleRow(...row));
}

function addScheduleRow(name = 'New circuit', load = 1, quantity = 1, pf = .9, diversity = .8) {
  const row = document.createElement('tr');
  row.innerHTML = `<td><input class="schedule-name" value="${escapeHtml(name)}" maxlength="60"></td><td><input class="schedule-load" type="number" value="${escapeHtml(load)}" min="0" step="0.1"></td><td><input class="schedule-qty" type="number" value="${escapeHtml(quantity)}" min="1" step="1"></td><td><input class="schedule-pf" type="number" value="${escapeHtml(pf)}" min="0.01" max="1" step="0.01"></td><td><input class="schedule-diversity" type="number" value="${escapeHtml(diversity)}" min="0.01" max="1" step="0.01"></td><td><button class="delete-schedule-row" aria-label="Delete circuit"><i class="fa-solid fa-trash"></i></button></td>`;
  $('#schedule-body').appendChild(row);
}

function calculateSchedule() {
  const result = window.DangoteAcademyCore.calculateScheduleSizing({
    phase: Number($('#schedule-phase').value),
    method: $('#schedule-method').value,
    rcd: $('#schedule-rcd').value,
    rows: $$('#schedule-body tr').map(row => ({
      load: Number($('.schedule-load', row).value),
      quantity: Number($('.schedule-qty', row).value),
      pf: Number($('.schedule-pf', row).value),
      diversity: Number($('.schedule-diversity', row).value)
    }))
  });
  if (!result.valid) {
    showToast(result.error);
    return;
  }
  $('#schedule-connected').textContent = `${result.connected.toFixed(2)} kW`;
  $('#schedule-demand').textContent = `${result.demand.toFixed(2)} kW`;
  $('#schedule-current').textContent = `${result.current.toFixed(2)} A`;
  $('#schedule-protection').textContent = `${result.cable.breaker}A Type C · ${result.cable.size} mm²`;
  $('#schedule-capacity').textContent = `Derated cable capacity: ${result.deratedCapacity.toFixed(1)} A`;
  $('#schedule-rcd-result').textContent = `RCD: ${$('#schedule-rcd').value === 'recommended' ? '30 mA protection recommended' : 'Confirm requirement separately'}`;
  const status = $('#schedule-status');
  status.className = `schedule-status ${result.needsReview ? 'review' : ''}`;
  status.querySelector('strong').textContent = result.needsReview ? 'Review required' : 'Protection coordinated for exercise';
  status.querySelector('p').textContent = result.needsReview ? 'Verify feeder protection, cable capacity, and applicable standards before use.' : 'The training breaker is within the selected cable capacity after derating.';
}

function calculateLoad(event) {
  event?.preventDefault();
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
    showToast(result.error);
    return;
  }
  $('#res-current').textContent = result.current.toFixed(2);
  $('#res-cable').textContent = result.cable.size;
  $('#res-capacity').textContent = result.actualCapacity;
  $('#res-method-txt').textContent = result.methodLabel;
  $('#res-breaker').textContent = `${result.cable.breaker}A Type C`;
  $('#res-vdrop').textContent = `${result.voltageDrop} V`;
  $('#res-vdrop').className = result.voltageDrop > result.voltage * .05 ? 'warning' : 'safe';
  const derating = Number.isFinite(result.derating) ? result.derating : result.actualCapacity / result.cable.capacity;
  const voltageDropPercent = Number.isFinite(result.voltageDropPercent) ? result.voltageDropPercent : result.voltageDrop / result.voltage * 100;
  $('#res-derating').textContent = `${(derating * 100).toFixed(0)}`;
  $('#res-vdrop-percent').textContent = voltageDropPercent.toFixed(2);
  lastCalculation = { cable: result.cable, breaker: `${result.cable.breaker}A Type C` };
  showToast('Cable sizing result updated.');
}

function updateBOQ() {
  let total = 0;
  $$('#boq-body tr').forEach(row => {
    const qty = Number($('.qty-input', row)?.value) || 0;
    const unitPrice = Number($('.unit-price', row)?.textContent.replace(/,/g, '')) || 0;
    const rowTotal = qty * unitPrice;
    $('.item-total', row).textContent = rowTotal.toLocaleString('en-US');
    total += rowTotal;
  });
  $('#boq-total').textContent = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!restoringBOQ) saveBOQ();
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
  const projects = getSavedProjects().filter(project => project.name !== name);
  projects.push({ name, savedAt: new Date().toISOString(), rows: getBOQRows() });
  localStorage.setItem('dangote-academy-projects', JSON.stringify(projects));
  refreshProjectList();
  $('#project-list').value = name;
  showToast(`Project saved: ${name}`);
}

function loadNamedProject() {
  const name = $('#project-list').value;
  const project = getSavedProjects().find(item => item.name === name);
  if (!project) return;
  restoringBOQ = true;
  $('#project-name').value = project.name;
  $('#boq-body').innerHTML = '';
  project.rows.forEach(item => addBoqRow(item.description, item.category, item.quantity, item.unit, item.price));
  restoringBOQ = false;
  updateBOQ();
  showToast(`Project loaded: ${project.name}`);
}

function deleteNamedProject() {
  const name = $('#project-list').value;
  if (!name) {
    showToast('Choose a saved project first.');
    return;
  }
  localStorage.setItem('dangote-academy-projects', JSON.stringify(getSavedProjects().filter(project => project.name !== name)));
  refreshProjectList();
  showToast(`Project deleted: ${name}`);
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
  restoringBOQ = true;
  $('#boq-body').innerHTML = '';
  saved.forEach(item => addBoqRow(item.description, item.category, item.quantity, item.unit, item.price));
  restoringBOQ = false;
}

function addBoqRow(description, category, quantity, unit, price) {
  const row = document.createElement('tr');
  row.innerHTML = `<td><strong>${escapeHtml(description)}</strong></td><td>${escapeHtml(category)}</td><td><input class="qty-input" type="number" value="${escapeHtml(quantity)}" min="0" step="1"></td><td>${escapeHtml(unit)}</td><td class="unit-price">${Number(price).toLocaleString('en-US')}</td><td class="item-total">0</td><td><button class="delete-row" aria-label="Delete item"><i class="fa-solid fa-trash"></i></button></td>`;
  $('#boq-body').appendChild(row);
  updateBOQ();
}

function exportPdf() {
  if (!window.jspdf?.jsPDF || typeof window.jspdf.jsPDF.API?.autoTable !== 'function') {
    showToast('PDF libraries are unavailable. Check your internet connection.');
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

function createComponent(type, x, y) {
  if (!restoringCircuit) pushCircuitHistory();
  const id = `component-${componentId++}`;
  const labels = { 'source-ac': ['AC mains', '∿'], battery: ['Battery', '＋'], mcb: ['MCB', 'M'], rcd: ['RCD', 'R'], 'switch-1way': ['Switch', '╱'], lamp: ['Lamp', '◉'], socket: ['Socket', 'S'], motor: ['Motor', 'M'] };
  const [label, symbol] = labels[type] || [type, '?'];
  const element = document.createElement('div');
  element.className = 'circuit-component'; element.id = id; element.dataset.type = type; element.dataset.state = ['mcb', 'rcd'].includes(type) ? 'on' : 'off'; element.draggable = true; element.style.left = `${Math.max(0, x)}px`; element.style.top = `${Math.max(0, y)}px`;
  element.innerHTML = `<div class="component-symbol">${symbol}</div><span class="component-label">${label}</span><button class="remove-component" aria-label="Remove component"><i class="fa-solid fa-xmark"></i></button>`;
  element.addEventListener('dragstart', event => { const rect = element.getBoundingClientRect(); event.dataTransfer.setData('existing-id', id); event.dataTransfer.setData('offset-x', event.clientX - rect.left); event.dataTransfer.setData('offset-y', event.clientY - rect.top); });
  element.addEventListener('click', event => {
    if (event.target.closest('.remove-component')) { removeComponent(id); return; }
    if (connectMode) { selectConnectionEndpoint(id); return; }
    if (['switch-1way', 'mcb', 'rcd'].includes(type)) { element.dataset.state = element.dataset.state === 'on' ? 'off' : 'on'; checkCircuitLogic(); }
  });
  $('#circuit-canvas').appendChild(element);
  $('#canvas-instruction')?.remove();
  updateCircuitSummary();
  return id;
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
  pendingConnection = null;
  renderCircuitWires();
  updateCircuitSummary();
  checkCircuitLogic();
}

function selectConnectionEndpoint(id) {
  if (!pendingConnection) {
    pendingConnection = id;
    $(`#${id}`).classList.add('connection-selected');
    showToast('Select a second component to create a wire.');
    return;
  }
  if (pendingConnection === id) return;
  const duplicate = circuitConnections.some(connection => (connection.from === pendingConnection && connection.to === id) || (connection.from === id && connection.to === pendingConnection));
  if (!duplicate) { pushCircuitHistory(); circuitConnections.push({ from: pendingConnection, to: id }); }
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
    const x1 = from.offsetLeft + from.offsetWidth / 2;
    const y1 = from.offsetTop + from.offsetHeight / 2;
    const x2 = to.offsetLeft + to.offsetWidth / 2;
    const y2 = to.offsetTop + to.offsetHeight / 2;
    return `<line class="circuit-wire" data-connection="${index}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
  }).join('');
}

function updateCircuitSummary() {
  $('#circuit-component-count').textContent = $$('.circuit-component').length;
  $('#circuit-connection-count').textContent = circuitConnections.length;
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

function validateCircuit() {
  const components = $$('.circuit-component');
  const types = components.map(item => item.dataset.type);
  const source = components.find(item => ['source-ac', 'battery'].includes(item.dataset.type));
  const loads = components.filter(item => ['lamp', 'socket', 'motor'].includes(item.dataset.type));
  const protectedTypes = ['mcb', 'rcd'];
  const hasProtection = components.some(item => protectedTypes.includes(item.dataset.type));
  const graph = new Map(components.map(item => [item.id, []]));
  circuitConnections.forEach(connection => { graph.get(connection.from)?.push(connection.to); graph.get(connection.to)?.push(connection.from); });
  const reachable = new Set(source ? [source.id] : []);
  const queue = source ? [source.id] : [];
  while (queue.length) graph.get(queue.shift()).forEach(id => { if (!reachable.has(id)) { reachable.add(id); queue.push(id); } });
  const connectedLoad = loads.some(load => reachable.has(load.id));
  const complete = Boolean(source && loads.length && hasProtection && connectedLoad && circuitConnections.length >= components.length - 1);
  const message = !source ? 'Add a source.' : !loads.length ? 'Add at least one load.' : !hasProtection ? 'Add an MCB or RCD.' : !connectedLoad ? 'Connect the source path to a load.' : complete ? 'Topology is complete for this training exercise.' : 'Connect every component into one circuit path.';
  $('#circuit-validation').textContent = complete ? 'Circuit valid' : 'Review required';
  $('#circuit-validation').className = complete ? 'validation-good' : 'validation-warning';
  $('#circuit-message').textContent = message;
  return complete;
}

function serialiseCircuit() {
  return {
    version: 1,
    components: $$('.circuit-component').map(item => ({ id: item.id, type: item.dataset.type, state: item.dataset.state, left: parseInt(item.style.left, 10), top: parseInt(item.style.top, 10) })),
    connections: circuitConnections.map(connection => ({ ...connection }))
  };
}

function restoreCircuit(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.components) || !Array.isArray(data.connections)) throw new Error('Unsupported circuit file.');
  restoringCircuit = true;
  $('#circuit-canvas').querySelectorAll('.circuit-component').forEach(item => item.remove());
  circuitConnections = [];
  const ids = data.components.map(item => createComponent(item.type, item.left, item.top));
  const idMap = new Map(data.components.map((item, index) => [item.id, ids[index]]));
  data.components.forEach((item, index) => { const element = $(`#${ids[index]}`); if (element) element.dataset.state = item.state || element.dataset.state; });
  data.connections.forEach(connection => {
    if (idMap.has(connection.from) && idMap.has(connection.to)) {
      circuitConnections.push({ from: idMap.get(connection.from), to: idMap.get(connection.to) });
    }
  });
  renderCircuitWires();
  updateCircuitSummary();
  validateCircuit();
  restoringCircuit = false;
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
  const components = $$('.circuit-component'); const source = components.find(item => ['source-ac', 'battery'].includes(item.dataset.type)); const loads = components.filter(item => ['lamp', 'socket', 'motor'].includes(item.dataset.type));
  const closed = components.filter(item => ['switch-1way', 'mcb', 'rcd'].includes(item.dataset.type)).every(item => item.dataset.state === 'on');
  const fault = $('#circuit-fault')?.value || circuitFault;
  const powered = valid && closed && fault === 'none';
  const voltage = powered ? (source.dataset.type === 'battery' ? 12 : 230) : 0;
  const normalCurrent = loads.reduce((total, item) => total + ({ lamp: .5, socket: 5, motor: 6 }[item.dataset.type] || 0), 0);
  const current = fault === 'short' && valid ? 80 : powered ? normalCurrent : 0;
  $('#sim-status').textContent = fault === 'open' ? 'Fault: open circuit' : fault === 'short' ? 'Fault: short circuit' : fault === 'earth-leakage' ? 'Fault: earth leakage' : isSimulating ? 'Simulation running' : 'Simulation stopped';
  $('#sim-v').textContent = voltage; $('#sim-i').textContent = current.toFixed(1); $('#sim-p').textContent = (voltage * current).toFixed(0);
  loads.forEach(load => load.dataset.powered = powered ? 'true' : 'false');
  $('#circuit-message').textContent = fault === 'open' ? 'Open-circuit fault injected; no load current should flow.' : fault === 'short' ? 'Short-circuit fault injected; protective devices should be reviewed.' : fault === 'earth-leakage' ? 'Earth-leakage fault injected; verify RCD protection.' : $('#circuit-message').textContent;
}

function renderComponentCatalog() {
  const query = $('#component-search').value.trim().toLowerCase();
  const category = $('#component-category').value;
  const visible = componentCatalog.filter(item => (category === 'all' || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(query));
  $('#component-results').innerHTML = visible.length ? visible.map(item => `<article class="component-card"><i class="fa-solid ${escapeHtml(item.icon)}"></i><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div class="tag-row">${item.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></article>`).join('') : '<article class="panel"><p class="muted">No components match this search.</p></article>';
}

function renderTroubleshooting() {
  $('#troubleshooting-results').innerHTML = troubleshootingScenarios.map((scenario, index) => `<article class="scenario-card"><h3>${scenario.title}</h3><p>${scenario.symptom}</p><div class="scenario-options">${scenario.options.map((option, optionIndex) => `<button class="scenario-option" data-scenario="${index}" data-answer="${optionIndex}">${option}</button>`).join('')}</div><p class="scenario-feedback" id="scenario-feedback-${index}"></p></article>`).join('');
}

function answerTroubleshooting(event) {
  const option = event.target.closest('.scenario-option');
  if (!option || option.disabled) return;
  const scenario = troubleshootingScenarios[Number(option.dataset.scenario)];
  const correct = Number(option.dataset.answer) === scenario.answer;
  const card = option.closest('.scenario-card');
  $$('.scenario-option', card).forEach(button => { button.disabled = true; if (Number(button.dataset.answer) === scenario.answer) button.classList.add('correct'); });
  if (!correct) option.classList.add('incorrect');
  $(`#scenario-feedback-${option.dataset.scenario}`).textContent = correct ? 'Correct diagnosis.' : `Review: ${scenario.options[scenario.answer]}.`;
  if (correct) $('#troubleshooting-score').textContent = Number($('#troubleshooting-score').textContent) + 1;
}

function toggleSimulation() {
  isSimulating = !isSimulating;
  const button = $('#simulate-circuit'); const indicator = $('#sim-indicator');
  if (isSimulating) { button.innerHTML = '<i class="fa-solid fa-stop"></i> Stop simulation'; button.className = 'secondary-button'; $('#sim-status').textContent = 'Simulation running'; indicator.className = 'fa-solid fa-circle running'; simulationTimer = setInterval(() => { simulationSeconds += 1; $('#sim-energy').textContent = `${((Number($('#sim-p').textContent) * simulationSeconds) / 3600000).toFixed(2)} kWh`; }, 1000); checkCircuitLogic(); }
  else { clearInterval(simulationTimer); button.innerHTML = '<i class="fa-solid fa-play"></i> Run simulation'; button.className = 'success-button'; $('#sim-status').textContent = 'Simulation stopped'; indicator.className = 'fa-solid fa-circle stopped'; $('#sim-v').textContent = '0'; $('#sim-i').textContent = '0'; $('#sim-p').textContent = '0'; $$('.circuit-component').forEach(item => item.dataset.powered = 'false'); }
}

function initialise() {
  $('#boq-date').textContent = new Date().toLocaleDateString('en-GB');
  insertLoadScheduleModule();
  restoreBOQ();
  updateBOQ();
  refreshProjectList();
  renderComponentCatalog();
  renderTroubleshooting();
  $$('.nav-item').forEach(item => item.addEventListener('click', () => switchModule(item.dataset.module)));
  $$('[data-go]').forEach(item => item.addEventListener('click', () => switchModule(item.dataset.go)));
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#calc-form').addEventListener('submit', calculateLoad);
  $('#calc-form').addEventListener('invalid', event => { event.preventDefault(); showToast('Enter a load greater than zero and valid factor values.'); }, true);
  $('#add-to-boq').addEventListener('click', () => { if (!lastCalculation) { showToast('Run a calculation first.'); return; } addBoqRow(`${lastCalculation.cable.size}mm² Single Core Copper Wire`, 'Cabling', 1, 'Roll', lastCalculation.cable.size * 15000); addBoqRow(`${lastCalculation.breaker} MCB`, 'Protection', 1, 'Pcs', 4500); switchModule('boq'); showToast('Calculation added to the BOQ.'); });
  $('#boq-body').addEventListener('input', updateBOQ); $('#boq-body').addEventListener('click', event => { if (event.target.closest('.delete-row')) { event.target.closest('tr').remove(); updateBOQ(); } });
  $('#add-custom-item').addEventListener('click', () => addBoqRow('Custom electrical item', 'General', 1, 'Pcs', 0)); $('#export-pdf').addEventListener('click', exportPdf);
  $('#save-project').addEventListener('click', saveNamedProject); $('#project-list').addEventListener('change', loadNamedProject); $('#delete-project').addEventListener('click', deleteNamedProject);
  $('#component-search').addEventListener('input', renderComponentCatalog); $('#component-category').addEventListener('change', renderComponentCatalog);
  $('#calculate-schedule').addEventListener('click', calculateSchedule); $('#schedule-phase').addEventListener('change', calculateSchedule); $('#schedule-method').addEventListener('change', calculateSchedule); $('#schedule-rcd').addEventListener('change', calculateSchedule); $('#add-load-row').addEventListener('click', () => { addScheduleRow(); calculateSchedule(); }); $('#schedule-body').addEventListener('input', calculateSchedule); $('#schedule-body').addEventListener('click', event => { if (event.target.closest('.delete-schedule-row')) { event.target.closest('tr').remove(); calculateSchedule(); } });
  $('#troubleshooting-results').addEventListener('click', answerTroubleshooting);
  $$('[data-library-message]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.libraryMessage)));
  $('#upload-video').addEventListener('click', () => showToast('Video upload is queued for the next module release.'));
  $$('.component-drag').forEach(item => item.addEventListener('dragstart', event => event.dataTransfer.setData('type', item.dataset.type)));
  $('#circuit-canvas').addEventListener('dragover', event => event.preventDefault()); $('#circuit-canvas').addEventListener('drop', dropComponent);
  $('#clear-canvas').addEventListener('click', () => { pushCircuitHistory(); $$('.circuit-component').forEach(item => item.remove()); circuitConnections = []; pendingConnection = null; renderCircuitWires(); updateCircuitSummary(); validateCircuit(); if (isSimulating) toggleSimulation(); });
  $('#simulate-circuit').addEventListener('click', toggleSimulation);
  $('#circuit-fault').addEventListener('change', event => { circuitFault = event.target.value; checkCircuitLogic(); });
  $('#undo-circuit').addEventListener('click', undoCircuit); $('#redo-circuit').addEventListener('click', redoCircuit);
  $('#connect-mode').addEventListener('click', event => { connectMode = !connectMode; event.currentTarget.classList.toggle('active', connectMode); showToast(connectMode ? 'Connection mode enabled.' : 'Connection mode disabled.'); });
  $('#validate-circuit').addEventListener('click', validateCircuit);
  $('#save-circuit').addEventListener('click', saveCircuit); $('#load-circuit').addEventListener('click', loadCircuit); $('#export-circuit').addEventListener('click', exportCircuit); $('#import-circuit').addEventListener('click', () => $('#circuit-file').click()); $('#circuit-file').addEventListener('change', importCircuit);
  calculateLoad({ preventDefault() {} }); calculateSchedule(); updateCircuitSummary(); validateCircuit(); updateCircuitHistoryControls();
}

document.addEventListener('DOMContentLoaded', initialise);
