import { applyTheme } from './src/theme.js';
import { buildExamSet, generateTask, TYPES, LEVELS, EXAM } from './src/tasks.js';
import { createRng } from './src/rng.js';
import { LETTERS } from './src/latin.js';
import { SIZE, SHAPES, COLORS } from './src/figural.js';
import * as Auth from './src/auth.js';
import * as Groups from './src/groups.js';
import { renderAdmin } from './src/admin.js';
import { renderAccountInfo, renderAccountSettings } from './src/account.js';

applyTheme();

const app = document.getElementById('app');
const isSEB = /SEB/i.test(navigator.userAgent);
const HISTORY_KEY = 'testas-sim-history-v1';

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus o. Ä. */ } },
};

let screen = 'loading';
let sessionReady = false;
function setScreen(name) {
  const changed = screen !== name;
  screen = name;
  document.body.dataset.screen = name;
  const activePage = { 'exam-page': 'exam', 'practice-page': 'practice', 'history-page': 'history' }[name];
  document.querySelectorAll('.site-nav [data-page]').forEach((link) => {
    if (link.dataset.page === activePage) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (changed) window.scrollTo(0, 0);
}
let S = null;   // Prüfungssitzung
let P = null;   // Übungssitzung
let timerId = null;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function profileAvatar(person) {
  const palettes = [
    ['#e6430f', '#fff'], ['#13794a', '#fff'], ['#0b63ce', '#fff'], ['#a55f00', '#fff'],
  ];
  const identity = person.name || person.email || person.id;
  const hash = [...identity].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  const [background, foreground] = palettes[hash % palettes.length];
  const initials = identity.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return `<svg class="profile-avatar" viewBox="0 0 40 40" role="img" aria-label="${esc(`Profilbild von ${identity}`)}">
    <rect width="40" height="40" rx="20" fill="${background}"/><path d="M0 25 25 0h8L8 40H0zM23 40l17-17v8L31 40z" fill="${foreground}" opacity=".14"/>
    <text x="20" y="23" text-anchor="middle" dominant-baseline="middle" fill="${foreground}">${esc(initials)}</text>
  </svg>`;
}
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const same = (a, b) => a !== null && a !== undefined && String(a) === String(b);
// Figurale Sequenzen: a válasz egy [kép1, kép2] tömb (1–3); csak akkor kész, ha mindkettő ki van töltve.
const answered = (a) => (Array.isArray(a) ? a.every((x) => x !== null) : a !== null && a !== undefined);
const showAns = (a) => (Array.isArray(a) ? a.map((x) => x ?? '–').join(' / ') : (a ?? '–'));
const badges = () => (isSEB ? '<span class="badge seb">Safe Exam Browser erkannt</span>' : '');

/* ------------------------------------------------------------------ Figurale Sequenzen (SVG) */
const SHAPE_PATH = {
  square: '<rect x="-.3" y="-.3" width=".6" height=".6"/>',
  hexagon: '<polygon points="-.36,0 -.18,-.31 .18,-.31 .36,0 .18,.31 -.18,.31"/>',
  triangle: '<polygon points="0,-.36 .34,.3 -.34,.3"/>',
  trapezoid: '<polygon points="-.36,.26 .36,.26 .2,-.26 -.2,-.26"/>',
  corner: '<polygon points="-.3,-.3 .3,-.3 .3,-.1 -.1,-.1 -.1,.3 -.3,.3"/>',
  moon: '<path d="M-.36 .18 A.36 .36 0 0 1 .36 .18 Z"/>',
};

function frameSVG(frame, { label = '' } = {}) {
  const U = 20; // egy mező mérete
  let g = '';
  for (let i = 1; i < SIZE; i++) g += `<path d="M${i * U} 0V${SIZE * U}M0 ${i * U}H${SIZE * U}" class="fgrid"/>`;
  for (const f of frame) {
    g += `<g transform="translate(${(f.col + .5) * U} ${(f.row + .5) * U}) rotate(${f.rot * 90}) scale(${U})"
      fill="${COLORS[f.color].hex}" stroke="#111" stroke-width=".075" stroke-linejoin="round">${SHAPE_PATH[f.shape]}</g>`;
  }
  return `<svg viewBox="-1 -1 ${SIZE * U + 2} ${SIZE * U + 2}" class="fm" role="img" aria-label="${esc(label)}">
    <rect x="0" y="0" width="${SIZE * U}" height="${SIZE * U}" class="fbg"/>${g}<rect x="0" y="0" width="${SIZE * U}" height="${SIZE * U}" class="fborder"/></svg>`;
}

function figuralHTML(task, { answer = null, reveal = false, interactive = true } = {}) {
  const given = task.frames.map((f, i) => `<div class="fcell">${frameSVG(f, { label: `Matrix ${i + 1}` })}</div>`).join('');
  const cols = [0, 1].map((p) => {
    const opts = task.options[p].map((f, k) => {
      const n = k + 1;
      let cls = '';
      if (reveal) cls = n === task.answer[p] ? 'right' : (answer?.[p] === n ? 'wrong' : '');
      else if (answer?.[p] === n) cls = 'sel';
      return `<button class="fopt ${cls}" data-pic="${p}" data-opt="${n}" ${interactive ? '' : 'disabled'}
        aria-label="Bild ${p + 1}: Matrix ${n}">${frameSVG(f, { label: `Bild ${p + 1}, Matrix ${n}` })}<span class="fnum">${n}</span></button>`;
    }).join('');
    return `<div class="fcol"><div class="fq">?</div><div class="muted">Bild ${p + 1}</div>${opts}</div>`;
  }).join('');
  return `<p class="question">Wie sehen die nächsten beiden Matrizen aus? Wählen Sie für Bild 1 und Bild 2 je eine Antwort.</p>
    <div class="fseq"><div class="fgiven">${given}</div><div class="fanswers">${cols}</div></div>
    ${reveal ? `<div class="explain"><p class="muted">Lösung: Bild 1 = Matrix ${task.answer[0]}, Bild 2 = Matrix ${task.answer[1]}</p><ul>${task.explanation.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}`;
}

/* ------------------------------------------------------------------ Aufgaben-HTML */
function eqHTML(task) {
  const lines = task.equations.map((e) => `<div>${esc(e).replace(/\b([A-D])\b/g, '<b>$1</b>')}</div>`).join('');
  return `<div class="eqs">${lines}</div>`;
}

function latinGrid(task, { chosen = null, solved = false } = {}) {
  const [qr, qc] = task.question;
  let cells = '';
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const given = task.grid[r][c];
    if (r === qr && c === qc) {
      const shown = solved ? task.answer : chosen;
      cells += `<div class="q ${shown ? 'filled' : ''}" id="qcell">${shown ?? '?'}</div>`;
    } else if (given !== null) cells += `<div>${given}</div>`;
    else cells += solved ? `<div class="hint">${task.solution[r][c]}</div>` : '<div></div>';
  }
  return `<div class="latin" aria-label="5 mal 5 Raster">${cells}</div>`;
}

function taskHTML(task, { answer = null, reveal = false, interactive = true } = {}) {
  if (task.type === 'figural') return figuralHTML(task, { answer, reveal, interactive });
  if (task.type === 'gleichungen') {
    return `${eqHTML(task)}
      <p class="question">Welchem Wert entspricht <b>${task.question}</b>, damit die Gleichungen korrekt gelöst werden?</p>
      <input id="ans" type="number" min="1" max="20" inputmode="numeric" autocomplete="off" aria-label="Antwort"
        value="${answer ?? ''}" ${interactive ? '' : 'disabled'}>
      ${reveal ? `<p class="muted">Lösung: ${Object.entries(task.solution).map(([k, v]) => `${k} = ${v}`).join(', ')}</p>` : ''}`;
  }
  const choices = LETTERS.map((l) => {
    let cls = '';
    if (reveal) cls = l === task.answer ? 'right' : (l === answer ? 'wrong' : '');
    else if (l === answer) cls = 'sel';
    return `<button data-letter="${l}" class="${cls}" ${interactive ? '' : 'disabled'} aria-label="Buchstabe ${l}">${l}</button>`;
  }).join('');
  return `<p class="question">Welcher Buchstabe gehört an die Stelle des Fragezeichens?</p>
    <div class="latin-wrap">${latinGrid(task, { chosen: reveal ? null : answer, solved: reveal })}<div class="choices">${choices}</div></div>`;
}

// Eingaben der Aufgabe an einen Callback binden
function bindTask(task, onAnswer, onEnter) {
  if (task.type === 'figural') {
    const cur = [0, 1].map((p) => { const b = app.querySelector(`.fopt.sel[data-pic="${p}"]`); return b ? Number(b.dataset.opt) : null; });
    app.querySelectorAll('.fopt').forEach((b) => b.addEventListener('click', () => {
      const p = Number(b.dataset.pic);
      cur[p] = Number(b.dataset.opt);
      app.querySelectorAll(`.fopt[data-pic="${p}"]`).forEach((x) => x.classList.toggle('sel', x === b));
      onAnswer(cur[0] === null && cur[1] === null ? null : [...cur]);
    }));
    return;
  }
  if (task.type === 'gleichungen') {
    const el = document.getElementById('ans');
    if (!el || el.disabled) return;
    el.addEventListener('input', () => onAnswer(el.value === '' ? null : Number(el.value)));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } });
    el.focus();
  } else {
    app.querySelectorAll('.choices button').forEach((b) => b.addEventListener('click', () => {
      const l = b.dataset.letter;
      app.querySelectorAll('.choices button').forEach((x) => x.classList.toggle('sel', x === b));
      document.getElementById('qcell').textContent = l;
      document.getElementById('qcell').classList.add('filled');
      onAnswer(l);
    }));
  }
}

/* ------------------------------------------------------------------ Startseite */
const historyKey = (h) => `${h.ts}|${h.mode}|${h.type}`;

function historyHTML(limit = 8) {
  const hist = store.get(HISTORY_KEY, []).slice(0, limit);
  const table = hist.length
    ? `<div class="card"><table><thead><tr><th>Datum</th><th>Modus</th><th>Typ</th><th>Ergebnis</th><th><span class="visually-hidden">Details</span></th></tr></thead><tbody>
        ${hist.map((h) => `<tr><td>${esc(new Date(h.ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))}</td>
          <td>${h.mode === 'exam' ? 'Prüfung' : 'Übung'}</td><td>${esc(TYPES[h.type]?.label ?? h.type)}</td>
          <td>${h.correct}/${h.total}${h.seconds ? ` · ${fmt(h.seconds * 1000)}` : ''}${h.seed != null ? ` · Seed ${h.seed}` : ''}</td>
          <td>${h.detail ? `<button type="button" class="small" data-detail="${esc(historyKey(h))}">Details</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>`
    : '<p class="lead muted">Noch keine Ergebnisse – starten Sie eine Prüfung oder eine Übung.</p>';
  return table;
}

function renderStartup() {
  setScreen('loading');
  app.innerHTML = '<div class="startup-state" role="status">Konto und Trainingsplattform werden geladen …</div>';
}

function renderOnboarding() {
  setScreen('onboarding');
  clearInterval(timerId);
  const previewFig = frameSVG([
    { shape: 'triangle', row: 1, col: 2, rot: 1, color: 'yellow' },
    { shape: 'square', row: 2, col: 0, rot: 0, color: 'pink' },
    { shape: 'hexagon', row: 3, col: 3, rot: 0, color: 'green' },
    { shape: 'moon', row: 0, col: 1, rot: 2, color: 'orange' },
  ], { label: 'Beispielmatrix' });
  const samples = [['A', 'B', 'C', '', 'E'], ['', 'C', '', 'E', ''], ['C', 'D', 'E', '', 'B'], ['', 'E', '', 'B', ''], ['E', '?', '', 'C', '']];
  const previewLatin = `<div class="latin mini" aria-label="Beispielraster">${samples.flat().map((v) => `<div${v === '?' ? ' class="q"' : ''}>${v}</div>`).join('')}</div>`;
  const previewEq = '<div class="mini-eqs"><div><b>A</b> × 3 = <b>B</b></div><div><b>B</b> – <b>A</b> = 8</div></div>';
  const access = authAvailable
    ? `<div class="row onboarding-actions"><button class="primary lg" data-auth-mode="register">Konto erstellen</button><button class="lg" data-auth-mode="login">Anmelden</button></div>
       <p class="onboarding-note">Dein Trainingsbereich und gespeicherter Fortschritt sind nach der Anmeldung verfügbar.</p>`
    : '<p class="form-note onboarding-note" role="status">Die Registrierung ist momentan nicht erreichbar. Bitte öffne die bereitgestellte Plattform mit aktivem Konto-Server.</p>';

  app.innerHTML = `
    <section class="onboarding">
      <div class="onboarding-grid">
        <div class="onboarding-copy">
          <h1>Drei Subtests.<br><em>Ein Trainingsplan.</em></h1>
          <p class="lead">Bereite dich strukturiert auf das TestAS-Kernmodul vor: mit unendlich vielen generierten Aufgaben, Prüfungssimulationen und nachvollziehbarem Fortschritt.</p>
          ${access}
          <p class="onboarding-footnote">Figurale Sequenzen · Mathematische Gleichungen · Lateinische Quadrate</p>
        </div>
        <div class="onboarding-preview" aria-label="Aufgabenbeispiele">
          <div class="preview-head"><span>TRAINING / KERNMODUL</span><span>01 — 03</span></div>
          <div class="preview-row"><span class="preview-number">01</span><div><b>Figurale Sequenzen</b><div class="preview-art">${previewFig}</div></div><span class="preview-mark">↗</span></div>
          <div class="preview-row"><span class="preview-number">02</span><div><b>Mathematische Gleichungen</b><div class="preview-art">${previewEq}</div></div><span class="preview-mark">=</span></div>
          <div class="preview-row"><span class="preview-number">03</span><div><b>Lateinische Quadrate</b><div class="preview-art">${previewLatin}</div></div><span class="preview-mark">?</span></div>
        </div>
      </div>
      <div class="onboarding-footer"><span>20 AUFGABEN / SUBTEST</span><span>25 MINUTEN</span><span>SOFORT-FEEDBACK IM ÜBUNGSMODUS</span></div>
    </section>`;
}

function renderHome() {
  if (!sessionReady) return renderStartup();
  if (!user) return renderOnboarding();
  setScreen('home');
  clearInterval(timerId);
  const entries = store.get(HISTORY_KEY, []);
  const totalCorrect = entries.reduce((sum, entry) => sum + entry.correct, 0);
  const totalQuestions = entries.reduce((sum, entry) => sum + entry.total, 0);
  const accuracy = totalQuestions ? `${Math.round(totalCorrect / totalQuestions * 100)} %` : '–';
  app.innerHTML = `
    <section class="hero platform-hero">
      <p class="eyebrow"><b>DEIN TRAININGSBEREICH</b> · KERNMODUL</p>
      <h1>Willkommen zurück, <em>${esc(user.name || user.email)}</em>.</h1>
      <p class="lead">Wähle deinen nächsten Schritt und arbeite gezielt an deinem TestAS-Kernmodul.</p>
      <p class="meta">${isSEB ? '<span class="badge seb">Safe Exam Browser erkannt</span>' : 'Dein Trainingsbereich'}</p>
    </section>
    <section class="platform-metrics" aria-label="Dein Fortschritt">
      <div><span class="metric-value">${entries.filter((entry) => entry.mode === 'exam').length}</span><span class="muted">Subtests abgeschlossen</span></div>
      <div><span class="metric-value">${entries.filter((entry) => entry.mode === 'practice').length}</span><span class="muted">Übungssitzungen</span></div>
      <div><span class="metric-value">${accuracy}</span><span class="muted">Gesamtquote</span></div>
    </section>
    <section class="platform-links" aria-label="Trainingsbereiche">
      <a href="#pruefung" class="platform-link" data-page="exam"><span class="platform-index">01</span><span><b>Prüfung</b><small>${EXAM.count} Aufgaben je Subtest · ${EXAM.minutes} Minuten</small></span><span class="platform-arrow">→</span></a>
      <a href="#ueben" class="platform-link" data-page="practice"><span class="platform-index">02</span><span><b>Üben</b><small>Aufgabentyp und Schwierigkeit auswählen</small></span><span class="platform-arrow">→</span></a>
      <a href="#verlauf" class="platform-link" data-page="history"><span class="platform-index">03</span><span><b>Verlauf</b><small>Ergebnisse und Fortschritt ansehen</small></span><span class="platform-arrow">→</span></a>
      <a href="gruppen.html" class="platform-link" data-page="groups"><span class="platform-index">04</span><span><b>Lerngruppen</b><small>Gruppen, geplante Tests und Ergebnisse</small></span><span class="platform-arrow">→</span></a>
    </section>`;
  app.querySelectorAll('[data-page]').forEach((link) => (link.onclick = (event) => {
    event.preventDefault();
    openPlatformPage(link.dataset.page);
  }));
  window.scrollTo(0, 0);
}

function renderExamPage() {
  setScreen('exam-page');
  app.innerHTML = `
    <p class="eyebrow"><b>PRÜFUNGSMODUS</b> / KERNSIMULATION</p>
    <h1>Prüfung</h1>
    <p class="lead muted">${EXAM.count} Aufgaben je Subtest, Zeit einstellbar (Standard: ${EXAM.minutes} Minuten), keine Rückmeldung bis zur Abgabe.</p>
    <section class="card">
      <div class="grid">
        <div><label for="exam-type">Umfang</label><select id="exam-type">
          <option value="all">Kernmodul (alle drei Subtests)</option>
          <option value="figural">Nur Figurale Sequenzen</option>
          <option value="gleichungen">Nur Mathematische Gleichungen</option>
          <option value="quadrate">Nur Lateinische Quadrate</option>
        </select></div>
        <div><label for="exam-minutes">Zeit pro Subtest (Minuten)</label><input id="exam-minutes" type="number" min="1" max="120" step="1" value="${EXAM.minutes}"></div>
        <div><label for="seed">Seed (optional, für dieselbe Aufgabenreihe)</label><input id="seed" type="number" min="0" placeholder="zufällig"></div>
      </div>
      <p style="margin-top:18px"><button class="primary lg" id="start-exam">Prüfung starten</button></p>
    </section>`;
  document.getElementById('start-exam').onclick = () => {
    const seedRaw = document.getElementById('seed').value;
    const minutes = Math.min(120, Math.max(1, Math.round(Number(document.getElementById('exam-minutes').value)) || EXAM.minutes));
    startExam(document.getElementById('exam-type').value, seedRaw === '' ? null : Number(seedRaw), minutes);
  };
}

function renderPracticePage() {
  setScreen('practice-page');
  app.innerHTML = `
    <p class="eyebrow"><b>ÜBUNGSMODUS</b> / INDIVIDUELL</p>
    <h1>Üben</h1>
    <p class="lead muted">Unbegrenzt viele neue Aufgaben mit sofortiger Rückmeldung und Lösungsweg.</p>
    <section class="card">
      <div class="grid">
        <div><label for="prac-type">Aufgabentyp</label><select id="prac-type">${Object.entries(TYPES).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('')}</select></div>
        <div><label for="prac-level">Schwierigkeit</label><select id="prac-level"><option value="gemischt">gemischt</option>${LEVELS.map((level) => `<option value="${level}">${level}</option>`).join('')}</select></div>
      </div>
      <p style="margin-top:18px"><button class="primary lg" id="start-prac">Üben</button></p>
    </section>`;
  document.getElementById('start-prac').onclick = () =>
    startPractice(document.getElementById('prac-type').value, document.getElementById('prac-level').value);
}

// Antwort für die Speicherung: nur Zahlen, Buchstaben, [Bild 1, Bild 2] oder null
const plainAnswer = (a) => (Array.isArray(a) ? a.map((x) => (x ?? null)) : (a ?? null));
// Gespeicherte Antworten nie ungeprüft in HTML einsetzen (Verlauf liegt im Browser bzw. kommt vom Server)
function safeAnswer(type, a) {
  if (type === 'gleichungen') return typeof a === 'number' && Number.isFinite(a) ? a : null;
  if (type === 'quadrate') return typeof a === 'string' && /^[A-E]$/.test(a) ? a : null;
  return Array.isArray(a) && a.length === 2 ? a.map((x) => (Number.isInteger(x) ? x : null)) : null;
}

/** Aufgabenliste mit Richtig/Falsch, Antwort, Lösung und – wenn vorhanden – der Aufgabe selbst. items: [{ id, level, answer, correct, task|null }] */
function reviewHTML(items) {
  return `<div class="review-list">${items.map((it) => {
    const ok = same(it.answer, it.correct);
    return `<details class="${ok ? 'ok' : 'wrong'}"><summary>${ok ? '✔' : '✘'} ${esc(it.id)} · ${esc(it.level)} · Ihre Antwort: ${esc(showAns(it.answer))} · richtig: ${esc(showAns(it.correct))}</summary>
      <div class="review-task">${it.task ? taskHTML(it.task, { answer: it.answer, reveal: true, interactive: false }) : '<p class="muted">Die Aufgabe lässt sich nicht mehr darstellen.</p>'}</div></details>`;
  }).join('')}</div>`;
}

/** Aufgaben eines Verlaufseintrags wiederherstellen. Stimmt eine Lösung nicht mit der gespeicherten überein (z. B. nach einer Änderung der Generatoren), wird die Aufgabe nicht angezeigt. */
function historyItems(h) {
  const d = h.detail;
  const fits = (task, correct) => task && JSON.stringify(task.answer) === JSON.stringify(correct);
  if (h.mode === 'exam') {
    let tasks = [];
    try { tasks = buildExamSet(h.type, h.seed, { count: d.n, difficulty: d.d }); } catch { /* nicht rekonstruierbar */ }
    return d.c.map((correct, k) => ({
      id: tasks[k]?.id ?? `${h.type[0].toUpperCase()}${String(k + 1).padStart(2, '0')}`, level: fits(tasks[k], correct) ? tasks[k].level : '–',
      answer: safeAnswer(h.type, d.a[k]), correct, task: fits(tasks[k], correct) ? tasks[k] : null,
    }));
  }
  return d.t.map((x, k) => {
    let task = null;
    try { task = generateTask(createRng(x.s), h.type, x.l); } catch { /* nicht rekonstruierbar */ }
    return { id: `#${k + 1}`, level: x.l, answer: safeAnswer(h.type, x.a), correct: x.c, task: fits(task, x.c) ? task : null };
  });
}

function renderHistoryDetail(key) {
  const h = store.get(HISTORY_KEY, []).find((x) => historyKey(x) === key);
  if (!h?.detail) return renderHistoryPage();
  setScreen('history-page');
  app.innerHTML = '<p class="card">Aufgaben werden erstellt …</p>';
  setTimeout(() => {
    const items = historyItems(h);
    const wrong = items.filter((it) => !same(it.answer, it.correct)).length;
    const blank = items.filter((it) => !answered(it.answer)).length;
    app.innerHTML = `
      <div class="row" style="margin-top:14px"><button type="button" id="hd-back">‹ Verlauf</button></div>
      <h1>${esc(TYPES[h.type]?.label ?? h.type)}</h1>
      <p class="lead muted">${h.mode === 'exam' ? 'Prüfung' : 'Übung'} · ${esc(new Date(h.ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }))}${h.seed != null ? ` · Seed ${h.seed}` : ''}</p>
      <section class="card"><div class="score">${h.correct} / ${h.total}</div>
        <p class="muted">${h.seconds ? `Zeit: ${fmt(h.seconds * 1000)} · ` : ''}falsch: ${wrong - blank} · unbeantwortet: ${blank}</p>
        <label class="check"><input type="checkbox" id="hd-wrong"> Nur falsche und unbeantwortete Aufgaben zeigen</label></section>
      <section class="card" id="hd-list">${reviewHTML(items)}</section>`;
    document.getElementById('hd-back').onclick = renderHistoryPage;
    document.getElementById('hd-wrong').onchange = (e) => document.getElementById('hd-list').classList.toggle('only-wrong', e.target.checked);
  }, 30);
}
app.addEventListener('click', (e) => {
  const button = e.target.closest('[data-detail]');
  if (button) renderHistoryDetail(button.dataset.detail);
});

function renderHistoryPage() {
  setScreen('history-page');
  app.innerHTML = `
    <p class="eyebrow"><b>DEIN FORTSCHRITT</b> / ERGEBNISSE</p>
    <h1>Verlauf</h1>
    <p class="lead muted">Deine letzten Prüfungs- und Übungsergebnisse.</p>
    <div id="verlauf-body">${historyHTML(50)}</div>`;
}

function openPlatformPage(page) {
  if (!user) return renderOnboarding();
  if (screen === 'exam' || screen === 'intro') return;
  if (screen === 'practice') endPractice();
  if (page === 'exam') renderExamPage();
  else if (page === 'practice') renderPracticePage();
  else if (page === 'history') renderHistoryPage();
  else if (page === 'groups') location.href = 'gruppen.html'; // Lerngruppen sind eine eigene Unterseite
  else renderHome();
}

/* ------------------------------------------------------------------ Prüfung */
function startExam(kind, seed, minutes = EXAM.minutes, groupId = null, options = {}) {
  const useSeed = Number.isFinite(seed) && seed !== null ? seed : Math.floor(Math.random() * 1e9);
  const types = kind === 'all' ? ['figural', 'gleichungen', 'quadrate'] : [kind];
  app.innerHTML = '<p class="card">Aufgaben werden erstellt …</p>';
  setTimeout(() => {
    S = {
      seed: useSeed, si: 0, groupId, difficulty: options.difficulty ?? 'gemischt',
      sections: types.map((type) => {
        const tasks = buildExamSet(type, useSeed, options);
        return { type, tasks, answers: Array(tasks.length).fill(null), flags: Array(tasks.length).fill(false), i: 0, startedAt: null, endedAt: null, minutes, limitMs: minutes * 60000 };
      }),
    };
    renderIntro();
  }, 30);
}

const INSTRUCTIONS = {
  figural: `<p>Sie sehen eine Reihe von Matrizen. Die Figuren können von einer Matrix zur nächsten regelgeleitet ihre <b>Position</b>, <b>Farbe</b> und/oder <b>Ausrichtung</b> verändern.</p>
    <p>Setzen Sie die Reihe folgerichtig fort: Wählen Sie für die fünfte (Bild 1) und die sechste Matrix (Bild 2) jeweils die richtige Antwort. Figuren prallen an den Rändern ab oder laufen an der Begrenzung entlang; sie verschwinden und überlappen nie.</p>`,
  gleichungen: `<p>Sie sehen Gleichungssysteme. Bestimmen Sie, welche Zahlen für die Buchstaben eingesetzt werden müssen, damit alle Gleichungen stimmen.</p>
    <p>Jeder Buchstabe hat genau eine Lösung zwischen <b>1</b> und <b>20</b>. Geben Sie den Wert des gefragten Buchstabens ein.</p>`,
  quadrate: `<p>Sie sehen ein Raster mit 5 Zeilen und 5 Spalten. Es kommen nur die Buchstaben A–E vor. Jeder Buchstabe darf in jeder Zeile und jeder Spalte nur <b>einmal</b> vorkommen.</p>
    <p>Bestimmen Sie den Buchstaben, der an die Stelle des Fragezeichens gehört. Manchmal müssen Sie dazu im Kopf zuerst andere Felder füllen.</p>`,
};

function renderIntro() {
  setScreen('intro');
  const sec = S.sections[S.si];
  app.innerHTML = `<h1>${TYPES[sec.type].label}</h1><p class="muted">Subtest ${S.si + 1} von ${S.sections.length} ${badges()}</p>
    <section class="card">${INSTRUCTIONS[sec.type]}
      <p>Sie haben <b>${sec.tasks.length} Aufgaben</b> und <b>${sec.minutes} Minuten</b>. Arbeiten Sie so schnell und akkurat wie möglich. Wenn Sie eine Antwort nicht wissen, raten Sie. Sie dürfen sich keine Notizen machen.</p>
      <p class="muted">Tastatur: ← → blättern, bei Quadraten A–E wählen, bei Figuralen Sequenzen 1–3 (Bild 1) und 4–6 (Bild 2), bei Gleichungen Enter = weiter.</p>
      <p><button class="primary" id="go">Subtest starten</button> <button id="abort">Abbrechen</button></p></section>`;
  document.getElementById('go').onclick = () => { sec.startedAt = Date.now(); startTimer(); renderExam(); };
  document.getElementById('abort').onclick = () => { S = null; renderHome(); };
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    const sec = S.sections[S.si];
    const left = sec.limitMs - (Date.now() - sec.startedAt);
    const el = document.getElementById('timer');
    if (el) { el.textContent = fmt(left); el.classList.toggle('low', left < Math.min(5 * 60000, sec.limitMs / 5)); }
    if (left <= 0) finishSection(true);
  }, 250);
}

