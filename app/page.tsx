"use client";
/* ────────────────────────────────────────────────────────────────
   A3RO — landing page
   A single vertical descent: arrival → position → craft → work →
   process → resolution. One fixed atmosphere behind everything;
   sections travel through it rather than stacking on top of it.
   Motion rules live in docs/MOTION.md.
──────────────────────────────────────────────────────────────── */
import { useSmoothScroll } from "./components/motion";
import Atmosphere from "./components/Atmosphere";
import { Nav, ProgressThread, EntranceVeil } from "./components/Chrome";
import Hero from "./components/sections/Hero";
import Manifesto from "./components/sections/Manifesto";
import Craft from "./components/sections/Craft";
import Work from "./components/sections/Work";
import Process from "./components/sections/Process";
import Contact from "./components/sections/Contact";

export default function Home() {
  useSmoothScroll();

  return (
    <main className="grain relative">
      <EntranceVeil />
      <Atmosphere />
      <ProgressThread />
      <Nav />

      <Hero />
      <Manifesto />
      <Craft />
      <Work />
      <Process />
      <Contact />
    </main>
  );
}

