/* ────────────────────────────────────────────────────────────────
   Privacy top 10 (roadmap #87): a static, sourced comparison, reviewed
   by hand each quarter (manual job "crypto-privacy-review").

   Usability counts as much as the tech: a project delisted everywhere
   is hard to use. No security ratings: only specialist audits can say
   a design is secure, so this records audits and incidents instead.
   Development activity (commits and contributors, 12 months) is filled
   in automatically by the daily crypto job from GitHub (`repo`).
   "Not checked" means we haven't confirmed it yet, not "no".
──────────────────────────────────────────────────────────────── */

export const PRIVACY_REVIEWED = "2026-11-27";

export interface PrivacySource { label: string; url: string }
export interface PrivacyProject {
  id: string;
  name: string;
  kind: "Privacy coin" | "Ethereum privacy" | "Bitcoin privacy" | "Confidential compute";
  /** How it hides things, in plain words. */
  method: string;
  /** Is a normal transaction private without the user choosing it? */
  byDefault: string;
  /** Does the cryptography depend on a one-time setup someone had to destroy? */
  trustedSetup: string;
  audits: string;
  incidents: string;
  /** Exchanges, wallets, ways in and out, regulation. */
  access: string;
  australia: string;
  summary: string;
  /** GitHub owner/repo whose commit activity stands in for development. */
  repo: string | null;
  sources: PrivacySource[];
}

