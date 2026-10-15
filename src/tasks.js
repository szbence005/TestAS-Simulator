import { createRng } from './rng.js';
import { generateEquation } from './equations.js';
import { generateSquare } from './latin.js';

export const LEVELS = ['niedrig', 'mittel', 'hoch'];
export const TYPES = {
  gleichungen: { label: 'Mathematische Gleichungen', gen: generateEquation },
  quadrate: { label: 'Lateinische Quadrate', gen: generateSquare },
};

// A vizsgán típusonként 20 feladat van, 25 perc alatt.
export const EXAM = { count: 20, minutes: 25, mix: { niedrig: 6, mittel: 7, hoch: 7 } };

export function generateTask(rng, type, level) {
  return TYPES[type].gen(rng, level);
}

export function buildExamSet(type, seed) {
  const rng = createRng(seed);
  const levels = rng.shuffle(LEVELS.flatMap((l) => Array(EXAM.mix[l]).fill(l)));
  return levels.map((level, i) => ({ ...generateTask(rng, type, level), id: `${type[0].toUpperCase()}${String(i + 1).padStart(2, '0')}` }));
}
