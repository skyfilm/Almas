import { parseEntry, toISODate, formatMinutes, minutesToHHMM } from './parser.js';

// ---------------- lagring ----------------
const KEY = 'almas-tid-v1';
const defaults = () => ({
  entries: [],
  projects: [],
  timer: null, // { startedAt: ms, project, description }
  settings: { lang: 'sv-SE', speak: true, autoSave: false, dailyGoal: 8, defaultProject: '' },
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) return { ...defaults(), ...raw, settings: { ...defaults().settings, ...raw.settings } };
  } catch { /* tom eller blockerad lagring */ }
  return defaults();
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('Kunde inte spara lokalt'); }
}

const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------------- UI-hjälp ----------------
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function speak(msg) {
  if (!state.settings.speak || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(msg);
  u.lang = state.settings.lang;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function spokenMinutes(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const parts = [];
  if (h) parts.push(h === 1 ? 'en timme' : `${h} timmar`);
  if (m) parts.push(`${m} minuter`);
  return parts.join(' och ') || '0 minuter';
}

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  window.scrollTo(0, 0);
  if (name === 'overview') renderOverview();
  if (name === 'settings') renderSettings();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

// ---------------- taligenkänning ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) { $('srUnsupported').hidden = false; }

/**
 * Startar en inspelning. onText(final, interim) anropas löpande.
 * Returnerar en stop-funktion.
 */
function listen({ onText, onEnd }) {
  const rec = new SR();
  rec.lang = state.settings.lang;
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = '';
  let stopped = false;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += (finalText ? ' ' : '') + r[0].transcript.trim();
      else interim += r[0].transcript;
    }
    onText(finalText, interim);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Mikrofonen är blockerad – tillåt den i webbläsaren.');
    else if (e.error === 'no-speech') toast('Hörde inget – försök igen.');
    else if (e.error !== 'aborted') toast(`Taligenkänningsfel: ${e.error}`);
  };
  // Vissa webbläsare avslutar efter tystnad – starta om tills användaren trycker stopp.
  rec.onend = () => {
    if (!stopped && rec._keepAlive) { try { rec.start(); return; } catch { /* faller igenom */ } }
    onEnd(finalText);
  };
  rec._keepAlive = true;
  rec.start();
  return () => { stopped = true; rec._keepAlive = false; rec.stop(); };
}

// Huvudknappen
let stopMain = null;
$('micBtn').addEventListener('click', () => {
  if (!SR) { $('transcript').focus(); return; }
  if (stopMain) { stopMain(); return; }
  const before = $('transcript').value.trim();
  $('micBtn').classList.add('recording');
  $('micHint').textContent = 'Lyssnar… tryck igen när du är klar.';
  stopMain = listen({
    onText: (fin, interim) => {
      $('transcript').value = [before, fin, interim].filter(Boolean).join(' ');
    },
    onEnd: (spoken) => {
      stopMain = null;
      $('micBtn').classList.remove('recording');
      $('micHint').textContent = 'Tryck för att tala in igen.';
      // Röstkommandot "spara" sparar det som redan står i formuläret.
      if (/^\s*(spara|spara det|ok spara)[.!]?\s*$/i.test(spoken)) {
        $('transcript').value = before;
        saveFromForm();
        return;
      }
      const text = $('transcript').value.trim();
      if (text) handleSpoken(text);
    },
  });
});

// Diktera direkt i dokumentationsfältet
let stopDictate = null;
$('dictateBtn').addEventListener('click', () => {
  if (!SR) { $('f-desc').focus(); toast('Använd tangentbordets mikrofon för att diktera.'); return; }
  if (stopDictate) { stopDictate(); return; }
  const before = $('f-desc').value.trim();
  $('dictateBtn').classList.add('recording');
  $('dictateBtn').textContent = '⏹ Stoppa';
  stopDictate = listen({
    onText: (fin, interim) => {
      const add = [fin, interim].filter(Boolean).join(' ');
      $('f-desc').value = [before, add ? add.charAt(0).toUpperCase() + add.slice(1) : ''].filter(Boolean).join(before.endsWith('.') ? ' ' : '. ');
    },
    onEnd: () => {
      stopDictate = null;
      $('dictateBtn').classList.remove('recording');
      $('dictateBtn').textContent = '🎤 Diktera';
    },
  });
});

