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

/* ── Module spine ──
   Six platforms share one vertical axis. Native scroll through the pinned
   stage turns the ring; every value below is a pure function of position. */
export const SPINE = {
  slot: 0.9,      // viewport heights of scroll given to each module
  hold: 0.5,      // share of a slot in which the facing card rests
  entrance: 0.6,  // modules of travel completed while the stage rises into view
  step: 60,       // degrees between neighbours: six modules close the ring
} as const;

/** Viewport heights the runway occupies, including the one the stage fills. */
export const spineRunway = (count: number) => 1 + (count - 0.5) * SPINE.slot;

/** Which module faces the reader, as a fractional index.
 *  `progress` is 0 when the runway's top edge enters the viewport and 1 when
 *  its bottom edge arrives, so the stage pins after exactly one viewport. */
export function spinePosition(progress: number, count: number) {
  const scrolled = clamp(progress) * spineRunway(count);
  if (scrolled <= 1) return SPINE.entrance * (smooth((scrolled - 0.3) / 0.7) - 1);
  const slots = (scrolled - 1) / SPINE.slot;
  const exchange = 1 - SPINE.hold;
  let position = 0;
  for (let next = 1; next < count; next++) position += smooth((slots - next) / exchange + 0.5);
  return position;
}

/** Scroll past the pin, in viewport heights, at which a module rests. */
export const spineStop = (index: number, count: number) =>
  Math.min(Math.max(index, 0) + 0.5, count - 0.5 - SPINE.hold / 4) * SPINE.slot;

/** A card's place on the ring. `offset` is its index minus the spine position;
 *  `x` and `depth` are in units of the ring radius. */
export function orbitState(offset: number) {
  const distance = Math.abs(offset);
  const angle = Math.max(-150, Math.min(150, offset * SPINE.step));
  const radians = (angle * Math.PI) / 180;
  return {
    angle,
    x: Math.sin(radians),
    depth: Math.cos(radians) - 1,
    shade: 0.55 * smooth(distance),              // neighbours wait in half-light
    presence: 1 - smooth((distance - 1) / 0.5),  // gone before a card turns its back
    focus: 1 - smooth(distance / 0.3),           // 1 only while the card is docked
  };
}

/** A module's marker on the spine: passed markers queue above the junction and
 *  upcoming ones below the card. Between the two a marker fades out at the
 *  card's foot and back in at the junction, never crossing the card's face. */
export function nodeState(offset: number) {
  const waiting = offset >= 0.5;
  return {
    rail: waiting ? offset : Math.min(offset, 0),  // marker gaps from the junction, or from the card's foot
    foot: waiting ? 1 : 0,                         // 1 once the marker hangs below the card
    visible: clamp(Math.max(1 - offset / 0.25, (offset - 0.75) / 0.25)),
    focus: 1 - smooth(Math.abs(offset) / 0.5),
  };
}
