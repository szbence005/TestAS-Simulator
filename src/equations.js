// Mathematische Gleichungen: egyenletrendszer-generátor.
// Minden betű értéke 1..20; a rendszernek pontosan egy megoldása van (a generátor ezt kimerítő szűréssel biztosítja).
export const NAMES = ['A', 'B', 'C', 'D'];
const MAX = 20;

const UNKNOWNS = { niedrig: 2, mittel: 3, hoch: 4 };
const SOLUTION_MAX = { niedrig: 12, mittel: 15, hoch: 20 };
const KINDS = {
  niedrig: ['add_c', 'sub_c', 'mul_k', 'div_k', 'sum_c', 'diff_c', 'direct'],
  mittel: ['mul_k', 'div_k', 'sum_c', 'diff_c', 'lin2', 'sum3', 'prod', 'sum3c', 'add_c'],
  hoch: ['lin2', 'mix3', 'mulsub', 'muladd', 'mul_k', 'div_k', 'sum3', 'prod', 'sum3c'],
};

const spaceCache = {};
function space(n) {
  if (spaceCache[n]) return spaceCache[n];
  let out = [[]];
  for (let i = 0; i < n; i++) {
    const next = [];
    for (const p of out) for (let v = 1; v <= MAX; v++) next.push([...p, v]);
    out = next;
  }
  return (spaceCache[n] = out);
}

// Egy egyenlet-jelölt a megoldás alapján: { text, test(tuple) } vagy null, ha nem használható.
function build(rng, kind, sol, n) {
  const idx = [...Array(n).keys()];
  const N = NAMES;
  switch (kind) {
    case 'add_c': case 'sub_c': {
      const [x, y] = rng.sample(idx, 2);
      const c = sol[y] - sol[x];
      if (c < 1) return null;
      return kind === 'add_c'
        ? { text: `${N[x]} + ${c} = ${N[y]}`, test: (t) => t[x] + c === t[y] }
        : { text: `${N[y]} – ${c} = ${N[x]}`, test: (t) => t[y] - c === t[x] };
    }
    case 'mul_k': case 'div_k': {
      const [x, y] = rng.sample(idx, 2);
      if (sol[y] % sol[x]) return null;
      const k = sol[y] / sol[x];
      if (k < 2 || k > 10) return null;
      return kind === 'mul_k'
        ? { text: `${k} × ${N[x]} = ${N[y]}`, test: (t) => k * t[x] === t[y] }
        : { text: `${N[y]} ÷ ${k} = ${N[x]}`, test: (t) => t[y] === k * t[x] };
    }
    case 'sum_c': {
      const [x, y] = rng.sample(idx, 2);
      const c = sol[x] + sol[y];
      return { text: `${N[x]} + ${N[y]} = ${c}`, test: (t) => t[x] + t[y] === c };
    }
    case 'diff_c': {
      const [x, y] = rng.sample(idx, 2);
      const c = sol[y] - sol[x];
      if (c < 1) return null;
      return { text: `${N[y]} – ${N[x]} = ${c}`, test: (t) => t[y] - t[x] === c };
    }
    case 'direct': {
      const x = rng.pick(idx);
      const c = sol[x];
      return { text: `${N[x]} = ${c}`, test: (t) => t[x] === c };
    }
    case 'lin2': {
      const [x, y] = rng.sample(idx, 2);
      const k = rng.int(2, 4), m = rng.int(2, 4);
      const c = k * sol[x] + m * sol[y];
      return { text: `${k} × ${N[x]} + ${m} × ${N[y]} = ${c}`, test: (t) => k * t[x] + m * t[y] === c };
    }
    case 'sum3': {
      if (n < 3) return null;
      const [x, y, z] = rng.sample(idx, 3);
      if (sol[x] + sol[y] !== sol[z]) return null;
      return { text: `${N[x]} + ${N[y]} = ${N[z]}`, test: (t) => t[x] + t[y] === t[z] };
    }
    case 'prod': {
      if (n < 3) return null;
      const [x, y, z] = rng.sample(idx, 3);
      if (sol[x] * sol[y] !== sol[z]) return null;
      return { text: `${N[x]} × ${N[y]} = ${N[z]}`, test: (t) => t[x] * t[y] === t[z] };
    }
    case 'sum3c': {
      if (n < 3) return null;
      const [x, y, z] = rng.sample(idx, 3);
      const c = sol[x] + sol[y] + sol[z];
      return { text: `${N[x]} + ${N[y]} + ${N[z]} = ${c}`, test: (t) => t[x] + t[y] + t[z] === c };
    }
    case 'mix3': {
      if (n < 3) return null;
      const [x, y, z] = rng.sample(idx, 3);
      const c = sol[x] + sol[y] - sol[z];
      if (c < 1) return null;
      return { text: `${N[x]} + ${N[y]} – ${N[z]} = ${c}`, test: (t) => t[x] + t[y] - t[z] === c };
    }
    case 'mulsub': {
      const [x, y] = rng.sample(idx, 2);
      const k = rng.int(2, 5);
      const c = k * sol[x] - sol[y];
      if (c < 1 || c > 12) return null;
      return { text: `${k} × ${N[x]} – ${c} = ${N[y]}`, test: (t) => k * t[x] - c === t[y] };
    }
    case 'muladd': {
      const [x, y] = rng.sample(idx, 2);
      const k = rng.int(2, 5);
      const c = sol[y] - k * sol[x];
      if (c < 1 || c > 12) return null;
      return { text: `${k} × ${N[x]} + ${c} = ${N[y]}`, test: (t) => k * t[x] + c === t[y] };
    }
    default: return null;
  }
}

function candidate(rng, sol, n, level) {
  for (let i = 0; i < 200; i++) {
    const c = build(rng, rng.pick(KINDS[level]), sol, n);
    if (c) return c;
  }
  return null;
}

export function generateEquation(rng, level) {
  const n = UNKNOWNS[level];
  const all = space(n);
  for (let attempt = 0; attempt < 400; attempt++) {
    const sol = Array.from({ length: n }, () => rng.int(1, SOLUTION_MAX[level]));
    let surv = all;
    const eqs = [];
    while (surv.length > 1 && eqs.length < n) {
      let best = null;
      for (let k = 0; k < 6; k++) {
        const c = candidate(rng, sol, n, level);
        if (!c) continue;
        const f = surv.filter(c.test);
        if (f.length < surv.length && (!best || f.length < best.f.length)) best = { c, f };
      }
      if (!best) break;
      eqs.push(best.c);
      surv = best.f;
    }
    if (surv.length === 1 && surv[0].every((v, i) => v === sol[i])) {
      const q = rng.int(0, n - 1);
      return {
        type: 'gleichungen',
        level,
        equations: rng.shuffle(eqs.map((e) => e.text)),
        question: NAMES[q],
        answer: sol[q],
        solution: Object.fromEntries(sol.map((v, i) => [NAMES[i], v])),
      };
    }
  }
  throw new Error('Gleichungssystem konnte nicht erzeugt werden');
}

// Ellenőrzéshez (tesztek): hány megoldása van a rendszernek az 1..20 tartományban?
export function countSolutions(equations, n) {
  const fns = equations.map((e) => {
    const [l, r] = e.replace(/×/g, '*').replace(/÷/g, '/').replace(/–/g, '-').split(' = ');
    return new Function(...NAMES.slice(0, n), `return Math.abs((${l}) - (${r})) < 1e-9;`);
  });
  return space(n).filter((t) => fns.every((f) => f(...t)));
}
