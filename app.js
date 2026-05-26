// ═══════════════════════════════════════════
//  FORGE PWA — app.js
//  Dynamic plan system, full nutrition, PWA
// ═══════════════════════════════════════════

// ─── GLOBALS ───────────────────────────────
const SCREENS   = ['today','plans','nutrition','progress','add'];
const MEALS     = ['Breakfast','Lunch','Dinner','Snacks','Pre-Workout','Post-Workout'];
const GOALS     = ['Strength','Hypertrophy','Fat Loss','Athletic','Custom'];
const EX_CATS   = ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Core','Cardio','Full Body','Other'];

let APP = {
  plans:        [],
  activePlanId: null,
  logs:         {},   // date → {planId, dayIndex, exercises:{exId:{done,weight,reps,skipped}}, status}
  nutrition:    {},   // date → {meals:{mealName:[{...}]}, goals}
  bodyWeight:   [],   // [{date,weight}]
  customFoods:  [],
  prs:          {},   // exName → [{date,weight,reps}]
  nutrGoals:    { cal: 2500, p: 180, c: 280, f: 70 },
  recentFoods:  [],
  favFoods:     []
};

let nutrDate    = today();
let dashSection = 'workout';
let dashRange   = '1m';
let dashExName  = '';
let _liftModalExName = null;
let workoutTimerInterval = null;
let workoutTimerSec      = 0;
let restTimerInterval    = null;
let restTimerSec         = 0;
let restTimerTotal       = 0;
let deferredInstallPrompt = null;

// ─── DATE HELPERS ──────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }
function addDays(d, n) { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().split('T')[0]; }
function diffDays(a, b) { return Math.round((new Date(a) - new Date(b)) / 86400000); }
function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
function fmtDateShort(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ─── STORAGE (IndexedDB-backed, localStorage fallback) ───
async function saveApp() {
  try {
    await DB.dbPut('settings', { key: 'appData', value: APP });
  } catch(e) {
    localStorage.setItem('forge_app', JSON.stringify(APP));
  }
}
async function loadApp() {
  try {
    const r = await DB.dbGet('settings', 'appData');
    if (r && r.value) { APP = r.value; return; }
  } catch(e) {}
  const ls = localStorage.getItem('forge_app');
  if (ls) APP = JSON.parse(ls);
}

// ─── SCREEN SWITCHING ──────────────────────
function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('nav button')[SCREENS.indexOf(name)].classList.add('active');
  const renders = { today: renderToday, plans: renderPlans, nutrition: renderNutrition, progress: renderProgress, add: renderAdd };
  renders[name] && renders[name]();
}

// ─── TOAST ─────────────────────────────────
function toast(msg, duration = 2300) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), duration);
}

// ─── MODAL ─────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll && document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-bg').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));
});

