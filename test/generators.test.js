import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { generateEquation, countSolutions, NAMES } from '../src/equations.js';
import { generateSquare, LETTERS, deductionDepth } from '../src/latin.js';
import { buildExamSet, LEVELS, EXAM } from '../src/tasks.js';

test('Gleichungen: pontosan egy megoldás, és az a tárolt megoldás', () => {
  const rng = createRng(1);
  for (const level of LEVELS) {
    for (let i = 0; i < 8; i++) {
      const t = generateEquation(rng, level);
      const n = Object.keys(t.solution).length;
      const sols = countSolutions(t.equations, n);
      assert.equal(sols.length, 1, t.equations.join(' | '));
      assert.deepEqual(Object.fromEntries(sols[0].map((v, k) => [NAMES[k], v])), t.solution);
      assert.equal(t.solution[t.question], t.answer);
      assert.ok(Object.values(t.solution).every((v) => v >= 1 && v <= 20));
    }
  }
});

test('Quadrate: érvényes latin négyzet, a megadott mezők egyeznek, a válasz levezethető', () => {
  const rng = createRng(2);
  for (const level of LEVELS) {
    for (let i = 0; i < 8; i++) {
      const t = generateSquare(rng, level);
      for (let k = 0; k < 5; k++) {
        assert.deepEqual([...t.solution[k]].sort(), LETTERS);
        assert.deepEqual(t.solution.map((r) => r[k]).sort(), LETTERS);
      }
      t.grid.forEach((row, r) => row.forEach((v, c) => {
        if (v !== null) assert.equal(v, t.solution[r][c]);
      }));
      const [qr, qc] = t.question;
      assert.equal(t.grid[qr][qc], null);
      assert.equal(t.solution[qr][qc], t.answer);
      // a következtetés (egyetlen lehetséges betű/hely) tényleg eljut a kérdéses mezőig
      const idx = (g) => g.map((r) => r.map((v) => (v === null ? null : LETTERS.indexOf(v))));
      assert.equal(deductionDepth(idx(t.grid), t.question), t.steps);
      if (level === 'niedrig') assert.equal(t.steps, 1);
      if (level === 'mittel') assert.equal(t.steps, 2);
      if (level === 'hoch') assert.ok(t.steps >= 3);
    }
  }
});

test('Vizsgasor: 20 feladat, helyes nehézségi eloszlás, azonos seed → azonos sor', () => {
  for (const type of ['gleichungen', 'quadrate']) {
    const a = buildExamSet(type, 42);
    const b = buildExamSet(type, 42);
    assert.equal(a.length, EXAM.count);
    assert.deepEqual(a, b);
    for (const l of LEVELS) assert.equal(a.filter((t) => t.level === l).length, EXAM.mix[l]);
  }
});
