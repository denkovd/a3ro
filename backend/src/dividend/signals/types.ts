export type SignalSource = "epoch" | "btos" | "indeed";
export const SIGNAL_SOURCES: SignalSource[] = ["epoch", "btos", "indeed"];

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

export type SignalPayload = { epoch: EpochPayload; btos: BtosPayload; indeed: IndeedPayload };

export interface SignalDataset<S extends SignalSource = SignalSource> {
  source: S;
  retrievedAt: string;
  dataUrl: string;
  payload: SignalPayload[S];
}

export type SignalDatasets = { [S in SignalSource]?: SignalDataset<S> };
