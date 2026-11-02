const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const add = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

// Gregorian Easter for Australia's national Good Friday/Easter Monday holidays.
function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function rbaBusinessDay(date: Date) {
  if ([0, 6].includes(date.getUTCDay())) return false;
  const year = date.getUTCFullYear(), day = iso(date), newYear = new Date(Date.UTC(year, 0, 1));
  const observedNewYear = add(newYear, newYear.getUTCDay() === 6 ? 2 : newYear.getUTCDay() === 0 ? 1 : 0);
  return ![iso(newYear), iso(observedNewYear), iso(add(easter(year), -2)), iso(add(easter(year), 1))].includes(day);
}

/** First Friday at least two business days after month-end, then one calendar day. */
export function australiaCapitalCheckDate(observationMonth: string) {
  let date = new Date(Date.UTC(Number(observationMonth.slice(0, 4)), Number(observationMonth.slice(5, 7)), 1));
  let businessDays = 0;
  while (true) {
    if (rbaBusinessDay(date)) businessDays++;
    if (date.getUTCDay() === 5 && rbaBusinessDay(date) && businessDays >= 2) return iso(add(date, 1));
    date = add(date, 1);
  }
}

/** Planning windows, not promises by the publishers. Actual source dates always win. */
export function capitalCheckDate(marketId: string, observationMonth: string) {
  if (marketId === "AU") return australiaCapitalCheckDate(observationMonth);
  let date = new Date(Date.UTC(Number(observationMonth.slice(0, 4)), Number(observationMonth.slice(5, 7)), 1));
  const businessDaysRequired = marketId === "GB" ? 2 : 1;
  let count = 0;
  while (true) {
    if (![0, 6].includes(date.getUTCDay()) && !(date.getUTCMonth() === 0 && date.getUTCDate() <= 3
      && date.getUTCDate() === (new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).getUTCDay() === 6 ? 3 : new Date(Date.UTC(date.getUTCFullYear(), 0, 1)).getUTCDay() === 0 ? 2 : 1))) count++;
    if (count >= businessDaysRequired) return iso(add(date, 1));
    date = add(date, 1);
  }
}

export function capitalRefreshPlan(
  markets: readonly { id: string; timeZone: string }[],
  latest: { marketId: string; asOf: string }[],
  now = new Date(),
) {
  return markets.map((market) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: market.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    const previous = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, 0));
    const targetMonth = iso(previous).slice(0, 7), checkOn = capitalCheckDate(market.id, targetMonth);
    const asOf = latest.find((row) => row.marketId === market.id)?.asOf;
    return { marketId: market.id, targetMonth, checkOn, due: today >= checkOn && (!asOf || asOf.slice(0, 7) < targetMonth) };
  });
}