export const PRIVACY_PROJECTS: PrivacyProject[] = [
  {
    id: "monero", name: "Monero (XMR)", kind: "Privacy coin",
    method: "Ring signatures hide the sender among decoys, stealth addresses hide the receiver, RingCT hides the amount.",
    byDefault: "Yes, every transaction",
    trustedSetup: "None",
    audits: "Next upgrade (FCMP++, which hides the sender among the whole chain instead of 16 decoys): audited by Trail of Bits (announced Aug 2026) and zkSecurity (Nov 2026, no high or medium findings). Not live on mainnet yet; test-network hard fork 5 Oct 2026.",
    incidents: "2025: Qubic mining pool's selfish-mining campaign; researchers found it fell short of a majority attack.",
    access: "Delisted by OKX (Jan 2024) and Binance (Feb 2024); Kraken dropped it in the EEA (Oct 2024), Canada (Sep 2025), India and the UAE (2026). Still on Kraken outside those regions, KuCoin, HTX, Bitfinex and MEXC, all with ID checks (Oct 2026). Usage stayed above pre-2022 levels despite delistings (TRM Labs).",
    australia: "No AUSTRAC-registered exchange lists it (Finder).",
    summary: "The default-private standard. Strongest everyday privacy, weakest access: buying it now mostly means swaps or offshore exchanges.",
    repo: "monero-project/monero",
    sources: [
      { label: "Crypto.news: FCMP++ zkSecurity audit", url: "https://crypto.news/monero-fcmp-upgrade-clears-zksecurity-audit-with-no-major-issues/" },
      { label: "Bitrue: Oct 2026 test-network upgrade", url: "https://www.bitrue.com/blog/when-is-next-monero-hard-fork-xmr-testnet-upgrade" },
      { label: "CoinTurk: exchanges listing XMR (Oct 2026)", url: "https://en.coin-turk.com/?p=254402" },
      { label: "Kraken: delisting notices", url: "https://support.kraken.com/au/sections/delistings" },
      { label: "Finder: buying Monero in Australia", url: "https://www.finder.com.au/how-to-buy-monero" },
      { label: "MEXC/Cointelegraph: TRM Labs on Monero usage", url: "https://www.mexc.com/news/740016" },
    ],
  },
  {
    id: "zcash", name: "Zcash (ZEC)", kind: "Privacy coin",
    method: "Zero-knowledge proofs (zk-SNARKs) in shielded pools hide sender, receiver and amount.",
    byDefault: "Optional, but the main wallets (Zodl, formerly Zashi) now shield by default. 59% of transactions were shielded in Feb 2026; about 29% of all ZEC sat in shielded pools in Q3 2026.",
    trustedSetup: "Current Orchard pool: none (Halo 2). Older pools used setup ceremonies.",
    audits: "External audit of the Ledger device app's Rust rewrite (minor changes only). NU7 network upgrade went live 6 Nov 2026.",
    incidents: "None major found in this review.",
    access: "Kraken dropped it in India and the UAE (2026). Ledger hardware wallets added shielded ZEC in Sep 2026.",
    australia: "Available on AUSTRAC-registered exchanges.",
    summary: "The most-audited zero-knowledge privacy design, with optional privacy that keeps exchange listings alive. The best balance of privacy and access in this list.",
    repo: "zcash/librustzcash",
    sources: [
      { label: "CoinDesk Research: shielded adoption", url: "https://www.coindesk.com/research/encryption-supremacy-zcash-and-privacy-in-the-age-of-scale" },
      { label: "Messari: Zcash Q3 2026 report", url: "https://messari.io/report/zcash-token-holder-report-q3-2026" },
      { label: "Decrypt: NU7 goes live", url: "https://decrypt.co/382692/zcashs-nu7-upgrade-goes-live-recycling-60-of-fees-to-fund-future-block-rewards" },
      { label: "ZecHub: Ledger app audit", url: "https://zechub.substack.com/p/zcash-shielded-news-vol10" },
      { label: "zkonomics: privacy coins in Australia", url: "https://zkonomics.pages.dev/buy/australia/" },
    ],
  },
  {
    id: "dash", name: "Dash (DASH)", kind: "Privacy coin",
    method: "Main chain: optional CoinJoin mixing. Evolution platform: shielded transfers built on Zcash's Orchard (live in v4.0.0, Jul 2026).",
    byDefault: "No, ordinary Dash transactions are transparent",
    trustedSetup: "None (CoinJoin; Orchard uses Halo 2)",
    audits: "Not checked",
    incidents: "None major found in this review.",
    access: "Kraken dropped it in India and the UAE (2026); some exchanges delisted it in 2026 for AML reasons.",
    australia: "Not checked",
    summary: "Payments coin with privacy as an add-on. Optional privacy keeps it listed, but most activity is not private.",
    repo: "dashpay/dash",
    sources: [
      { label: "HTX/cryptonews: Dash launches ZK privacy", url: "https://www.htx.com/news/447970/" },
      { label: "Dash: shielded transactions on Evolution", url: "https://crash.dash.org/blog/dash-is-adding-shielded-transactions-to-evolution" },
      { label: "Kraken: UAE delistings", url: "https://support.kraken.com/ch/articles/notice-of-delistings-uae" },
    ],
  },
  {
    id: "firo", name: "Firo (FIRO)", kind: "Privacy coin",
    method: "Lelantus Spark: zero-knowledge proofs hide sender, receiver and amount.",
    byDefault: "Yes, Spark addresses are the default",
    trustedSetup: "None",
    audits: "Spark protocol published as a peer-reviewed IACR paper (2021).",
    incidents: "Aug 2026: Spark inflation bug (forged coins possible in multi-input spends); multi-input spends disabled, fixed by hard fork on 4 Sep 2026.",
    access: "Binance delisted it on 16 Apr 2025. Relies on swap services, a few exchanges and bridges; wrapped FIRO on other chains is not private.",
    australia: "Not checked",
    summary: "Strong default privacy without a trusted setup, but a 2026 inflation bug and thin exchange access.",
    repo: "firoorg/firo",
    sources: [
      { label: "Yellow: Firo and Zano", url: "https://yellow.com/research/privacy-coins-firo-zano-leading-repricing" },
      { label: "Crypto Times: Spark bug and hard fork", url: "https://www.cryptotimes.io/2026/09/18/firo-firo-price-surges-33-after-spark-hard-fork-fix-and-rsfiro-cross-chain-launch/" },
      { label: "Firo Frontier: Binance delisting", url: "https://buttondown.com/firo/archive/firo-frontier-newsletter-vol-2-no-7/" },
    ],
  },
  {
    id: "zano", name: "Zano (ZANO)", kind: "Privacy coin",
    method: "Ring signatures and Bulletproofs+ hide sender, receiver and amount; Confidential Assets let anyone issue private tokens, such as the fUSD stablecoin.",
    byDefault: "Yes, every transaction",
    trustedSetup: "None",
    audits: "Not checked",
    incidents: "Sep 2026: a flaw in the new Gateway Addresses let an attacker mint about 36.9M ZANO and 1.8 trillion fUSD; the chain was rolled back about a month (2 Oct 2026).",
    access: "Mostly its own wallet, DEX and swaps.",
    australia: "Not checked",
    summary: "The most ambitious private platform (private stablecoins, trading), but the 2026 exploit and rollback show the risk of new features.",
    repo: "hyle-team/zano",
    sources: [
      { label: "CoinGecko Learn: what is Zano", url: "https://www.coingecko.com/learn/what-is-zano-privacy-blockchain-platform" },
      { label: "CoinMarketCap: Zano exploit and rollback", url: "https://coinmarketcap.com/cmc-ai/zano/latest-updates" },
    ],
  },
  {
    id: "railgun", name: "Railgun (RAIL)", kind: "Ethereum privacy",
    method: "Zero-knowledge shielded balances inside Ethereum, Arbitrum, BNB Chain and Polygon; private transfers and DeFi trades without leaving the chain.",
    byDefault: "No, users shield tokens into it",
    trustedSetup: "Not checked",
    audits: "Not checked",
    incidents: "None major found in this review.",
    access: "Works with existing wallets and tokens; 'Private Proofs of Innocence' screens deposits against known illicit addresses. About $110M held (L2BEAT); record $117M of stablecoins moved in Sep 2026; $4.5B moved since 2021.",
    australia: "Uses ordinary tokens (ETH, USDC), so no privacy-coin listing needed.",
    summary: "The practical route to private stablecoins today: dollars stay ordinary USDC or DAI, only the history is hidden.",
    repo: "Railgun-Community/engine",
    sources: [
      { label: "L2BEAT: Railgun", url: "https://l2beat.com/privacy/projects/railgun" },
      { label: "TechFlow / Alea Research: record stablecoin month", url: "https://www.techflowpost.com/en-US/article/35111" },
      { label: "AMBCrypto: $4.5B cumulative volume", url: "https://ambcrypto.com/railgun-launches-plug-and-play-privacy-defi-layer-for-ethereum/" },
    ],
  },
  {
    id: "aztec", name: "Aztec (AZTEC)", kind: "Ethereum privacy",
    method: "A privacy layer 2 on Ethereum: smart contracts can run privately, with zero-knowledge proofs checked on Ethereum.",
    byDefault: "Apps choose what is private",
    trustedSetup: "Not checked",
    audits: "Audits ongoing; the team says to deposit only what you can afford to lose.",
    incidents: "27 Jul 2026: critical flaw found in the V5 alpha proving system (by an internal AI-assisted audit). Tierra (V6, 3 Nov 2026) fixed security issues and sped up proofs.",
    access: "Alpha mainnet since 1 Apr 2026; token launched 12 Feb 2026.",
    australia: "Not checked",
    summary: "The most capable design here (private apps, not just payments), but still alpha software.",
    repo: "AztecProtocol/aztec-packages",
    sources: [
      { label: "KuCoin: Alpha mainnet", url: "https://www.kucoin.com/news/flash/privacy-chain-aztec-network-launches-alpha-mainnet" },
      { label: "Aztec: V5 vulnerability notice", url: "https://aztec.network/ko/blog/your-favorite-defi-apps-now-with-privacy" },
      { label: "The Block: Tierra V6", url: "https://theblock.co/news/defi/2026-11-03-ethereum-l2-aztec-tierra-v6-upgrade-private-apps-432399" },
      { label: "Binance Square: token launch", url: "https://www.binance.com/cs/square/post/291767018993153" },
    ],
  },
  {
    id: "secret", name: "Secret Network (SCRT)", kind: "Confidential compute",
    method: "Private smart contracts run inside Intel SGX secure hardware (a trusted execution environment), not cryptography alone.",
    byDefault: "Yes, contract data is encrypted",
    trustedSetup: "Trusts Intel's hardware instead",
    audits: "Not checked",
    incidents: "2022: researchers extracted the network's master decryption key through an Intel chip flaw (ÆPIC Leak); patched. 2025: tee.fail flaw led the network to switch to permissioned nodes. Bridge exploited for $4.7M.",
    access: "Jul 2026: proposed moving SCRT to Arbitrum.",
    australia: "Not checked",
    summary: "Privacy that depends on hardware, which has been broken more than once. Weakest guarantees in this list.",
    repo: "scrtlabs/SecretNetwork",
    sources: [
      { label: "Blockworks: 2022 vulnerability", url: "https://blockworks.com/news/secret-network-crypto-transactions-not-so-secret-after-all" },
      { label: "Secret Network: 2026 roadmap", url: "https://scrt.network/blog/secret-network-2026-roadmap" },
      { label: "Cointelegraph: proposed Arbitrum move", url: "https://cointelegraph.com/news/secret-network-cites-ai-exploit-risks-in-proposed-arbitrum-move?rand=6792" },
    ],
  },
  {
    id: "btc-tools", name: "Bitcoin privacy tools", kind: "Bitcoin privacy",
    method: "Silent Payments (a new address for every payment from one reusable code), PayJoin (both sides add coins, breaking a key tracing rule) and CoinJoin (many users combine payments).",
    byDefault: "No, wallet features the user turns on",
    trustedSetup: "None",
    audits: "Open standards (BIP352, BIP77/78) reviewed in public by Bitcoin developers.",
    incidents: "Jun 2024: law enforcement shut the coordinators of Wasabi and Whirlpool CoinJoin; independent coordinators replaced them.",
    access: "Silent Payments in Cake Wallet and Sparrow (send and receive from May 2026); Bitcoin Core merged the crypto module in Jun 2026. PayJoin in Bull Bitcoin and Cake Wallet. Works with ordinary BTC, so no listing problem.",
    australia: "Ordinary BTC, available everywhere.",
    summary: "Private bitcoin is arriving through wallets rather than a new coin; adoption is early.",
    repo: "cake-tech/cake_wallet",
    sources: [
      { label: "Spark: Bitcoin privacy in 2026", url: "https://www.spark.money/research/bitcoin-privacy-landscape-2026" },
      { label: "Spark: which privacy tool", url: "https://www.spark.money/tools/which-bitcoin-privacy-tool-should-i-use" },
      { label: "PETS 2026: CoinJoin coordinators", url: "https://crysp.petsymposium.org/popets/2026/popets-2026-0061.php" },
    ],
  },
  {
    id: "liquid", name: "Liquid Network (L-BTC, USDt)", kind: "Bitcoin privacy",
    method: "A federated Bitcoin sidechain; Confidential Transactions hide amounts and asset types (not who pays whom).",
    byDefault: "Yes, amounts and asset types",
    trustedSetup: "Trusts the federation that holds the bitcoin backing L-BTC",
    audits: "Not checked",
    incidents: "Sep 2026: transactions stopped until a fix (resumed 10 Sep); peg-outs stayed paused and the reserve was about 600 BTC short (Oct 2026); full 1:1 backing restored in Nov 2026.",
    access: "Holds about $5B (mid-2026) in L-BTC, USDt and tokenized securities; Bitfinex and SideShift move funds in and out.",
    australia: "Not checked",
    summary: "Hides amounts for bitcoin and Tether, but relies on a federation, and the 2026 reserve shortfall shows that risk.",
    repo: "ElementsProject/elements",
    sources: [
      { label: "Blockstream: Liquid confidentiality", url: "https://help.blockstream.com/liquid-network/faqs/how-does-liquid-keep-my-transaction-data-confidential.md" },
      { label: "Spark: Liquid deep dive", url: "https://www.spark.money/research/liquid-network-federated-sidechain" },
      { label: "Learn Bitcoin: 2026 halt and peg", url: "https://www.learnbitcoin.com/glossary/liquid-network" },
      { label: "KuCoin: reserves restored", url: "https://www.kucoin.com/blog/liquid-network-restores-full-bitcoin-reserves-lbtc" },
    ],
  },
];

