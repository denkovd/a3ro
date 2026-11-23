/* ────────────────────────────────────────────────────────────────
   Central bank meeting dates (roadmap #24). Hand-kept: both banks
   publish a year ahead. Re-check each December and whenever a bank
   revises its calendar (the Fed did on 12 Nov 2026).

   decisionAt is the announcement instant in UTC:
   - RBA: 2:30 pm Sydney time on day 2 (AEDT = UTC+11 Oct–Apr, AEST = UTC+10 Apr–Oct)
   - Fed: 2:00 pm Washington time on day 2 (EST = UTC−5, EDT = UTC−4)
   Verified 23 Nov 2026 against the sources below.
──────────────────────────────────────────────────────────────── */

export interface CentralBankMeeting {
  bank: "RBA" | "Fed";
  /** Meeting days, e.g. "8–9 Feb 2027". */
  label: string;
  /** Policy announcement time (UTC ISO). Null when the meeting has no policy decision. */
  decisionAt: string | null;
  /** Last meeting day (UTC ISO), used to retire meetings that have no decision time. */
  endsAt?: string;
  note?: string;
}

export const CENTRAL_BANK_SOURCES = {
  RBA: "https://www.rba.gov.au/schedules-events/calendar/",
  Fed: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
} as const;

export const CENTRAL_BANK_MEETINGS: readonly CentralBankMeeting[] = [
  { bank: "RBA", label: "7–8 Dec 2026", decisionAt: "2026-12-08T03:30:00Z" },
  { bank: "Fed", label: "8–9 Dec 2026", decisionAt: "2026-12-09T19:00:00Z", note: "With economic projections" },
  { bank: "Fed", label: "26–27 Jan 2027", decisionAt: "2027-01-27T19:00:00Z" },
  { bank: "RBA", label: "8–9 Feb 2027", decisionAt: "2027-02-09T03:30:00Z" },
  { bank: "Fed", label: "16–17 Mar 2027", decisionAt: "2027-03-17T18:00:00Z" },
  { bank: "RBA", label: "22–23 Mar 2027", decisionAt: "2027-03-23T03:30:00Z" },
  { bank: "Fed", label: "27–28 Apr 2027", decisionAt: "2027-04-28T18:00:00Z" },
  { bank: "RBA", label: "3–4 May 2027", decisionAt: "2027-05-04T04:30:00Z" },
  { bank: "Fed", label: "8–9 Jun 2027", decisionAt: "2027-06-09T18:00:00Z" },
  { bank: "RBA", label: "21–22 Jun 2027", decisionAt: "2027-06-22T04:30:00Z" },
  { bank: "Fed", label: "27–28 Jul 2027", decisionAt: "2027-07-28T18:00:00Z" },
  { bank: "RBA", label: "9–10 Aug 2027", decisionAt: "2027-08-10T04:30:00Z" },
  { bank: "Fed", label: "14–15 Sep 2027", decisionAt: "2027-09-15T18:00:00Z" },
  { bank: "RBA", label: "27–28 Sep 2027", decisionAt: "2027-09-28T04:30:00Z" },
  { bank: "Fed", label: "26–27 Oct 2027", decisionAt: null, endsAt: "2027-10-27T22:00:00Z", note: "Strategy meeting, no policy decision" },
  { bank: "RBA", label: "1–2 Nov 2027", decisionAt: "2027-11-02T03:30:00Z" },
  { bank: "Fed", label: "16–17 Nov 2027", decisionAt: "2027-11-17T19:00:00Z" },
  { bank: "RBA", label: "13–14 Dec 2027", decisionAt: "2027-12-14T03:30:00Z" },
  { bank: "Fed", label: "25–26 Jan 2028", decisionAt: "2028-01-26T19:00:00Z" },
];

/** Meetings that haven't finished yet, in date order. */
export function upcomingMeetings(now = new Date(), limit = 8): CentralBankMeeting[] {
  return CENTRAL_BANK_MEETINGS.filter((m) => new Date(m.decisionAt ?? m.endsAt ?? 0) >= now).slice(0, limit);
}
