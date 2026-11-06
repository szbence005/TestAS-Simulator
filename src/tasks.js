import { createRng } from './rng.js';
import { generateEquation } from './equations.js';
import { generateSquare } from './latin.js';
import { generateFigural } from './figural.js';

export const LEVELS = ['niedrig', 'mittel', 'hoch'];
export const TYPES = {
  figural: { label: 'Figurale Sequenzen', gen: generateFigural },
  gleichungen: { label: 'Mathematische Gleichungen', gen: generateEquation },
  quadrate: { label: 'Lateinische Quadrate', gen: generateSquare },
};

// A vizsgán típusonként 20 feladat van, 25 perc alatt.
export const EXAM = { count: 20, minutes: 25, mix: { niedrig: 6, mittel: 7, hoch: 7 } };

export function generateTask(rng, type, level) {
  return TYPES[type].gen(rng, level);
}

// Gruppentests: Anzahl der Aufgaben und Schwierigkeit sind einstellbar. Standard = Original-Prüfung (20 Aufgaben, 6/7/7 gemischt).
export const GROUP_TEST_LIMITS = { minCount: 1, maxCount: 40 };
export const DIFFICULTIES = ['gemischt', ...LEVELS];

/** Verteilung der Schwierigkeitsstufen. „gemischt“ skaliert die Prüfungsmischung (30 % / 35 % / 35 %); bei 20 Aufgaben genau 6/7/7. */
export function examMix(count = EXAM.count, difficulty = 'gemischt') {
  if (LEVELS.includes(difficulty)) return { niedrig: 0, mittel: 0, hoch: 0, [difficulty]: count };
  if (count === EXAM.count) return { ...EXAM.mix };
  const niedrig = Math.round(count * 0.3);
  const mittel = Math.round(count * 0.35);
  return { niedrig, mittel, hoch: count - niedrig - mittel };
}

export function buildExamSet(type, seed, { count = EXAM.count, difficulty = 'gemischt' } = {}) {
  const rng = createRng(seed);
  const mix = examMix(count, difficulty);
  const levels = rng.shuffle(LEVELS.flatMap((l) => Array(mix[l]).fill(l)));
  return levels.map((level, i) => ({ ...generateTask(rng, type, level), id: `${type[0].toUpperCase()}${String(i + 1).padStart(2, '0')}` }));
}
