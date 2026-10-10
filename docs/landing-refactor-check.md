# Landing refactor verification — 9 October 2026

The implementation is complete in the local checkout. It has not been deployed.

## Implemented

- Existing Oil preview promoted to Commodity Watch hero, with a reversible 180-degree scroll turn and same-canvas geometry compression into a spine.
- Five existing module entries orbit the axis, with stable reading intervals, native scrolling, phase-based preloading and keyboard positioning. Commodity Watch has a compact entry without a second globe.
- Responsive readouts, short-viewport/list fallbacks, live reduced-motion subscription and accessible route placeholders.
- Original Index content and motion retained; outgoing spine, module heading and list control now retire before the Index.
- Compact contact/footer, updated and legacy anchors, and full-platform Oil/Gold/BTC links available on phones.
- Obsolete marketing sections, entrance veil, unused motion helpers and Lenis dependency removed.

## Files changed for this refactor

- New: `app/components/landing/CommodityHero.tsx`, `LandingExperience.tsx`, `sequence.ts`; `tests/landing-sequence.test.mjs`.
- Landing composition/style: `app/page.tsx`, `app/globals.css`, `app/components/Chrome.tsx`, `Atmosphere.tsx`, `motion.tsx`, `DeferredModule.tsx`.
- Cards/renderer: `app/components/projects/OilTrackerPreview.tsx`, `CommodityWatch.tsx`, `BullFinder.tsx`, `EarningsBeat.tsx`, `RegimeShiftFinder.tsx`.
- Closing sections: `app/components/sections/FeatureLoop.tsx`, `Contact.tsx`.
- Asset shell navigation: Oil, Gold and BTC Tracker `view.tsx` files.
- Dependency/test configuration: `package.json`, `package-lock.json`; documentation: `docs/MOTION.md` and this report.
- Removed obsolete sections: Hero, Manifesto, Craft, Process and Work.

Existing Thesis Lab retirement, backend and other unrelated changes were preserved.

## Checks performed

- `npm run test:landing`: 9 passed, covering half-turn endpoints, stable card reading positions, phase continuity, reverse/skip determinism and helix depth.
- `npm run test:optimization`: 6 passed, including snapshot sharing, failure retries and visible-frame cleanup.
- `npx tsc --noEmit --incremental false`: passed.
- Production build with `A3RO_BUILD_DIR=.next-optimization`: passed. A Windows sandbox permission failure required rerunning outside the sandbox. External Google Fonts optimization could not download its stylesheet; this did not block compilation.
- `git diff --check`: passed; only line-ending notices.
- Browser: opening globe, globe compression/reversal, desktop and 390×844 phone cards, keyboard progression, list/orbit switching, full Oil opening, Oil/Gold/BTC phone navigation and module return anchors.
- Short landscape fallback checked at 844×390. Live Trend Finder, Regime, Earnings and Australia Watch content observed. All four dedicated module routes returned HTTP 200.
- Final browser check: direct Index anchor is correct, outgoing spine opacity is zero, list control is hidden, and browser error log is empty. Phone module rendering and all-card list visibility rechecked after the final correction.

## Verification limits

Reduced motion and rendering-failure fallbacks are implemented, but OS reduced-motion emulation and true 200% text zoom were not verified in the available browser controls. Browser zoom shortcuts had no effect, so they are not counted as a successful zoom check. Backend error/pending states retain their existing hooks; every such state was not forced in the browser.

Final preview: `http://127.0.0.1:3000/`.