function renderExam() {
  setScreen('exam');
  const sec = S.sections[S.si];
  const t = sec.tasks[sec.i];
  const left = sec.limitMs - (Date.now() - sec.startedAt);
  app.innerHTML = `
    <div class="topbar">
      <div><b>${TYPES[sec.type].label}</b> · Aufgabe ${sec.i + 1}/${sec.tasks.length}</div>
      <div class="timer ${left < Math.min(5 * 60000, sec.limitMs / 5) ? 'low' : ''}" id="timer" role="timer">${fmt(left)}</div>
      <button class="danger" id="submit">Abgeben</button>
    </div>
    <div class="nav" id="nav">${sec.tasks.map((_, k) => `<button data-k="${k}" aria-label="Aufgabe ${k + 1}">${k + 1}</button>`).join('')}</div>
    <section class="card task" id="task">${taskHTML(t, { answer: sec.answers[sec.i] })}</section>
    <div class="row spread">
      <button id="prev" ${sec.i === 0 ? 'disabled' : ''}>‹ Zurück</button>
      <button id="flag">${sec.flags[sec.i] ? 'Markierung entfernen' : 'Markieren'}</button>
      <button id="next" class="primary" ${sec.i === sec.tasks.length - 1 ? 'disabled' : ''}>Weiter ›</button>
    </div>`;
  paintNav();
  document.getElementById('prev').onclick = () => go(sec.i - 1);
  document.getElementById('next').onclick = () => go(sec.i + 1);
  document.getElementById('flag').onclick = () => { sec.flags[sec.i] = !sec.flags[sec.i]; document.getElementById('flag').textContent = sec.flags[sec.i] ? 'Markierung entfernen' : 'Markieren'; paintNav(); };
  document.getElementById('submit').onclick = () => {
    const open = sec.answers.filter((a) => !answered(a)).length;
    if (confirm(open ? `Noch ${open} Aufgabe(n) unbeantwortet. Subtest wirklich abgeben?` : 'Subtest jetzt abgeben?')) finishSection(false);
  };
  document.getElementById('nav').onclick = (e) => { const b = e.target.closest('button[data-k]'); if (b) go(Number(b.dataset.k)); };
  bindTask(t, (a) => { sec.answers[sec.i] = a; paintNav(); }, () => go(sec.i + 1));
}

