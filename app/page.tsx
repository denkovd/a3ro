"use client";
import { useEffect, useRef, useState } from "react";

const SERVICES = [
  {
    id: "01",
    title: "Custom App Development",
    description:
      "We design and build web and mobile applications from the ground up — tailored to your exact workflow, not the other way around.",
    tags: ["Web Apps", "Mobile", "Full Stack"],
  },
  {
    id: "02",
    title: "AI Automation",
    description:
      "Replace manual, repetitive tasks with intelligent systems. We wire AI into your business so you can focus on what actually matters.",
    tags: ["Workflow Automation", "AI Integration", "Efficiency"],
  },
  {
    id: "03",
    title: "Software MVPs",
    description:
      "Got an idea? We turn it into a working product fast. Validate your concept before committing to a full build.",
    tags: ["Prototyping", "Rapid Build", "Validation"],
  },
  {
    id: "04",
    title: "Website Development",
    description:
      "High-performance, visually striking websites built to convert. Not templates — purpose-built digital presence.",
    tags: ["Design", "Performance", "SEO"],
  },
];

const STEPS = [
  { num: "01", title: "Discovery Call", body: "We learn your business, your pain points, and what success looks like for you." },
  { num: "02", title: "Scope & Strategy", body: "We map out exactly what to build, how long it takes, and what it costs. No surprises." },
  { num: "03", title: "Build & Iterate", body: "We build in sprints and show you progress along the way. You stay in the loop." },
  { num: "04", title: "Launch & Support", body: "We ship it and stick around. Ongoing support, improvements, and scaling as you grow." },
];