// ─── TODAY ─────────────────────────────────
function renderToday() {
  const plan  = getActivePlan();
  const dateLabel = document.getElementById('today-date-label');
  const content   = document.getElementById('today-content');
  dateLabel.textContent = fmtDate(today());
  document.getElementById('streak-num').textContent = calcStreak();

  if (!plan) {
    content.innerHTML = `
      <div class="empty">
        <i class="ti ti-dumbbell"></i>
        <h3>No Active Plan</h3>
        <p>Go to Plans tab and create or activate a workout plan to get started.</p>
      </div>
      <button class="btn-main" onclick="switchScreen('plans')" style="margin-top:12px">Create a Plan</button>`;
    return;
  }

  const dayIdx    = getTodayDayIndex(plan);
  const planDay   = plan.days[dayIdx];
  const log       = getDayLog(today(), plan.id, dayIdx);
  const totalDone = plan.days.filter((_, i) => { const l = getDayLog(addDays(getPlanStart(plan.id), i), plan.id, i); return l.status === 'done' || l.status === 'skipped'; }).length;
  const dur       = plan.days.length;

  // Install banner
  let installHtml = '';
  if (deferredInstallPrompt) {
    installHtml = `<div class="install-banner show"><div class="ib-icon">📲</div><div class="ib-text"><div class="ib-title">Install FORGE App</div><div class="ib-sub">Add to home screen for offline access</div></div><button class="ib-btn" onclick="triggerInstall()">Install</button></div>`;
  }

  // Nutrition quick-look
  const nd   = getNutrDay(today());
  const tot  = calcNutrTotals(nd);
  const bwLast = APP.bodyWeight.length ? APP.bodyWeight[APP.bodyWeight.length - 1] : null;
  const bwToday = APP.bodyWeight.find(b => b.date === today());

  let html = installHtml;

  // Progress bar
  html += `<div class="progress-wrap"><div class="p-label"><span>${plan.name}</span><span>${totalDone}/${dur}</span></div><div class="progress-bar"><div class="progress-fill" style="width:${Math.round(totalDone/dur*100)}%"></div></div></div>`;

  // Summary cards row
  html += `<div class="stats-grid">
    <div class="stat-card" style="cursor:pointer" onclick="switchScreen('nutrition')">
      <div class="val">${tot.cal}</div><div class="lbl">Kcal Today</div></div>
    <div class="stat-card teal" style="cursor:pointer" onclick="openBWModal()">
      <div class="val">${bwToday ? bwToday.weight : bwLast ? bwLast.weight+'*' : '—'}</div><div class="lbl">Body Wt kg</div></div>
  </div>`;

  if (!planDay) {
    html += `<div class="empty"><i class="ti ti-check"></i><h3>Cycle Complete!</h3><p>You've finished the ${dur}-day cycle. Great work!</p></div>`;
    content.innerHTML = html; return;
  }

  html += `<div class="section-label">Day ${dayIdx + 1} — ${planDay.name}</div>`;
  html += `<div style="margin:0 16px 10px;font-size:12px;color:var(--text2)">${plan.goal ? `<span class="goal-pill ${plan.goal.toLowerCase().replace(' ','')}">${plan.goal}</span>` : ''} &nbsp;${fmtDate(today())}</div>`;

  if (planDay.type === 'rest') {
    html += `<div style="text-align:center;padding:32px 20px">
      <div style="font-size:50px;margin-bottom:12px">🛌</div>
      <div style="font-family:'Bebas Neue';font-size:30px;color:var(--purple);letter-spacing:2px">REST DAY</div>
      <div style="font-size:13px;color:var(--text2);margin-top:8px">Recovery is part of the process.</div>
    </div>`;
    if (log.status !== 'done') {
      html += `<button class="btn-main" onclick="markRestDone()">Log Rest Day</button>`;
    } else {
      html += `<div style="text-align:center;padding:12px;color:var(--green);font-size:13px">✓ Rest logged</div>`;
    }
  } else {
    // Workout timer strip
    html += `<div style="margin:0 16px 10px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:12px;color:var(--text2)">${planDay.exercises ? planDay.exercises.length : 0} exercises</span>
      <div id="workout-timer-inline" style="font-family:'Bebas Neue';font-size:18px;color:var(--accent)">⏱ ${formatTime(workoutTimerSec)}</div>
    </div>`;

    if (planDay.exercises && planDay.exercises.length) {
      html += `<div class="card"><div style="padding:0 14px">`;
      planDay.exercises.forEach(ex => {
        const exLog = (log.exercises || {})[ex.id] || {};
        const isDone = exLog.done, isSkipped = exLog.skipped;
        const lastPR = getLastPR(ex.name);
        html += `<div class="ex-row">
          <div class="ex-check ${isDone ? 'done' : isSkipped ? 'skipped' : ''}" onclick="toggleEx('${ex.id}','done')"><i class="ti ti-check"></i></div>
          <div class="ex-info">
            <div class="ex-name" style="${isDone ? 'text-decoration:line-through;opacity:.5' : ''}">${ex.name}${lastPR?`<span class="pr-badge">PR ${lastPR.weight}kg</span>`:''}</div>
            <div class="ex-meta">${ex.sets} sets × ${ex.reps}${ex.rest ? ' · ' + ex.rest : ''}${ex.notes ? ' · ' + ex.notes : ''}</div>
            ${ex.targetWeight ? `<div class="ex-weight-badge">Target: ${ex.targetWeight}kg</div>` : ''}
            ${exLog.actualWeight ? `<div style="font-size:11px;color:var(--teal);margin-top:2px">Logged: ${exLog.actualWeight}kg × ${exLog.actualReps || ex.reps}</div>` : ''}
            <div class="ex-actions">
              ${!isDone && !isSkipped ? `<button class="btn-xxs danger" onclick="toggleEx('${ex.id}','skip')">Skip</button>` : ''}
              ${isDone || isSkipped ? `<button class="btn-xxs" onclick="toggleEx('${ex.id}','undo')">Undo</button>` : ''}
              ${ex.weighted ? `<button class="btn-xxs" onclick="openLogModal('${ex.id}','${ex.name.replace(/'/g,"\\'")}')"><i class="ti ti-weight" style="font-size:10px"></i> Log</button>` : ''}
              ${ex.rest ? `<button class="btn-xxs" onclick="startRest(${parseRestSecs(ex.rest)},'${ex.name.replace(/'/g,"\\'")}')">⏱ Rest</button>` : ''}
            </div>
          </div>
        </div>`;
      });
      html += `</div></div>`;
    } else {
      html += `<div class="empty"><i class="ti ti-list"></i><p>No exercises added to this day.</p></div>`;
    }

    html += `<div class="day-cta" style="margin:0 16px 14px">
      <button class="btn-day primary" onclick="completeDayToday()" ${log.status === 'done' ? 'disabled' : ''}>${log.status === 'done' ? '✓ Done' : 'Complete Day'}</button>
      <button class="btn-day skip" onclick="skipDayToday()" ${log.status === 'skipped' ? 'disabled' : ''}>${log.status === 'skipped' ? 'Skipped' : 'Skip Day'}</button>
    </div>`;
  }

  content.innerHTML = html;

  // Start workout timer if not started yet for today
  if (!workoutTimerInterval && log.status === 'pending' && planDay.type !== 'rest') {
    startWorkoutTimer();
  }
  updateTimerDisplay();
}

function getTodayDayIndex(plan) {
  const start = getPlanStart(plan.id);
  const diff  = diffDays(today(), start);
  if (diff < 0) return 0;
  return diff % plan.days.length;
}

function getPlanStart(planId) {
  const key = 'plan_start_' + planId;
  let d = localStorage.getItem(key);
  if (!d) { d = today(); localStorage.setItem(key, d); }
  return d;
}

function getDayLog(date, planId, dayIdx) {
  const key = date + '_' + planId + '_' + dayIdx;
  return APP.logs[key] || { status: 'pending', exercises: {} };
}
function setDayLog(date, planId, dayIdx, log) {
  APP.logs[date + '_' + planId + '_' + dayIdx] = log;
  saveApp();
}

function toggleEx(exId, action) {
  const plan   = getActivePlan();
  const dayIdx = getTodayDayIndex(plan);
  const log    = getDayLog(today(), plan.id, dayIdx);
  if (!log.exercises) log.exercises = {};
  const cur = log.exercises[exId] || {};
  if (action === 'done') { cur.done = !cur.done; cur.skipped = false; }
  if (action === 'skip') { cur.skipped = true; cur.done = false; }
  if (action === 'undo') { cur.done = false; cur.skipped = false; }
  log.exercises[exId] = cur;

  // Auto-complete if all resolved
  const plan2 = getActivePlan();
  const planDay = plan2.days[dayIdx];
  if (planDay && planDay.exercises) {
    const allRes = planDay.exercises.every(ex => log.exercises[ex.id]?.done || log.exercises[ex.id]?.skipped);
    if (allRes && log.status !== 'done') { log.status = 'done'; toast('🔥 Day Complete!'); }
  }
  setDayLog(today(), plan.id, dayIdx, log);
  renderToday();
}

function completeDayToday() {
  const plan   = getActivePlan();
  const dayIdx = getTodayDayIndex(plan);
  const log    = getDayLog(today(), plan.id, dayIdx);
  log.status   = 'done';
  const planDay = plan.days[dayIdx];
  if (planDay && planDay.exercises) {
    planDay.exercises.forEach(ex => { if (!log.exercises) log.exercises = {}; if (!log.exercises[ex.id]) log.exercises[ex.id] = { done: true }; });
  }
  setDayLog(today(), plan.id, dayIdx, log);
  stopWorkoutTimer();
  toast('💪 Day logged!');
  renderToday();
}
function skipDayToday() {
  const plan   = getActivePlan();
  const dayIdx = getTodayDayIndex(plan);
  const log    = getDayLog(today(), plan.id, dayIdx);
  log.status   = 'skipped';
  setDayLog(today(), plan.id, dayIdx, log);
  stopWorkoutTimer();
  toast('Day skipped →');
  renderToday();
}
function markRestDone() {
  const plan   = getActivePlan();
  const dayIdx = getTodayDayIndex(plan);
  const log    = getDayLog(today(), plan.id, dayIdx);
  log.status   = 'done';
  setDayLog(today(), plan.id, dayIdx, log);
  toast('Rest logged ✓');
  renderToday();
}

function calcStreak() {
  const plan = getActivePlan();
  if (!plan) return 0;
  let streak = 0, d = today();
  for (let i = 0; i < 120; i++) {
    const idx = diffDays(d, getPlanStart(plan.id));
    if (idx < 0) break;
    const dayIdx = idx % plan.days.length;
    const planDay = plan.days[dayIdx];
    const log = getDayLog(d, plan.id, dayIdx);
    if (planDay?.type === 'rest' || log.status === 'done' || log.status === 'skipped') {
      if (planDay?.type === 'rest' || log.status === 'done') streak++;
      d = addDays(d, -1);
    } else break;
  }
  return streak;
}

// ─── WORKOUT TIMER ─────────────────────────
function startWorkoutTimer() {
  if (workoutTimerInterval) return;
  workoutTimerSec = 0;
  workoutTimerInterval = setInterval(() => { workoutTimerSec++; updateTimerDisplay(); }, 1000);
}
function stopWorkoutTimer() {
  clearInterval(workoutTimerInterval);
  workoutTimerInterval = null;
}
function formatTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
}
function updateTimerDisplay() {
  const el = document.getElementById('workout-timer-inline');
  if (el) el.textContent = '⏱ ' + formatTime(workoutTimerSec);
}

// ─── REST TIMER ────────────────────────────
function parseRestSecs(restStr) {
  if (!restStr) return 90;
  const m = restStr.match(/(\d+)/g);
  if (!m) return 90;
  if (restStr.includes('min')) return parseInt(m[0]) * 60 + (m[1] ? parseInt(m[1]) : 0);
  if (restStr.includes('sec')) return parseInt(m[0]);
  return parseInt(m[0]) * 60;
}
function startRest(secs, exName) {
  const overlay = document.getElementById('rest-overlay');
  restTimerSec   = secs;
  restTimerTotal = secs;
  overlay.querySelector('.rest-ex').textContent = 'Rest after ' + exName;
  overlay.classList.add('show');
  clearInterval(restTimerInterval);
  updateRestDisplay();
  restTimerInterval = setInterval(() => {
    restTimerSec--;
    updateRestDisplay();
    if (restTimerSec <= 0) { clearInterval(restTimerInterval); overlay.classList.remove('show'); toast('Rest done! 💥'); }
  }, 1000);
}
function updateRestDisplay() {
  const el = document.getElementById('rest-countdown');
  const circle = document.getElementById('rest-circle-progress');
  if (el) el.textContent = formatTime(restTimerSec);
  if (circle) {
    const r = 72, circ = 2 * Math.PI * r;
    const pct = restTimerSec / restTimerTotal;
    circle.style.strokeDasharray = circ;
    circle.style.strokeDashoffset = circ * (1 - pct);
  }
}
function skipRest() { clearInterval(restTimerInterval); document.getElementById('rest-overlay').classList.remove('show'); }

// ─── LOG MODAL (sets/reps/weight during workout) ────
function openLogModal(exId, exName) {
  _liftModalExName = exName;
  document.getElementById('log-modal-title').textContent = exName;
  const plan   = getActivePlan();
  const dayIdx = getTodayDayIndex(plan);
  const log    = getDayLog(today(), plan.id, dayIdx);
  const exLog  = (log.exercises || {})[exId] || {};
  document.getElementById('log-actual-weight').value = exLog.actualWeight || '';
  document.getElementById('log-actual-reps').value   = exLog.actualReps || '';
  document.getElementById('log-ex-id').value         = exId;
  // Show PR history
  const prs = (APP.prs[exName] || []).slice(-4).reverse().map(p => `${p.date}: ${p.weight}kg×${p.reps}`).join('  ·  ') || 'No history';
  document.getElementById('log-pr-hist').textContent = prs;
  openModal('log-modal');
  setTimeout(() => document.getElementById('log-actual-weight').focus(), 150);
}
function saveLogEntry() {
  const exId     = document.getElementById('log-ex-id').value;
  const weight   = parseFloat(document.getElementById('log-actual-weight').value);
  const reps     = document.getElementById('log-actual-reps').value;
  if (!weight) { toast('Enter weight'); return; }
  const plan   = getActivePlan();
  const dayIdx = getTodayDayIndex(plan);
  const log    = getDayLog(today(), plan.id, dayIdx);
  if (!log.exercises) log.exercises = {};
  if (!log.exercises[exId]) log.exercises[exId] = {};
  log.exercises[exId].actualWeight = weight;
  log.exercises[exId].actualReps   = reps;
  log.exercises[exId].done         = true;
  setDayLog(today(), plan.id, dayIdx, log);

  // Save PR
  if (!APP.prs[_liftModalExName]) APP.prs[_liftModalExName] = [];
  APP.prs[_liftModalExName].push({ date: today(), weight, reps });
  saveApp();

  closeModal('log-modal');
  toast('Logged: ' + weight + 'kg ✓');
  renderToday();
}
function getLastPR(exName) {
  const list = APP.prs[exName];
  if (!list || !list.length) return null;
  return list[list.length - 1];
}

// ─── BODY WEIGHT MODAL ────────────────────
function openBWModal() {
  const existing = APP.bodyWeight.find(b => b.date === today());
  document.getElementById('bw-modal-date').textContent = fmtDate(today());
  document.getElementById('bw-input').value = existing ? existing.weight : '';
  openModal('bw-modal');
  setTimeout(() => document.getElementById('bw-input').focus(), 150);
}
function saveBW() {
  const w = parseFloat(document.getElementById('bw-input').value);
  if (!w || w < 20 || w > 400) { toast('Enter a valid weight'); return; }
  const idx = APP.bodyWeight.findIndex(b => b.date === today());
  if (idx >= 0) APP.bodyWeight[idx].weight = w;
  else APP.bodyWeight.push({ date: today(), weight: w });
  APP.bodyWeight.sort((a, b) => a.date.localeCompare(b.date));
  saveApp();
  closeModal('bw-modal');
  toast('Body weight logged: ' + w + 'kg ✓');
  if (document.getElementById('screen-today').classList.contains('active')) renderToday();
  if (document.getElementById('screen-progress').classList.contains('active')) renderProgress();
}

// ─── PLANS SCREEN ──────────────────────────
function renderPlans() {
  const content = document.getElementById('plans-content');
  if (!APP.plans.length) {
    content.innerHTML = `<div class="empty"><i class="ti ti-layout-cards"></i><h3>No Plans Yet</h3><p>Create your first workout plan to get started.</p></div>
      <button class="btn-main" onclick="openNewPlanModal()">+ Create Plan</button>`;
    return;
  }

  let html = `<button class="btn-main" onclick="openNewPlanModal()" style="margin-bottom:12px">+ Create New Plan</button>`;

  APP.plans.forEach(plan => {
    const isActive = plan.id === APP.activePlanId;
    const wDays = plan.days.filter(d => d.type === 'workout').length;
    html += `<div class="plan-card ${isActive ? 'active-plan' : ''}">
      <div class="plan-card-header">
        <div class="plan-card-icon">${isActive ? '⚡' : '📋'}</div>
        <div class="plan-card-info">
          <div class="name">${plan.name}</div>
          <div class="meta">${plan.days.length}-day · ${wDays} workout days · <span class="goal-pill ${plan.goal?.toLowerCase().replace(' ','')}">${plan.goal || 'Custom'}</span></div>
        </div>
        <div class="plan-card-actions">
          <button title="Edit" onclick="editPlan('${plan.id}')"><i class="ti ti-edit"></i></button>
          <button title="Duplicate" onclick="duplicatePlan('${plan.id}')"><i class="ti ti-copy"></i></button>
          <button title="Delete" onclick="deletePlan('${plan.id}')" style="color:var(--red)"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;

    if (isActive) {
      // Show today's day
      const dayIdx  = getTodayDayIndex(plan);
      const planDay = plan.days[dayIdx];
      html += `<div style="padding:10px 14px;border-top:1px solid var(--border);font-size:12px;color:var(--text2)">
        Today → Day ${dayIdx + 1}: <b style="color:var(--text)">${planDay ? planDay.name : '—'}</b>
      </div>`;
    } else {
      html += `<div style="padding:10px 14px;border-top:1px solid var(--border)">
        <button class="btn-day primary" onclick="setActivePlan('${plan.id}')">Set as Active</button>
      </div>`;
    }
    html += `</div>`;
  });

  content.innerHTML = html;
}

function getActivePlan() {
  return APP.plans.find(p => p.id === APP.activePlanId) || null;
}

function setActivePlan(planId) {
  APP.activePlanId = planId;
  localStorage.setItem('plan_start_' + planId, today());
  saveApp();
  toast('Plan activated ✓');
  renderPlans();
}

function duplicatePlan(planId) {
  const plan = APP.plans.find(p => p.id === planId);
  if (!plan) return;
  const copy = JSON.parse(JSON.stringify(plan));
  copy.id   = uid();
  copy.name = plan.name + ' (Copy)';
  APP.plans.push(copy);
  saveApp();
  toast('Plan duplicated');
  renderPlans();
}

function deletePlan(planId) {
  if (!confirm('Delete this plan?')) return;
  APP.plans = APP.plans.filter(p => p.id !== planId);
  if (APP.activePlanId === planId) APP.activePlanId = APP.plans[0]?.id || null;
  saveApp();
  toast('Plan deleted');
  renderPlans();
}

// ─── NEW PLAN MODAL ────────────────────────
let _editPlanId = null;
function openNewPlanModal() {
  _editPlanId = null;
  document.getElementById('plan-modal-title').textContent = 'New Plan';
  document.getElementById('plan-name-input').value    = '';
  document.getElementById('plan-goal-select').value   = 'Strength';
  document.getElementById('plan-dur-select').value    = '7';
  document.getElementById('plan-days-list').innerHTML = '';
  openModal('plan-modal');
  generateDaySlots(7);
}

function editPlan(planId) {
  const plan = APP.plans.find(p => p.id === planId);
  if (!plan) return;
  _editPlanId = planId;
  document.getElementById('plan-modal-title').textContent = 'Edit Plan';
  document.getElementById('plan-name-input').value    = plan.name;
  document.getElementById('plan-goal-select').value   = plan.goal || 'Custom';
  document.getElementById('plan-dur-select').value    = String(plan.days.length);
  renderDaySlots(plan.days);
  openModal('plan-modal');
}

function generateDaySlots(n) {
  const days = [];
  for (let i = 0; i < n; i++) {
    days.push({ id: uid(), day: i + 1, name: i % 7 === 5 || i % 7 === 6 ? 'Rest Day' : 'Day ' + (i + 1), type: i % 7 === 5 || i % 7 === 6 ? 'rest' : 'workout', exercises: [] });
  }
  renderDaySlots(days);
}

function renderDaySlots(days) {
  const container = document.getElementById('plan-days-list');
  container.innerHTML = '';
  days.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'builder-day-row';
    row.dataset.idx = i;
    row.innerHTML = `
      <div class="bdr-num">${d.day || i + 1}</div>
      <div class="bdr-info">
        <input type="text" value="${d.name}" placeholder="Day name" style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;padding:4px 8px;width:100%" data-field="name" data-idx="${i}">
        <div class="bdr-type" style="margin-top:4px">
          <select data-field="type" data-idx="${i}" style="background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:${d.type === 'rest' ? 'var(--purple)' : 'var(--accent)'};font-size:11px;padding:2px 6px">
            <option value="workout" ${d.type === 'workout' ? 'selected' : ''}>💪 Workout</option>
            <option value="rest"    ${d.type === 'rest'    ? 'selected' : ''}>🛌 Rest</option>
          </select>
        </div>
      </div>
      <div class="bdr-actions">
        ${d.type === 'workout' ? `<button class="btn-icon primary" onclick="openExBuilder(${i})" title="Add exercises"><i class="ti ti-list-check"></i> ${d.exercises?.length || 0}</button>` : ''}
      </div>`;
    container.appendChild(row);

    row.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        const idx  = parseInt(el.dataset.idx);
        const fld  = el.dataset.field;
        days[idx][fld] = el.value;
        if (fld === 'type') renderDaySlots(days);
      });
    });
  });
  container.dataset.days = JSON.stringify(days);
}

