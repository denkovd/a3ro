"use client";
/* ────────────────────────────────────────────────────────────────
   TradingView embed (free widgets, roadmap #24 / #43).

   Terms (#37): the TradingView attribution must stay visible, so the
   copyright line below is part of the component and can't be turned
   off. Stock data in widgets is delayed. Commercial use and use behind
   a login aren't covered by the widget docs, so these widgets are only
   used on free, public pages until TradingView confirms in writing.
──────────────────────────────────────────────────────────────── */
import { useEffect, useRef } from "react";

export type TradingViewWidgetName = "events" | "market-overview" | "mini-symbol-overview" | "symbol-overview" | "advanced-chart" | "stock-heatmap" | "forex-heat-map" | "symbol-info" | "symbol-profile";

export default function TradingViewWidget({ widget, config, height, label }: {
  widget: TradingViewWidgetName;
  config: Record<string, unknown>;
  height: number;
  /** What the widget shows, for screen readers and the attribution line. */
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  // The advanced chart takes `theme` and autosizes to its box; the other widgets take `colorTheme`.
  const json = JSON.stringify(widget === "advanced-chart"
    ? { theme: "dark", backgroundColor: "rgba(0, 0, 0, 0)", locale: "en", autosize: true, ...config }
    : { colorTheme: "dark", isTransparent: true, locale: "en", width: "100%", height, ...config });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = "";
    const script = document.createElement("script");
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget}.js`;
    script.async = true;
    script.type = "text/javascript";
    script.text = json;
    el.appendChild(script);
    return () => { el.innerHTML = ""; };
  }, [widget, json]);

  return <figure className="tradingview-widget-container" aria-label={label}>
    <div ref={host} className="tradingview-widget-container__widget" style={widget === "advanced-chart" ? { height } : { minHeight: height }} />
    <figcaption className="tradingview-widget-copyright mt-2 font-mono text-[10px] text-[var(--ink-3)]">
      <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank" className="underline" data-track-outbound="tradingview">
        {label} by TradingView
      </a>
      <span> · stock data delayed</span>
    </figcaption>
  </figure>;
}