// ---------------- tolkning ----------------
function parseOpts() {
  return { projects: state.projects, defaultProject: state.settings.defaultProject };
}

function handleSpoken(text) {
  const r = parseEntry(text, parseOpts());

  if (r.command === 'start') return startTimer(r);
  if (r.command === 'stop') return stopTimer(r.description);

  fillForm(r);
  if (state.settings.autoSave && r.minutes) {
    saveFromForm();
  } else if (r.minutes) {
    speak(`${spokenMinutes(r.minutes)}${r.project ? ' på ' + r.project : ''}. Säg spara eller tryck spara.`);
  } else {
    toast('Ingen tid hittades – fyll i tiden eller tala in igen.');
  }
}

$('parseBtn').addEventListener('click', () => {
  const text = $('transcript').value.trim();
  if (text) handleSpoken(text);
});
$('clearBtn').addEventListener('click', () => { $('transcript').value = ''; resetForm(); });

// ---------------- formulär ----------------
function fillForm(r) {
  $('f-date').value = r.date || toISODate(new Date());
  $('f-project').value = r.project || '';
  $('f-start').value = r.start || '';
  $('f-end').value = r.end || '';
  $('f-break').value = r.breakMinutes || 0;
  $('f-hours').value = r.minutes != null ? +(r.minutes / 60).toFixed(2) : '';
  $('f-desc').value = r.description || '';
}

function resetForm() {
  $('f-id').value = '';
  fillForm({ date: toISODate(new Date()), project: state.settings.defaultProject });
  $('cancelEditBtn').hidden = true;
  $('saveBtn').textContent = 'Spara';
}

// Räkna om tiden när start/slut/rast ändras
function recalc() {
  const s = $('f-start').value, e = $('f-end').value;
  if (!s || !e) return;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let diff = toMin(e) - toMin(s);
  if (diff < 0) diff += 24 * 60;
  diff -= +$('f-break').value || 0;
  $('f-hours').value = +(Math.max(0, diff) / 60).toFixed(2);
}
['f-start', 'f-end', 'f-break'].forEach((id) => $(id).addEventListener('change', recalc));

function saveFromForm() {
  const hours = parseFloat($('f-hours').value);
  if (!Number.isFinite(hours) || hours <= 0) { toast('Ange hur lång tid det tog.'); $('f-hours').focus(); return; }
  const id = $('f-id').value;
  const entry = {
    id: id || uid(),
    date: $('f-date').value || toISODate(new Date()),
    start: $('f-start').value || null,
    end: $('f-end').value || null,
    breakMinutes: +$('f-break').value || 0,
    minutes: Math.round(hours * 60),
    project: $('f-project').value.trim(),
    description: $('f-desc').value.trim(),
    transcript: $('transcript').value.trim(),
    updatedAt: Date.now(),
  };
  if (entry.project) addProject(entry.project, false);
  const idx = state.entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) state.entries[idx] = { ...state.entries[idx], ...entry };
  else state.entries.push({ ...entry, createdAt: Date.now() });
  save();
  const msg = `Sparat ${formatMinutes(entry.minutes)}${entry.project ? ' – ' + entry.project : ''}`;
  toast(msg);
  speak(`Sparat. ${spokenMinutes(entry.minutes)}${entry.project ? ' på ' + entry.project : ''}.`);
  $('transcript').value = '';
  resetForm();
}

$('entryForm').addEventListener('submit', (e) => { e.preventDefault(); saveFromForm(); });
$('cancelEditBtn').addEventListener('click', resetForm);

function editEntry(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  showView('report');
  fillForm(e);
  $('f-id').value = e.id;
  $('transcript').value = e.transcript || '';
  $('cancelEditBtn').hidden = false;
  $('saveBtn').textContent = 'Uppdatera';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteEntry(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e || !confirm(`Ta bort ${formatMinutes(e.minutes)} den ${e.date}?`)) return;
  state.entries = state.entries.filter((x) => x.id !== id);
  save();
  renderOverview();
  toast('Posten togs bort');
}

// ---------------- timer ----------------
let timerInterval;
function startTimer(r) {
  if (state.timer) { toast('En timer går redan.'); return; }
  state.timer = { startedAt: Date.now(), project: r.project || state.settings.defaultProject || '', description: r.description || '' };
  save();
  renderTimer();
  $('transcript').value = '';
  toast(`Timer startad${state.timer.project ? ' – ' + state.timer.project : ''}`);
  speak(`Timer startad${state.timer.project ? ' på ' + state.timer.project : ''}.`);
}

