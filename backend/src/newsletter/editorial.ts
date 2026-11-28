/* ────────────────────────────────────────────────────────────────
   Newsletter editorial: the parts a person writes. Claude drafts them
   in Admin → Newsletter; the owner edits and approves. Nothing drafted
   goes out without the owner approving the issue.

     bigNews  the week's most market-moving story plus two briefs, from
              a web search (paraphrased, no quotes), tied to A3RO data
     pattern  2–3 sentences on the week's Trend Finder flips (Premium)
     updates  what shipped on A3RO this week, from the public repo's
              commit messages, in user-facing words
     earnings notable companies reporting in the 7 days after the send
              (US large caps and ASX 200), from a web search. Report
              dates are public facts; no licensed earnings data (#8)

   Uses the Anthropic Messages API with the web search tool. Needs
   ANTHROPIC_API_KEY; NEWSLETTER_MODEL overrides the model.
──────────────────────────────────────────────────────────────── */

export interface BigNews { headline: string; body: string; why: string; briefs: string[] }
export interface Updates { shipped: string[]; fixed: string[]; next: string[] }
export type EditorialSlot = "summary" | "bigNews" | "pattern" | "earnings" | "updates";
export const SLOT_LABEL: Record<EditorialSlot, string> = { summary: "This week in one line", bigNews: "Big news this week", pattern: "Pattern of the week (Premium)", earnings: "Earnings next week", updates: "A3RO updates" };
export interface Editorial {
  /** Slots the owner chose to leave out this week (no placeholder, no section). */
  skip?: EditorialSlot[] | null;
  bigNews?: BigNews | null;
  /** One sentence at the top of the issue for readers who only skim. */
  summary?: string | null;
  pattern?: string | null;
  updates?: Updates | null;
  earnings?: string[] | null;
  draftedAt?: string | null;
  editedAt?: string | null;
  editedBy?: string | null;
  model?: string | null;
}

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const PUBLIC_REPO = "denkovd/a3ro";

/** Commit subjects worth telling readers about: no scan caches, roadmap edits or merges. */
export function userFacingCommits(subjects: string[]): string[] {
  return subjects
    .map((s) => s.split("\n")[0].trim())
    .filter((s) => s && !/^(chore|roadmap|merge|wip|docs?)\b|bar cache|^revert/i.test(s))
    .slice(0, 40);
}

export async function fetchRecentCommits(since: Date, opts: { repo?: string; fetchImpl?: typeof fetch } = {}): Promise<string[]> {
  const url = `https://api.github.com/repos/${opts.repo ?? PUBLIC_REPO}/commits?since=${since.toISOString()}&per_page=100`;
  const res = await (opts.fetchImpl ?? fetch)(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "a3ro-newsletter" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const body = await res.json() as { commit?: { message?: string } }[];
  return userFacingCommits(body.map((c) => c.commit?.message ?? ""));
}

const SYSTEM = [
  "You write the editorial parts of A3RO Daily Session's weekly issue, an Australian market-intelligence newsletter.",
  "Rules: Australian English, plain and short sentences. General information only: never recommend buying, selling or holding anything, and never say what a reader should do.",
  "Use web search for the news. Paraphrase in your own words; never copy sentences and never quote more than a few words. Do not name a source inside the text.",
  "Only state numbers that appear in your search results or in the data you are given. If unsure, leave the number out.",
  "Reply with one JSON object and nothing else.",
].join("\n");

export function buildPrompt(input: { issueDate: string; context: string; commits: string[]; wantPattern: boolean }): string {
  return [
    `Issue date: ${input.issueDate} (sent Monday 6pm Sydney). Cover the 7 days before it.`,
    "",
    "A3RO data this week:",
    input.context,
    "",
    "Commit messages from the A3RO repo this week:",
    ...(input.commits.length ? input.commits.map((c) => `- ${c}`) : ["(none)"]),
    "",
    "Return JSON with this shape:",
    `{"summary":"one sentence, at most 30 words: the week's main story and what it means for the A3RO signals",`,
    `"bigNews":{"headline":"…","body":"2–3 sentences on the week's most market-moving story","why":"one sentence tying it to the A3RO data above","briefs":["one sentence","one sentence"]},`,
    input.wantPattern ? `"pattern":"2–3 sentences on what the week's Trend Finder flips say together, from the data above",` : `"pattern":null,`,
    `"updates":{"shipped":["what a user would notice, ≤ 20 words each, at most 4"],"fixed":["at most 3"],"next":["at most 2, only if the commits say so"]},`,
    `"earnings":["one line per reporting day in the 7 days after the send, Sydney date first, e.g. 'Thu 4 Dec · US after close: Salesforce, CrowdStrike' — large US companies and ASX 200 names only, at most 7 lines, only dates confirmed by the companies or exchange calendars"]}`,
  ].join("\n");
}

type Block = { type: string; text?: string };

/** Pulls the JSON object out of the model's final text. */
export function parseEditorial(text: string): Pick<Editorial, "summary" | "bigNews" | "pattern" | "updates" | "earnings"> {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("The draft had no JSON object");
  const raw = JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>;
  const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, n) : []);
  const bn = raw.bigNews as Record<string, unknown> | null | undefined;
  const up = raw.updates as Record<string, unknown> | null | undefined;
  return {
    summary: str(raw.summary, 260) || null,
    bigNews: bn && str(bn.headline) ? { headline: str(bn.headline, 200), body: str(bn.body, 900), why: str(bn.why, 400), briefs: list(bn.briefs, 3) } : null,
    pattern: str(raw.pattern, 900) || null,
    updates: up ? { shipped: list(up.shipped, 4), fixed: list(up.fixed, 3), next: list(up.next, 2) } : null,
    earnings: list(raw.earnings, 7),
  };
}

export async function draftEditorial(
  input: { issueDate: string; context: string; commits: string[]; wantPattern: boolean },
  opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch },
): Promise<Editorial> {
  const model = opts.model || DEFAULT_MODEL;
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: buildPrompt(input) }];
  let blocks: Block[] = [];
  for (let turn = 0; turn < 4; turn++) {
    const res = await (opts.fetchImpl ?? fetch)("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2500, system: SYSTEM, messages, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }] }),
    });
    const body = await res.json().catch(() => null) as { content?: Block[]; stop_reason?: string; error?: { message?: string } } | null;
    if (!res.ok || !body) throw new Error(`Claude ${res.status}: ${body?.error?.message ?? "request failed"}`);
    blocks = body.content ?? [];
    if (body.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: blocks }); // a long search paused; let it continue
  }
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
  return { ...parseEditorial(text), draftedAt: new Date().toISOString(), model };
}
