import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, normalizeCode, formatCode, parseAdminEmails, summarize, countExams, trend, csvCell, toCsv } from '../server/stats.js';

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
