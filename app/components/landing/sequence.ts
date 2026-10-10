/** Scroll distances are stable viewport heights; no elapsed-time state. */
export function sequenceTiming(mobile: boolean, count: number) {
  const rotation = mobile ? 80 : 120;
  const morph = mobile ? 40 : 60;
  const card = mobile ? 90 : 110;
  const release = mobile ? 30 : 40;
  const cardsStart = rotation + morph;
  const cardsEnd = cardsStart + count * card;
  return { rotation, morph, card, release, cardsStart, cardsEnd, total: cardsEnd + release, count };
}

export type SequenceTiming = ReturnType<typeof sequenceTiming>;
export const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };

/** The middle 65% of each interval is a genuinely stationary reading position. */
export function sequenceState(progress: number, timing: SequenceTiming) {
  const distance = clamp(progress) * timing.total;
  const position = (distance - timing.cardsStart) / timing.card;
  const slot = Math.floor(position);
  const fraction = position - slot;
  const travel = fraction < 0.175
    ? slot - 0.5 + 0.5 * smooth(fraction / 0.175)
    : fraction > 0.825
      ? slot + 0.5 * smooth((fraction - 0.825) / 0.175)
      : slot;
  return {
    turn: 180 * clamp(distance / timing.rotation),
    morph: smooth((distance - timing.rotation) / timing.morph),
    orbit: clamp(travel, 0, timing.count - 1),
    appear: smooth((distance - timing.rotation - timing.morph * 0.55) / (timing.morph * 0.45)),
    release: smooth((distance - timing.cardsEnd) / timing.release),
    active: clamp(Math.round(travel), 0, timing.count - 1),
  };
}

export function readingProgress(index: number, timing: SequenceTiming) {
  return (timing.cardsStart + (clamp(index, 0, timing.count - 1) + 0.5) * timing.card) / timing.total;
}

export function orbitPose(index: number, orbit: number, width: number, height: number, mobile: boolean) {
  const offset = index - orbit;
  const angle = offset * Math.PI / 2;
  const radius = Math.min(width * (mobile ? 0.16 : 0.3), mobile ? 80 : 410);
  return {
    x: Math.sin(angle) * radius,
    y: offset * height * (mobile ? 0.7 : 0.62),
    z: (Math.cos(angle) - 1) * radius * (mobile ? 0.4 : 0.8),
    opacity: clamp(1 - Math.abs(offset) * 0.65),
    scale: 1 - clamp(Math.abs(offset)) * (mobile ? 0.06 : 0.1),
    angle: offset * 90,
    zIndex: 20 - Math.round(Math.abs(offset) * 4),
  };
}
