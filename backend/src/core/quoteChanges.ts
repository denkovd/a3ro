/* ────────────────────────────────────────────────────────────────
   Day / week change for a live quote against stored daily closes.

   /api/oil/latest served a bare price, so anything quoting oil (the
   newsletter, a ticker) had no 1D or 1W move. Reference closes are
   taken strictly BEFORE the quote's own UTC date, so a settlement row
   written for today can never be compared with itself:

     prevClose  newest close dated before the quote's date
     d1         % vs prevClose
     w1         % vs the newest close at least 7 calendar days before
                the quote's date

   Pure: closes come from the caller (priceRepo.getDailySeries).
──────────────────────────────────────────────────────────────── */

export interface DatedClose {
  periodDate: string; // "YYYY-MM-DD"
  price: number;
}

export interface QuoteChanges {
  prevClose: number | null;
  prevCloseDate: string | null;
  d1: number | null;
  w1: number | null;
}

const pct = (now: number, then: number): number =>
  Math.round(((now - then) / then) * 10_000) / 100;

function minusDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function computeQuoteChanges(
  price: number | null | undefined,
  observedAt: string | null | undefined,
  closes: DatedClose[],
): QuoteChanges {
  const empty: QuoteChanges = { prevClose: null, prevCloseDate: null, d1: null, w1: null };
  if (typeof price !== "number" || !Number.isFinite(price) || !observedAt) return empty;
  const quoteDate = observedAt.slice(0, 10);
  const prior = closes
    .filter((c) => c.periodDate < quoteDate && Number.isFinite(c.price) && c.price > 0)
    .sort((a, b) => (a.periodDate < b.periodDate ? -1 : 1));
  if (prior.length === 0) return empty;

  const prev = prior[prior.length - 1];
  const weekCut = minusDays(quoteDate, 7);
  const weekRef = [...prior].reverse().find((c) => c.periodDate <= weekCut) ?? null;

  return {
    prevClose: prev.price,
    prevCloseDate: prev.periodDate,
    d1: pct(price, prev.price),
    w1: weekRef ? pct(price, weekRef.price) : null,
  };
}
