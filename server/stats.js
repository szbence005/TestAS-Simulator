// Reine Hilfsfunktionen (ohne Datenbank, gut testbar): Gruppencodes, Admin-Liste, Statistik, CSV.
import { randomInt } from 'node:crypto';
import { buildExamSet } from '../src/tasks.js';

export const TYPE_KEYS = ['figural', 'gleichungen', 'quadrate'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I/L
const EXAM_GAP_MS = 5 * 60_000; // Ergebnisse desselben Seeds innerhalb von 5 Minuten = eine Prüfung

/** 8 Zeichen, gespeichert ohne Bindestrich (Anzeige: XXXX-XXXX). */
export function generateCode() {
  let c = '';
  for (let i = 0; i < 8; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}
export const normalizeCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** ADMIN_EMAILS="a@x.hu, b@y.hu" → Set kleingeschriebener Adressen */
export function parseAdminEmails(value) {
  return new Set(String(value ?? '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const pct = (correct, total) => (total > 0 ? (correct / total) * 100 : null);
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const weighted = (es) => pct(es.reduce((a, e) => a + e.correct, 0), es.reduce((a, e) => a + e.total, 0));

/** Anzahl Prüfungen: Ergebnisse mit gleichem Seed und kleinem zeitlichen Abstand zählen als eine (Kernmodul = 3 Subtests). */
export function countExams(entries) {
  const exams = entries.filter((e) => e.mode === 'exam').sort((a, b) => a.ts - b.ts);
  const lastBySeed = new Map();
  let n = 0;
  for (const e of exams) {
    const key = e.seed ?? `ts${e.ts}`;
    const prev = lastBySeed.get(key);
    if (prev === undefined || e.ts - prev > EXAM_GAP_MS) n++;
    lastBySeed.set(key, e.ts);
  }
  return n;
}

/** Trend: die letzten k Ergebnisse gegen die k davor (k ≤ 3), ab 4 Ergebnissen. Schwelle ±3 Prozentpunkte. */
export function trend(entries) {
  const es = [...entries].sort((a, b) => a.ts - b.ts);
  if (es.length < 4) return null;
  const k = Math.min(3, Math.floor(es.length / 2));
  const delta = weighted(es.slice(-k)) - weighted(es.slice(-2 * k, -k));
  return { delta: round1(delta), dir: delta >= 3 ? 'up' : delta <= -3 ? 'down' : 'flat' };
}

/** Kennzahlen eines Teilnehmers aus seinen history-Zeilen. */
export function summarize(entries) {
  const exam = {};
  const practice = {};
  for (const type of TYPE_KEYS) {
    exam[type] = round1(mean(entries.filter((e) => e.mode === 'exam' && e.type === type).map((e) => pct(e.correct, e.total)).filter((x) => x != null)));
    practice[type] = round1(weighted(entries.filter((e) => e.mode === 'practice' && e.type === type)));
  }
  return {
    exams: countExams(entries),
    practices: entries.filter((e) => e.mode === 'practice').length,
    exam,
    practice,
    last: entries.length ? Math.max(...entries.map((e) => e.ts)) : null,
    trend: trend(entries),
  };
}

export const percent = (e) => round1(pct(e.correct, e.total));

/* ---------- CSV (Excel DE/HU: Semikolon, Dezimalkomma, UTF-8-BOM) */
export function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // Formel-Injection in Excel verhindern (Namen sind Nutzereingaben)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header, rows) {
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
export const utc = (ts) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

/* ---------- Gruppentests: vom Gruppenleiter geplante Prüfungen mit Startzeit */
export const TEST_KINDS = ['all', ...TYPE_KEYS];
export const MAX_TESTS_PER_GROUP = 100;
export const TEST_DIFFICULTIES = ['gemischt', 'niedrig', 'mittel', 'hoch'];
export const DEFAULT_TEST_COUNT = 20;
export const MIN_TEST_COUNT = 1;
export const MAX_TEST_COUNT = 40;
const DAY_MS = 24 * 60 * 60_000;

export const randomSeed = () => randomInt(1, 1_000_000_000); // passt in INTEGER (auch Postgres int4)

/**
 * Gemeinsame Prüfung der Testfelder. startsAt: höchstens 24 h zurück (= sofort), höchstens 2 Jahre voraus (nur wenn checkStart).
 * endsAt (optional, null = offen): muss nach der Startzeit liegen; beim Planen zusätzlich in der Zukunft.
 */
function validateTest(f, { now, checkStart, futureEnd }) {
  if (!f.title || !TEST_KINDS.includes(f.kind) || !Number.isInteger(f.minutes) || f.minutes < 1 || f.minutes > 120 || !Number.isSafeInteger(f.startsAt)) return 'invalid_test';
  if (!Number.isInteger(f.count) || f.count < MIN_TEST_COUNT || f.count > MAX_TEST_COUNT || !TEST_DIFFICULTIES.includes(f.difficulty)) return 'invalid_test';
  if (checkStart && (f.startsAt < now - DAY_MS || f.startsAt > now + 730 * DAY_MS)) return 'invalid_time';
  if (f.endsAt !== null) {
    if (!Number.isSafeInteger(f.endsAt) || f.endsAt <= f.startsAt || f.endsAt > f.startsAt + 730 * DAY_MS || (futureEnd && f.endsAt <= now)) return 'invalid_end';
  }
  return null;
}
const endValue = (value) => (value == null || value === '' ? null : Number(value));

/** Prüft die Eingaben der Gruppenleitung → { test } oder { error }. */
export function parseTestInput(body, now = Date.now(), seed = randomSeed()) {
  const test = {
    title: String(body?.title ?? '').trim().slice(0, 80),
    kind: body?.kind,
    minutes: Number(body?.minutes),
    count: body?.count == null ? DEFAULT_TEST_COUNT : Number(body.count),
    difficulty: body?.difficulty == null ? 'gemischt' : body.difficulty,
    startsAt: Number(body?.startsAt),
    endsAt: endValue(body?.endsAt),
  };
  const error = validateTest(test, { now, checkStart: true, futureEnd: true });
  return error ? { error } : { test: { ...test, seed } };
}

/**
 * Änderung eines geplanten Tests → { patch } (vollständige neue Werte) oder { error }.
 * Titel, Zeit pro Subtest und Endzeit lassen sich immer ändern. Aufgabenzahl, Schwierigkeit und Startzeit bestimmen, welche Aufgaben es gibt
 * und welche Ergebnisse zählen – sie sind gesperrt, sobald es Ergebnisse gibt (hasResults), damit niemand nachträglich anders bewertet wird.
 * Eine Endzeit in der Vergangenheit ist erlaubt (= Test jetzt beenden).
 */
export function parseTestUpdate(existing, body, { now = Date.now(), hasResults = false } = {}) {
  const has = (key) => body != null && Object.hasOwn(body, key);
  const next = {
    title: has('title') ? String(body.title ?? '').trim().slice(0, 80) : existing.title,
    kind: existing.kind,
    minutes: has('minutes') ? Number(body.minutes) : existing.minutes,
    count: has('count') ? Number(body.count) : existing.count ?? DEFAULT_TEST_COUNT,
    difficulty: has('difficulty') ? body.difficulty : existing.difficulty ?? 'gemischt',
    startsAt: has('startsAt') ? Number(body.startsAt) : existing.startsAt,
    endsAt: has('endsAt') ? endValue(body.endsAt) : existing.endsAt ?? null,
  };
  const startChanged = next.startsAt !== existing.startsAt;
  const error = validateTest(next, { now, checkStart: startChanged, futureEnd: false });
  if (error) return { error };
  if (hasResults && (startChanged || next.count !== (existing.count ?? DEFAULT_TEST_COUNT) || next.difficulty !== (existing.difficulty ?? 'gemischt'))) return { error: 'has_results' };
  return { patch: next };
}

/** Was ein Nutzer von einem Test sehen darf: Der Seed (= die Aufgaben) wird erst ab der Startzeit herausgegeben – nur die Gruppenleitung kennt ihn vorher. */
export function shapeTest(test, { owner = false, now = Date.now() } = {}) {
  const released = test.startsAt <= now;
  const endsAt = test.endsAt ?? null;
  const out = { id: test.id, title: test.title, kind: test.kind, minutes: test.minutes, count: test.count ?? DEFAULT_TEST_COUNT, difficulty: test.difficulty ?? 'gemischt', startsAt: test.startsAt, endsAt, ended: endsAt !== null && endsAt <= now, released };
  if (released || owner) out.seed = test.seed;
  return out;
}

/** Ergebnis eines Teilnehmers: je Subtest zählt der erste Prüfungsversuch mit dem Seed des Tests ab der Startzeit (und, falls gesetzt, bis zur Endzeit). */
export function testResult(test, entries) {
  const types = test.kind === 'all' ? TYPE_KEYS : [test.kind];
  const parts = {};
  for (const e of [...entries].sort((a, b) => a.ts - b.ts)) {
    if (e.mode !== 'exam' || Number(e.seed) !== test.seed || e.ts < test.startsAt || (test.endsAt != null && e.ts > Number(test.endsAt)) || !types.includes(e.type) || parts[e.type]) continue;
    // Nicht nachgerechnete Ergebnisse (verified = 0) und Ergebnisse mit anderer Aufgabenzahl/Schwierigkeit zählen nicht; ältere Zeilen ohne diese Angaben schon
    if (e.verified != null && Number(e.verified) === 0) continue;
    if (e.exam_count != null && (Number(e.exam_count) !== (test.count ?? DEFAULT_TEST_COUNT) || e.exam_difficulty !== (test.difficulty ?? 'gemischt'))) continue;
    parts[e.type] = { correct: e.correct, total: e.total, seconds: e.seconds ?? null, ts: e.ts };
  }
  const list = Object.values(parts);
  const correct = list.reduce((sum, p) => sum + p.correct, 0);
  const total = list.reduce((sum, p) => sum + p.total, 0);
  const seconds = list.reduce((sum, p) => sum + (p.seconds ?? 0), 0);
  return { parts, done: list.length, expected: types.length, complete: list.length === types.length, correct, total, seconds, percent: round1(pct(correct, total)) };
}

/** Wie viele Mitglieder den Test vollständig abgeschlossen haben (entries: Prüfungszeilen der Gruppenmitglieder). */
export function completedCount(test, entries) {
  const byUser = new Map();
  for (const e of entries) (byUser.get(e.user_id) ?? byUser.set(e.user_id, []).get(e.user_id)).push(e);
  return [...byUser.values()].filter((list) => testResult(test, list).complete).length;
}

/** CSV der Testergebnisse (eine Zeile je Mitglied): Name, Subtests, Gesamtergebnis, Zeit und je Subtest Richtig/Gesamt/Sekunden. members: [{ name, email, result }] */
export function testResultsCsv(test, members) {
  const types = test.kind === 'all' ? TYPE_KEYS : [test.kind];
  const header = ['Name', 'E-Mail', 'Subtests abgeschlossen', 'Subtests gesamt', 'Richtig', 'Gesamt', 'Prozent', 'Zeit (Sekunden)',
    ...types.flatMap((t) => [`${t} richtig`, `${t} gesamt`, `${t} Sekunden`])];
  const rows = members.map(({ name, email, result: r }) => [
    name, email, r.done, r.expected, r.done ? r.correct : null, r.done ? r.total : null, r.percent, r.done ? r.seconds : null,
    ...types.flatMap((t) => { const p = r.parts[t]; return p ? [p.correct, p.total, p.seconds] : [null, null, null]; }),
  ]);
  return toCsv(header, rows);
}

/* ---------- Details eines Verlaufseintrags (Antworten je Aufgabe, für die Detailansicht im Verlauf) */
const DETAIL_MAX_ITEMS = 100;
const DETAIL_MAX_CHARS = 12_000;
const DETAIL_LEVELS = ['niedrig', 'mittel', 'hoch'];
// Antworten: null (unbeantwortet), Zahl (Gleichungen), Buchstabe A–E (Quadrate) oder [Bild 1, Bild 2] mit je null oder 1–9 (Figurale Sequenzen)
const answerOk = (x) => x === null
  || (typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e6)
  || (typeof x === 'string' && /^[A-E]$/.test(x))
  || (Array.isArray(x) && x.length === 2 && x.every((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 9)));
const answersOk = (list, n) => Array.isArray(list) && list.length === n && list.every(answerOk);

/**
 * Prüft die Details eines Verlaufseintrags (vom Client geliefert) → bereinigtes Objekt oder null.
 * Prüfung: { n: Aufgabenzahl, d: Schwierigkeit, a: Antworten[], c: richtige Antworten[] } (Aufgaben ergeben sich aus Seed, n und d)
 * Übung:   { t: [{ s: Aufgaben-Seed, l: Stufe, a: Antwort, c: richtige Antwort }] }
 */
export function cleanDetail(detail, { mode, total } = {}) {
  if (detail == null || typeof detail !== 'object' || Array.isArray(detail)) return null;
  let out = null;
  if (mode === 'exam') {
    const { n, d, a, c } = detail;
    if (Number.isInteger(n) && n === total && n >= 1 && n <= DETAIL_MAX_ITEMS && TEST_DIFFICULTIES.includes(d) && answersOk(a, n) && answersOk(c, n) && !c.includes(null)) out = { n, d, a, c };
  } else if (mode === 'practice') {
    const { t } = detail;
    if (Array.isArray(t) && t.length === total && t.length >= 1 && t.length <= DETAIL_MAX_ITEMS
      && t.every((x) => x && Number.isSafeInteger(x.s) && DETAIL_LEVELS.includes(x.l) && answerOk(x.a) && answerOk(x.c) && x.c !== null)) {
      out = { t: t.map((x) => ({ s: x.s, l: x.l, a: x.a, c: x.c })) };
    }
  }
  return out && JSON.stringify(out).length <= DETAIL_MAX_CHARS ? out : null;
}

/**
 * Prüfungsergebnis serverseitig nachrechnen. Der Client meldet nur Antworten (detail); Aufgaben und Lösungen erzeugt der Server selbst
 * aus Seed, Anzahl und Schwierigkeit. Die Zahl der richtigen Antworten stammt aus dieser Rechnung, nicht aus der Behauptung des Clients.
 * → { correct, total, count, difficulty } oder null (kein/ungültiges detail, oder die mitgeschickten Lösungen passen nicht zu den Aufgaben).
 * Grenze: Wer die Aufgaben selbst erzeugt, kann die richtigen Antworten kennen – Zeit und Zeitstempel bleiben Angaben des Clients.
 */
export function verifyExamEntry(e) {
  const d = e?.detail;
  if (e?.mode !== 'exam' || !Number.isSafeInteger(e.seed) || !d || !Number.isInteger(d.n)) return null;
  let tasks;
  try { tasks = buildExamSet(e.type, e.seed, { count: d.n, difficulty: d.d }); } catch { return null; }
  if (tasks.length !== d.n || tasks.some((t, k) => JSON.stringify(t.answer) !== JSON.stringify(d.c[k]))) return null;
  // gleicher Vergleich wie im Client (app.js: same)
  const same = (a, b) => a !== null && a !== undefined && String(a) === String(b);
  return { correct: tasks.filter((t, k) => same(d.a[k], t.answer)).length, total: d.n, count: d.n, difficulty: d.d };
}

/** Admin nur mit bestätigter E-Mail-Adresse – sonst könnte sich jeder mit der Adresse eines Admins registrieren. */
export const adminAllowed = (user, admins) => Boolean(user?.email) && user.emailVerified === true && admins.has(user.email.toLowerCase());

/* ---------- Eigene Daten exportieren (Konto → Einstellungen) */
export const HISTORY_CSV_HEADER = ['Zeit (UTC)', 'Modus', 'Typ', 'Richtig', 'Gesamt', 'Prozent', 'Sekunden', 'Seed'];

/** Verlauf eines Nutzers als CSV (Excel DE/HU). */
export function historyCsv(entries) {
  return toCsv(HISTORY_CSV_HEADER, entries.map((e) => [utc(e.ts), e.mode === 'exam' ? 'Prüfung' : 'Übung', e.type, e.correct, e.total, percent(e), e.seconds, e.seed]));
}

/** Alle gespeicherten Daten des Nutzers als JSON-Objekt (nur eigene Daten, keine Daten anderer Mitglieder). */
export function accountExport({ user, entries, joined = [], created = [], mail = { notifyTests: false }, now = Date.now() }) {
  const iso = (ms) => (ms == null ? null : new Date(Number(ms)).toISOString());
  return {
    exportedAt: iso(now),
    account: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null },
    settings: { notifyNewTests: Boolean(mail.notifyTests) },
    groups: {
      memberOf: joined.map((g) => ({ id: g.id, name: g.name, joinedAt: iso(g.joinedAt) })),
      ownerOf: created.map((g) => ({ id: g.id, name: g.name, code: g.code, createdAt: iso(g.createdAt), members: g.members })),
    },
    history: entries.map((e) => ({ time: iso(e.ts), mode: e.mode, type: e.type, correct: e.correct, total: e.total, percent: percent(e), seconds: e.seconds ?? null, seed: e.seed ?? null })),
  };
}
