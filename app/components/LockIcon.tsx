/** Small padlock marking a Premium module the viewer hasn't unlocked. */
export function LockIcon({ className = "", title }: { className?: string; title?: string }) {
  return <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.5"
    className={`inline-block shrink-0 align-[-0.125em] ${className}`} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
    {title ? <title>{title}</title> : null}
    <rect x="3" y="7" width="10" height="7" rx="1.2" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
  </svg>;
}
