// Figurale Sequenzen: 4x4-es mátrixok sorozata. Az első 4 mátrix adott, az 5. és 6. hiányzik;
// mindegyikhez 3 válaszlehetőség van. A figurák szabály szerint mozognak, forognak és/vagy színt váltanak.
//
// A generátor garantálja, hogy a szabályok a 4 látható mátrixból egyértelműen kikövetkeztethetők:
// a `ambiguous()` az összes, a látott képekkel összeegyeztethető szabályt végigpróbálja, és csak akkor
// fogad el egy feladatot, ha mind ugyanazt jósolja az 5. és 6. mátrixra.
export const SIZE = 4;
export const FRAMES = 6; // 4 adott + 2 keresett

export const SHAPES = {
  square: { de: 'Quadrat', art: 'Das', rotates: false },
  hexagon: { de: 'Sechseck', art: 'Das', rotates: false },
  triangle: { de: 'Dreieck', art: 'Das', rotates: true },
  trapezoid: { de: 'Trapez', art: 'Das', rotates: true },
  corner: { de: 'Winkel', art: 'Der', rotates: true },
  moon: { de: 'Halbkreis', art: 'Der', rotates: true },
};
export const COLORS = {
  white: { de: 'Weiß', hex: '#ffffff' },
  pink: { de: 'Rosa', hex: '#d97bb6' },
  yellow: { de: 'Gelb', hex: '#f2d63a' },
  green: { de: 'Grün', hex: '#1aa57a' },
  orange: { de: 'Orange', hex: '#f08a24' },
  black: { de: 'Schwarz', hex: '#2a2a2e' },
  blue: { de: 'Blau', hex: '#1f6fb2' },
};
const SHAPE_KEYS = Object.keys(SHAPES);
const COLOR_KEYS = Object.keys(COLORS);

const RING = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0]]; // órajárás szerint
const ringIndex = (r, c) => RING.findIndex(([a, b]) => a === r && b === c);
const mod = (a, n) => ((a % n) + n) % n;
const inGrid = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const cum = (t, grow) => (grow ? (t * (t + 1)) / 2 : t); // x+1 szabály: 0,1,3,6,10,15

/* ------------------------------------------------------------------ pozíciószabályok */
// 1D pálya (sor, oszlop vagy átló) lepattanással a végeken
function trackPos(rule, t) {
  const L = rule.cells.length;
  if (L === 1) return rule.cells[0];
  const P = 2 * (L - 1);
  const m = mod(rule.i0 + rule.dir * rule.step * t, P);
  return rule.cells[m <= L - 1 ? m : P - m];
}

export function posAt(rule, t) {
  switch (rule.k) {
    case 'static': return rule.at;
    case 'track': return trackPos(rule, t);
    case 'ring': return RING[mod(rule.i0 + rule.dir * (rule.grow ? cum(t, true) : rule.step * t), 12)];
    case 'block': return rule.cells[mod(rule.i0 + rule.dir * t, 4)];
    default: throw new Error(`ismeretlen szabály: ${rule.k}`);
  }
}

function diagTrack(r, c, dr, dc) {
  let a = r, b = c;
  while (inGrid(a - dr, b - dc)) { a -= dr; b -= dc; }
  const cells = [];
  while (inGrid(a, b)) { cells.push([a, b]); a += dr; b += dc; }
  return cells;
}
const rowTrack = (r) => Array.from({ length: SIZE }, (_, c) => [r, c]);
const colTrack = (c) => Array.from({ length: SIZE }, (_, r) => [r, c]);
const idxIn = (cells, r, c) => cells.findIndex(([a, b]) => a === r && b === c);

// 2x2-es blokk celláinak órajárás szerinti sorrendje (bal felső sarok: r0,c0)
const blockCells = (r0, c0) => [[r0, c0], [r0, c0 + 1], [r0 + 1, c0 + 1], [r0 + 1, c0]];

