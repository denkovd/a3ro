// Site-wide footer (roadmap #20): general information warning, legal links and data attribution.
// Wording is "general information only" on purpose: giving general *advice* in Australia needs an
// AFSL or authorised-representative arrangement, which is the legal opinion due at the gate.
export const GENERAL_INFO_WARNING =
  "A3RO provides general information only. It is not financial product advice and does not take into account your objectives, financial situation or needs. Consider whether any information is appropriate for you and seek advice from a licensed financial adviser before making a financial decision. Past performance is not a reliable indicator of future performance.";

export default function SiteFooter() {
  return <footer className="relative z-10 border-t border-[var(--line)] bg-[var(--depth-0,transparent)]">
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 md:px-10">
      <p className="max-w-4xl text-[11px] leading-relaxed text-[var(--ink-3)]">
        <span className="font-mono uppercase tracking-[0.2em] text-[var(--ink-2)]">General information only · </span>
        {GENERAL_INFO_WARNING}
      </p>
      <p className="max-w-4xl text-[11px] leading-relaxed text-[var(--ink-3)]">
        Data: Australian Bureau of Statistics (CC BY 4.0), Reserve Bank of Australia, OECD, U.S. Energy Information Administration, FRED® (Federal Reserve Bank of St. Louis), IMF PortWatch and other sources named on each page. Sources are not responsible for how A3RO uses their data.
      </p>
      <nav aria-label="Legal" className="flex flex-wrap gap-5 font-mono text-[11px] text-[var(--ink-3)]">
        <a href="/terms" className="hover:text-[var(--ink)]">Terms of use</a>
        <a href="/privacy" className="hover:text-[var(--ink)]">Privacy</a>
        <a href="mailto:a3ro.helpdesk@gmail.com" className="hover:text-[var(--ink)]">a3ro.helpdesk@gmail.com</a>
      </nav>
    </div>
  </footer>;
}