function stopTimer(extraDesc = '') {
  if (!state.timer) { toast('Ingen timer är igång.'); return; }
  const t = state.timer;
  const startD = new Date(t.startedAt);
  const now = new Date();
  const minutes = Math.max(1, Math.round((now - startD) / 60000));
  state.timer = null;
  save();
  renderTimer();
  fillForm({
    date: toISODate(startD),
    start: minutesToHHMM(startD.getHours() * 60 + startD.getMinutes()),
    end: minutesToHHMM(now.getHours() * 60 + now.getMinutes()),
    breakMinutes: 0,
    minutes,
    project: t.project,
    description: [t.description, extraDesc].filter(Boolean).join('. '),
  });
  $('transcript').value = '';
  showView('report');
  if (state.settings.autoSave) saveFromForm();
  else speak(`Timer stoppad efter ${spokenMinutes(minutes)}. Lägg till dokumentation och spara.`);
}

function renderTimer() {
  clearInterval(timerInterval);
  const badge = $('timerBadge');
  if (!state.timer) { badge.hidden = true; return; }
  badge.hidden = false;
  const tick = () => {
    const sec = Math.floor((Date.now() - state.timer.startedAt) / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    $('timerText').textContent = `${state.timer.project ? state.timer.project + ' · ' : ''}${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}
$('timerStopBtn').addEventListener('click', () => stopTimer());

// ---------------- översikt ----------------
let weekOffset = 0;
function mondayOf(d) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderOverview() {
  const mon = mondayOf(new Date());
  mon.setDate(mon.getDate() + weekOffset * 7);
  const days = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); return d; });
  const isoDays = days.map(toISODate);
  const weekEntries = state.entries.filter((e) => isoDays.includes(e.date));
  const total = weekEntries.reduce((a, e) => a + e.minutes, 0);
  const goal = (state.settings.dailyGoal || 0) * 60;

  $('weekLabel').textContent = `Vecka ${isoWeek(mon)} · ${days[0].toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${days[6].toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`;
  $('weekTotal').textContent = `Totalt ${formatMinutes(total)}${goal ? ` av ${formatMinutes(goal * 5)}` : ''}`;

  const perDay = isoDays.map((d) => weekEntries.filter((e) => e.date === d).reduce((a, e) => a + e.minutes, 0));
  const max = Math.max(goal, ...perDay, 60);
  const todayISO = toISODate(new Date());
  $('weekBars').innerHTML = days.map((d, i) => `
    <div class="bar ${isoDays[i] === todayISO ? 'today' : ''}">
      <span class="val">${perDay[i] ? (perDay[i] / 60).toFixed(1).replace('.', ',') : ''}</span>
      <div class="fill ${goal && perDay[i] > goal ? 'over' : ''}" style="height:${(perDay[i] / max) * 100}%"></div>
      <span>${d.toLocaleDateString('sv-SE', { weekday: 'short' })}</span>
    </div>`).join('');

  const byProject = {};
  weekEntries.forEach((e) => { const k = e.project || 'Utan projekt'; byProject[k] = (byProject[k] || 0) + e.minutes; });
  const rows = Object.entries(byProject).sort((a, b) => b[1] - a[1]);
  $('projectTotals').innerHTML = rows.length
    ? `<h2>Per projekt</h2>${rows.map(([p, m]) => `<div class="proj-row"><span>${esc(p)}</span><strong>${formatMinutes(m)}</strong></div>`).join('')}`
    : '<div class="empty">Inga timmar den här veckan.</div>';

  const q = $('search').value.trim().toLowerCase();
  const list = (q ? state.entries : weekEntries)
    .filter((e) => !q || [e.project, e.description, e.date].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || ''));
  const groups = {};
  list.forEach((e) => (groups[e.date] ||= []).push(e));
  $('entryList').innerHTML = list.length ? Object.entries(groups).map(([date, items]) => `
    <div class="day-group">
      <h3>${new Date(date + 'T12:00').toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatMinutes(items.reduce((a, e) => a + e.minutes, 0))}</h3>
      ${items.map((e) => `
        <article class="entry">
          <div class="head"><span>${esc(e.project || 'Utan projekt')}</span><span>${formatMinutes(e.minutes)}</span></div>
          <div class="meta">${e.start && e.end ? `${e.start}–${e.end}` : ''}${e.breakMinutes ? ` · rast ${e.breakMinutes} min` : ''}</div>
          ${e.description ? `<div class="desc">${esc(e.description)}</div>` : ''}
          <div class="actions"><button class="link" data-edit="${e.id}">Redigera</button><button class="link del" data-del="${e.id}">Ta bort</button></div>
        </article>`).join('')}
    </div>`).join('') : `<div class="empty">${q ? 'Inga träffar.' : 'Inga poster ännu – tryck på mikrofonen och berätta vad du gjort.'}</div>`;
}
$('entryList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.edit) editEntry(b.dataset.edit);
  if (b.dataset.del) deleteEntry(b.dataset.del);
});
$('prevWeek').addEventListener('click', () => { weekOffset--; renderOverview(); });
$('nextWeek').addEventListener('click', () => { weekOffset++; renderOverview(); });
$('search').addEventListener('input', renderOverview);

// ---------------- inställningar ----------------
function addProject(name, notify = true) {
  const n = name.trim();
  if (!n) return;
  if (state.projects.some((p) => p.toLowerCase() === n.toLowerCase())) { if (notify) toast('Projektet finns redan'); return; }
  state.projects.push(n);
  save();
  renderProjects();
}
function renderProjects() {
  $('projectList').innerHTML = state.projects.map((p) => `<option value="${esc(p)}">`).join('');
  $('projectChips').innerHTML = state.projects.map((p, i) => `<li>${esc(p)}<button data-i="${i}" aria-label="Ta bort ${esc(p)}">×</button></li>`).join('');
  $('defaultProject').innerHTML = '<option value="">– Inget –</option>' +
    state.projects.map((p) => `<option ${p === state.settings.defaultProject ? 'selected' : ''}>${esc(p)}</option>`).join('');
}
function renderSettings() {
  renderProjects();
  $('lang').value = state.settings.lang;
  $('speak').checked = state.settings.speak;
  $('autoSave').checked = state.settings.autoSave;
  $('dailyGoal').value = state.settings.dailyGoal;
}
$('projectForm').addEventListener('submit', (e) => { e.preventDefault(); addProject($('newProject').value); $('newProject').value = ''; });
$('projectChips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const p = state.projects[+b.dataset.i];
  state.projects.splice(+b.dataset.i, 1);
  if (state.settings.defaultProject === p) state.settings.defaultProject = '';
  save(); renderProjects();
});
$('defaultProject').addEventListener('change', (e) => { state.settings.defaultProject = e.target.value; save(); });
$('lang').addEventListener('change', (e) => { state.settings.lang = e.target.value; save(); });
$('speak').addEventListener('change', (e) => { state.settings.speak = e.target.checked; save(); });
$('autoSave').addEventListener('change', (e) => { state.settings.autoSave = e.target.checked; save(); });
$('dailyGoal').addEventListener('change', (e) => { state.settings.dailyGoal = +e.target.value || 0; save(); });

// ---------------- export / import ----------------
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportCsv').addEventListener('click', () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Datum', 'Start', 'Slut', 'Rast (min)', 'Timmar', 'Projekt', 'Dokumentation']];
  [...state.entries].sort((a, b) => a.date.localeCompare(b.date)).forEach((e) =>
    rows.push([e.date, e.start || '', e.end || '', e.breakMinutes || 0, (e.minutes / 60).toFixed(2).replace('.', ','), e.project, e.description]));
  // Semikolon + BOM så att svenska Excel öppnar filen rätt.
  download(`tidrapport-${toISODate(new Date())}.csv`, '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
});
$('exportJson').addEventListener('click', () =>
  download(`almas-tid-backup-${toISODate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json'));
$('importJson').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.entries)) throw new Error('fel format');
    if (!confirm(`Ersätta nuvarande data med ${data.entries.length} poster från filen?`)) return;
    state = { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
    save(); renderSettings(); renderTimer(); toast('Data återställd');
  } catch { toast('Kunde inte läsa filen'); }
  e.target.value = '';
});

// ---------------- start ----------------
resetForm();
renderProjects();
renderTimer();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