function savePlan() {
  const name  = document.getElementById('plan-name-input').value.trim();
  if (!name) { toast('Enter a plan name'); return; }
  const goal  = document.getElementById('plan-goal-select').value;
  const container = document.getElementById('plan-days-list');
  const days  = JSON.parse(container.dataset.days || '[]');

  // Gather current input values
  container.querySelectorAll('[data-field="name"]').forEach(el => { const i = parseInt(el.dataset.idx); if (days[i]) days[i].name = el.value; });
  container.querySelectorAll('[data-field="type"]').forEach(el => { const i = parseInt(el.dataset.idx); if (days[i]) days[i].type = el.value; });

  if (_editPlanId) {
    const idx = APP.plans.findIndex(p => p.id === _editPlanId);
    if (idx >= 0) { APP.plans[idx].name = name; APP.plans[idx].goal = goal; APP.plans[idx].days = days; }
  } else {
    const plan = { id: uid(), name, goal, days, createdAt: today() };
    APP.plans.push(plan);
    if (!APP.activePlanId) { APP.activePlanId = plan.id; localStorage.setItem('plan_start_' + plan.id, today()); }
  }
  saveApp();
  closeModal('plan-modal');
  toast('Plan saved ✓');
  renderPlans();
}

// ─── EXERCISE BUILDER ──────────────────────
let _exBuilderDayIdx = null;
let _exBuilderDays   = null;

