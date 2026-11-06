import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, normalizeCode, formatCode, parseAdminEmails, summarize, countExams, trend, csvCell, toCsv, parseTestInput, shapeTest, testResult, completedCount, randomSeed } from '../server/stats.js';

const e = (ts, mode, type, correct, total = 20, seed = null) => ({ ts, mode, type, correct, total, seed });
const MIN = 60_000;

test('Gruppencode: 8 Zeichen ohne verwechselbare Zeichen, Eingabe tolerant', () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^[A-HJKMNP-Z2-9]{8}$/);
  assert.equal(normalizeCode(' ab3d-ef9h '), 'AB3DEF9H');
  assert.equal(formatCode('AB3DEF9H'), 'AB3D-EF9H');
});

test('ADMIN_EMAILS: Komma/Semikolon/Leerzeichen, Groß-/Kleinschreibung egal', () => {
  const s = parseAdminEmails(' Te@Email.hu, other@x.hu;third@y.hu ');
  assert.deepEqual([...s].sort(), ['other@x.hu', 'te@email.hu', 'third@y.hu']);
  assert.equal(parseAdminEmails(undefined).size, 0);
  assert.equal(parseAdminEmails('').size, 0);
});

test('Prüfungen zählen: ein Kernmodul (3 Subtests, gleicher Seed) = eine Prüfung', () => {
  const t = 1_000_000;
  const full = [e(t, 'exam', 'figural', 10, 20, 5), e(t + 20, 'exam', 'gleichungen', 12, 20, 5), e(t + 40, 'exam', 'quadrate', 15, 20, 5)];
  assert.equal(countExams(full), 1);
  assert.equal(countExams([...full, e(t + 60 * MIN, 'exam', 'figural', 15, 20, 5)]), 2); // gleicher Seed, aber Stunden später
  assert.equal(countExams([...full, e(t + 100, 'exam', 'figural', 15, 20, 9)]), 2);       // anderer Seed
  assert.equal(countExams([e(t, 'practice', 'figural', 3, 5)]), 0);
});

test('Zusammenfassung: Prüfungs-Ø je Subtest, Übungs-Ø gewichtet, letzte Aktivität', () => {
  const s = summarize([
    e(1000, 'exam', 'figural', 10, 20, 1), e(2000, 'exam', 'figural', 20, 20, 2),
    e(3000, 'practice', 'quadrate', 1, 4), e(4000, 'practice', 'quadrate', 3, 4),
  ]);
  assert.equal(s.exam.figural, 75);
  assert.equal(s.exam.gleichungen, null);
  assert.equal(s.practice.quadrate, 50); // 4 von 8, nicht der Mittelwert der Sitzungsquoten
  assert.equal(s.practices, 2);
  assert.equal(s.exams, 2);
  assert.equal(s.last, 4000);
  assert.equal(summarize([]).last, null);
});

test('Trend: erst ab 4 Ergebnissen, Schwelle ±3 Prozentpunkte', () => {
  const mk = (...c) => c.map((x, i) => e(i * 1000, 'exam', 'figural', x, 20, i * 10_000));
  assert.equal(trend(mk(10, 12, 14)), null);
  assert.deepEqual(trend(mk(8, 8, 14, 14)), { delta: 30, dir: 'up' });
  assert.deepEqual(trend(mk(14, 14, 8, 8)), { delta: -30, dir: 'down' });
  assert.equal(trend(mk(10, 10, 10, 10)).dir, 'flat');
  assert.equal(trend(mk(10, 10, 10, 11)).dir, 'flat'); // +2,5 Punkte
});

test('CSV: Semikolon, Dezimalkomma, BOM, Formel-Injection entschärft', () => {
  assert.equal(csvCell(72.5), '72,5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+49 123'), "'+49 123");
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell('Müller'), 'Müller');
  const out = toCsv(['A', 'B'], [['x', 1.5]]);
  assert.ok(out.startsWith('\uFEFFA;B\r\n'));
  assert.ok(out.endsWith('x;1,5\r\n'));
});

/* ---------- Gruppentests */
const NOW = 1_800_000_000_000;
const HOUR = 60 * MIN;
const T = { id: 't1', title: 'Probe', kind: 'all', minutes: 25, seed: 4711, startsAt: NOW };
const ex = (user_id, ts, type, correct, total = 20, seed = 4711, seconds = 600) => ({ user_id, ts, mode: 'exam', type, correct, total, seed, seconds });

