// Reine Hilfsfunktionen (ohne Datenbank, gut testbar): Gruppencodes, Admin-Liste, Statistik, CSV.
import { randomInt } from 'node:crypto';

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
