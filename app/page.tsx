"use client";
import { useEffect, useRef, useState } from "react";

/* ─── LOGO SVG ─────────────────────────────────────────────── */
function A3ROLogo({ className = "", white = false }: { className?: string; white?: boolean }) {
  const fill = white ? "#ffffff" : "#ffffff";
  return (
    <svg className={className} viewBox="0 0 120 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* A */}
      <path d="M2 32L12 4H16L26 32H21.5L19.5 26H8.5L6.5 32H2ZM10 22H18L14 10L10 22Z" fill={fill}/>
      {/* 3 */}
      <path d="M30 4H46V8H34V14H43V18H34V26H46V30H30V4Z" fill={fill}/>
      {/* R */}
      <path d="M50 4H62C66.4 4 70 7.6 70 12C70 15.2 68.1 17.9 65.4 19.2L71 30H66L61 20H54V30H50V4ZM54 8V16H62C64.2 16 66 14.2 66 12C66 9.8 64.2 8 62 8H54Z" fill={fill}/>
      {/* O (circle) */}
      <circle cx="101" cy="17" r="14" stroke={fill} strokeWidth="4" fill="none"/>
    </svg>
  );
}

/* ─── PARTICLE CANVAS ───────────────────────────────────────── */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let W = 0, H = 0;

    type Particle = {
      x: number; y: number;
      vx: number; vy: number;
      r: number; alpha: number;
    };

    let particles: Particle[] = [];

    const resize = () => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
      particles = Array.from({ length: Math.floor((W * H) / 8000) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.6 + 0.2,
      }));
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });
    canvas.addEventListener("mouseleave", () => {
      mouseRef.current = { x: -1000, y: -1000 };
    });

    const CONN_DIST = 120;
    const MOUSE_DIST = 150;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // update
      for (const p of particles) {
        // mouse repulsion
        const dx = p.x - mouseRef.current.x;
        const dy = p.y - mouseRef.current.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < MOUSE_DIST) {
          const force = (MOUSE_DIST - d) / MOUSE_DIST * 0.012;
          p.vx += (dx / d) * force;
          p.vy += (dy / d) * force;
        }
        // dampen
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        // wrap
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
      }

      // draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONN_DIST) {
            const op = (1 - d / CONN_DIST) * 0.35;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(100, 130, 255, ${op})`;
            ctx.lineWidth = 0.6;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // draw particles
      for (const p of particles) {
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        grd.addColorStop(0, `rgba(130, 150, 255, ${p.alpha})`);
        grd.addColorStop(1, `rgba(77, 107, 255, 0)`);
        ctx.beginPath();
        ctx.fillStyle = grd;
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
        // core dot
        ctx.beginPath();
        ctx.fillStyle = `rgba(200, 210, 255, ${p.alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ cursor: "crosshair" }}
    />
  );
}

/* ─── DATA ──────────────────────────────────────────────────── */
const SERVICES = [
  {
    id: "01",
    title: "Custom App Development",
    desc: "Web and mobile applications built from scratch — tailored to your exact workflow, not adapted from a template.",
    tags: ["Web Apps", "Mobile", "Full Stack"],
  },
  {
    id: "02",
    title: "AI Automation",
    desc: "Replace repetitive manual tasks with intelligent systems. We wire AI into your business operations so you can scale without adding headcount.",
    tags: ["Workflow Automation", "AI Integration", "Efficiency"],
  },
  {
    id: "03",
    title: "Software MVPs",
    desc: "Got an idea? We build a working product fast so you can validate before committing to a full build.",
    tags: ["Prototyping", "Rapid Build", "Validation"],
  },
  {
    id: "04",
    title: "Website Development",
    desc: "High-performance, visually striking websites built to convert visitors into clients. Purpose-built, never templated.",
    tags: ["Design", "Performance", "Conversion"],
  },
];

const STEPS = [
  { num: "01", title: "Discovery Call", body: "We learn your business, pain points, and what success looks like. No fluff — just the right questions." },
  { num: "02", title: "Scope & Strategy", body: "We map what to build, how long it takes, and what it costs. Clear scope, no surprises." },
  { num: "03", title: "Build & Iterate", body: "We build in sprints and show you progress as we go. You're in the loop the entire time." },
  { num: "04", title: "Launch & Support", body: "We ship and stick around. Ongoing support, improvements, and scaling as your business grows." },
];