test('Gruppentest planen: Eingaben prüfen, Titel kürzen, Zeitfenster begrenzen', () => {
  const ok = parseTestInput({ title: '  Probe 1  ', kind: 'figural', minutes: '30', startsAt: NOW + HOUR }, NOW, 99);
  assert.deepEqual(ok.test, { title: 'Probe 1', kind: 'figural', minutes: 30, startsAt: NOW + HOUR, seed: 99 });
  assert.equal(parseTestInput({ title: 'x'.repeat(200), kind: 'all', minutes: 25, startsAt: NOW }, NOW).test.title.length, 80);
  const bad = (patch) => parseTestInput({ title: 'T', kind: 'all', minutes: 25, startsAt: NOW, ...patch }, NOW).error;
  assert.equal(bad({ title: '   ' }), 'invalid_test');
  assert.equal(bad({ kind: 'alles' }), 'invalid_test');
  assert.equal(bad({ minutes: 0 }), 'invalid_test');
  assert.equal(bad({ minutes: 121 }), 'invalid_test');
  assert.equal(bad({ minutes: 12.5 }), 'invalid_test');
  assert.equal(bad({ startsAt: 'bald' }), 'invalid_test');
  assert.equal(bad({ startsAt: undefined }), 'invalid_test');
  assert.equal(bad({ startsAt: NOW - 2 * 24 * HOUR }), 'invalid_time'); // zu weit zurück
  assert.equal(bad({ startsAt: NOW + 800 * 24 * HOUR }), 'invalid_time'); // zu weit voraus
  assert.equal(bad({ startsAt: NOW - HOUR }), undefined); // "jetzt" (Minutenauflösung) ist erlaubt
  for (let i = 0; i < 100; i++) { const seed = randomSeed(); assert.ok(Number.isInteger(seed) && seed >= 1 && seed < 1e9); }
});

test('Gruppentest: Seed erst ab der Startzeit sichtbar – außer für die Gruppenleitung', () => {
  const before = NOW - 1;
  assert.equal(shapeTest(T, { now: before }).seed, undefined);
  assert.equal(shapeTest(T, { now: before }).released, false);
  assert.equal(shapeTest(T, { owner: true, now: before }).seed, 4711);
  assert.equal(shapeTest(T, { now: NOW }).seed, 4711); // genau zur Startzeit freigegeben
  assert.equal(shapeTest(T, { now: NOW }).released, true);
  assert.equal(JSON.stringify(shapeTest(T, { now: before })).includes('4711'), false);
});

test('Gruppentest auswerten: erster Versuch je Subtest, nur passender Seed, nur nach Start, nur Prüfungen', () => {
  const r = testResult(T, [
    ex('u', NOW - 5000, 'figural', 20),               // vor der Startzeit → zählt nicht
    ex('u', NOW + 1000, 'figural', 10),               // erster gültiger Versuch
    ex('u', NOW + 9000, 'figural', 20),               // zweiter Versuch → zählt nicht
    ex('u', NOW + 2000, 'gleichungen', 15, 20, 4711, 300),
    ex('u', NOW + 3000, 'quadrate', 20, 20, 999),     // anderer Seed
    { ...ex('u', NOW + 4000, 'quadrate', 20), mode: 'practice' },
  ]);
  assert.equal(r.done, 2);
  assert.equal(r.expected, 3);
  assert.equal(r.complete, false);
  assert.deepEqual([r.correct, r.total, r.percent, r.seconds], [25, 40, 62.5, 900]);
  const all = testResult(T, [...[ex('u', NOW + 1, 'figural', 10), ex('u', NOW + 2, 'gleichungen', 10), ex('u', NOW + 3, 'quadrate', 10)]]);
  assert.equal(all.complete, true);
  assert.equal(testResult({ ...T, kind: 'quadrate' }, [ex('u', NOW + 3, 'quadrate', 10)]).complete, true); // Einzel-Subtest
  assert.deepEqual(testResult(T, []), { parts: {}, done: 0, expected: 3, complete: false, correct: 0, total: 0, seconds: 0, percent: null });
  assert.equal(testResult(T, [{ ...ex('u', NOW + 1, 'figural', 10), seed: '4711' }]).done, 1); // Postgres/SQLite liefern evtl. Strings
});

test('Gruppentest: abgeschlossen zählt nur, wer alle Subtests des Tests gemacht hat', () => {
  const rows = [
    ex('a', NOW + 1, 'figural', 1), ex('a', NOW + 2, 'gleichungen', 1), ex('a', NOW + 3, 'quadrate', 1),
    ex('b', NOW + 1, 'figural', 1), ex('b', NOW + 2, 'gleichungen', 1),
  ];
  assert.equal(completedCount(T, rows), 1);
  assert.equal(completedCount({ ...T, kind: 'figural' }, rows), 2);
  assert.equal(completedCount(T, []), 0);
});
