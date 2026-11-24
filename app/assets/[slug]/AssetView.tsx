"use client";
// Client half of an asset page: the TradingView widgets and the anonymous asset_view event (#46).
import { useEffect } from "react";
import TradingViewWidget from "../../components/TradingViewWidget";
import { track } from "../../components/track";

export function AssetWidgets({ slug, tv, profile }: { slug: string; tv: string; profile: boolean }) {
  useEffect(() => { track("asset_view", { target: slug }); }, [slug]);
  return <div className="flex flex-col gap-8">
    <TradingViewWidget widget="symbol-info" height={180} label="Price" config={{ symbol: tv }} />
    <TradingViewWidget widget="advanced-chart" height={520} label="Chart" config={{
      symbol: tv, interval: "D", style: "1", timezone: "Australia/Sydney", allow_symbol_change: false,
      hide_side_toolbar: true, withdateranges: true, save_image: false, calendar: false, support_host: "https://www.tradingview.com",
    }} />
    {profile ? <TradingViewWidget widget="symbol-profile" height={380} label="Company profile" config={{ symbol: tv }} /> : null}
  </div>;
}
