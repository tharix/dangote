const moduleTitles = {
  dashboard: 'Dashboard overview',
  calculators: 'Load & cable sizing',
  'load-schedule': 'Load schedule & design checks',
  components: 'Component selection wizard',
  boq: 'Bill of quantities',
  'circuit-builder': 'Interactive circuit builder',
  troubleshooting: 'Fault troubleshooting simulator',
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
let projectsChangedDuringStartup = false;
const phaseConductors = ['line', 'phase-a', 'phase-b', 'phase-c'];
const conductorTypes = [...phaseConductors, 'neutral', 'earth'];
const projectDatabaseName = 'dangote-academy-projects';
const projectDatabaseVersion = 1;
const browserTestMode = new URLSearchParams(window.location.search).get('browser-test') === '1';

const componentCatalog = [
  { name: 'Miniature circuit breaker', category: 'protection', icon: 'fa-toggle-on', description: 'Protects final circuits from overload and short circuit conditions.', tags: ['Type C', '1-63 A'] },
  { name: 'Residual current device', category: 'protection', icon: 'fa-shield-halved', description: 'Provides additional earth leakage protection for people and equipment.', tags: ['30 mA', '2 pole'] },
  { name: 'Contactor', category: 'control', icon: 'fa-power-off', description: 'Electromagnetic switching device for motors and larger loads.', tags: ['AC-3', '3 pole'] },
  { name: 'PVC single-core cable', category: 'cabling', icon: 'fa-cable-car', description: 'Insulated copper conductor for conduit and trunking installations.', tags: ['1.5-50 mm²', '450/750 V'] },
  { name: 'LED bulkhead light', category: 'lighting', icon: 'fa-lightbulb', description: 'Efficient enclosed luminaire for industrial and service areas.', tags: ['18 W', 'IP65'] },
  { name: 'Emergency stop button', category: 'control', icon: 'fa-hand', description: 'Manual control device for quickly stopping hazardous machinery.', tags: ['Red', 'Twist reset'] }
];
const circuitComponentTypes = ['source-ac', 'battery', 'mcb', 'rcd', 'switch-1way', 'timer', 'relay', 'junction', 'lamp', 'socket', 'motor'];

const troubleshootingScenarios = [
  { title: 'Motor starter will not run', symptom: 'The supply is present, but the contactor does not pull in when the start button is pressed.', options: ['Check the control fuse and overload contact', 'Replace the motor bearings', 'Increase the motor cable size'], answer: 0 },
  { title: 'Lamp trips the MCB', symptom: 'A lighting circuit trips immediately when a lamp is switched on.', options: ['Inspect for a short circuit in the lamp holder', 'Reduce the diversity factor', 'Change the neutral wire colour'], answer: 0 },
  { title: 'RCD trips during testing', symptom: 'The RCD trips when a portable appliance is connected to an outlet.', options: ['Check the appliance insulation and earth leakage', 'Install a larger MCB', 'Remove the circuit earth conductor'], answer: 0 },
  { title: 'Timer does not start the load', symptom: 'The timer display advances, but the controlled lamp remains off after the delay.', options: ['Check timer supply, output contact, and delay setting', 'Increase the lamp wattage', 'Remove the protective earth'], answer: 0 },
  { title: 'Relay chatters repeatedly', symptom: 'A control relay rapidly makes and breaks instead of holding in.', options: ['Check coil voltage, control wiring, and contact feedback', 'Fit a smaller cable', 'Bypass the MCB'], answer: 0 }
];
const guidedLessons = [
  { id: 'safe-topology', title: 'Build a protected lighting circuit', objective: 'Create a valid source → MCB → lamp circuit using a phase conductor.', hint: 'Use AC mains, MCB, and Lamp, then connect both wires as line or Phase A/B/C.', check: () => validateCircuit() },
  { id: 'balanced-phases', title: 'Balance a three-phase schedule', objective: 'Assign equal diversified loads to Phase A, Phase B, and Phase C.', hint: 'Open Load Schedule, choose three-phase, and use equal loads on each phase.', check: () => Number($('#schedule-phase')?.value) === 3 && ['phase-a', 'phase-b', 'phase-c'].every(phase => $$('.schedule-row-phase').some(select => select.value === phase)) },
  { id: 'fault-response', title: 'Diagnose an earth-leakage fault', objective: 'Enable earth leakage and verify that an RCD and earth path are present.', hint: 'Build a circuit with an RCD and an earth conductor, then select Earth leakage.', check: () => $('#circuit-fault')?.value === 'earth-leakage' && validateCircuit() }
];
const profileStorageKey = 'dangote-academy-profile';
const profileDirectoryKey = 'dangote-academy-profiles';
const troubleshootingStorageKey = 'dangote-academy-troubleshooting';

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
  $$('[data-role]').forEach(control => {
    const roles = control.dataset.role.split(',').map(role => role.trim());
    control.hidden = !roles.includes(getRole());
  });
  $$('[data-student-only]').forEach(control => { control.hidden = getRole() !== 'student'; });
  const roleHint = $('#role-control-hint');
  if (roleHint) roleHint.textContent = getRole() === 'student'
    ? 'Students can save and submit projects for instructor review.'
    : getRole() === 'administrator'
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

function getStudentProgressSummary() {
  const lessons = getLessonProgress();
  const troubleshooting = getTroubleshootingProgress();
  const projects = getSavedProjects();
  return {
    lessonsCompleted: guidedLessons.filter(lesson => lessons[lesson.id]).length,
    lessonsTotal: guidedLessons.length,
    scenariosCompleted: troubleshootingScenarios.filter((scenario, index) => troubleshooting[scenario.id || `scenario-${index}`]?.completed).length,
    scenariosTotal: troubleshootingScenarios.length,
    attempts: troubleshootingScenarios.reduce((total, scenario, index) => total + (troubleshooting[scenario.id || `scenario-${index}`]?.attempts || 0), 0),
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
  const completedLessons = guidedLessons.filter(lesson => lessons[lesson.id]).length;
  const completedScenarios = troubleshootingScenarios.filter((scenario, index) =>
    troubleshooting[scenario.id || `scenario-${index}`]?.completed
  ).length;

  $('#dashboard-project-count').textContent = String(projects.length);
  $('#dashboard-lesson-count').textContent = `${completedLessons} / ${guidedLessons.length}`;
  $('#dashboard-scenario-count').textContent = `${completedScenarios} / ${troubleshootingScenarios.length}`;
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

  events.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  activity.innerHTML = events.length
    ? events.slice(0, 5).map(event => `<div class="activity"><span class="activity-icon ${event.color}"><i class="fa-solid ${event.icon}"></i></span><div><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail)} · ${escapeHtml(new Date(event.at).toLocaleString())}</small></div></div>`).join('')
    : '<p class="dashboard-empty">Your saved projects, completed lessons, and solved scenarios will appear here.</p>';
}

function renderStudentProgressSummary() {
  const summary = getStudentProgressSummary();
  const target = $('#student-progress-summary');
  if (target) target.innerHTML = `<span>Lessons <b>${summary.lessonsCompleted}/${summary.lessonsTotal}</b></span><span>Scenarios <b>${summary.scenariosCompleted}/${summary.scenariosTotal}</b></span><span>Attempts <b>${summary.attempts}</b></span><span>Submitted <b>${summary.projectsSubmitted}</b></span>`;
  renderDashboard();
}

function renderReview() {
  const projects = getSavedProjects();
  const progress = getLessonProgress();
  $('#review-summary').textContent = `${projects.length} saved project${projects.length === 1 ? '' : 's'} · ${Object.keys(progress).length}/${guidedLessons.length} lessons complete`;
  $('#review-projects').innerHTML = projects.length ? projects.map(project => {
    const history = Array.isArray(project.reviewHistory) ? project.reviewHistory : [];
    const status = project.status || 'draft';
    return `<article class="review-card" data-project="${escapeHtml(project.name)}"><div><strong>${escapeHtml(project.name)}</strong><small>Owner: ${escapeHtml(project.owner?.name || 'Local learner')} · Saved ${escapeHtml(new Date(project.savedAt).toLocaleString())}</small><span class="status ${status === 'approved' ? 'success' : status === 'changes-requested' ? 'danger' : status === 'submitted' ? 'info' : 'info'}">${escapeHtml(status)}</span><small>${project.resubmissionCount || 0} resubmission${project.resubmissionCount === 1 ? '' : 's'} · ${history.length} review event${history.length === 1 ? '' : 's'}</small>${project.comments ? `<p class="review-comment"><strong>Latest feedback:</strong> ${escapeHtml(project.comments)}</p>` : ''}<details><summary>Review history</summary><ul>${history.length ? history.map(event => `<li>${escapeHtml(event.action)} · ${escapeHtml(event.actor || 'Unknown')} · ${escapeHtml(new Date(event.at).toLocaleString())}${event.comment ? ` — ${escapeHtml(event.comment)}` : ''}</li>`).join('') : '<li>No history yet.</li>'}</ul></details></div><div class="review-actions"><textarea class="review-comment-input" data-role="instructor,administrator" data-name="${escapeHtml(project.name)}" maxlength="500" placeholder="Comment for the student" ${status !== 'submitted' ? 'disabled' : ''}>${escapeHtml(project.comments || '')}</textarea><div class="button-row" data-role="instructor,administrator"><button class="secondary-button review-action" data-name="${escapeHtml(project.name)}" data-status="approved" ${status !== 'submitted' ? 'disabled' : ''}>Approve</button><button class="secondary-button review-action" data-name="${escapeHtml(project.name)}" data-status="changes-requested" ${status !== 'submitted' ? 'disabled' : ''}>Request changes</button></div></div></article>`;
  }).join('') : '<p class="muted">Save a project to review it here.</p>';
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
    JSON.stringify(project.calculationInputs || null) !== JSON.stringify(activeSnapshot.calculationInputs)) {
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
  section.innerHTML = `<div class="section-heading"><div><p class="eyebrow accent">Engineering tools</p><h2>Load schedule & design checks</h2><p class="muted">Build a training load schedule and review diversified demand before cable selection.</p></div><span class="demo-note"><i class="fa-solid fa-circle-info"></i> Training estimate</span></div><div class="schedule-toolbar"><label>System phase<select id="schedule-phase"><option value="1">Single phase · 230 V</option><option value="3">Three phase · 400 V</option></select></label><label>Installation method<select id="schedule-method"><option value="clipped">Clipped direct</option><option value="conduit">Enclosed in conduit</option><option value="tray">Cable tray</option><option value="ground">Direct in ground</option></select></label><label>RCD protection<select id="schedule-rcd"><option value="recommended">Recommended</option><option value="not-required">Not required for this exercise</option></select></label><button class="secondary-button" id="add-load-row"><i class="fa-solid fa-plus"></i> Add circuit</button><button class="primary-button" id="calculate-schedule"><i class="fa-solid fa-calculator"></i> Recalculate schedule</button></div><article class="panel table-panel"><div class="table-scroll"><table class="schedule-table"><thead><tr><th>Circuit</th><th>Load (kW)</th><th>Qty</th><th>Power factor</th><th>Diversity</th><th>Phase</th><th>Action</th></tr></thead><tbody id="schedule-body"></tbody></table></div></article><div class="schedule-results"><article class="stat-card blue"><span>Connected load</span><strong id="schedule-connected">0.00 kW</strong><small>Total installed load</small></article><article class="stat-card yellow"><span>Diversified demand</span><strong id="schedule-demand">0.00 kW</strong><small>After diversity factors</small></article><article class="stat-card green"><span>Estimated design current</span><strong id="schedule-current">0.00 A</strong><small>Based on selected phase</small></article><article class="protection-card" id="protection-result"><div><span>Protection review</span><strong id="schedule-protection">--</strong></div><small id="schedule-capacity">Cable capacity: --</small><small id="schedule-rcd-result">RCD: --</small><small id="schedule-balance-result">Phase balance: --</small><small id="schedule-neutral-result">Estimated neutral: --</small></article><article class="schedule-status" id="schedule-status"><i class="fa-solid fa-circle-check"></i><div><strong>Ready for review</strong><p>Check protective devices and installation conditions against the applicable standard.</p></div></article></div>`;
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
  const result = window.DangoteAcademyCore.calculateScheduleSizing({
    phase: Number($('#schedule-phase').value),
    method: $('#schedule-method').value,
    rcd: $('#schedule-rcd').value,
    rows: $$('#schedule-body tr').map(row => ({
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
    lastCalculation = null;
    $('#add-to-boq').disabled = true;
    $('#res-capacity-warning').textContent = result.error;
    $('#res-capacity-warning').className = 'warning';
    showToast(result.error);
    return;
  }
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
        const localProjects = getSavedProjects();
        if (localProjects.length) {
          await persistProjects(localProjects);
        } else if (databaseProjects.length) {
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
      schedule: getLoadScheduleSnapshot(),
      calculationInputs: getLoadSizingInputs(),
      calculation: lastCalculation,
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
  if (project.schedule && !isValidLoadScheduleSnapshot(project.schedule)) {
    throw new Error('Invalid project load schedule.');
  }
  if (project.calculationInputs && !isValidLoadSizingInputs(project.calculationInputs)) {
    throw new Error('Invalid project calculation inputs.');
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
    JSON.stringify(previous.calculationInputs || null) !== JSON.stringify(project.calculationInputs)
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
      schedule: previous.schedule || null,
      calculationInputs: previous.calculationInputs || null,
      calculation: previous.calculation || null,
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
    reviewStatusChanged: (project.status || 'draft') !== (target.status || 'draft'),
    boqItems: `${targetRows.length} → ${currentRows.length}`,
    components: `${targetComponents.length} → ${currentComponents.length}`,
    connections: `${targetConnections.length} → ${currentConnections.length}`,
    loads: `${target.schedule?.rows?.length || 0} → ${project.schedule?.rows?.length || 0}`
  };
  output.textContent = `Revision ${index + 1}: ${result.boqChanged ? 'BOQ changed' : 'BOQ unchanged'} · ${result.circuitChanged ? 'Circuit changed' : 'Circuit unchanged'} · ${result.scheduleChanged ? 'Load schedule changed' : 'Load schedule unchanged'} · ${result.calculationChanged ? 'Sizing inputs changed' : 'Sizing inputs unchanged'} · review status ${result.reviewStatusChanged ? 'changed' : 'unchanged'} · items ${result.boqItems} · components ${result.components} · connections ${result.connections} · schedule rows ${result.loads}`;
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
  const blob = new Blob([JSON.stringify(projectSnapshot(name), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'project'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
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
    project: {
      name: projectName,
      owner: getProfile(),
      status: getSavedProjects().find(project => project.name === projectName)?.status || 'draft',
      boq: getBOQRows(),
      total: $('#boq-total')?.textContent || '0.00',
      circuit: serialiseCircuit(),
      scheduleInputs: getLoadScheduleSnapshot(),
      circuitValidation: {
        valid: circuitValid,
        message: $('#circuit-message')?.textContent || ''
      },
      calculation: lastCalculation,
      schedule: scheduleResult.valid ? scheduleResult : null,
      scheduleValidation: {
        valid: scheduleResult.valid,
        message: scheduleResult.error || ''
      },
      review: getSavedProjects().find(project => project.name === projectName)?.reviewHistory || []
    },
    learning: {
      lessons: getLessonProgress(),
      troubleshooting: getTroubleshootingProgress(),
      progress
    }
  };
}

function exportEngineeringReport() {
  const report = buildEngineeringReport();
  const name = report.project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'engineering-report';
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name}-engineering-report.json`;
  link.click();
  URL.revokeObjectURL(link.href);
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
  const labels = { 'source-ac': ['AC mains', '∿'], battery: ['Battery', '＋'], mcb: ['MCB', 'M'], rcd: ['RCD', 'R'], 'switch-1way': ['Switch', '╱'], timer: ['Timer', 'T'], relay: ['Relay', 'K'], junction: ['Junction', '＋'], lamp: ['Lamp', '◉'], socket: ['Socket', 'S'], motor: ['Motor', 'M'] };
  const [label, symbol] = labels[type] || [type, '?'];
  const element = document.createElement('div');
  element.className = 'circuit-component'; element.id = id; element.dataset.type = type; element.dataset.state = ['mcb', 'rcd'].includes(type) ? 'on' : 'off'; element.dataset.timerSeconds = type === 'timer' ? '5' : ''; element.draggable = true; element.style.left = `${Math.max(0, x)}px`; element.style.top = `${Math.max(0, y)}px`;
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
    if (['switch-1way', 'mcb', 'rcd', 'relay'].includes(type)) { element.dataset.state = element.dataset.state === 'on' ? 'off' : 'on'; checkCircuitLogic(); }
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
  const sources = components.filter(item => ['source-ac', 'battery'].includes(item.dataset.type));
  const source = sources[0];
  const loads = components.filter(item => ['lamp', 'socket', 'motor'].includes(item.dataset.type));
  const protectedTypes = ['mcb', 'rcd'];
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
    connectedLoad && lineConnectedLoad && allComponentsConnected && terminalsComplete &&
    destinationsUnique && junctionsComplete && earthLeakageReady);
  const message = sources.length === 0
    ? 'Add a source.'
    : sources.length > 1
      ? 'Use one source per training circuit.'
      : !loads.length
        ? 'Add at least one load.'
        : !hasProtection
          ? 'Add an MCB or RCD.'
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
    components: $$('.circuit-component').map(item => ({ id: item.id, type: item.dataset.type, state: item.dataset.state, timerSeconds: item.dataset.type === 'timer' ? Number(item.dataset.timerSeconds || 5) : undefined, left: parseInt(item.style.left, 10), top: parseInt(item.style.top, 10) })),
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
    $('#circuit-canvas').querySelectorAll('.circuit-component').forEach(item => item.remove());
    circuitConnections = [];
    const ids = data.components.map(item => createComponent(item.type, item.left, item.top, item.id));
    const idMap = new Map(data.components.map((item, index) => [item.id, ids[index]]));
    data.components.forEach((item, index) => {
      const element = $(`#${ids[index]}`);
      if (!element) return;
      element.dataset.state = item.state || element.dataset.state;
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
  const components = $$('.circuit-component'); const source = components.find(item => ['source-ac', 'battery'].includes(item.dataset.type)); const loads = components.filter(item => ['lamp', 'socket', 'motor'].includes(item.dataset.type));
  const closed = components.filter(item => ['switch-1way', 'mcb', 'rcd', 'relay', 'timer'].includes(item.dataset.type)).every(item => item.dataset.state === 'on');
  const fault = $('#circuit-fault')?.value || circuitFault;
  const leakage = fault === 'earth-leakage' && valid;
  const powered = valid && closed && fault === 'none';
  const voltage = powered ? (source.dataset.type === 'battery' ? 12 : 230) : 0;
  const normalCurrent = loads.reduce((total, item) => total + ({ lamp: .5, socket: 5, motor: 6 }[item.dataset.type] || 0), 0);
  const current = fault === 'short' && valid ? 80 : leakage ? .03 : powered ? normalCurrent : 0;
  $('#sim-status').textContent = fault === 'open' ? 'Fault: open circuit' : fault === 'short' ? 'Fault: short circuit' : fault === 'earth-leakage' ? 'Fault: earth leakage' : isSimulating ? 'Simulation running' : 'Simulation stopped';
  const faultVoltage = leakage ? (source.dataset.type === 'battery' ? 12 : 230) : voltage;
  $('#sim-v').textContent = faultVoltage; $('#sim-i').textContent = current.toFixed(fault === 'earth-leakage' ? 2 : 1); $('#sim-p').textContent = (faultVoltage * current).toFixed(0);
  const phaseCounts = Object.fromEntries(phaseConductors.map(conductor => [conductor, circuitConnections.filter(connection => connection.conductor === conductor).length]));
  const activePhase = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'line';
  $('#sim-phase-current').textContent = `${activePhase.replace('phase-', 'Phase ').toUpperCase()} ${current.toFixed(2)} A`;
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
  const progress = getTroubleshootingProgress();
  $('#troubleshooting-results').innerHTML = troubleshootingScenarios.map((scenario, index) => {
    const id = scenario.id || `scenario-${index}`;
    const item = progress[id] || {};
    return `<article class="scenario-card ${item.completed ? 'completed' : ''}"><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.symptom)}</p><small class="scenario-attempts">Attempts: ${item.attempts || 0}${item.completed ? ' · Completed' : ''}</small><div class="scenario-options">${scenario.options.map((option, optionIndex) => `<button class="scenario-option" data-scenario="${index}" data-answer="${optionIndex}" ${item.completed ? 'disabled' : ''}>${escapeHtml(option)}</button>`).join('')}</div><p class="scenario-feedback" id="scenario-feedback-${index}">${item.completed ? 'Completed and saved offline.' : ''}</p></article>`;
  }).join('');
  $('#troubleshooting-score').textContent = troubleshootingScenarios.filter((scenario, index) => progress[scenario.id || `scenario-${index}`]?.completed).length;
  renderStudentProgressSummary();
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
    }, 1000);
    checkCircuitLogic();
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
  insertLoadScheduleModule();
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
  renderLessons();
  renderReview();
  applyRoleControls();
  renderAdminTools();
  $$('.nav-item').forEach(item => item.addEventListener('click', () => switchModule(item.dataset.module)));
  $$('[data-go]').forEach(item => item.addEventListener('click', () => switchModule(item.dataset.go)));
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#calc-form').addEventListener('submit', calculateLoad);
  const invalidateCalculation = () => {
    invalidateLoadSizingResult();
  };
  $('#calc-form').addEventListener('input', invalidateCalculation);
  $('#calc-form').addEventListener('change', invalidateCalculation);
  $('#calc-form').addEventListener('invalid', event => { event.preventDefault(); showToast('Enter a load greater than zero and valid factor values.'); }, true);
  $('#add-to-boq').addEventListener('click', () => { if (!lastCalculation) { showToast('Run a calculation first.'); return; } addBoqRow(`${lastCalculation.cable.size}mm² Single Core Copper Wire`, 'Cabling', 1, 'Roll', lastCalculation.cable.size * 15000); addBoqRow(`${lastCalculation.breaker} MCB`, 'Protection', 1, 'Pcs', 4500); switchModule('boq'); showToast('Calculation added to the BOQ.'); });
  $('#boq-body').addEventListener('input', updateBOQ); $('#boq-body').addEventListener('click', event => { if (event.target.closest('.delete-row')) { event.target.closest('tr').remove(); updateBOQ(); } });
  $('#add-custom-item').addEventListener('click', () => addBoqRow('Custom electrical item', 'General', 1, 'Pcs', 0)); $('#export-pdf').addEventListener('click', exportPdf);
  $('#save-project').addEventListener('click', saveNamedProject); $('#submit-project').addEventListener('click', submitNamedProject); $('#project-list').addEventListener('change', () => { loadNamedProject(); renderRevisionControls(); }); $('#delete-project').addEventListener('click', deleteNamedProject); $('#export-project').addEventListener('click', exportProject); $('#export-engineering-report').addEventListener('click', exportEngineeringReport); $('#import-project').addEventListener('click', () => $('#project-file').click()); $('#project-file').addEventListener('change', importProject);
  $('#project-revision-list').addEventListener('change', () => { $('#revision-comparison').textContent = 'Ready to compare selected revision.'; }); $('#compare-revision').addEventListener('click', compareProjectRevisions); $('#restore-revision').addEventListener('click', restoreProjectRevision);
  $('#component-search').addEventListener('input', renderComponentCatalog); $('#component-category').addEventListener('change', renderComponentCatalog);
  $('#calculate-schedule').addEventListener('click', calculateSchedule); $('#schedule-phase').addEventListener('change', calculateSchedule); $('#schedule-method').addEventListener('change', calculateSchedule); $('#schedule-rcd').addEventListener('change', calculateSchedule); $('#add-load-row').addEventListener('click', () => { addScheduleRow(); calculateSchedule(); }); $('#schedule-body').addEventListener('input', calculateSchedule); $('#schedule-body').addEventListener('click', event => { if (event.target.closest('.delete-schedule-row')) { event.target.closest('tr').remove(); calculateSchedule(); } });
  $('#troubleshooting-results').addEventListener('click', answerTroubleshooting);
  $('#lesson-results').addEventListener('click', event => { const button = event.target.closest('.lesson-check'); if (button) checkLesson(button.dataset.lesson); });
  $('#export-review').addEventListener('click', exportReview);
  $('#save-profile').addEventListener('click', saveProfile);
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
