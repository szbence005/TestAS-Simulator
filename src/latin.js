// Lateinische Quadrate: 5x5-ös rács, A–E betűk, a "?" mező logikai következtetéssel meghatározható.
export const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Cél: mennyire legyen "üres" a rács és hány következtetési kör kell a "?" mezőhöz.
const SPEC = {
  niedrig: { maxGiven: 12, ok: (d) => d === 1, done: (d) => d === 1 },
  mittel: { maxGiven: 10, ok: (d) => d <= 2, done: (d) => d === 2 },
  hoch: { maxGiven: 9, ok: () => true, done: (d) => d >= 3 },
};

function randomLatin(rng) {
  const g = Array.from({ length: 5 }, () => Array(5).fill(null));
  const solve = (pos) => {
    if (pos === 25) return true;
    const r = Math.floor(pos / 5), c = pos % 5;
    for (const v of rng.shuffle([0, 1, 2, 3, 4])) {
      let clash = false;
      for (let j = 0; j < c; j++) if (g[r][j] === v) clash = true;
      for (let i = 0; i < r; i++) if (g[i][c] === v) clash = true;
      if (clash) continue;
      g[r][c] = v;
      if (solve(pos + 1)) return true;
      g[r][c] = null;
    }
    return false;
  };
  solve(0);
  return g;
}

// Hány következtetési körben (egyetlen lehetséges betű / egyetlen lehetséges hely) válik ismertté a q mező?
export function deductionDepth(grid, q) {
  const g = grid.map((r) => r.slice());
  for (let d = 1; d < 15; d++) {
    const cand = new Map();
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      if (g[r][c] !== null) continue;
      const used = new Set();
      for (let j = 0; j < 5; j++) { if (g[r][j] !== null) used.add(g[r][j]); if (g[j][c] !== null) used.add(g[j][c]); }
      cand.set(r * 5 + c, new Set([0, 1, 2, 3, 4].filter((v) => !used.has(v))));
    }
    const fills = new Map();
    for (const [cell, cs] of cand) if (cs.size === 1) fills.set(cell, [...cs][0]);
    for (let r = 0; r < 5; r++) for (let v = 0; v < 5; v++) {
      if (g[r].includes(v)) continue;
      const cells = [0, 1, 2, 3, 4].map((c) => r * 5 + c).filter((k) => cand.has(k) && cand.get(k).has(v));
      if (cells.length === 1) fills.set(cells[0], v);
    }
    for (let c = 0; c < 5; c++) for (let v = 0; v < 5; v++) {
      if (g.some((row) => row[c] === v)) continue;
      const cells = [0, 1, 2, 3, 4].map((r) => r * 5 + c).filter((k) => cand.has(k) && cand.get(k).has(v));
      if (cells.length === 1) fills.set(cells[0], v);
    }
    const qk = q[0] * 5 + q[1];
    if (fills.has(qk)) return d;
    if (!fills.size) return null;
    for (const [k, v] of fills) g[Math.floor(k / 5)][k % 5] = v;
  }
  return null;
}

export function generateSquare(rng, level) {
  const base = SPEC[level];
  for (let relax = 0; relax < 6; relax++) {
    const maxGiven = base.maxGiven + relax;
    for (let tries = 0; tries < 120; tries++) {
      const full = randomLatin(rng);
      const q = [rng.int(0, 4), rng.int(0, 4)];
      const grid = full.map((r) => r.slice());
      grid[q[0]][q[1]] = null;
      let given = 24;
      const order = rng.shuffle(Array.from({ length: 25 }, (_, i) => i).filter((i) => i !== q[0] * 5 + q[1]));
      for (const cell of order) {
        const r = Math.floor(cell / 5), c = cell % 5;
        const old = grid[r][c];
        grid[r][c] = null;
        const d = deductionDepth(grid, q);
        if (d === null || !base.ok(d)) { grid[r][c] = old; continue; }
        given--;
        if (given <= maxGiven && base.done(d)) {
          const L = (v) => (v === null ? null : LETTERS[v]);
          return {
            type: 'quadrate',
            level,
            grid: grid.map((row) => row.map(L)),
            question: q,
            answer: LETTERS[full[q[0]][q[1]]],
            steps: d,
            solution: full.map((row) => row.map(L)),
          };
        }
      }
    }
  }
  throw new Error('Lateinisches Quadrat konnte nicht erzeugt werden');
}
