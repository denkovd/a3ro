# A3RO Motion System

The landing page is one continuous descent, not a stack of blocks. Every animated element follows the rules below. If a new element can't be expressed with these tokens, the element changes — not the system.

## Principles

Motion exists to guide attention, create hierarchy, and connect sections into a single journey. It should feel physically believable: things settle, they don't bounce or flash. If an animation would still make sense with the sound off in a film, it belongs; if it draws attention to itself, it doesn't. Transform and opacity only — no animated layout properties, no filters on scroll paths, no animation that blocks reading.

## Tokens

Defined once in `app/globals.css` and mirrored in `app/components/motion.tsx`.

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Reveals, entrances — fast arrival, long settle |
| `--ease-inout` | `cubic-bezier(0.65, 0, 0.35, 1)` | Scene shifts (entrance veil, section dims) |
| `--ease-snap` | `cubic-bezier(0.3, 0.7, 0.4, 1)` | Micro interactions |
| `--dur-micro` | 160 ms | Hover color, focus |
| `--dur-base` | 320 ms | Hover transforms, underline sweeps |
| `--dur-reveal` | 800 ms | Scroll reveals |
| `--dur-scene` | 1200 ms | Entrance, veil, hero staging |
| Stagger | 80 ms | Sequential list/child reveals |

## Entrance (once per visit)

A black veil (`EntranceVeil`) opens the film: a 1 px acid thread draws across centre frame (600 ms, `--ease-out`), then the veil parts upward like a curtain (1200 ms, `--ease-inout`). Behind it the hero stages in: eyebrow at +500 ms, then the headline rises character by character out of clip masks (28 ms/char stagger, lines offset 250 ms), supporting line at +1350 ms, nav at +900 ms. Total settle ≈ 2.5 s; the page is scrollable throughout.

## Pinned scenes (scroll-scrubbed)

Three sections pin and let scroll drive them directly — the scroll position is the timeline:

- **Hero** (170 vh): while pinned, the title recedes (scale 1 → 0.86, y −260), meta rail lifts −90, horizon −40, a ghost numeral drifts −340 in the far background. Planes separate at different velocities → depth. The title block also tilts ≤ 4° toward the cursor on sprung values.
- **Manifesto** (220 vh): the statement holds centre frame while words illuminate in scroll order (opacity 0.12 → 1, y 8 → 0); a micro progress bar tracks the read-through.
- **Work** (320 vh, desktop only): vertical scroll becomes lateral travel — the slot corridor translates −102 vw while inner surfaces counter-drift ±28 px and a counter ticks 01→03. On touch/mobile it degrades to a vertical stack with per-card inner parallax.

## Scroll reveals

One grammar everywhere else: rise 24–34 px + fade, 800 ms, `--ease-out`, −12% viewport margin, **once only** — content never re-hides. Groups stagger at 80 ms. Headlines use `MaskText` (line rises out of a clipped mask, 900 ms).

## Layered parallax

Named depths as scroll-linked transforms: **background** (dust far-layer 0.03 scroll / −10 px pointer), **midground** (dust near-layer 0.08 / −26 px pointer; card inner planes ±28 px), **foreground** (content, moves with scroll). The dust field leans away from the cursor with eased inertia (4%/frame). Depth comes from relative velocity, never blur.

## Section-to-section transitions

The fixed `Atmosphere` (gradient + pointer-reactive dust + vignette + grain) runs behind everything, so sections read as stations along one route. Continuity cues: the acid progress thread (scroll-sprung), pinned scenes handing off to free-scrolling ones, the process line drawing itself (`scaleY` = progress) with station dots snapping acid as it passes, and contact dimming back toward black — the page ends where it began.

## Hover states

Drawn, not glowed: text shifts `--ink-2 → --ink` (160 ms); 1 px acid underline sweeps left→right, exits right (320 ms); craft rows translate +12 px, light their index, and a preview plate trails the cursor on springs (desktop only); work slots draw an acid corner tick; the contact email is magnetic (sprung, strength 0.3). No scale-ups on cards, no shadows, no glow.

## The accent

Acid green (`--acid: #b8e62d`) appears only as: progress thread, scroll-cue dot, process progress line, hover underline/index/tick, focus ring, text selection. Never as a background, fill, or large area. If green is visible when nothing is happening, something is wrong (the progress thread is the one ambient exception — it's 1 px).

## Performance and accessibility budget

- Canvas dust: single 2D canvas, DPR ≤ 1.5, ≤ 90 particles desktop / ≤ 42 mobile, paused when the tab is hidden. ~5% of near-layer motes are acid — the only ambient accent besides the progress thread.
- Pinned scenes are `position: sticky` + transform scrubbing — no scroll hijacking, no JS-driven layout.
- Grain: static SVG tile stepped by CSS (`steps(6)`), no JS.
- No WebGL, no post-processing, no scroll-linked blur/filter.
- `prefers-reduced-motion`: veil removed, Lenis disabled, reveals render settled, parallax and scrubbing static, dust field off. The page is fully legible with zero motion.