function paintNav() {
  const sec = S.sections[S.si];
  document.querySelectorAll('#nav button').forEach((b) => {
    const k = Number(b.dataset.k);
    b.className = [answered(sec.answers[k]) ? 'answered' : '', sec.flags[k] ? 'flagged' : '', k === sec.i ? 'current' : ''].join(' ').trim();
  });
}

function go(k) {
  const sec = S.sections[S.si];
  if (k < 0 || k >= sec.tasks.length) return;
  sec.i = k;
  renderExam();
}

function finishSection(auto) {
  clearInterval(timerId);
  const sec = S.sections[S.si];
  sec.endedAt = Date.now();
  sec.auto = auto;
  if (S.si < S.sections.length - 1) {
    setScreen('between');
    app.innerHTML = `<section class="card"><h1>Subtest beendet</h1>
      <p>${auto ? 'Die Zeit ist abgelaufen.' : 'Abgegeben.'} Es folgt der nächste Subtest: <b>${TYPES[S.sections[S.si + 1].type].label}</b>.</p>
      <p><button class="primary" id="cont">Weiter</button></p></section>`;
    document.getElementById('cont').onclick = () => { S.si++; renderIntro(); };
  } else renderResult();
}

/* ------------------------------------------------------------------ Ergebnis */
function renderResult() {
  setScreen('result');
  const history = store.get(HISTORY_KEY, []);
  const fresh = [];
  let html = `<h1>Ergebnis</h1><p class="muted">Seed ${S.seed} – mit diesem Seed erhalten Sie dieselben Aufgaben noch einmal. ${badges()}</p>`;
  for (const sec of S.sections) {
    const correct = sec.tasks.filter((t, k) => same(sec.answers[k], t.answer)).length;
    const seconds = Math.min(Math.round((sec.endedAt - sec.startedAt) / 1000), sec.limitMs / 1000);
    // Details für die Verlaufs-Detailansicht: Die Aufgaben ergeben sich aus Seed, Anzahl und Schwierigkeit; gespeichert werden Antworten und Lösungen
    const detail = { n: sec.tasks.length, d: S.difficulty, a: sec.answers.map(plainAnswer), c: sec.tasks.map((t) => t.answer) };
    const entry = { ts: Date.now(), mode: 'exam', type: sec.type, correct, total: sec.tasks.length, seconds, seed: S.seed, detail };
    history.unshift(entry);
    fresh.push(entry);
    const byLevel = LEVELS.map((l) => {
      const ts = sec.tasks.map((t, k) => ({ t, k })).filter((x) => x.t.level === l);
      return `<tr><td>${l}</td><td>${ts.filter((x) => same(sec.answers[x.k], x.t.answer)).length} / ${ts.length}</td></tr>`;
    }).join('');
    html += `<section class="card"><h2 style="margin-top:0">${TYPES[sec.type].label}</h2>
      <div class="score">${correct} / ${sec.tasks.length}</div>
      <p class="muted">Zeit: ${fmt(seconds * 1000)} von ${sec.minutes}:00${sec.auto ? ' (Zeit abgelaufen)' : ''} · unbeantwortet: ${sec.answers.filter((a) => !answered(a)).length}</p>
      <table><thead><tr><th>Schwierigkeit</th><th>Richtig</th></tr></thead><tbody>${byLevel}</tbody></table>
      <h2>Auswertung der Aufgaben</h2>
      ${reviewHTML(sec.tasks.map((t, k) => ({ id: t.id, level: t.level, answer: sec.answers[k], correct: t.answer, task: t })))}</section>`;
  }
  store.set(HISTORY_KEY, history.slice(0, 50));
  if (user) Auth.pushHistory(fresh);
  const groupId = S.groupId;
  html += `<p><button class="primary" id="home">Zur Startseite</button>${groupId ? ' <button id="to-group">Zur Lerngruppe</button>' : ''}</p>`;
  app.innerHTML = html;
  document.getElementById('home').onclick = () => { S = null; renderHome(); };
  if (groupId) document.getElementById('to-group').onclick = () => { location.href = `gruppen.html#${encodeURIComponent(groupId)}`; };
}