function openExBuilder(dayIdx) {
  const container = document.getElementById('plan-days-list');
  _exBuilderDays   = JSON.parse(container.dataset.days || '[]');
  _exBuilderDayIdx = dayIdx;
  container.querySelectorAll('[data-field="name"]').forEach(el => { const i = parseInt(el.dataset.idx); if (_exBuilderDays[i]) _exBuilderDays[i].name = el.value; });
  container.querySelectorAll('[data-field="type"]').forEach(el => { const i = parseInt(el.dataset.idx); if (_exBuilderDays[i]) _exBuilderDays[i].type = el.value; });

  const day = _exBuilderDays[dayIdx];
  document.getElementById('ex-builder-day-title').textContent = day.name;
  if (!day.exercises) day.exercises = [];
  renderExBuilder(day.exercises);
  openModal('ex-builder-modal');
}

function renderExBuilder(exList) {
  const container = document.getElementById('ex-list-builder');
  container.innerHTML = '';
  exList.forEach((ex, i) => {
    const row = document.createElement('div');
    row.className = 'ex-builder-row';
    row.dataset.idx = i;
    row.innerHTML = `
      <i class="ti ti-grip-vertical ex-grab"></i>
      <div class="ex-builder-info">
        <div class="ex-builder-name">${ex.name}</div>
        <div class="ex-builder-meta">${ex.sets} sets × ${ex.reps}${ex.targetWeight ? ' · ' + ex.targetWeight + 'kg' : ''}${ex.rest ? ' · ' + ex.rest : ''}</div>
      </div>
      <div class="ex-builder-actions">
        <button class="btn-icon primary" onclick="editExEntry(${i})"><i class="ti ti-edit"></i></button>
        <button class="btn-icon" onclick="dupeEx(${i})"><i class="ti ti-copy"></i></button>
        <button class="btn-icon danger-sm" onclick="delEx(${i})"><i class="ti ti-trash"></i></button>
      </div>`;
    container.appendChild(row);
  });
  container.dataset.exercises = JSON.stringify(exList);
}

