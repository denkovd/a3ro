"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postNewsletter } from "./post";

type Slot = "summary" | "bigNews" | "pattern" | "earnings" | "updates";
export interface EditorialValue {
  skip?: Slot[] | null;
  summary?: string | null;
  bigNews?: { headline: string; body: string; why: string; briefs: string[] } | null;
  pattern?: string | null;
  updates?: { shipped: string[]; fixed: string[]; next: string[] } | null;
  earnings?: string[] | null;
  draftedAt?: string | null;
  editedAt?: string | null;
  editedBy?: string | null;
  model?: string | null;
}

const FIELD = "w-full rounded-sm border border-[var(--line)] bg-transparent px-2 py-1.5 text-xs text-[var(--ink)]";
const LABEL = "flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--ink-2)]";

/** The parts a person writes: big news, the flip pattern, earnings next week and A3RO updates. One item per line in the list fields. */
export default function EditorialForm({ id, value, premium }: { id: number; value: EditorialValue; premium: boolean }) {
  const router = useRouter();
  const join = (a?: string[] | null) => (a ?? []).join("\n");
  const [f, setF] = useState({
    headline: value.bigNews?.headline ?? "", body: value.bigNews?.body ?? "", why: value.bigNews?.why ?? "", briefs: join(value.bigNews?.briefs),
    summary: value.summary ?? "", pattern: value.pattern ?? "", earnings: join(value.earnings),
    shipped: join(value.updates?.shipped), fixed: join(value.updates?.fixed), next: join(value.updates?.next),
  });
  const [skip, setSkip] = useState<Set<Slot>>(new Set(value.skip ?? []));
  const toggle = (s: Slot) => setSkip((cur) => { const n = new Set(cur); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const Skip = ({ slot }: { slot: Slot }) => <label className="flex items-center gap-1.5 text-[11px] normal-case tracking-normal text-[var(--ink-2)]">
    <input type="checkbox" checked={skip.has(slot)} onChange={() => toggle(slot)} /> Leave out this week</label>;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setNote(null);
    try {
      const r = await postNewsletter({ action: "save-editorial", id, editorial: {
        skip: [...skip], summary: f.summary,
        bigNews: { headline: f.headline, body: f.body, why: f.why, briefs: f.briefs },
        pattern: f.pattern, earnings: f.earnings, updates: { shipped: f.shipped, fixed: f.fixed, next: f.next },
      } });
      setNote({ ok: true, text: r.note ?? "Saved." });
      router.refresh();
    } catch (e) { setNote({ ok: false, text: e instanceof Error ? e.message : "Failed" }); }
    finally { setBusy(false); }
  }

  const meta = [value.draftedAt ? `drafted ${value.draftedAt.slice(0, 16).replace("T", " ")} UTC${value.model ? ` (${value.model})` : ""}` : null,
    value.editedBy ? `edited by ${value.editedBy}` : null].filter(Boolean).join(" · ");

  return <div className="flex flex-col gap-3">
    {meta ? <p className="text-xs text-[var(--ink-2)]">{meta}</p> : null}
    <p className="text-xs text-[var(--ink-2)]">Blank sections show a yellow &ldquo;✍️ Claude to comment here&rdquo; box in the preview. Fill them by hand or with &ldquo;Draft editorial with Claude&rdquo;, or tick &ldquo;Leave out this week&rdquo;. The issue can&rsquo;t be approved while a box remains.</p>
    <Skip slot="summary" />
    <label className={LABEL}>This week in one line (top of the issue, ≤ 30 words)<input className={FIELD} value={f.summary} onChange={set("summary")} /></label>
    <Skip slot="bigNews" />
    <label className={LABEL}>Big news headline<input className={FIELD} value={f.headline} onChange={set("headline")} /></label>
    <label className={LABEL}>Big news story<textarea rows={4} className={FIELD} value={f.body} onChange={set("body")} /></label>
    <label className={LABEL}>Why it matters<textarea rows={2} className={FIELD} value={f.why} onChange={set("why")} /></label>
    <label className={LABEL}>Briefs (one per line, up to 3)<textarea rows={3} className={FIELD} value={f.briefs} onChange={set("briefs")} /></label>
    {premium ? <Skip slot="pattern" /> : null}
    {premium ? <label className={LABEL}>Pattern of the week (Premium)<textarea rows={3} className={FIELD} value={f.pattern} onChange={set("pattern")} /></label> : null}
    <Skip slot="earnings" />
    <label className={LABEL}>Earnings next week (one per line, e.g. &ldquo;Tue 2 Dec · Salesforce (CRM) · after close&rdquo;)<textarea rows={4} className={FIELD} value={f.earnings} onChange={set("earnings")} /></label>
    <Skip slot="updates" />
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={LABEL}>Shipped<textarea rows={4} className={FIELD} value={f.shipped} onChange={set("shipped")} /></label>
      <label className={LABEL}>Fixed<textarea rows={4} className={FIELD} value={f.fixed} onChange={set("fixed")} /></label>
      <label className={LABEL}>Next<textarea rows={4} className={FIELD} value={f.next} onChange={set("next")} /></label>
    </div>
    <div className="flex items-center gap-2">
      <button type="button" disabled={busy} onClick={save} className="rounded-sm border border-[var(--ink)] px-3 py-1.5 text-xs text-[var(--ink)] disabled:opacity-50">{busy ? "Saving…" : "Save editorial"}</button>
      {note ? <span role={note.ok ? "status" : "alert"} className={`text-xs ${note.ok ? "text-[var(--ink-2)]" : "text-[#e5484d]"}`}>{note.text}</span> : null}
    </div>
  </div>;
}