/* ------------------------------------------------------------------ Übungsmodus */
function startPractice(type, level) {
  P = { type, level, rng: createRng(Date.now()), task: null, taskSeed: null, log: [], answer: null, checked: false, correct: 0, total: 0 };
  nextPractice();
}

function nextPractice() {
  const lvl = P.level === 'gemischt' ? P.rng.pick(LEVELS) : P.level;
  // Jede Aufgabe hat einen eigenen Seed, damit sie im Verlauf wieder angezeigt werden kann
  P.taskSeed = Math.floor(Math.random() * 1e9) + 1;
  P.task = generateTask(createRng(P.taskSeed), P.type, lvl);
  P.answer = null;
  P.checked = false;
  renderPractice();
}

function renderPractice() {
  setScreen('practice');
  const t = P.task;
  const ok = P.checked && same(P.answer, t.answer);
  app.innerHTML = `
    <div class="topbar"><div><b>${TYPES[P.type].label}</b> · ${t.level}</div>
      <div>Richtig: <b>${P.correct}</b> / ${P.total}</div>
      <button id="end">Beenden</button></div>
    <section class="card task">${taskHTML(t, { answer: P.answer, reveal: P.checked, interactive: !P.checked })}
      ${P.checked ? `<p class="feedback ${ok ? 'ok' : 'bad'}">${ok ? 'Richtig!' : `Leider falsch – richtig ist ${showAns(t.answer)}.`}</p>` : '<p class="feedback" id="msg"></p>'}
    </section>
    <div class="row"><button class="primary" id="main">${P.checked ? 'Nächste Aufgabe' : 'Prüfen'}</button></div>`;
  document.getElementById('end').onclick = endPractice;
  const main = document.getElementById('main');
  main.onclick = () => (P.checked ? nextPractice() : checkPractice());
  if (!P.checked) bindTask(t, (a) => { P.answer = a; }, checkPractice);
  else main.focus();
}

