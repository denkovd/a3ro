"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ModulePlaceholder({ name, href }: { name: string; href: string }) {
  return (
    <a href={href} className="flex h-full min-h-[inherit] w-full flex-col justify-end rounded-sm hairline bg-[var(--depth-1)] p-6">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--ink-3)]">A3RO Intelligence</span>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">{name}</h3>
      <span className="mt-4 text-sm text-[var(--acid)]">Open platform →</span>
    </a>
  );
}

/** Reserve the card's space and keep a working link before loading its preview. */
export default function DeferredModule({
  children, className, name, href, preload, observe = true,
}: {
  children: ReactNode;
  className: string;
  name: string;
  href: string;
  preload?: boolean;
  observe?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (preload) setReady(true);
  }, [preload]);

  useEffect(() => {
    if (ready || !observe) return;
    if (!ref.current) return;
    if (!("IntersectionObserver" in window)) {
      setReady(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReady(true);
        observer.disconnect();
      }
    }, { rootMargin: "400px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [observe, ready]);

  return (
    <div ref={ref} className={className}>
      {ready ? children : <ModulePlaceholder name={name} href={href} />}
    </div>
  );
}
