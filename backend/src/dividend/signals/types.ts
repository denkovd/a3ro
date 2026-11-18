export type SignalSource = "epoch" | "btos" | "indeed" | "eia" | "fred" | "datacentres" | "drought";
/** Step 3: capability, adoption and jobs. */
export const STEP3_SOURCES: SignalSource[] = ["epoch", "btos", "indeed"];
/** Step 4: constraint gauges. */
export const CONSTRAINT_SOURCES: SignalSource[] = ["eia", "fred", "datacentres", "drought"];
export const SIGNAL_SOURCES: SignalSource[] = [...STEP3_SOURCES, ...CONSTRAINT_SOURCES];

/** One model on the Epoch Capabilities Index. */
export interface EciModel {
  model: string;
  name: string;
  organization: string;
  date: string;
  score: number;
  open: boolean;
}

export interface EpochPayload {
  models: EciModel[];
}

/** One fortnightly Census BTOS estimate, dated by the end of its reference period. */
export interface BtosPoint {
  period: string;
  sampleCode: string;
  use: number | null;
  expected: number | null;
}

export interface BtosPayload {
  /** Kept so a change in Census's question wording is visible as a break. */
  useQuestion: string;
  points: BtosPoint[];
}

/** Indeed postings index (1 Feb 2020 = 100), monthly mean of daily values per occupation. */
export interface IndeedPayload {
  sectors: { sector: string; points: { period: string; value: number }[] }[];
  latestDay: string;
}

/** EIA retail electricity: monthly sales (million kWh) and price (cents/kWh). */
export interface EiaPayload {
  rows: { period: string; state: string; sector: string; sales: number | null; price: number | null }[];
}

/** IMF commodity prices via FRED, monthly USD. */
export interface FredPayload {
  series: { uranium: { date: string; value: number }[]; copper: { date: string; value: number }[] };
}

/** Epoch AI's tracked frontier data centres (current state). */
export interface DataCentresPayload {
  sites: { name: string; country: string; state: string | null; powerMw: number; h100e: number | null; capexBn: number | null; owner: string }[];
}

/** US Drought Monitor: latest share of each state's area in severe drought or worse (D2–D4). */
export interface DroughtPayload {
  states: { state: string; date: string; severeOrWorse: number }[];
}

export type SignalPayload = { epoch: EpochPayload; btos: BtosPayload; indeed: IndeedPayload; eia: EiaPayload; fred: FredPayload; datacentres: DataCentresPayload; drought: DroughtPayload };

export interface SignalDataset<S extends SignalSource = SignalSource> {
  source: S;
  retrievedAt: string;
  dataUrl: string;
  payload: SignalPayload[S];
}

export type SignalDatasets = { [S in SignalSource]?: SignalDataset<S> };
