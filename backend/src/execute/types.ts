/* Execute module (BTC Event Pivots) — shapes shared by the repo, API routes and page. */

export const EXECUTE_STRATEGY_VERSION = "v1.1";
export const EXECUTE_Z_THRESHOLD = 0.75;
export const EXECUTE_ARM_HOURS = 24;

export type ExecuteEventKind = "FOMC" | "CPI";
export type ExecuteLean = "short" | "long" | "none";
export type ExecuteMode = "backtest" | "paper";

export interface ExecuteEvent {
  id: number;
  kind: ExecuteEventKind;
  eventTime: string;
  armTime: string;
}

export interface ExecuteChecklist {
  q1_htf_trend: boolean;
  q2_bull_bear: boolean;
  q3_liquidity_swept: boolean;
  q4_strong_push: boolean;
  q5_exhausted: boolean;
  month_confluence: boolean;
  score: number;
  rsi4: number | null;
}

export interface ExecuteSignal {
  eventId: number;
  snapshotAt: string;
  asOfBar: string;
  state: "preview" | "armed";
  btcPrice: number | null;
  move7dPct: number | null;
  z: number | null;
  zThreshold: number;
  lean: ExecuteLean;
  checklist: ExecuteChecklist | null;
}

export interface ExecuteFill { tag: string; price: number; qty: number; time: string }

export interface ExecuteTrade {
  mode: ExecuteMode;
  eventKind: ExecuteEventKind;
  eventTime: string;
  armedAt: string;
  side: "short" | "long";
  riskPct: number | null;
  z: number | null;
  move7dPct: number | null;
  levels: { e1?: number; e2?: number; e3?: number; stop?: number; tp1?: number; stop_dist_pct?: number } | null;
  entries: ExecuteFill[];
  exits: ExecuteFill[];
  stop: number | null;
  pnlPct: number | null;
  status: "pending" | "open" | "closed" | "skipped";
  skipReason: string | null;
  openedAt: string | null;
  closedAt: string | null;
}

export interface ExecuteStats {
  mode: ExecuteMode;
  asOf: string;
  trades: number;
  netPct: number | null;
  profitFactor: number | null;
  winRate: number | null;
  maxDdPct: number | null;
  byYear: Record<string, { trades: number; net_pct: number; win_rate: number }>;
  equity: { t: string; pct: number }[];
}

export interface ExecuteRecord { stats: ExecuteStats | null; trades: ExecuteTrade[] }

export interface ExecuteUpcoming extends ExecuteEvent { signal: ExecuteSignal | null }

export interface ExecuteNewsletterBlock { free: string; premium: string }

/** /api/execute (Premium). */
export interface ExecutePayload {
  version: string;
  generatedAt: string;
  engine: { lastRunAt: string | null; ok: boolean | null };
  upcoming: ExecuteUpcoming[];
  openTrade: ExecuteTrade | null;
  paper: ExecuteRecord;
  backtest: ExecuteRecord;
  newsletter: ExecuteNewsletterBlock | null;
}

/** /api/execute-peek (public): calendar only — no prices, signals or record. */
export interface ExecutePeekPayload {
  version: string;
  generatedAt: string;
  upcoming: ExecuteEvent[];
}