function checkPractice() {
  if (!answered(P.answer)) { document.getElementById('msg').textContent = 'Bitte zuerst eine Antwort geben.'; return; }
  P.checked = true;
  P.total++;
  P.log.push({ s: P.taskSeed, l: P.task.level, a: plainAnswer(P.answer), c: P.task.answer });
  if (same(P.answer, P.task.answer)) P.correct++;
  renderPractice();
}

function endPractice() {
  if (P.total > 0) {
    const entry = { ts: Date.now(), mode: 'practice', type: P.type, correct: P.correct, total: P.total, detail: { t: P.log } };
    store.set(HISTORY_KEY, [entry, ...store.get(HISTORY_KEY, [])].slice(0, 50));
    if (user) Auth.pushHistory([entry]);
  }
  P = null;
  renderHome();
}

/* ------------------------------------------------------------------ Tastatur & Schutz */
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = e.target.tagName === 'INPUT';
  if (screen === 'exam') {
    const sec = S.sections[S.si];
    if (!typing && e.key === 'ArrowRight') go(sec.i + 1);
    else if (!typing && e.key === 'ArrowLeft') go(sec.i - 1);
    else if (!typing && sec.tasks[sec.i].type === 'quadrate' && /^[a-e]$/i.test(e.key))
      document.querySelector(`.choices button[data-letter="${e.key.toUpperCase()}"]`)?.click();
    else if (!typing && sec.tasks[sec.i].type === 'figural' && /^[1-6]$/.test(e.key))
      document.querySelector(`.fopt[data-pic="${e.key > 3 ? 1 : 0}"][data-opt="${((Number(e.key) - 1) % 3) + 1}"]`)?.click();
  } else if (screen === 'practice' && !P.checked && !typing && P.task.type === 'quadrate' && /^[a-e]$/i.test(e.key)) {
    document.querySelector(`.choices button[data-letter="${e.key.toUpperCase()}"]`)?.click();
  } else if (screen === 'practice' && !P.checked && !typing && P.task.type === 'figural' && /^[1-6]$/.test(e.key)) {
    document.querySelector(`.fopt[data-pic="${e.key > 3 ? 1 : 0}"][data-opt="${((Number(e.key) - 1) % 3) + 1}"]`)?.click();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (screen === 'exam') { e.preventDefault(); e.returnValue = ''; }
});

