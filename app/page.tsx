"use client";

import Atmosphere from "./components/Atmosphere";
import { Nav, ProgressThread } from "./components/Chrome";
import LandingExperience from "./components/landing/LandingExperience";
import Contact from "./components/sections/Contact";

export default function Home() {
  return <main className="grain relative">
    <Atmosphere />
    <ProgressThread />
    <Nav />
    <LandingExperience />
    <Contact />
  </main>;
}