function addExEntry() {
  const name   = document.getElementById('ex-name').value.trim();
  if (!name) { toast('Enter exercise name'); return; }
  const ex = {
    id:           uid(),
    name,
    sets:         document.getElementById('ex-sets').value || '3',
    reps:         document.getElementById('ex-reps').value || '10',
    targetWeight: document.getElementById('ex-target-weight').value ? parseFloat(document.getElementById('ex-target-weight').value) : null,
    rest:         document.getElementById('ex-rest').value || '',
    notes:        document.getElementById('ex-notes').value || '',
    category:     document.getElementById('ex-category').value || 'Other',
    weighted:     document.getElementById('ex-weighted').checked
  };
  const container = document.getElementById('ex-list-builder');
  const exercises = JSON.parse(container.dataset.exercises || '[]');
  exercises.push(ex);
  renderExBuilder(exercises);
  // Clear fields
  ['ex-name','ex-sets','ex-reps','ex-target-weight','ex-rest','ex-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('ex-name').focus();
  toast('Exercise added');
}

function dupeEx(idx) {
  const container = document.getElementById('ex-list-builder');
  const exercises = JSON.parse(container.dataset.exercises || '[]');
  const copy = { ...exercises[idx], id: uid() };
  exercises.splice(idx + 1, 0, copy);
  renderExBuilder(exercises);
}

function delEx(idx) {
  const container = document.getElementById('ex-list-builder');
  const exercises = JSON.parse(container.dataset.exercises || '[]');
  exercises.splice(idx, 1);
  renderExBuilder(exercises);
}

let _editExIdx = null;
function editExEntry(idx) {
  const container = document.getElementById('ex-list-builder');
  const exercises = JSON.parse(container.dataset.exercises || '[]');
  const ex = exercises[idx];
  _editExIdx = idx;
  document.getElementById('ex-name').value          = ex.name;
  document.getElementById('ex-sets').value          = ex.sets;
  document.getElementById('ex-reps').value          = ex.reps;
  document.getElementById('ex-target-weight').value = ex.targetWeight || '';
  document.getElementById('ex-rest').value          = ex.rest || '';
  document.getElementById('ex-notes').value         = ex.notes || '';
  document.getElementById('ex-category').value      = ex.category || 'Other';
  document.getElementById('ex-weighted').checked    = !!ex.weighted;
  document.getElementById('ex-name').focus();
}

function saveExBuilder() {
  const container = document.getElementById('ex-list-builder');
  const exercises = JSON.parse(container.dataset.exercises || '[]');
  if (!_exBuilderDays || _exBuilderDayIdx === null) { closeModal('ex-builder-modal'); return; }
  _exBuilderDays[_exBuilderDayIdx].exercises = exercises;
  const planContainer = document.getElementById('plan-days-list');
  planContainer.dataset.days = JSON.stringify(_exBuilderDays);
  renderDaySlots(_exBuilderDays);
  closeModal('ex-builder-modal');
  toast('Exercises saved ✓');
}

// ─── NUTRITION ─────────────────────────────
function getNutrDay(d) {
  if (!APP.nutrition[d]) APP.nutrition[d] = { meals: {} };
  return APP.nutrition[d];
}
function calcNutrTotals(nd) {
  let cal = 0, p = 0, c = 0, f = 0;
  Object.values(nd.meals || {}).forEach(items => items.forEach(it => { cal += it.cal || 0; p += it.p || 0; c += it.c || 0; f += it.f || 0; }));
  return { cal: Math.round(cal), p: Math.round(p * 10) / 10, c: Math.round(c * 10) / 10, f: Math.round(f * 10) / 10 };
}

function shiftNutrDate(n) {
  nutrDate = addDays(nutrDate, n);
  if (nutrDate > today()) nutrDate = today();
  renderNutrition();
}

let _activeMeal = '';
let _searchResults = [];

function renderNutrition() {
  document.getElementById('nutr-date-label').textContent = nutrDate === today() ? 'Today' : fmtDate(nutrDate);
  const nd   = getNutrDay(nutrDate);
  const tot  = calcNutrTotals(nd);
  const g    = APP.nutrGoals;
  const pct  = (v, max) => Math.min(100, Math.round(v / max * 100));

  let html = `
    <!-- Macro summary -->
    <div style="margin:0 16px 12px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border);padding:14px">
      <div style="display:flex;justify-content:space-around;margin-bottom:12px">
        <div style="text-align:center"><div style="font-family:'Bebas Neue';font-size:28px;color:var(--accent);line-height:1">${tot.cal}</div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">KCAL</div><div style="font-size:10px;color:var(--text3)">/ ${g.cal}</div></div>
        <div style="width:1px;background:var(--border)"></div>
        <div style="text-align:center"><div style="font-family:'Bebas Neue';font-size:22px;color:#ff6b6b">${tot.p}g</div><div style="font-size:10px;color:var(--text3)">PROTEIN</div></div>
        <div style="text-align:center"><div style="font-family:'Bebas Neue';font-size:22px;color:var(--amber)">${tot.c}g</div><div style="font-size:10px;color:var(--text3)">CARBS</div></div>
        <div style="text-align:center"><div style="font-family:'Bebas Neue';font-size:22px;color:var(--teal)">${tot.f}g</div><div style="font-size:10px;color:var(--text3)">FAT</div></div>
      </div>
      <div class="macro-bar-row"><div class="mbl">Protein</div><div class="mbbar"><div class="mbfill" style="width:${pct(tot.p,g.p)}%;background:#ff6b6b"></div></div><div class="mbval">${pct(tot.p,g.p)}%</div></div>
      <div class="macro-bar-row" style="margin-top:5px"><div class="mbl">Carbs</div><div class="mbbar"><div class="mbfill" style="width:${pct(tot.c,g.c)}%;background:var(--amber)"></div></div><div class="mbval">${pct(tot.c,g.c)}%</div></div>
      <div class="macro-bar-row" style="margin-top:5px"><div class="mbl">Fat</div><div class="mbbar"><div class="mbfill" style="width:${pct(tot.f,g.f)}%;background:var(--teal)"></div></div><div class="mbval">${pct(tot.f,g.f)}%</div></div>
    </div>`;

  // Meal blocks
  MEALS.forEach(meal => {
    const items = nd.meals[meal] || [];
    const mCal  = Math.round(items.reduce((a, b) => a + (b.cal || 0), 0));
    html += `<div class="meal-block">
      <div class="meal-header">
        <span class="mname">${meal}</span>
        <div style="display:flex;align-items:center;gap:8px">
          ${mCal > 0 ? `<span class="mcal">${mCal} kcal</span>` : ''}
          <button class="btn-icon primary" onclick="openFoodPicker('${meal}')"><i class="ti ti-plus"></i></button>
        </div>
      </div>
      ${items.length ? items.map((it, i) => `
        <div class="food-item-row">
          <div><div class="finame">${it.name} <span style="color:var(--text3);font-size:11px">${it.qty}${it.unit}</span></div>
          <div class="fimeta">${Math.round(it.cal)} kcal · P${(it.p||0).toFixed(1)} C${(it.c||0).toFixed(1)} F${(it.f||0).toFixed(1)}</div></div>
          <button class="fidel" onclick="deleteFood('${meal}',${i})"><i class="ti ti-x"></i></button>
        </div>`).join('') : `<div style="padding:9px 14px;font-size:12px;color:var(--text3)">Tap + to add food</div>`}
    </div>`;
  });

  // Goals editor
  html += `<div class="section-label">Daily Goals</div>
  <div class="form-row col2">
    <div class="form-group"><label>Calories</label><input type="number" id="g-cal" value="${g.cal}" onchange="saveNutrGoals()"></div>
    <div class="form-group"><label>Protein g</label><input type="number" id="g-p" value="${g.p}" onchange="saveNutrGoals()"></div>
    <div class="form-group"><label>Carbs g</label><input type="number" id="g-c" value="${g.c}" onchange="saveNutrGoals()"></div>
    <div class="form-group"><label>Fat g</label><input type="number" id="g-f" value="${g.f}" onchange="saveNutrGoals()"></div>
  </div><div style="height:14px"></div>`;

  document.getElementById('nutrition-content').innerHTML = html;
}

function saveNutrGoals() {
  APP.nutrGoals = {
    cal: parseFloat(document.getElementById('g-cal').value) || 2500,
    p:   parseFloat(document.getElementById('g-p').value) || 180,
    c:   parseFloat(document.getElementById('g-c').value) || 280,
    f:   parseFloat(document.getElementById('g-f').value) || 70
  };
  saveApp();
  renderNutrition();
}

// ─── FOOD PICKER ───────────────────────────
function openFoodPicker(meal) {
  _activeMeal = meal;
  document.getElementById('food-picker-title').textContent = 'Add to ' + meal;
  document.getElementById('food-search-box').value = '';
  document.getElementById('food-results-list').innerHTML = '';
  document.getElementById('food-qty').value = '100';
  document.getElementById('food-unit').value = 'g';
  document.getElementById('manual-name').value = '';
  document.getElementById('manual-cal').value = '';
  document.getElementById('manual-p').value = '';
  document.getElementById('manual-c').value = '';
  document.getElementById('manual-f').value = '';
  document.getElementById('food-selected-info').innerHTML = '';
  _selectedFood = null;
  renderRecentFoods();
  openModal('food-picker-modal');
  setTimeout(() => document.getElementById('food-search-box').focus(), 150);
}

let _selectedFood = null;
function renderRecentFoods() {
  const recents = (APP.recentFoods || []).slice(0, 8);
  const html    = recents.length ? recents.map(f => `<button class="btn-icon" onclick="selectFoodItem('${f.id}','${f.name.replace(/'/g,'\\\'')}')" style="margin:2px">${f.name}</button>`).join('') : '<span style="font-size:12px;color:var(--text3)">No recent foods</span>';
  const el = document.getElementById('recent-foods');
  if (el) el.innerHTML = html;
}

function searchFoodDB(q) {
  const el = document.getElementById('food-results-list');
  if (!q || q.length < 1) { el.innerHTML = ''; return; }
  const ql = q.toLowerCase();
  const results = FOOD_DB.filter(f => f.name.toLowerCase().includes(ql)).slice(0, 15);
  const customResults = APP.customFoods.filter(f => f.name.toLowerCase().includes(ql)).slice(0, 5);
  const all = [...results, ...customResults];
  if (!all.length) { el.innerHTML = '<div class="fsr-item"><span class="fi-n" style="color:var(--text2)">No results — add manually below</span></div>'; return; }
  el.innerHTML = all.map(f => `<div class="fsr-item" onclick="selectFoodItem('${f.id}','${f.name.replace(/'/g,'\\\'')}')" style="cursor:pointer">
    <span class="fi-n">${f.name}</span>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
      <span class="fi-c">${f.cal} kcal</span>
      <span class="fi-cat">${f.cat || 'Custom'}</span>
    </div>
  </div>`).join('');
}

function selectFoodItem(foodId, foodName) {
  const food = FOOD_DB.find(f => f.id === foodId) || APP.customFoods.find(f => f.id === foodId);
  if (!food) return;
  _selectedFood = food;
  document.getElementById('food-unit').value = food.unit || 'g';
  document.getElementById('food-qty').value  = food.per || 100;
  updateFoodCalcDisplay();
  document.getElementById('food-results-list').innerHTML = '';
  document.getElementById('food-search-box').value = food.name;
}

function updateFoodCalcDisplay() {
  if (!_selectedFood) return;
  const qty  = parseFloat(document.getElementById('food-qty').value) || 100;
  const ratio = qty / (_selectedFood.per || 100);
  const cal  = Math.round(_selectedFood.cal * ratio);
  const p    = (_selectedFood.p * ratio).toFixed(1);
  const c    = (_selectedFood.c * ratio).toFixed(1);
  const f    = (_selectedFood.f * ratio).toFixed(1);
  document.getElementById('food-selected-info').innerHTML = `
    <div style="background:var(--bg3);border-radius:var(--r-sm);padding:10px 12px;font-size:12px;display:flex;gap:14px;justify-content:center">
      <span><b style="color:var(--accent)">${cal}</b> kcal</span>
      <span>P<b style="color:#ff6b6b">${p}</b></span>
      <span>C<b style="color:var(--amber)">${c}</b></span>
      <span>F<b style="color:var(--teal)">${f}</b></span>
    </div>`;
}

function addFoodFromPicker() {
  const nd  = getNutrDay(nutrDate);
  if (!nd.meals[_activeMeal]) nd.meals[_activeMeal] = [];

  if (_selectedFood) {
    const qty   = parseFloat(document.getElementById('food-qty').value) || 100;
    const unit  = document.getElementById('food-unit').value;
    const ratio = qty / (_selectedFood.per || 100);
    const entry = {
      name: _selectedFood.name, qty, unit,
      cal: Math.round(_selectedFood.cal * ratio),
      p:   Math.round(_selectedFood.p * ratio * 10) / 10,
      c:   Math.round(_selectedFood.c * ratio * 10) / 10,
      f:   Math.round(_selectedFood.f * ratio * 10) / 10
    };
    nd.meals[_activeMeal].push(entry);
    // Recent foods
    if (!APP.recentFoods) APP.recentFoods = [];
    APP.recentFoods = [{ id: _selectedFood.id, name: _selectedFood.name }, ...APP.recentFoods.filter(r => r.id !== _selectedFood.id)].slice(0, 20);
  } else {
    // Manual
    const name = document.getElementById('manual-name').value.trim();
    if (!name) { toast('Enter food name'); return; }
    const entry = {
      name, qty: parseFloat(document.getElementById('food-qty').value) || 100, unit: document.getElementById('food-unit').value,
      cal: parseFloat(document.getElementById('manual-cal').value) || 0,
      p:   parseFloat(document.getElementById('manual-p').value)   || 0,
      c:   parseFloat(document.getElementById('manual-c').value)   || 0,
      f:   parseFloat(document.getElementById('manual-f').value)   || 0
    };
    nd.meals[_activeMeal].push(entry);
  }
  APP.nutrition[nutrDate] = nd;
  saveApp();
  closeModal('food-picker-modal');
  toast('Food added ✓');
  renderNutrition();
}

function addCustomFood() {
  const name = document.getElementById('manual-name').value.trim();
  if (!name) { toast('Enter food name'); return; }
  const food = {
    id: 'cf_' + uid(), name, cat: 'Custom',
    cal: parseFloat(document.getElementById('manual-cal').value) || 0,
    p:   parseFloat(document.getElementById('manual-p').value)   || 0,
    c:   parseFloat(document.getElementById('manual-c').value)   || 0,
    f:   parseFloat(document.getElementById('manual-f').value)   || 0,
    unit: document.getElementById('food-unit').value, per: parseFloat(document.getElementById('food-qty').value) || 100
  };
  APP.customFoods.push(food);
  saveApp();
  toast('Custom food saved ✓');
}

function deleteFood(meal, idx) {
  const nd = getNutrDay(nutrDate);
  if (nd.meals[meal]) nd.meals[meal].splice(idx, 1);
  APP.nutrition[nutrDate] = nd;
  saveApp();
  renderNutrition();
}

// ─── PROGRESS DASHBOARD ────────────────────
let _dashCharts = [];

function renderProgress() {
  const plan = getActivePlan();

  const totalDone  = Object.values(APP.logs).filter(l => l.status === 'done').length;
  const streak     = calcStreak();
  const lastBW     = APP.bodyWeight.length ? APP.bodyWeight[APP.bodyWeight.length - 1] : null;
  let calSum = 0, calDays = 0;
  for (let i = 0; i < 7; i++) { const d = addDays(today(), -i); const nd = getNutrDay(d); const t = calcNutrTotals(nd); if (t.cal > 0) { calSum += t.cal; calDays++; } }
  const avgCal = calDays > 0 ? Math.round(calSum / calDays) : 0;

  // PR summary
  const prCount = Object.keys(APP.prs).length;

  let html = `
    <div class="stats-grid">
      <div class="stat-card"><div class="val">${totalDone}</div><div class="lbl">Sessions Done</div></div>
      <div class="stat-card"><div class="val">${streak}</div><div class="lbl">Streak</div></div>
      <div class="stat-card teal"><div class="val">${lastBW ? lastBW.weight + '<span style="font-size:11px"> kg</span>' : '—'}</div><div class="lbl">Body Weight</div></div>
      <div class="stat-card orange"><div class="val">${avgCal}</div><div class="lbl">Avg Kcal/Day</div></div>
    </div>
    <div class="tab-strip">
      <button class="tab-btn ${dashRange==='1m'?'active':''}" onclick="setDR('1m')">1 Mo</button>
      <button class="tab-btn ${dashRange==='3m'?'active':''}" onclick="setDR('3m')">3 Mo</button>
      <button class="tab-btn ${dashRange==='6m'?'active':''}" onclick="setDR('6m')">6 Mo</button>
      <button class="tab-btn ${dashRange==='1y'?'active':''}" onclick="setDR('1y')">1 Year</button>
    </div>
    <div class="segment-tabs">
      <button class="seg-btn ${dashSection==='workout'?'active':''}" onclick="setDS('workout')">Workout</button>
      <button class="seg-btn ${dashSection==='body'?'active':''}" onclick="setDS('body')">Body Wt</button>
      <button class="seg-btn ${dashSection==='nutrition'?'active':''}" onclick="setDS('nutrition')">Nutrition</button>
      <button class="seg-btn ${dashSection==='lifts'?'active':''}" onclick="setDS('lifts')">Lifts</button>
    </div>`;

  if (dashSection === 'workout') {
    // Heatmap
    html += `<div class="section-label">Consistency (last 13 weeks)</div>
    <div class="heatmap-grid" id="heatmap-grid"></div>
    <div class="chart-wrap"><h3>Weekly Volume (Sessions)</h3><canvas id="completion-chart" height="160"></canvas></div>`;
  } else if (dashSection === 'body') {
    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 16px;margin-bottom:8px">
      <span style="font-size:12px;color:var(--text2)">Body Weight Trend</span>
      <button class="btn-icon primary" onclick="openBWModal()"><i class="ti ti-plus"></i> Log</button>
    </div>
    <div class="chart-wrap"><h3>Weight (kg)</h3><canvas id="bw-chart" height="200"></canvas></div>
    <div class="card"><div style="padding:0 14px" id="bw-log-list"></div></div>`;
  } else if (dashSection === 'nutrition') {
    html += `<div class="chart-wrap"><h3>Daily Calories</h3><canvas id="cal-chart" height="170"></canvas></div>
    <div class="chart-wrap"><h3>Protein Intake (g)</h3><canvas id="protein-chart" height="150"></canvas></div>`;
  } else if (dashSection === 'lifts') {
    const exNames = Object.keys(APP.prs);
    if (!dashExName && exNames.length) dashExName = exNames[0];
    html += `<select class="tab-btn" onchange="setDE(this.value)" style="margin:0 16px 10px;width:calc(100% - 32px);background:var(--bg2);color:var(--text);border:1px solid var(--border2);border-radius:var(--r-sm);padding:7px 12px">
      ${exNames.map(n => `<option value="${n}" ${n===dashExName?'selected':''}>${n}</option>`).join('')}
    </select>
    <div class="chart-wrap"><h3>${dashExName || 'Select exercise'} — Lift Progression</h3><canvas id="lift-chart" height="200"></canvas></div>
    <div class="section-label">PRs (Personal Records)</div>
    <div class="card"><div style="padding:0 14px" id="pr-list"></div></div>`;
  }

  document.getElementById('progress-content').innerHTML = html;

  // Destroy old charts
  _dashCharts.forEach(c => { try { c.destroy(); } catch(e) {} });
  _dashCharts = [];

  const days = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }[dashRange] || 30;
  const CO = { responsive: true, plugins: { legend: { display: false } }, scales: {
    x: { ticks: { color: '#444', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
    y: { ticks: { color: '#444', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: false }
  }};

  if (dashSection === 'workout') {
    // Heatmap
    renderHeatmap();
    // Completion chart
    const weeks = Math.min(Math.ceil(days / 7), 52);
    const labels = [], done = [], skip = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const ws = addDays(today(), -(w + 1) * 7 + 1);
      let d = 0, s = 0;
      for (let dd = 0; dd < 7; dd++) {
        const date = addDays(ws, dd);
        Object.entries(APP.logs).forEach(([key, log]) => { if (key.startsWith(date)) { if (log.status === 'done') d++; if (log.status === 'skipped') s++; } });
      }
      labels.push('W' + (weeks - w)); done.push(d); skip.push(s);
    }
    const c = new Chart(document.getElementById('completion-chart'), { type: 'bar', data: { labels, datasets: [{ label: 'Done', data: done, backgroundColor: 'rgba(0,230,118,.45)', borderRadius: 3 }, { label: 'Skipped', data: skip, backgroundColor: 'rgba(255,69,69,.35)', borderRadius: 3 }] }, options: { ...CO, plugins: { legend: { labels: { color: '#555', font: { size: 10 } } } }, scales: { x: { ticks: { color: '#444', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#444', font: { size: 9 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true } } } });
    _dashCharts.push(c);

  } else if (dashSection === 'body') {
    const cutoff   = addDays(today(), -days);
    const bwData   = APP.bodyWeight.filter(b => b.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
    const c = new Chart(document.getElementById('bw-chart'), { type: 'line', data: { labels: bwData.map(b => fmtDateShort(b.date)), datasets: [{ data: bwData.map(b => b.weight), borderColor: 'var(--teal)', backgroundColor: 'rgba(0,212,170,.07)', tension: 0.35, pointBackgroundColor: 'var(--teal)', pointRadius: 4, fill: true }] }, options: CO });
    _dashCharts.push(c);
    const bwList = document.getElementById('bw-log-list');
    if (bwList) bwList.innerHTML = bwData.slice().reverse().slice(0, 20).map(b => `<div class="bw-row"><span class="bw-date">${fmtDate(b.date)}</span><span class="bw-val">${b.weight}</span><button class="bw-del" onclick="delBW('${b.date}')"><i class="ti ti-trash"></i></button></div>`).join('') || '<div style="padding:14px;text-align:center;color:var(--text3);font-size:13px">No entries</div>';

  } else if (dashSection === 'nutrition') {
    const pts = [], labels = [];
    for (let i = days - 1; i >= 0; i--) { const d = addDays(today(), -i); const t = calcNutrTotals(getNutrDay(d)); pts.push(t.cal); labels.push(i % Math.max(1, Math.floor(days / 10)) === 0 ? fmtDateShort(d) : ''); }
    const c1 = new Chart(document.getElementById('cal-chart'), { type: 'bar', data: { labels, datasets: [{ data: pts, backgroundColor: 'rgba(200,255,0,.4)', borderRadius: 3 }] }, options: { ...CO, scales: { x: { ticks: { color: '#444', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#444', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,.04)' }, beginAtZero: true } } } });
    _dashCharts.push(c1);
    const pts2 = [];
    for (let i = days - 1; i >= 0; i--) { const d = addDays(today(), -i); pts2.push(calcNutrTotals(getNutrDay(d)).p); }
    const c2 = new Chart(document.getElementById('protein-chart'), { type: 'line', data: { labels, datasets: [{ data: pts2, borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,.07)', tension: 0.3, pointRadius: 0, fill: true }] }, options: CO });
    _dashCharts.push(c2);

  } else if (dashSection === 'lifts') {
    const cutoff = addDays(today(), -days);
    const liftData = (APP.prs[dashExName] || []).filter(p => p.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
    const c = new Chart(document.getElementById('lift-chart'), { type: 'line', data: { labels: liftData.map(p => fmtDateShort(p.date)), datasets: [{ data: liftData.map(p => p.weight), borderColor: 'var(--accent)', backgroundColor: 'rgba(200,255,0,.07)', tension: 0.3, pointBackgroundColor: 'var(--accent)', pointRadius: 4, fill: true }] }, options: CO });
    _dashCharts.push(c);
    const prEl = document.getElementById('pr-list');
    if (prEl) prEl.innerHTML = liftData.slice().reverse().slice(0, 15).map(p => `<div class="volume-row"><span class="vex">${fmtDate(p.date)}</span><span style="font-size:12px;color:var(--text2)">${p.reps || '—'} reps</span><span class="vvol">${p.weight}kg</span></div>`).join('') || '<div style="padding:14px;text-align:center;color:var(--text3);font-size:12px">No PR data yet</div>';
  }
}

function renderHeatmap() {
  const grid = document.getElementById('heatmap-grid');
  if (!grid) return;
  const plan = getActivePlan();
  let html = '';
  for (let i = 12 * 7 - 1; i >= 0; i--) {
    const d   = addDays(today(), -i);
    const isTod = d === today();
    let cls = 'hm-cell';
    if (plan) {
      const diff   = diffDays(d, getPlanStart(plan.id));
      const dayIdx = ((diff % plan.days.length) + plan.days.length) % plan.days.length;
      const log    = getDayLog(d, plan.id, dayIdx);
      const planDay = plan.days[dayIdx];
      if (planDay?.type === 'rest') cls += ' rest';
      else if (log.status === 'done') cls += ' done';
      else if (log.status === 'skipped') cls += ' skipped';
    }
    if (isTod) cls += ' today';
    html += `<div class="${cls}" title="${fmtDate(d)}"></div>`;
  }
  grid.innerHTML = html;
}

function setDR(r) { dashRange = r; renderProgress(); }
function setDS(s) { dashSection = s; renderProgress(); }
function setDE(e) { dashExName = e; renderProgress(); }
function delBW(date) { APP.bodyWeight = APP.bodyWeight.filter(b => b.date !== date); saveApp(); renderProgress(); }

// ─── ADD CUSTOM SESSION (legacy compat) ────
function renderAdd() {
  document.getElementById('add-content').innerHTML = `
    <div class="section-label">Custom Food</div>
    <div class="form-group"><label>Food Name</label><input type="text" id="cf-name" placeholder="e.g. Homemade Protein Bar"></div>
    <div class="form-row col2">
      <div class="form-group"><label>Per (grams/ml)</label><input type="number" id="cf-per" placeholder="100"></div>
      <div class="form-group"><label>Unit</label><input type="text" id="cf-unit" placeholder="g"></div>
    </div>
    <div class="form-row col2">
      <div class="form-group"><label>Calories</label><input type="number" id="cf-cal"></div>
      <div class="form-group"><label>Protein g</label><input type="number" id="cf-p"></div>
      <div class="form-group"><label>Carbs g</label><input type="number" id="cf-c"></div>
      <div class="form-group"><label>Fat g</label><input type="number" id="cf-f"></div>
    </div>
    <button class="btn-main" onclick="saveCustomFood()">Save Custom Food</button>
    <div class="section-label" style="margin-top:12px">Custom Foods (${APP.customFoods.length})</div>
    <div class="card" style="padding:0 14px">
      ${APP.customFoods.length ? APP.customFoods.map((f, i) => `<div class="food-item-row"><div><div class="finame">${f.name}</div><div class="fimeta">${f.cal} kcal · P${f.p} C${f.c} F${f.f} / ${f.per}${f.unit}</div></div><button class="fidel" onclick="delCustomFood(${i})"><i class="ti ti-trash"></i></button></div>`).join('') : '<div style="padding:14px;color:var(--text3);font-size:13px">No custom foods yet</div>'}
    </div>`;
}
function saveCustomFood() {
  const name = document.getElementById('cf-name').value.trim();
  if (!name) { toast('Enter food name'); return; }
  APP.customFoods.push({ id: 'cf_' + uid(), name, cat: 'Custom', cal: parseFloat(document.getElementById('cf-cal').value) || 0, p: parseFloat(document.getElementById('cf-p').value) || 0, c: parseFloat(document.getElementById('cf-c').value) || 0, f: parseFloat(document.getElementById('cf-f').value) || 0, per: parseFloat(document.getElementById('cf-per').value) || 100, unit: document.getElementById('cf-unit').value || 'g' });
  saveApp(); toast('Custom food saved ✓'); renderAdd();
}
function delCustomFood(i) { APP.customFoods.splice(i, 1); saveApp(); renderAdd(); }

// ─── PWA INSTALL ───────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'block';
});
function triggerInstall() {
  if (!deferredInstallPrompt) { toast('Open in Chrome browser to install'); return; }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(r => {
    if (r.outcome === 'accepted') { toast('FORGE installed! 🎉'); deferredInstallPrompt = null; }
  });
}
window.addEventListener('appinstalled', () => { toast('App installed on home screen!'); deferredInstallPrompt = null; });

// ─── SERVICE WORKER ────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then(() => {}).catch(() => {});
}

// ─── INIT ──────────────────────────────────
async function init() {
  await loadApp();
  switchScreen('today');
}
init();