/* ------------------------------------------------------------------ Kopfzeile */
if (isSEB) document.getElementById('auth-slot').insertAdjacentHTML('beforebegin', '<span class="badge seb">SEB erkannt</span>');

/* ------------------------------------------------------------------ Konto (Better Auth, optional) */
let user = null;            // angemeldeter Nutzer oder null
let authAvailable = false;
let isAdmin = false;          // laut Server (ADMIN_EMAILS); nur für die Anzeige des Admin-Buttons, der Server prüft selbst
let mailAvailable = false;    // Server kann E-Mails senden: Bestätigung der Adresse und „Passwort vergessen“
let githubAvailable = false;  // false, wenn kein Auth-Server erreichbar ist (z. B. GitHub Pages)

function renderAuthSlot() {
  const slot = document.getElementById('auth-slot');
  const note = document.getElementById('foot-note');
  if (!authAvailable) {
    slot.innerHTML = '';
    note.textContent = 'Für den Trainingsbereich ist ein aktiver Konto-Server erforderlich.';
    return;
  }
  slot.innerHTML = user
    ? `<div class="profile-control">
        <button type="button" class="profile-trigger" id="profile-trigger" aria-expanded="false" aria-controls="profile-menu" aria-label="Profilmenü öffnen">
          ${profileAvatar(user)}<span class="profile-name">${esc(user.name || user.email)}</span><span class="profile-chevron" aria-hidden="true">⌄</span>
        </button>
        <nav class="profile-menu" id="profile-menu" aria-label="Profilmenü" hidden>
          <a href="#kontoinformationen" id="profile-info">Kontoinformationen</a>
          <a href="#einstellungen" id="profile-settings">Einstellungen</a>
          ${isAdmin ? '<a href="#admin" id="profile-admin">Admin-Dashboard</a>' : ''}
        </nav>
      </div>`
    : '<a class="auth-link" href="#login" data-auth-mode="login">Anmelden</a><a class="auth-link auth-link-primary" href="#register" data-auth-mode="register">Registrieren</a>';
  note.textContent = user ? 'Dein Trainingsbereich ist mit deinem Konto verbunden.' : 'Registriere dich, um deinen persönlichen Trainingsbereich zu öffnen.';
  if (!user) return;
  const menu = document.getElementById('profile-menu');
  const trigger = document.getElementById('profile-trigger');
  const closeMenu = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  trigger.onclick = () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
  };
  document.getElementById('profile-info').onclick = (event) => {
    event.preventDefault();
    closeMenu();
    renderAccountInfo({ app, setScreen, goHome: () => goHome(), user, onOpenSettings: () => renderAccountSettingsPage() });
  };
  document.getElementById('profile-settings').onclick = (event) => { event.preventDefault(); closeMenu(); renderAccountSettingsPage(); };
  document.getElementById('profile-admin')?.addEventListener('click', (event) => {
    event.preventDefault(); closeMenu(); renderAdmin({ app, setScreen, goHome: () => goHome() });
  });

  function renderAccountSettingsPage() {
    renderAccountSettings({
    app,
    setScreen,
    goHome: () => goHome(),
    user,
    onUserUpdated: (updatedUser) => { user = updatedUser; renderAuthSlot(); },
    onAccountDeleted: logout,
      onLogout: logout,
    });
  }
}