/* ─── PAGE ──────────────────────────────────────────────────── */
export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [activeService, setActiveService] = useState<number | null>(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <main className="bg-[#04040f] text-white min-h-screen overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? "bg-[#04040f]/80 backdrop-blur-xl border-b border-white/5" : ""}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 md:px-10 py-5">
          <A3ROLogo className="h-7 w-auto" white />
          <div className="hidden md:flex items-center gap-8 text-sm text-white/40 font-medium">
            <a href="#services" className="hover:text-white transition-colors duration-200">Services</a>
            <a href="#how" className="hover:text-white transition-colors duration-200">How It Works</a>
            <a href="#contact" className="hover:text-white transition-colors duration-200">Contact</a>
          </div>
          <a
            href="#contact"
            className="text-sm font-semibold px-5 py-2.5 rounded-sm transition-all duration-200"
            style={{ background: "linear-gradient(135deg, #4D6BFF, #7B8FFF)", color: "#fff" }}
          >
            Get Started →
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center overflow-hidden">
        {/* Particle field */}
        <ParticleCanvas />

        {/* Radial vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, #04040f 80%)" }}
        />

        {/* Blue glow orb behind content */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(77,107,255,0.12) 0%, transparent 70%)", filter: "blur(40px)" }}
        />

        {/* Content */}
        <div className="relative z-10 px-6 max-w-5xl mx-auto">
          <div
            className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.25em] uppercase mb-10 px-4 py-2 rounded-full border"
            style={{ borderColor: "rgba(77,107,255,0.3)", color: "rgba(130,150,255,0.9)", background: "rgba(77,107,255,0.06)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#4D6BFF" }} />
            Tech &amp; Automation Studio — Sydney, AU
          </div>

          <h1 className="font-black tracking-tighter leading-[0.88] mb-8" style={{ fontSize: "clamp(3.5rem, 12vw, 9rem)" }}>
            Built{" "}
            <span
              className="relative"
              style={{
                WebkitTextStroke: "1px rgba(77,107,255,0.6)",
                color: "transparent",
                textShadow: "0 0 80px rgba(77,107,255,0.4)",
              }}
            >
              Different.
            </span>
          </h1>

          <p className="text-lg md:text-xl mb-12 max-w-2xl mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            We build custom software, automate what slows you down, and ship products that work — powered by AI, built for results.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#contact"
              className="font-bold px-8 py-4 text-sm tracking-widest uppercase transition-all duration-200 hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #4D6BFF 0%, #7B8FFF 100%)", color: "#fff" }}
            >
              Start a Project
            </a>
            <a
              href="#services"
              className="font-semibold px-8 py-4 text-sm tracking-widest uppercase transition-all duration-200 hover:border-white/50 hover:text-white"
              style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}
            >
              What We Do ↓
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 pointer-events-none" style={{ color: "rgba(255,255,255,0.15)" }}>
          <span className="text-[10px] tracking-[0.3em] uppercase font-medium">Scroll</span>
          <div className="w-px h-10" style={{ background: "linear-gradient(to bottom, rgba(77,107,255,0.5), transparent)" }} />
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <div className="border-y overflow-hidden py-4" style={{ borderColor: "rgba(77,107,255,0.15)", background: "rgba(77,107,255,0.04)" }}>
        <div
          className="flex gap-10 whitespace-nowrap"
          style={{ animation: "marquee 22s linear infinite" }}
        >
          {["Custom Apps", "AI Automation", "Software MVPs", "Website Dev", "Rapid Prototyping", "AI Integration", "Full Stack Builds", "Custom Apps", "AI Automation", "Software MVPs", "Website Dev", "Rapid Prototyping", "AI Integration", "Full Stack Builds"].map((item, i) => (
            <span key={i} className="text-xs font-semibold tracking-[0.25em] uppercase" style={{ color: "rgba(130,150,255,0.5)" }}>
              {item}
              <span className="mx-5" style={{ color: "rgba(77,107,255,0.7)" }}>✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── ABOUT ── */}
      <section className="px-6 md:px-10 py-28 max-w-7xl mx-auto">
        <p className="text-xs tracking-[0.3em] uppercase font-semibold mb-10" style={{ color: "rgba(77,107,255,0.7)" }}>Our Studio</p>
        <div className="grid md:grid-cols-2 gap-16 items-start">
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-tight">
            We make technology work for your business — not the other way around.
          </h2>
          <div className="space-y-5 text-lg leading-relaxed pt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
            <p>A3RO is a Sydney-based tech and automation studio. We build custom software, integrate AI, and create digital tools that give businesses a real edge.</p>
            <p>No bloated agencies. No cookie-cutter solutions. Focused, intelligent builds that solve your actual problems.</p>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 font-semibold text-base transition-colors duration-200"
              style={{ color: "#7B8FFF" }}
            >
              Work with us →
            </a>
          </div>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section id="services" className="px-6 md:px-10 py-28 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-16 flex-wrap gap-6">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase font-semibold mb-4" style={{ color: "rgba(77,107,255,0.7)" }}>Services</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-tight">
              What we build.
            </h2>
          </div>
          <a
            href="#contact"
            className="text-sm font-semibold px-6 py-3 transition-all duration-200 hover:brightness-110 whitespace-nowrap"
            style={{ background: "linear-gradient(135deg, #4D6BFF, #7B8FFF)", color: "#fff" }}
          >
            Start a Project →
          </a>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {SERVICES.map((s, i) => (
            <div
              key={s.id}
              onMouseEnter={() => setActiveService(i)}
              onMouseLeave={() => setActiveService(null)}
              className="p-8 transition-all duration-300 cursor-default group"
              style={{
                border: activeService === i ? "1px solid rgba(77,107,255,0.5)" : "1px solid rgba(255,255,255,0.06)",
                background: activeService === i ? "rgba(77,107,255,0.06)" : "rgba(255,255,255,0.02)",
              }}
            >
              <div className="flex items-start justify-between mb-6">
                <span className="text-xs font-mono" style={{ color: activeService === i ? "rgba(130,150,255,0.8)" : "rgba(255,255,255,0.2)" }}>
                  {s.id}
                </span>
                <span
                  className="text-lg transition-all duration-300"
                  style={{
                    color: activeService === i ? "#7B8FFF" : "rgba(255,255,255,0.2)",
                    transform: activeService === i ? "translate(3px,-3px)" : "none",
                  }}
                >
                  →
                </span>
              </div>
              <h3 className="text-xl font-black tracking-tight mb-4">{s.title}</h3>
              <p className="leading-relaxed mb-6 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>{s.desc}</p>
              <div className="flex flex-wrap gap-2">
                {s.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-3 py-1 font-medium"
                    style={{
                      border: "1px solid rgba(77,107,255,0.2)",
                      color: "rgba(130,150,255,0.6)",
                      background: "rgba(77,107,255,0.05)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="px-6 md:px-10 py-28 max-w-7xl mx-auto">
        <p className="text-xs tracking-[0.3em] uppercase font-semibold mb-4" style={{ color: "rgba(77,107,255,0.7)" }}>Process</p>
        <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-20 leading-tight">
          Simple process.<br />Serious results.
        </h2>

        <div
          className="grid md:grid-cols-2 lg:grid-cols-4"
          style={{ border: "1px solid rgba(77,107,255,0.15)" }}
        >
          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className="p-8 group hover:transition-colors duration-300"
              style={{
                borderRight: i < STEPS.length - 1 ? "1px solid rgba(77,107,255,0.15)" : "none",
              }}
            >
              <span
                className="text-xs font-mono font-bold mb-6 block"
                style={{ color: "#4D6BFF" }}
              >
                {step.num}
              </span>
              <h3 className="text-lg font-black tracking-tight mb-4">{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="contact" className="px-6 md:px-10 py-40 text-center relative overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(77,107,255,0.12) 0%, transparent 70%)", filter: "blur(60px)" }}
        />
        <div className="relative z-10 max-w-4xl mx-auto">
          <p className="text-xs tracking-[0.3em] uppercase font-semibold mb-8" style={{ color: "rgba(77,107,255,0.7)" }}>
            Let&apos;s Build
          </p>
          <h2 className="font-black tracking-tighter leading-[0.9] mb-8" style={{ fontSize: "clamp(2.5rem, 8vw, 6rem)" }}>
            Ready to automate<br />everything?
          </h2>
          <p className="text-lg mb-12 max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
            Tell us what you need. We&apos;ll tell you how to build it, how long it takes, and what it costs.
          </p>
          <a
            href="mailto:hello@a3ro.com.au"
            className="inline-block font-black px-12 py-5 text-sm tracking-widest uppercase transition-all duration-200 hover:brightness-110"
            style={{ background: "linear-gradient(135deg, #4D6BFF 0%, #7B8FFF 100%)", color: "#fff" }}
          >
            hello@a3ro.com.au
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t px-6 md:px-10 py-14" style={{ borderColor: "rgba(77,107,255,0.12)" }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
          <div>
            <A3ROLogo className="h-6 w-auto mb-3" white />
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>Tech &amp; Automation Studio</p>
          </div>
          <div className="flex gap-14 text-sm">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold mb-4" style={{ color: "rgba(77,107,255,0.6)" }}>Discover</p>
              {["Services", "How It Works", "Contact"].map((l) => (
                <a key={l} href={`#${l.toLowerCase().replace(/ /g, "")}`} className="block transition-colors duration-200 hover:text-white" style={{ color: "rgba(255,255,255,0.3)" }}>{l}</a>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold mb-4" style={{ color: "rgba(77,107,255,0.6)" }}>Connect</p>
              {[
                { label: "LinkedIn", href: "#" },
                { label: "Instagram", href: "#" },
                { label: "Email", href: "mailto:hello@a3ro.com.au" },
              ].map((l) => (
                <a key={l.label} href={l.href} className="block transition-colors duration-200 hover:text-white" style={{ color: "rgba(255,255,255,0.3)" }}>{l.label}</a>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t mt-10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs" style={{ borderColor: "rgba(77,107,255,0.1)", color: "rgba(255,255,255,0.18)" }}>
          <span>© {new Date().getFullYear()} A3RO. All rights reserved.</span>
          <span>a3ro.com.au</span>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
      `}</style>
    </main>
  );
}
