export default function Contact() {
  return <footer id="contact" className="relative z-10 hairline-t scroll-mt-24">
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-10 md:flex-row md:items-center md:justify-between md:px-10">
      <p className="landing-kicker">A3RO — Market Intelligence · Sydney</p>
      <a href="mailto:hello@a3ro.com.au" className="sweep w-fit font-mono text-xs tracking-wider text-[var(--ink-2)]">hello@a3ro.com.au</a>
      <p className="landing-kicker">© {new Date().getFullYear()} A3RO. All rights reserved.</p>
    </div>
  </footer>;
}
