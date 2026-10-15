// Kis, seedelhető véletlenszám-generátor (mulberry32), hogy a feladatsorok reprodukálhatók legyenek.
export function createRng(seed = Date.now()) {
  let a = (Number(seed) >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)); // mindkét határ benne van
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const shuffle = (arr) => {
    const r = arr.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  };
  const sample = (arr, k) => shuffle(arr).slice(0, k);
  return { next, int, pick, shuffle, sample };
}