document.addEventListener('click', (event) => {
  if (event.target.closest('.profile-control')) return;
  const menu = document.getElementById('profile-menu');
  if (menu) {
    menu.hidden = true;
    document.getElementById('profile-trigger')?.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = document.getElementById('profile-menu');
  if (menu) {
    menu.hidden = true;
    document.getElementById('profile-trigger')?.setAttribute('aria-expanded', 'false');
  }
});

function refreshHistory() {
  const body = document.getElementById('verlauf-body');
  if (screen === 'history-page' && body) body.innerHTML = historyHTML(50);
}

// Lokalen und serverseitigen Verlauf zusammenführen (nach Login bzw. beim Laden der Seite)
async function syncHistory() {
  if (!user) return;
  const remote = await Auth.fetchHistory();
  if (!remote) return;
  const key = (h) => `${h.ts}|${h.mode}|${h.type}`;
  const remoteKeys = new Set(remote.map(key));
  const local = store.get(HISTORY_KEY, []);
  const onlyLocal = local.filter((h) => !remoteKeys.has(key(h)));
  store.set(HISTORY_KEY, [...remote, ...onlyLocal].sort((a, b) => b.ts - a.ts).slice(0, 50));
  await Auth.pushHistory(onlyLocal);
}

// Admin-Status vom Server holen (nur zur Anzeige)
async function loadAccount() {
  isAdmin = user ? Boolean((await Groups.getAccount())?.admin) : false;
}

async function logout() {
  await Auth.signOut();
  user = null;
  isAdmin = false;
  S = null;
  P = null;
  clearInterval(timerId);
  localStorage.removeItem(HISTORY_KEY); // auf geteilten Geräten keinen fremden Verlauf zurücklassen (liegt auf dem Server)
  renderAuthSlot();
  renderHome();
}

function openAuthDialog(mode = 'login') {
  document.getElementById('auth-dialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'auth-dialog';
  dlg.setAttribute('aria-label', 'Konto');
  dlg.innerHTML = `<form class="auth-form" novalidate>
      ${githubAvailable ? '<button type="button" id="auth-github" class="github-btn">Mit GitHub fortfahren</button><p class="form-note" style="text-align:center">oder mit E-Mail</p>' : ''}
      <div class="auth-tabs" role="tablist">
        <button type="button" role="tab" data-mode="login">Anmelden</button>
        <button type="button" role="tab" data-mode="register">Registrieren</button>
      </div>
      <div id="name-field"><label for="auth-name">Name</label><input id="auth-name" type="text" autocomplete="name"></div>
      <label for="auth-email">E-Mail</label><input id="auth-email" type="email" autocomplete="email" required>
      <label for="auth-pass">Passwort</label><input id="auth-pass" type="password" required minlength="8">
      <p class="form-note" id="pass-note">Mindestens 8 Zeichen.</p>
      <p class="form-note" id="forgot-row"><button type="button" class="link" id="auth-forgot">Passwort vergessen?</button></p>
      <p class="form-error" id="auth-error" role="alert"></p>
      <div class="row"><button type="button" id="auth-cancel">Abbrechen</button><button type="submit" class="primary" id="auth-submit"></button></div>
    </form>`;
  document.body.appendChild(dlg);
  const $ = (id) => dlg.querySelector(`#${id}`);
  const setMode = (m) => {
    mode = m;
    dlg.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    const reset = m === 'reset';
    dlg.querySelector('.auth-tabs').hidden = reset;
    $('name-field').hidden = m !== 'register';
    $('pass-note').hidden = m !== 'register';
    $('auth-pass').hidden = reset;
    dlg.querySelector('label[for="auth-pass"]').hidden = reset;
    $('auth-pass').required = !reset;
    $('forgot-row').hidden = m !== 'login' || !mailAvailable;
    $('auth-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('auth-submit').textContent = reset ? 'Link senden' : m === 'login' ? 'Anmelden' : 'Konto erstellen';
    $('auth-error').textContent = '';
  };
  dlg.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('auth-cancel').onclick = () => dlg.close();
  $('auth-forgot').onclick = () => setMode('reset');
  const showNotice = (title, text) => {
    dlg.querySelector('form').innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button type="button" class="primary" id="auth-ok">Schließen</button></div>`;
    dlg.querySelector('#auth-ok').onclick = () => dlg.close();
  };
  if (githubAvailable) $('auth-github').onclick = async () => { const r = await Auth.signInGithub(); if (!r.ok) $('auth-error').textContent = r.error; };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('auth-name').value.trim();
    const email = $('auth-email').value.trim();
    const pass = $('auth-pass').value;
    if (mode === 'reset') {
      if (!email) { $('auth-error').textContent = 'Bitte E-Mail eingeben.'; return; }
      $('auth-submit').disabled = true;
      const sent = await Auth.requestPasswordReset(email);
      $('auth-submit').disabled = false;
      if (!sent.ok) { $('auth-error').textContent = sent.error; return; }
      showNotice('E-Mail unterwegs', `Wenn zu ${email} ein Konto existiert, haben wir einen Link zum Zurücksetzen des Passworts gesendet. Er ist eine Stunde gültig.`);
      return;
    }
    if (!email || !pass) { $('auth-error').textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
    if (mode === 'register' && pass.length < 8) { $('auth-error').textContent = 'Das Passwort braucht mindestens 8 Zeichen.'; return; }
    $('auth-submit').disabled = true;
    const r = mode === 'login' ? await Auth.signIn(email, pass) : await Auth.signUp(name || email.split('@')[0], email, pass);
    $('auth-submit').disabled = false;
    if (!r.ok) { $('auth-error').textContent = r.error; return; }
    const s = await Auth.getSession();
    if (mode === 'register' && !s.user && mailAvailable) { // Konto angelegt, aber erst nach Bestätigung der Adresse nutzbar
      showNotice('Fast geschafft', `Wir haben eine E-Mail an ${email} gesendet. Bitte klicke auf den Link darin, um deine Adresse zu bestätigen – danach bist du angemeldet. Schau auch im Spam-Ordner nach.`);
      return;
    }
    user = s.user;
    dlg.close();
    sessionReady = true;
    await loadAccount();
    renderAuthSlot();
    await syncHistory();
    renderHome();
  });
  setMode(mode);
  dlg.showModal();
  $('auth-email').focus();
}

document.addEventListener('click', (e) => {
  const authButton = e.target.closest('[data-auth-mode]');
  if (authButton) openAuthDialog(authButton.dataset.authMode);
});

function goHome() {
  if (screen === 'exam' || screen === 'intro') return;
  if (screen === 'practice') { endPractice(); return; }
  S = null;
  renderHome();
}
document.getElementById('brand').addEventListener('click', (e) => { e.preventDefault(); goHome(); });
document.querySelectorAll('.site-nav a').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  openPlatformPage(a.dataset.page);
}));

/* ------------------------------------------------------------------ Einstieg von außen: Gruppentest-Link, Navigation der Unterseite */
const HASH_PAGES = { '#pruefung': 'exam', '#ueben': 'practice', '#verlauf': 'history' };

async function startGroupTest(gid, tid) {
  const r = await Groups.groupTests(gid);
  const t = r.ok ? r.data.tests.find((x) => x.id === tid) : null;
  if (t?.released && t.seed != null) {
    // Ergebnisse nach der Endzeit zählen nicht: vorher warnen, wenn die Zeit nicht mehr reicht
    const needMs = (t.kind === 'all' ? 3 : 1) * t.minutes * 60_000;
    if (t.endsAt != null && t.endsAt - Date.now() < needMs) {
      const left = t.endsAt - Date.now();
      const text = left <= 0 ? 'Die Endzeit dieses Tests ist abgelaufen. Das Ergebnis zählt nicht mehr für die Wertung.'
        : `Die Endzeit ist in ${Math.max(1, Math.round(left / 60_000))} Minuten, der Test dauert bis zu ${Math.round(needMs / 60_000)} Minuten. Ergebnisse nach der Endzeit zählen nicht.`;
      if (!confirm(`${text}\n\nTrotzdem starten?`)) { location.href = `gruppen.html#${encodeURIComponent(gid)}`; return; }
    }
    return startExam(t.kind, t.seed, t.minutes, gid, { count: t.count, difficulty: t.difficulty });
  }
  setScreen('home');
  const msg = t ? `Dieser Test startet erst am ${new Date(t.startsAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Dieser Test ist nicht (mehr) verfügbar.';
  app.innerHTML = `<h1>Gruppentest</h1><section class="card"><p>${esc(msg)}</p><p><a class="btn" href="gruppen.html#${esc(encodeURIComponent(gid))}">Zurück zur Lerngruppe</a></p></section>`;
}

async function openFromLocation() {
  if (!user) { if (location.hash === '#login' && authAvailable) openAuthDialog('login'); return; }
  const ref = new URLSearchParams(location.search).get('gruppentest');
  if (ref) {
    window.history.replaceState(null, '', location.pathname); // Seite neu laden startet den Test nicht noch einmal
    const [gid, tid] = ref.split('~');
    return startGroupTest(gid, tid);
  }
  if (HASH_PAGES[location.hash]) openPlatformPage(HASH_PAGES[location.hash]);
  // Links aus dem Profilmenü der Unterseite „Lerngruppen“
  const accountLink = { '#kontoinformationen': 'profile-info', '#einstellungen': 'profile-settings', '#admin': 'profile-admin' }[location.hash];
  if (accountLink) document.getElementById(accountLink)?.click();
}

renderStartup();
Auth.getSession().then(async (s) => {
  authAvailable = s.available;
  user = s.user;
  if (authAvailable) { const config = await Auth.getConfig(); githubAvailable = Boolean(config.github); mailAvailable = Boolean(config.mail); }
  sessionReady = true;
  await loadAccount();
  renderAuthSlot();
  await syncHistory();
  renderHome();
  await openFromLocation();
});