/* ── Development activity (GitHub, public repos) ─────────────────
   /stats/participation gives 52 weekly commit counts for the default
   branch. GitHub builds it on first request and answers 202 until it
   is ready, so we ask again a few times. */
export interface PrivacyDev { commits52w: number; commits13w: number; weekly: number[] }

export function summariseParticipation(all: unknown): PrivacyDev | null {
  if (!Array.isArray(all) || all.length === 0 || !all.every((n) => typeof n === "number")) return null;
  const weekly = all as number[];
  const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
  return { commits52w: sum(weekly), commits13w: sum(weekly.slice(-13)), weekly };
}

export async function fetchPrivacyDev(
  ghGet: (path: string) => Promise<{ status: number; body: unknown }>,
  projects: PrivacyProject[] = PRIVACY_PROJECTS,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ dev: Record<string, PrivacyDev>; problems: string[] }> {
  const dev: Record<string, PrivacyDev> = {};
  const problems: string[] = [];
  for (const p of projects) {
    if (!p.repo) continue;
    let got: PrivacyDev | null = null;
    for (let attempt = 0; attempt < 4 && !got; attempt++) {
      try {
        const r = await ghGet(`/repos/${p.repo}/stats/participation`);
        if (r.status === 200) got = summariseParticipation((r.body as { all?: unknown })?.all);
        else if (r.status !== 202) break;
      } catch { break; }
      if (!got) await wait(3000);
    }
    if (got) dev[p.id] = got; else problems.push(`privacy dev activity: no GitHub stats for ${p.repo}`);
  }
  return { dev, problems };
}
