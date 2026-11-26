// Messages (Admin): reviews, feature requests and problems members send from their Account page
// (roadmap #105). Stored in Supabase (user_feedback). Open ones first; tick Done once dealt with.
import { createDb, listFeedback, type FeedbackRow } from "@a3ro/oil-backend";
import { requireOwner } from "../../../lib/ownerGuard";
import { OpsPage, OpsSection, OpsTable } from "../ui";
import HandledToggle from "./HandledToggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const KIND_LABEL: Record<string, string> = { review: "Review", request: "Feature request", problem: "Problem", other: "Other" };

function table(rows: FeedbackRow[], empty: string) {
  return <OpsTable
    cols={["Sent", "From", "Kind", "Message", "Done"]}
    empty={empty}
    rows={rows.map((f) => [
      WHEN.format(new Date(f.createdAt)),
      <span key="f">{f.displayName ? <>{f.displayName}<br /></> : null}<a href={`mailto:${f.email ?? ""}`} className="text-[var(--ink-3)] underline">{f.email ?? "—"}</a></span>,
      `${KIND_LABEL[f.kind] ?? f.kind}${f.rating ? ` · ${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}` : ""}`,
      <span key="m" className="block max-w-xl whitespace-pre-wrap">{f.message}</span>,
      <HandledToggle key="h" id={f.id} handled={f.handledAt !== null} />,
    ])}
  />;
}

export default async function MessagesPage() {
  await requireOwner();
  let rows: FeedbackRow[] | null = null;
  try { rows = await listFeedback(await createDb(), 300); } catch { rows = null; }
  const open = rows?.filter((r) => !r.handledAt) ?? [];
  const done = rows?.filter((r) => r.handledAt) ?? [];

  return <OpsPage title="Messages" intro="What members send from their Account page: reviews, feature requests and problems. Click an email to reply. Tick Done once it's dealt with.">
    {rows === null
      ? <p className="text-xs text-[var(--ink-2)]">Messages can&rsquo;t be read yet: run <code>npm --prefix backend run migrate:user-profiles</code>.</p>
      : <>
        <OpsSection title={`Open · ${open.length}`}>{table(open, "Nothing waiting.")}</OpsSection>
        <OpsSection title={`Done · ${done.length}`}>{table(done, "Nothing done yet.")}</OpsSection>
      </>}
  </OpsPage>;
}
