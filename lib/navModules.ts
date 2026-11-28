/* Lightweight module lists for the site header dropdowns (no globe data imported).
   Order matches the homepage module list and the commodity tab row (CommodityNav). */

export interface NavItem { label: string; route: string; /** Premium even where the page itself is open (BTC). */ premium?: boolean }

export const NAV_MODULES: readonly NavItem[] = [
  { label: "Australia Watch", route: "/Projects/Australia-Watch" },
  { label: "AI Dividend", route: "/Projects/AI-Dividend" },
  { label: "Commodity Watch", route: "/Projects/Oil-Tracker" },
  { label: "Crypto", route: "/Projects/Crypto-Fundamentals" },
  { label: "Trend Finder", route: "/Projects/Bull-Market-Finder" },
  { label: "Regime", route: "/Projects/Regime-Shift" },
  { label: "Earnings Beat", route: "/Projects/Earnings-Beat" },
  { label: "Execute", route: "/Projects/Execute" },
];

export const NAV_COMMODITIES: readonly NavItem[] = [
  { label: "Oil", route: "/Projects/Oil-Tracker" },
  { label: "Iron ore", route: "/Projects/Iron-Ore-Tracker" },
  { label: "Copper", route: "/Projects/Copper-Tracker" },
  { label: "LNG", route: "/Projects/LNG-Tracker" },
  { label: "Uranium", route: "/Projects/Uranium-Tracker" },
  { label: "Gold", route: "/Projects/Gold-Tracker", premium: true },
  { label: "BTC", route: "/Projects/BTC-Tracker", premium: true },
];
