import { buildExamSet, generateTask, TYPES, LEVELS, EXAM } from './src/tasks.js';
import { createRng } from './src/rng.js';
import { LETTERS } from './src/latin.js';
import { SIZE, SHAPES, COLORS } from './src/figural.js';
import * as Auth from './src/auth.js';
import * as Groups from './src/groups.js';
import { openAccountDialog, renderAdmin } from './src/admin.js';

const app = document.getElementById('app');
const isSEB = /SEB/i.test(navigator.userAgent);
const HISTORY_KEY = 'testas-sim-history-v1';

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus o. Ä. */ } },
};

let screen = 'home';
function setScreen(name) {
  const changed = screen !== name;
  screen = name;
  document.body.dataset.screen = name;
  if (changed) window.scrollTo(0, 0);
}
let S = null;   // Prüfungssitzung
let P = null;   // Übungssitzung
let timerId = null;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
function historyHTML() {
  const hist = store.get(HISTORY_KEY, []).slice(0, 8);
  const table = hist.length
    ? `<div class="card"><table><thead><tr><th>Datum</th><th>Modus</th><th>Typ</th><th>Ergebnis</th></tr></thead><tbody>
        ${hist.map((h) => `<tr><td>${esc(new Date(h.ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }))}</td>
          <td>${h.mode === 'exam' ? 'Prüfung' : 'Übung'}</td><td>${esc(TYPES[h.type]?.label ?? h.type)}</td>
          <td>${h.correct}/${h.total}${h.seconds ? ` · ${fmt(h.seconds * 1000)}` : ''}${h.seed != null ? ` · Seed ${h.seed}` : ''}</td></tr>`).join('')}
        </tbody></table></div>`
    : '<p class="lead muted">Noch keine Ergebnisse – starten Sie eine Prüfung oder eine Übung.</p>';
  const hint = authAvailable && !user
    ? '<div class="hint-box"><p>Mit einem Konto wird Ihr Verlauf gespeichert und auf allen Geräten angezeigt.</p><button class="small" data-login>Anmelden</button></div>'
    : '';
  return table + hint;
}

