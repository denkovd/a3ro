# A3RO Motion System

The landing page is one native-scroll descent: Commodity Watch globe → module spine → Index. Canvas 2D and Framer Motion share the existing neutral/amber visual language. Acid green remains reserved for focus and progress. No WebGL, scroll interception, motion blur, or additional rendering framework.

## Shared landing sequence

`app/components/landing/sequence.ts` owns pure, reversible timeline math. One `useScroll` MotionValue controls longitude, geometry compression, card positions and the release. Distances use stable viewport heights and the actual module count.

| Phase | Desktop | Phone |
| --- | --- | --- |
| Globe half-turn | 120svh | 80svh |
| Globe to spine | 60svh | 40svh |
| Each module | 110svh | 90svh |
| Release | 40svh | 30svh |

The globe retains the Oil preview's land samples, graticule, artery and markers. Longitude advances from its existing opening view by exactly 180 degrees; latitude stays fixed. Horizontal projected coordinates contract while vertical coordinates extend, so the same canvas resolves into the card axis. Labels withdraw during compression. Scroll-controlled mode has no independent pendulum, tracing or pulse clock. Canvas drawing is coalesced into one animation frame when scroll, size or visibility changes.

Cards follow successive quarter-turn positions on a helix: X and Z describe the orbit, Y advances along the spine. Faces are billboarded (orbital orientation and its counter-rotation cancel before CSS compositing), keeping text upright. The middle 65% of each interval holds the foreground card still, at full opacity and scale. The remainder exchanges cards with smoothstep easing. Only the foreground card accepts pointer events. All links retain semantic order; keyboard focus moves the document to that card's reading interval.

The incoming Index overlaps the end of the runway by 60svh, allowing its heading to enter as the final card recedes. Its own timeline is independent and unchanged. Hash anchors use actual runway positions; `#modules` lands halfway through the first reading interval, while legacy `#platform` and `#method` remain usable.

## Globe navigation

The hero opens the existing Oil Tracker route and stores its longitude/latitude/zoom in the existing arrival session record. The expansion and route preview freeze that exact view until the full engine is ready. Only Oil appears on the landing page; Oil, Gold and BTC navigation remains inside the platform and is visible on phones. Heavy engines stay route-only.

## Responsive and static modes

The stage is measured below the fixed header. Phones use a shallower orbit and full-width cards with reflowed live readouts. If the usable height is below 650px on phones or 600px on larger screens, or a card's content overflows, the page uses normal flow. Re-measure on viewport changes. The list control preserves the selected module, and loading a card is permanent for that visit.

Reduced motion, unavailable advanced rendering, and list mode show a static globe, normal-flow cards and the static Index. Server HTML starts in this same accessible layout with working module links. Canvas failure leaves the entry and CTA available. Dynamic module errors retain an accessible route placeholder and switch the sequence to normal flow.

## Preserved Index

The 300vh sticky wall retains the original 2,200px scroll contribution plus 26px/s idle drift. Desktop fine-pointer devices show opposing columns, with the second at 0.75 speed. Phones show one column. Seam copies remain presentation-only. Static mode displays all 14 features in normal flow.

## Performance and cleanup

MotionValues update transforms without React renders per scroll frame. React state changes only for phase-based preloading, layout, visibility and user interaction. Preload the current and following module; keep mounted previews and data state. The globe caps DPR at 1.5 and stops scheduling frames outside the viewport or while the tab is hidden. Dispose of observers, subscriptions, listeners and frames on unmount. Existing snapshot caching and data hooks remain intact.

Shared reveal, easing and focus tokens remain in `app/components/motion.tsx` and `app/globals.css`. Obsolete landing sections, entrance veil and Lenis initialization have been removed.