const STATS = [
  { value: "4x", label: "Faster than traditional agencies" },
  { value: "AI", label: "Native in every build" },
  { value: "100%", label: "Custom — no templates" },
  { value: "24h", label: "First prototype turnaround" },
];

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [activeService, setActiveService] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="bg-[#080808] text-white min-h-screen font-sans overflow-x-hidden">

      {/* NAV */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 transition-all duration-300 ${
          scrolled ? "bg-[#080808]/90 backdrop-blur border-b border-white/10" : ""
        }`}
      >
        <span className="text-xl font-black tracking-tighter">A3RO</span>
        <div className="hidden md:flex gap-8 text-sm text-white/50">
          <a href="#services" className="hover:text-white transition-colors">Services</a>
          <a href="#how" className="hover:text-white transition-colors">How It Works</a>
          <a href="#contact" className="hover:text-white transition-colors">Contact</a>
        </div>
        <a
          href="#contact"
          className="text-sm font-semibold bg-white text-black px-5 py-2 hover:bg-[#e8ff00] transition-colors"
        >
          Get Started →
        </a>
      </nav>

      {/* HERO */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24"
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-white/[0.03] blur-3xl" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] rounded-full bg-[#e8ff00]/[0.04] blur-3xl" />
        </div>

        <p className="text-xs tracking-[0.4em] uppercase text-white/30 mb-8">
          Tech &amp; Automation Studio — Sydney, AU
        </p>

        <h1 className="text-6xl md:text-8xl lg:text-[10rem] font-black tracking-tighter leading-[0.9] mb-10 relative">
          Built
          <br />
          <span className="text-transparent" style={{ WebkitTextStroke: "1px rgba(255,255,255,0.3)" }}>
            Different.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-white/50 max-w-2xl mb-12 leading-relaxed">
          We build custom software, automate what slows you down, and ship MVPs that actually work — powered by AI, built for results.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <a
            href="#contact"
            className="bg-[#e8ff00] text-black font-bold px-8 py-4 text-sm tracking-widest uppercase hover:bg-white transition-colors"
          >
            Start a Project
          </a>
          <a
            href="#services"
            className="border border-white/20 text-white/70 font-semibold px-8 py-4 text-sm tracking-widest uppercase hover:border-white hover:text-white transition-colors"
          >
            See What We Do
          </a>
        </div>

        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/20 text-xs tracking-widest">
          <span>SCROLL</span>
          <div className="w-px h-12 bg-gradient-to-b from-white/20 to-transparent" />
        </div>
      </section>

      {/* MARQUEE */}
      <div className="border-y border-white/10 py-5 overflow-hidden bg-[#0d0d0d]">
        <div className="flex gap-12 whitespace-nowrap" style={{ animation: "marquee 20s linear infinite" }}>
          {["Custom Apps", "AI Automation", "Software MVPs", "Website Dev", "Rapid Prototyping", "AI Integration", "Full Stack", "Custom Apps", "AI Automation", "Software MVPs", "Website Dev", "Rapid Prototyping", "AI Integration", "Full Stack"].map(
            (item, i) => (
              <span key={i} className="text-sm font-semibold tracking-widest uppercase text-white/30">
                {item} <span className="text-[#e8ff00] mx-4">✦</span>
              </span>
            )
          )}
        </div>
      </div>

      {/* ABOUT */}
      <section className="px-8 md:px-20 py-32 max-w-7xl mx-auto">
        <p className="text-xs tracking-[0.3em] uppercase text-white/30 mb-8">Our Studio</p>
        <div className="grid md:grid-cols-2 gap-16 items-start">
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight">
            We make technology work for your business — not the other way around.
          </h2>
          <div className="space-y-6 text-white/50 text-lg leading-relaxed pt-4">
            <p>
              A3RO is a Sydney-based tech and automation studio. We build custom software, integrate AI, and create digital tools that give businesses a real edge.
            </p>
            <p>
              No bloated agencies. No cookie-cutter solutions. Just focused, intelligent builds that solve your actual problems.
            </p>
            <a href="#contact" className="inline-flex items-center gap-2 text-white font-semibold hover:text-[#e8ff00] transition-colors text-base">
              Work with us →
            </a>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="px-8 md:px-20 py-32 max-w-7xl mx-auto">
        <p className="text-xs tracking-[0.3em] uppercase text-white/30 mb-16">Services</p>
        <div className="grid md:grid-cols-2 gap-6">
          {SERVICES.map((s, i) => (
            <div
              key={s.id}
              onMouseEnter={() => setActiveService(i)}
              className={`group border p-8 transition-all duration-300 cursor-default ${
                activeService === i
                  ? "border-[#e8ff00]/50 bg-[#e8ff00]/[0.03]"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              <div className="flex items-start justify-between mb-6">
                <span className="text-xs text-white/20 font-mono">{s.id}</span>
                <span className={`text-xl transition-transform duration-300 ${activeService === i ? "translate-x-1 -translate-y-1" : ""}`}>
                  →
                </span>
              </div>
              <h3 className="text-2xl font-black tracking-tight mb-4">{s.title}</h3>
              <p className="text-white/50 leading-relaxed mb-6">{s.description}</p>
              <div className="flex flex-wrap gap-2">
                {s.tags.map((t) => (
                  <span key={t} className="text-xs border border-white/10 text-white/30 px-3 py-1">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section className="border-y border-white/10 py-20 px-8 md:px-20 bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-4xl md:text-6xl font-black tracking-tighter text-[#e8ff00] mb-3">{s.value}</div>
              <div className="text-sm text-white/40 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="px-8 md:px-20 py-32 max-w-7xl mx-auto">
        <p className="text-xs tracking-[0.3em] uppercase text-white/30 mb-6">How It Works</p>
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-20">
          Simple process.<br />Serious results.
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 border border-white/10">
          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className={`p-8 ${i < STEPS.length - 1 ? "border-b lg:border-b-0 lg:border-r border-white/10" : ""}`}
            >
              <span className="text-xs font-mono text-[#e8ff00] mb-6 block">{step.num}</span>
              <h3 className="text-xl font-black tracking-tight mb-4">{step.title}</h3>
              <p className="text-white/40 text-sm leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        id="contact"
        className="px-8 md:px-20 py-40 max-w-7xl mx-auto text-center relative"
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#e8ff00]/[0.04] blur-3xl" />
        </div>
        <p className="text-xs tracking-[0.3em] uppercase text-white/30 mb-8">Let&apos;s Build</p>
        <h2 className="text-5xl md:text-8xl font-black tracking-tighter leading-tight mb-10">
          Ready to automate<br />everything?
        </h2>
        <p className="text-white/40 text-lg max-w-xl mx-auto mb-12">
          Tell us what you need. We&apos;ll tell you how to build it, how long it takes, and what it costs.
        </p>
        <a
          href="mailto:hello@a3ro.com.au"
          className="inline-block bg-[#e8ff00] text-black font-black px-12 py-5 text-sm tracking-widest uppercase hover:bg-white transition-colors"
        >
          hello@a3ro.com.au
        </a>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 px-8 md:px-20 py-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <span className="text-2xl font-black tracking-tighter">A3RO</span>
            <p className="text-white/30 text-sm mt-2">Tech &amp; Automation Studio</p>
          </div>
          <div className="flex gap-12 text-sm text-white/30">
            <div className="space-y-2">
              <p className="text-white/20 text-xs uppercase tracking-widest mb-3">Discover</p>
              <a href="#services" className="block hover:text-white transition-colors">Services</a>
              <a href="#how" className="block hover:text-white transition-colors">How It Works</a>
              <a href="#contact" className="block hover:text-white transition-colors">Contact</a>
            </div>
            <div className="space-y-2">
              <p className="text-white/20 text-xs uppercase tracking-widest mb-3">Connect</p>
              <a href="#" className="block hover:text-white transition-colors">LinkedIn</a>
              <a href="#" className="block hover:text-white transition-colors">Instagram</a>
              <a href="mailto:hello@a3ro.com.au" className="block hover:text-white transition-colors">Email</a>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-white/20 text-xs">
          <span>© {new Date().getFullYear()} A3RO. All rights reserved.</span>
          <span>a3ro.com.au</span>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </main>
  );
}
