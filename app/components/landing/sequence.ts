const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** One reversible camera move; the globe always keeps its spherical geometry. */
export function pullbackState(progress: number) {
  const p = clamp(progress);
  const pullback = smooth((p - 0.35) / 0.65);
  return {
    turn: 100 * smooth(p / 0.45),
    scale: 1 - 0.32 * pullback,
    lift: -90 * pullback,
    opacity: 1 - smooth((p - 0.55) / 0.45),
  };
}
