/* ────────────────────────────────────────────────────────────────
   Crypto fundamentals (roadmap #82): the projects on the scorecard.

   One yardstick for all of them: who pays to use it, and how much.
   Every number comes from DefiLlama's free API (open data).

   `chain`    DefiLlama chain name, for TVL and stablecoins held on
              the chain (null when the project is not a chain).
   `fees`     names to look for in DefiLlama's fees list, in order;
              the first match is used for fees and revenue. Chains
              appear there with the fees paid to use the chain itself.
──────────────────────────────────────────────────────────────── */

export type CryptoGroup = "index" | "platform" | "infrastructure" | "tokenization" | "privacy";

export interface CryptoProject {
  id: string;
  name: string;
  symbol: string;
  group: CryptoGroup;
  chain: string | null;
  fees: string[];
  /** One line on what users pay for. */
  role: string;
  /** TradingView symbol for the asset page link. */
  tv?: string;
  /** CoinGecko id, for market cap (Premium: market data, #18). */
  gecko?: string;
}

export const CRYPTO_GROUP_LABEL: Record<CryptoGroup, string> = {
  index: "The index",
  platform: "Platforms",
  infrastructure: "Real-world infrastructure",
  tokenization: "Tokenization rails",
  privacy: "Privacy",
};
export const CRYPTO_GROUP_ORDER: CryptoGroup[] = ["index", "platform", "infrastructure", "tokenization", "privacy"];

export const CRYPTO_PROJECTS: CryptoProject[] = [
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", group: "index", chain: "Bitcoin", fees: ["Bitcoin"], role: "Block space for final settlement; fees paid to miners.", tv: "COINBASE:BTCUSD", gecko: "bitcoin" },

  { id: "ethereum", name: "Ethereum", symbol: "ETH", group: "platform", chain: "Ethereum", fees: ["Ethereum"], role: "Block space for DeFi, stablecoins and layer-2 settlement.", tv: "COINBASE:ETHUSD", gecko: "ethereum" },
  { id: "solana", name: "Solana", symbol: "SOL", group: "platform", chain: "Solana", fees: ["Solana"], role: "High-throughput block space: trading, payments, memecoins.", tv: "COINBASE:SOLUSD", gecko: "solana" },
  { id: "hyperliquid", name: "Hyperliquid", symbol: "HYPE", group: "platform", chain: "Hyperliquid L1", fees: ["Hyperliquid Perps", "Hyperliquid"], role: "On-chain perpetuals exchange; traders pay trading fees.", tv: "BYBIT:HYPEUSDT", gecko: "hyperliquid" },
  { id: "tron", name: "Tron", symbol: "TRX", group: "platform", chain: "Tron", fees: ["Tron"], role: "Mostly USDT transfers; users pay for bandwidth and energy.", tv: "BINANCE:TRXUSDT", gecko: "tron" },
  { id: "bnb", name: "BNB Chain", symbol: "BNB", group: "platform", chain: "BSC", fees: ["BNB Chain", "BSC", "Binance Smart Chain"], role: "Exchange-backed chain for trading and DeFi.", tv: "BINANCE:BNBUSDT", gecko: "binancecoin" },
  { id: "base", name: "Base", symbol: "—", group: "platform", chain: "Base", fees: ["Base"], role: "Coinbase's layer 2 on Ethereum; no token of its own.", tv: undefined },
  { id: "sui", name: "Sui", symbol: "SUI", group: "platform", chain: "Sui", fees: ["Sui"], role: "Newer high-throughput chain.", tv: "BINANCE:SUIUSDT", gecko: "sui" },
  { id: "avalanche", name: "Avalanche", symbol: "AVAX", group: "platform", chain: "Avalanche", fees: ["Avalanche", "Avalanche C-Chain"], role: "Smart-contract chain with app-specific subnets.", tv: "BINANCE:AVAXUSDT", gecko: "avalanche-2" },
  { id: "cardano", name: "Cardano", symbol: "ADA", group: "platform", chain: "Cardano", fees: ["Cardano"], role: "Smart-contract chain; usage measured like the others.", tv: "BINANCE:ADAUSDT", gecko: "cardano" },
  { id: "xrp", name: "XRP Ledger", symbol: "XRP", group: "platform", chain: "XRPL", fees: ["XRP Ledger", "XRPL", "Ripple"], role: "Payments ledger; usage measured like the others.", tv: "BINANCE:XRPUSDT", gecko: "ripple" },

  { id: "helium", name: "Helium", symbol: "HNT", group: "infrastructure", chain: null, fees: ["Helium Network", "Helium"], role: "Wireless coverage that carriers and devices pay to use (data credits).", tv: "BINANCE:HNTUSDT", gecko: "helium" },
  { id: "chainlink", name: "Chainlink", symbol: "LINK", group: "tokenization", chain: null, fees: ["Chainlink", "Chainlink VRF", "Chainlink Requests"], role: "Price feeds and cross-chain messaging. DefiLlama only tracks its on-chain request fees, not what data users pay off-chain, so it reads low.", tv: "BINANCE:LINKUSDT", gecko: "chainlink" },
  { id: "ondo", name: "Ondo", symbol: "ONDO", group: "tokenization", chain: null, fees: ["Ondo Yield Assets", "Ondo Finance", "Ondo"], role: "Tokenized Treasuries and funds; holders pay management fees.", tv: "BYBIT:ONDOUSDT", gecko: "ondo-finance" },

  { id: "zcash", name: "Zcash", symbol: "ZEC", group: "privacy", chain: null, fees: ["Zcash"], role: "Optional shielded payments; fees paid to miners.", tv: "BINANCE:ZECUSDT", gecko: "zcash" },
  { id: "monero", name: "Monero", symbol: "XMR", group: "privacy", chain: null, fees: ["Monero"], role: "Private-by-default payments; fees paid to miners.", tv: "KRAKEN:XMRUSD", gecko: "monero" },
];

export const QUANT_NOTE = "Quant (QNT) is left out: its revenue is from enterprise licences, which DefiLlama does not track.";