// Az összes pozíciószabály, amit egy megoldó a (r,c) kezdőmezőből számításba vehet.
function positionCandidates(r, c) {
  const out = [{ k: 'static', at: [r, c] }];
  const tracks = [rowTrack(r), colTrack(c), diagTrack(r, c, 1, 1), diagTrack(r, c, 1, -1)].filter((x) => x.length >= 2);
  for (const cells of tracks) {
    for (const dir of [1, -1]) for (const step of [1, 2]) out.push({ k: 'track', cells, i0: idxIn(cells, r, c), dir, step });
  }
  const ri = ringIndex(r, c);
  if (ri >= 0) {
    for (const dir of [1, -1]) {
      for (const step of [1, 2, 3]) out.push({ k: 'ring', i0: ri, dir, step, grow: false });
      out.push({ k: 'ring', i0: ri, dir, step: 1, grow: true });
    }
  }
  for (let r0 = Math.max(0, r - 1); r0 <= Math.min(SIZE - 2, r); r0++) {
    for (let c0 = Math.max(0, c - 1); c0 <= Math.min(SIZE - 2, c); c0++) {
      const cells = blockCells(r0, c0);
      for (const dir of [1, -1]) out.push({ k: 'block', cells, i0: idxIn(cells, r, c), dir });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ forgatás- és színszabályok */
const rotAt = (rule, t) => mod(rule.r0 + rule.q * cum(t, rule.grow), 4); // negyedfordulatok (óramutató szerint)
const colorAt = (rule, t) => rule.cycle[t % rule.cycle.length];

function rotationCandidates(r0) {
  const out = [];
  for (const q of [0, 1, 2, 3]) for (const grow of q === 0 ? [false] : [false, true]) out.push({ r0, q, grow });
  return out;
}
function colorCandidates(obs) {
  const out = [];
  for (const L of [1, 2, 3]) {
    const cycle = obs.slice(0, L);
    if (obs.every((v, t) => v === cycle[t % L])) out.push({ cycle });
  }
  return out;
}

/* ------------------------------------------------------------------ egyértelműség */
// Igaz, ha a figura (a 4 látott állapota alapján) az 5. és 6. mátrixban nem határozható meg egyértelműen.
function figureAmbiguous(fig) {
  const observed = (f) => Array.from({ length: 4 }, (_, t) => f(t));
  const preds = new Set();
  const pos = observed((t) => posAt(fig.pos, t));
  for (const cand of positionCandidates(...pos[0])) {
    if (pos.every((p, t) => { const q = posAt(cand, t); return q[0] === p[0] && q[1] === p[1]; })) {
      preds.add(`p${posAt(cand, 4)}|${posAt(cand, 5)}`);
    }
  }
  if (preds.size > 1) return true;
  if (SHAPES[fig.shape].rotates) {
    const rots = observed((t) => rotAt(fig.rot, t));
    const rp = new Set();
    for (const cand of rotationCandidates(rots[0])) {
      if (rots.every((v, t) => rotAt(cand, t) === v)) rp.add(`${rotAt(cand, 4)}|${rotAt(cand, 5)}`);
    }
    if (rp.size > 1) return true;
  }
  const cols = observed((t) => colorAt(fig.color, t));
  const cp = new Set();
  for (const cand of colorCandidates(cols)) cp.add(`${colorAt(cand, 4)}|${colorAt(cand, 5)}`);
  return cp.size > 1;
}
export const ambiguous = (figures) => figures.some(figureAmbiguous);

/* ------------------------------------------------------------------ generálás */
const CONFIG = {
  niedrig: { figs: [1, 2], pos: ['track', 'track', 'diag', 'block', 'ring1'], rotP: 0, colP: 0, extras: 0, grow: false },
  mittel: { figs: [2, 3], pos: ['track', 'diag', 'block', 'ring1', 'ring2'], rotP: 0.45, colP: 0.45, extras: 2, grow: false },
  hoch: { figs: [3, 4], pos: ['track', 'track2', 'diag', 'block', 'ring1', 'ring2', 'ringGrow'], rotP: 0.6, colP: 0.6, extras: 3, grow: true },
};

function randomPosRule(rng, kind) {
  const dir = rng.pick([1, -1]);
  switch (kind) {
    case 'track': case 'track2': {
      const horizontal = rng.pick([true, false]);
      const line = rng.int(0, SIZE - 1);
      const cells = horizontal ? rowTrack(line) : colTrack(line);
      return { k: 'track', cells, i0: rng.int(0, SIZE - 1), dir, step: kind === 'track2' ? 2 : 1 };
    }
    case 'diag': {
      const cells = rng.pick([diagTrack(rng.int(0, 3), rng.int(0, 3), 1, 1), diagTrack(rng.int(0, 3), rng.int(0, 3), 1, -1)]);
      if (cells.length < 3) return null;
      return { k: 'track', cells, i0: rng.int(0, cells.length - 1), dir, step: 1 };
    }
    case 'block': {
      const cells = blockCells(rng.int(0, SIZE - 2), rng.int(0, SIZE - 2));
      return { k: 'block', cells, i0: rng.int(0, 3), dir };
    }
    case 'ring1': return { k: 'ring', i0: rng.int(0, 11), dir, step: 1, grow: false };
    case 'ring2': return { k: 'ring', i0: rng.int(0, 11), dir, step: 2, grow: false };
    case 'ringGrow': return { k: 'ring', i0: rng.int(0, 11), dir, step: 1, grow: true };
    default: return null;
  }
}

function randomFigures(rng, level) {
  const cfg = CONFIG[level];
  const n = rng.int(cfg.figs[0], cfg.figs[1]);
  const shapes = rng.sample(SHAPE_KEYS, n);
  const figs = [];
  let extrasLeft = cfg.extras;
  let grewOnce = false;
  for (let i = 0; i < n; i++) {
    const shape = shapes[i];
    const rotates = SHAPES[shape].rotates;
    let kind = rng.pick(cfg.pos);
    if (cfg.grow && !grewOnce && i === n - 1) kind = 'ringGrow';
    const pos = randomPosRule(rng, kind);
    if (!pos) return null;
    if (pos.grow) grewOnce = true;
    let rot = { r0: rotates ? rng.int(0, 3) : 0, q: 0, grow: false };
    let color = { cycle: [rng.pick(COLOR_KEYS)] };
    if (extrasLeft > 0) {
      if (rotates && rng.next() < cfg.rotP) {
        rot = { r0: rot.r0, q: rng.pick([1, 3]), grow: cfg.grow && rng.next() < 0.5 };
        if (rot.grow) grewOnce = true;
        extrasLeft--;
      }
      if (extrasLeft > 0 && rng.next() < cfg.colP) {
        color = { cycle: rng.sample(COLOR_KEYS, rng.pick([2, 3])) };
        extrasLeft--;
      }
    }
    figs.push({ shape, pos, rot, color });
  }
  return figs;
}

const frameOf = (figs, t) => figs.map((f) => {
  const [row, col] = posAt(f.pos, t);
  return { shape: f.shape, row, col, rot: rotAt(f.rot, t), color: colorAt(f.color, t) };
});
const hasOverlap = (frame) => new Set(frame.map((f) => `${f.row},${f.col}`)).size < frame.length;
const key = (frame) => frame.map((f) => `${f.shape}${f.row}${f.col}${f.rot}${f.color}`).join('|');

// Egy rossz válaszlehetőség: a helyes mátrixból 1 (néha 2) figura állapotát elrontjuk, a szabály "hihető" hibájával.
function distractor(rng, figs, t, correct, level) {
  for (let tries = 0; tries < 60; tries++) {
    const frame = correct.map((f) => ({ ...f }));
    const edits = level === 'niedrig' ? 1 : rng.pick([1, 1, 2]);
    for (let e = 0; e < edits; e++) {
      const i = rng.int(0, figs.length - 1);
      const f = figs[i];
      const kinds = ['pos'];
      if (SHAPES[f.shape].rotates && (f.rot.q !== 0 || level !== 'niedrig')) kinds.push('rot');
      if (f.color.cycle.length > 1 || level !== 'niedrig') kinds.push('color');
      const kind = rng.pick(kinds);
      if (kind === 'pos') {
        // a figura útvonalának másik lépése, vagy egy szomszédos mező
        const alt = [posAt(f.pos, t - 1), posAt(f.pos, t + 1), posAt(f.pos, t - 2), posAt(f.pos, t + 2)];
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [frame[i].row + a, frame[i].col + b]).filter(([a, b]) => inGrid(a, b));
        const [row, col] = rng.pick([...alt, ...alt, ...nb]);
        frame[i].row = row; frame[i].col = col;
      } else if (kind === 'rot') {
        frame[i].rot = mod(frame[i].rot + rng.pick([1, 2, 3]), 4);
      } else {
        const pool = f.color.cycle.length > 1 ? f.color.cycle : COLOR_KEYS;
        frame[i].color = rng.pick(pool.filter((c) => c !== correct[i].color));
      }
    }
    if (!hasOverlap(frame) && key(frame) !== key(correct)) return frame;
  }
  return null;
}

/* ------------------------------------------------------------------ magyarázat (németül) */
const DIRS = { '0,1': 'rechts', '0,-1': 'links', '1,0': 'unten', '-1,0': 'oben' };
function moveWord(f) {
  const [r0, c0] = posAt(f.pos, 0), [r1, c1] = posAt(f.pos, 1);
  const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
  if (dr && dc) return `diagonal nach ${dc > 0 ? 'rechts' : 'links'} ${dr > 0 ? 'unten' : 'oben'}`;
  return DIRS[`${dr},${dc}`];
}
function describe(f) {
  const { art, de } = SHAPES[f.shape];
  const pron = art === 'Der' ? 'Er' : 'Es';
  const sentences = [];
  const p = f.pos;
  if (p.k === 'track') {
    const diag = p.cells[0][0] !== p.cells[1][0] && p.cells[0][1] !== p.cells[1][1];
    const where = diag ? '' : (p.cells[0][0] === p.cells[1][0] ? ` in Zeile ${p.cells[0][0] + 1}` : ` in Spalte ${p.cells[0][1] + 1}`);
    const step = p.step === 1 ? 'ein Feld' : 'zwei Felder';
    sentences.push(`bewegt sich${where} ${moveWord(f)} immer um ${step} weiter und prallt an der Begrenzung ab (danach läuft es auf demselben Weg zurück).`);
  } else if (p.k === 'ring') {
    const cw = p.dir === 1 ? 'im Uhrzeigersinn' : 'gegen den Uhrzeigersinn';
    sentences.push(p.grow
      ? `bewegt sich entlang der äußeren Grenzen ${cw} um x + 1 Felder weiter (ein Feld, dann zwei, dann drei usw.).`
      : `bewegt sich entlang der äußeren Grenzen ${cw} immer um ${p.step === 1 ? 'ein Feld' : p.step === 2 ? 'zwei Felder' : 'drei Felder'} weiter.`);
  } else if (p.k === 'block') {
    sentences.push(`bewegt sich in einem 2×2-Block ${p.dir === 1 ? 'im Uhrzeigersinn' : 'gegen den Uhrzeigersinn'} immer um ein Feld weiter.`);
  }
  if (f.rot.q !== 0) {
    const way = f.rot.q === 1 ? 'rechts' : 'links';
    sentences.push(`${pron} ` + (f.rot.grow
      ? `dreht sich x + 1 Mal um 90 Grad nach ${way} (einmal, dann zweimal, dann dreimal usw.).`
      : `dreht sich von Bild zu Bild um 90 Grad nach ${way}.`));
  }
  if (f.color.cycle.length > 1) sentences.push(`${pron} wechselt seine Farbe: ${f.color.cycle.map((c) => COLORS[c].de).join(' → ')} → usw.`);
  return `${art} ${de} ${sentences[0]}${sentences.slice(1).map((x) => ' ' + x).join('')}`;
}

export function generateFigural(rng, level) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const figs = randomFigures(rng, level);
    if (!figs) continue;
    const frames = Array.from({ length: FRAMES }, (_, t) => frameOf(figs, t));
    if (frames.some(hasOverlap)) continue;
    if (ambiguous(figs)) continue;
    const options = [], answer = [];
    let ok = true;
    for (const t of [4, 5]) {
      const correct = frames[t];
      const wrong = [];
      for (let k = 0; k < 2 && ok; k++) {
        let d = null;
        for (let tries = 0; tries < 30; tries++) {
          d = distractor(rng, figs, t, correct, level);
          if (d && !wrong.some((w) => key(w) === key(d))) break;
          d = null;
        }
        if (d) wrong.push(d); else ok = false;
      }
      if (!ok) break;
      const correctIndex = rng.int(0, 2);
      const opts = [...wrong];
      opts.splice(correctIndex, 0, correct);
      options.push(opts);
      answer.push(correctIndex + 1);
    }
    if (!ok) continue;
    return {
      type: 'figural',
      level,
      frames: frames.slice(0, 4),
      options,
      answer,
      explanation: figs.map(describe),
      truth: [frames[4], frames[5]],
      rules: figs,
    };
  }
  throw new Error('Figurale Sequenz konnte nicht erzeugt werden');
}

// Tesztekhez: a teljes (6 mátrixos) igazság, a feladat újraszámításához nem kell, de a generátor ellenőrzéséhez hasznos.
export const _internal = { frameOf, hasOverlap, key };
