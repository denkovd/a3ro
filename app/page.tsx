export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-white/10">
        <span className="text-2xl font-black tracking-tighter">A3RO</span>
        <div className="flex gap-8 text-sm text-white/50">
          <a href="#about" className="hover:text-white transition-colors">About</a>
          <a href="#work" className="hover:text-white transition-colors">Work</a>
          <a href="#contact" className="hover:text-white transition-colors">Contact</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-8 py-32">
        <p className="text-xs tracking-[0.3em] uppercase text-white/40 mb-6">
          Something big is coming
        </p>
        <h1 className="text-7xl md:text-9xl font-black tracking-tighter leading-none mb-8">
          A3RO
        </h1>
        <p className="text-xl md:text-2xl text-white/60 max-w-xl mb-12 text-balance">
          We're building something that changes everything. Stay tuned.
        </p>
        <a
          href="mailto:hello@a3ro.com.au"
          className="inline-block bg-[#e8ff00] text-black font-bold px-8 py-4 text-sm tracking-widest uppercase hover:bg-white transition-colors"
        >
          Get in Touch
        </a>
      </section>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-white/10 flex items-center justify-between text-xs text-white/30">
        <span>© {new Date().getFullYear()} A3RO</span>
        <span>a3ro.com.au</span>
      </footer>
    </main>
  );
}
