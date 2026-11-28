/** Exploratory statistics. No IID p-values or causal interpretations. */
export function pearson(x: number[], y: number[]): number | null {
  if (x.length !== y.length) throw new Error("Correlation arrays must have equal lengths.");
  const pairs = x.map((v, i) => [v, y[i]]).filter(p => p.every(Number.isFinite));
  if (pairs.length < 3) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length, my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  let xx = 0, yy = 0, xy = 0;
  for (const [a, b] of pairs) { xx += (a - mx) ** 2; yy += (b - my) ** 2; xy += (a - mx) * (b - my); }
  return xx > 1e-20 && yy > 1e-20 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null;
}
export function ranks(values: number[]): number[] {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v), out = Array(values.length).fill(0);
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
    for (let k = i; k < j; k++) out[sorted[k].i] = (i + j - 1) / 2 + 1;
    i = j;
  }
  return out;
}
export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length) throw new Error("Correlation arrays must have equal lengths.");
  const pairs = x.map((v, i) => [v, y[i]]).filter(p => p.every(Number.isFinite));
  return pearson(ranks(pairs.map(p => p[0])), ranks(pairs.map(p => p[1])));
}
export const correlation = (x: number[], y: number[]) => ({ n: x.filter((v, i) => Number.isFinite(v) && Number.isFinite(y[i])).length, pearson: pearson(x, y), spearman: spearman(x, y) });

/** Paired circular moving-block bootstrap, retaining common market shocks and
 * 21-session serial dependence. Exploratory, not selection-adjusted evidence. */
export function pairedSharpeRange(a: number[], b: number[], cash: number[], annual: number): [number, number] | null {
  if (a.length !== b.length || a.length !== cash.length) throw new Error("Paired return arrays must align.");
  const n = a.length;
  if (n < 126) return null;
  let seed = 41297;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const differences: number[] = [];
  for (let draw = 0; draw < 500; draw++) {
    let sa = 0, sb = 0, aa = 0, bb = 0, count = 0;
    while (count < n) {
      const start = Math.floor(random() * n);
      for (let j = 0; j < 21 && count < n; j++, count++) {
        const i = (start + j) % n, x = a[i] - cash[i], y = b[i] - cash[i];
        sa += x; sb += y; aa += x * x; bb += y * y;
      }
    }
    const va = (aa - sa * sa / n) / (n - 1), vb = (bb - sb * sb / n) / (n - 1);
    if (va > 1e-20 && vb > 1e-20) differences.push((sa / n / Math.sqrt(va) - sb / n / Math.sqrt(vb)) * Math.sqrt(annual));
  }
  if (differences.length < 400) return null;
  differences.sort((x, y) => x - y);
  return [differences[Math.floor(differences.length * 0.025)], differences[Math.floor(differences.length * 0.975)]];
}