function renderHome(scrollTo = null) {
  setScreen('home');
  clearInterval(timerId);
  const tags = ['Figurale Sequenzen', 'Mathematische Gleichungen', 'Lateinische Quadrate', 'niedrig', 'mittel', 'hoch', '20 Aufgaben', '25 Minuten', 'Seed-Wiederholung', 'Sofort-Feedback', 'Safe Exam Browser', 'Konto optional'];
  const tickerList = `<ul aria-hidden="true">${tags.map((t) => `<li>${t}</li>`).join('')}</ul>`;
  const previewFig = frameSVG([
    { shape: 'triangle', row: 1, col: 2, rot: 1, color: 'yellow' },
    { shape: 'square', row: 2, col: 0, rot: 0, color: 'pink' },
    { shape: 'hexagon', row: 3, col: 3, rot: 0, color: 'green' },
    { shape: 'moon', row: 0, col: 1, rot: 2, color: 'orange' },
  ], { label: 'Beispielmatrix' });
  const sample = [['A', 'B', 'C', '', 'E'], ['', 'C', '', 'E', ''], ['C', 'D', 'E', '', 'B'], ['', 'E', '', 'B', ''], ['E', '?', '', 'C', '']];
  const previewLatin = `<div class="latin mini" aria-label="Beispielraster">${sample.flat().map((v) => `<div${v === '?' ? ' class="q"' : ''}>${v}</div>`).join('')}</div>`;
  const previewEq = '<div class="mini-eqs"><div><b>A</b> × 3 = <b>B</b></div><div><b>B</b> – <b>A</b> = 8</div></div>';

  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow"><b>TestAS</b> · Kernmodul</p>
      <h1>Üben wie in der <em>Prüfung.</em></h1>
      <p class="lead">Alle drei Aufgabentypen des digitalen TestAS Kernmoduls – unendlich viele, selbst generierte Aufgaben, mit Zeitlimit oder mit sofortiger Rückmeldung.</p>
      <div class="ctas">
        <button class="primary lg" data-go="pruefung">Prüfung starten</button>
        <button class="lg" data-go="ueben">Einfach üben</button>
      </div>
      <p class="meta">Läuft im Browser · Konto optional${isSEB ? ' · <span class="badge seb">Safe Exam Browser erkannt</span>' : ''}</p>
    </section>
    <div class="ticker" aria-hidden="true"><div class="ticker-track">${tickerList}${tickerList}</div></div>

    <section class="section" id="typen">
      <p class="eyebrow"><b>01</b> / Aufgabentypen</p>
      <h2>Drei Subtests. Ein Ziel.</h2>
      <p class="lead">Jeder Typ in drei Schwierigkeitsstufen. Starten Sie direkt mit einem Typ – oder simulieren Sie das ganze Kernmodul.</p>
      <div class="tcards">
        <article class="tcard">
          <span class="num">01</span><h3>Figurale Sequenzen</h3>
          <div class="preview">${previewFig}</div>
          <p>Figuren ändern Position, Farbe und Ausrichtung nach Regeln. Setzen Sie die Matrizenreihe fort.</p>
          <div class="row"><button class="primary" data-practice="figural">Üben</button></div>
        </article>
        <article class="tcard">
          <span class="num">02</span><h3>Mathematische Gleichungen</h3>
          <div class="preview">${previewEq}</div>
          <p>Gleichungssysteme mit bis zu vier Unbekannten. Jeder Buchstabe hat genau einen Wert von 1 bis 20.</p>
          <div class="row"><button class="primary" data-practice="gleichungen">Üben</button></div>
        </article>
        <article class="tcard">
          <span class="num">03</span><h3>Lateinische Quadrate</h3>
          <div class="preview">${previewLatin}</div>
          <p>5×5-Raster mit den Buchstaben A–E. Welcher Buchstabe gehört an die Stelle des Fragezeichens?</p>
          <div class="row"><button class="primary" data-practice="quadrate">Üben</button></div>
        </article>
      </div>
    </section>

    <section class="section" id="pruefung">
      <p class="eyebrow"><b>02</b> / Prüfungsmodus</p>
      <h2>Wie im Testzentrum.</h2>
      <p class="lead">${EXAM.count} Aufgaben je Subtest, ${EXAM.minutes} Minuten, keine Rückmeldung bis zur Abgabe. Notizen sind nicht erlaubt.</p>
      <div class="card">
        <div class="grid">
          <div>
            <label for="exam-type">Umfang</label>
            <select id="exam-type">
              <option value="all">Kernmodul (alle drei Subtests)</option>
              <option value="figural">Nur Figurale Sequenzen</option>
              <option value="gleichungen">Nur Mathematische Gleichungen</option>
              <option value="quadrate">Nur Lateinische Quadrate</option>
            </select>
          </div>
          <div>
            <label for="seed">Seed (optional – für dieselbe Aufgabenreihe)</label>
            <input id="seed" type="number" min="0" placeholder="zufällig">
          </div>
        </div>
        <p style="margin-top:18px"><button class="primary lg" id="start-exam">Prüfung starten</button></p>
      </div>
    </section>

    <section class="section" id="ueben">
      <p class="eyebrow"><b>03</b> / Übungsmodus</p>
      <h2>Ohne Zeitdruck.</h2>
      <p class="lead">Unbegrenzt viele neue Aufgaben mit sofortiger Rückmeldung und Lösungsweg.</p>
      <div class="card">
        <div class="grid">
          <div>
            <label for="prac-type">Aufgabentyp</label>
            <select id="prac-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
          </div>
          <div>
            <label for="prac-level">Schwierigkeit</label>
            <select id="prac-level"><option value="gemischt">gemischt</option>${LEVELS.map((l) => `<option>${l}</option>`).join('')}</select>
          </div>
        </div>
        <p style="margin-top:18px"><button class="primary lg" id="start-prac">Üben</button></p>
      </div>
    </section>

    <section class="section" id="verlauf">
      <p class="eyebrow"><b>04</b> / Verlauf</p>
      <h2>Ihre letzten Ergebnisse.</h2>
      <div id="verlauf-body">${historyHTML()}</div>
      <div class="feat">
        <div><span class="letter">A</span><h3>Lokal oder mit Konto</h3><p>Ergebnisse bleiben im Browser – mit Konto werden sie zusätzlich synchronisiert.</p></div>
        <div><span class="letter">B</span><h3>Reproduzierbar</h3><p>Mit demselben Seed erhalten Sie jederzeit dieselbe Aufgabenreihe wieder.</p></div>
        <div><span class="letter">C</span><h3>Eindeutig gelöst</h3><p>Jede Aufgabe hat genau eine richtige Lösung – vom Generator geprüft.</p></div>
      </div>
    </section>`;

  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
  app.querySelectorAll('[data-practice]').forEach((b) => (b.onclick = () => startPractice(b.dataset.practice, 'gemischt')));
  document.getElementById('start-exam').onclick = () => {
    const seedRaw = document.getElementById('seed').value;
    startExam(document.getElementById('exam-type').value, seedRaw === '' ? null : Number(seedRaw));
  };
  document.getElementById('start-prac').onclick = () =>
    startPractice(document.getElementById('prac-type').value, document.getElementById('prac-level').value);
  if (scrollTo) requestAnimationFrame(() => go(scrollTo)); else window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ Prüfung */
function startExam(kind, seed) {
  const useSeed = Number.isFinite(seed) && seed !== null ? seed : Math.floor(Math.random() * 1e9);
  const types = kind === 'all' ? ['figural', 'gleichungen', 'quadrate'] : [kind];
  app.innerHTML = '<p class="card">Aufgaben werden erstellt …</p>';
  setTimeout(() => {
    S = {
      seed: useSeed, si: 0,
      sections: types.map((type) => {
        const tasks = buildExamSet(type, useSeed);
        return { type, tasks, answers: Array(tasks.length).fill(null), flags: Array(tasks.length).fill(false), i: 0, startedAt: null, endedAt: null, limitMs: EXAM.minutes * 60000 };
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
      <p>Sie haben <b>${EXAM.count} Aufgaben</b> und <b>${EXAM.minutes} Minuten</b>. Arbeiten Sie so schnell und akkurat wie möglich. Wenn Sie eine Antwort nicht wissen, raten Sie. Sie dürfen sich keine Notizen machen.</p>
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
    if (el) { el.textContent = fmt(left); el.classList.toggle('low', left < 5 * 60000); }
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
      <div class="timer ${left < 5 * 60000 ? 'low' : ''}" id="timer" role="timer">${fmt(left)}</div>
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
    const entry = { ts: Date.now(), mode: 'exam', type: sec.type, correct, total: sec.tasks.length, seconds, seed: S.seed };
    history.unshift(entry);
    fresh.push(entry);
    const byLevel = LEVELS.map((l) => {
      const ts = sec.tasks.map((t, k) => ({ t, k })).filter((x) => x.t.level === l);
      return `<tr><td>${l}</td><td>${ts.filter((x) => same(sec.answers[x.k], x.t.answer)).length} / ${ts.length}</td></tr>`;
    }).join('');
    html += `<section class="card"><h2 style="margin-top:0">${TYPES[sec.type].label}</h2>
      <div class="score">${correct} / ${sec.tasks.length}</div>
      <p class="muted">Zeit: ${fmt(seconds * 1000)} von ${EXAM.minutes}:00${sec.auto ? ' (Zeit abgelaufen)' : ''} · unbeantwortet: ${sec.answers.filter((a) => !answered(a)).length}</p>
      <table><thead><tr><th>Schwierigkeit</th><th>Richtig</th></tr></thead><tbody>${byLevel}</tbody></table>
      <h2>Auswertung der Aufgaben</h2>
      ${sec.tasks.map((t, k) => {
        const ok = same(sec.answers[k], t.answer);
        return `<details><summary>${ok ? '✔' : '✘'} ${t.id} · ${t.level} · Ihre Antwort: ${showAns(sec.answers[k])} · richtig: ${showAns(t.answer)}</summary>
          <div class="review-task">${taskHTML(t, { answer: sec.answers[k], reveal: true, interactive: false })}</div></details>`;
      }).join('')}</section>`;
  }
  store.set(HISTORY_KEY, history.slice(0, 50));
  if (user) Auth.pushHistory(fresh);
  html += '<p><button class="primary" id="home">Zur Startseite</button></p>';
  app.innerHTML = html;
  document.getElementById('home').onclick = () => { S = null; renderHome(); };
}

/* ------------------------------------------------------------------ Übungsmodus */
function startPractice(type, level) {
  P = { type, level, rng: createRng(Date.now()), task: null, answer: null, checked: false, correct: 0, total: 0 };
  nextPractice();
}

function nextPractice() {
  const lvl = P.level === 'gemischt' ? P.rng.pick(LEVELS) : P.level;
  P.task = generateTask(P.rng, P.type, lvl);
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
  if (same(P.answer, P.task.answer)) P.correct++;
  renderPractice();
}

function endPractice() {
  if (P.total > 0) {
    const entry = { ts: Date.now(), mode: 'practice', type: P.type, correct: P.correct, total: P.total };
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
let githubAvailable = false;  // false, wenn kein Auth-Server erreichbar ist (z. B. GitHub Pages)

function renderAuthSlot() {
  const slot = document.getElementById('auth-slot');
  const note = document.getElementById('foot-note');
  if (!authAvailable) { slot.innerHTML = ''; return; }
  slot.innerHTML = user
    ? `<span class="who" title="${esc(user.email)}">${esc(user.name || user.email)}</span>${isAdmin ? '<button class="small" id="admin">Admin</button>' : ''}<button class="small" id="account">Konto</button><button class="small" id="logout">Abmelden</button>`
    : '<button class="small" id="login">Anmelden</button>';
  note.textContent = 'Läuft im Browser. Ergebnisse werden lokal gespeichert, mit Konto zusätzlich auf dem Server.';
  if (!user) { document.getElementById('login').onclick = () => openAuthDialog(); return; }
  document.getElementById('logout').onclick = logout;
  document.getElementById('account').onclick = () => openAccountDialog(user);
  if (isAdmin) document.getElementById('admin').onclick = () => { if (screen !== 'exam' && screen !== 'intro') renderAdmin({ app, setScreen, goHome: () => goHome() }); };
}

function refreshHistory() {
  const body = document.getElementById('verlauf-body');
  if (screen === 'home' && body) body.innerHTML = historyHTML();
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
  document.getElementById('account-dialog')?.remove();
  if (screen === 'admin') renderHome();
  localStorage.removeItem(HISTORY_KEY); // auf geteilten Geräten keinen fremden Verlauf zurücklassen (liegt auf dem Server)
  renderAuthSlot();
  refreshHistory();
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
      <p class="form-error" id="auth-error" role="alert"></p>
      <div class="row"><button type="button" id="auth-cancel">Abbrechen</button><button type="submit" class="primary" id="auth-submit"></button></div>
    </form>`;
  document.body.appendChild(dlg);
  const $ = (id) => dlg.querySelector(`#${id}`);
  const setMode = (m) => {
    mode = m;
    dlg.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    $('name-field').hidden = m === 'login';
    $('pass-note').hidden = m === 'login';
    $('auth-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('auth-submit').textContent = m === 'login' ? 'Anmelden' : 'Konto erstellen';
    $('auth-error').textContent = '';
  };
  dlg.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('auth-cancel').onclick = () => dlg.close();
  if (githubAvailable) $('auth-github').onclick = async () => { const r = await Auth.signInGithub(); if (!r.ok) $('auth-error').textContent = r.error; };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('auth-name').value.trim();
    const email = $('auth-email').value.trim();
    const pass = $('auth-pass').value;
    if (!email || !pass) { $('auth-error').textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
    if (mode === 'register' && pass.length < 8) { $('auth-error').textContent = 'Das Passwort braucht mindestens 8 Zeichen.'; return; }
    $('auth-submit').disabled = true;
    const r = mode === 'login' ? await Auth.signIn(email, pass) : await Auth.signUp(name || email.split('@')[0], email, pass);
    $('auth-submit').disabled = false;
    if (!r.ok) { $('auth-error').textContent = r.error; return; }
    const s = await Auth.getSession();
    user = s.user;
    dlg.close();
    await loadAccount();
    renderAuthSlot();
    await syncHistory();
    refreshHistory();
  });
  setMode(mode);
  dlg.showModal();
  $('auth-email').focus();
}

app.addEventListener('click', (e) => { if (e.target.closest('[data-login]')) openAuthDialog(); });

function goHome(target = null) {
  if (screen === 'exam' || screen === 'intro') return;
  if (screen === 'practice') { endPractice(); if (target) document.getElementById(target)?.scrollIntoView(); return; }
  S = null;
  renderHome(target);
}
document.getElementById('brand').addEventListener('click', (e) => { e.preventDefault(); goHome(); });
document.querySelectorAll('.site-nav a').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  if (screen === 'home') document.getElementById(a.dataset.go)?.scrollIntoView({ behavior: 'smooth' });
  else goHome(a.dataset.go);
}));

renderHome();
Auth.getSession().then(async (s) => {
  authAvailable = s.available;
  user = s.user;
  if (authAvailable) githubAvailable = Boolean((await Auth.getConfig()).github);
  await loadAccount();
  renderAuthSlot();
  await syncHistory();
  refreshHistory();
});
