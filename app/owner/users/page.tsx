// Users (Admin): every account, with a checkbox that gives or removes Premium.
// Until payments exist (#27), this checkbox is the gate. Admin emails always have Premium.
import { createDb, listAccounts, type AccountRow } from "@a3ro/oil-backend";
import { isAdminEmail } from "../../../lib/access";
import { requireOwner } from "../../../lib/ownerGuard";
import { OpsPage, OpsSection, OpsTable } from "../ui";
import PremiumToggle from "./PremiumToggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });
const fmt = (iso: string | null) => (iso ? DAY.format(new Date(iso)) : "never");

export default async function UsersPage() {
  await requireOwner();
  let accounts: AccountRow[] | null = null;
  try { accounts = await listAccounts(await createDb()); } catch { accounts = null; }
  const premiumCount = accounts?.filter((a) => a.premium || isAdminEmail(a.email)).length ?? 0;

  return <OpsPage title="Users" intro="Everyone who has created an account. Tick Premium to open the Premium modules for that account; untick to remove it. Changes apply within 30 seconds. Admin accounts always have Premium.">
    {accounts === null
      ? <p className="text-xs text-[var(--ink-2)]">Accounts can&rsquo;t be read yet: run <code>npm --prefix backend run migrate:user-access</code>.</p>
      : <OpsSection title={`${accounts.length} account${accounts.length === 1 ? "" : "s"} · ${premiumCount} with Premium`}>
        <OpsTable
          cols={["Email", "Signed up with", "Signed up", "Last sign-in", "Premium since", "Premium"]}
          empty="No accounts yet."
          rows={accounts.map((a) => {
            const admin = isAdminEmail(a.email);
            return [
              <span key="e">{a.email ?? "(no email)"}{admin ? <span className="ml-2 text-[var(--ink-3)]">admin</span> : null}{!a.emailConfirmed ? <span className="ml-2 text-[var(--ink-3)]">unconfirmed</span> : null}</span>,
              a.provider === "google" ? "Google" : a.provider === "email" ? "Email link" : a.provider ?? "—",
              fmt(a.createdAt),
              fmt(a.lastSignInAt),
              a.premium ? `${fmt(a.premiumSince)}${a.updatedBy ? ` · ${a.source === "stripe" ? "paid" : "by admin"}` : ""}` : "—",
              <PremiumToggle key="p" userId={a.userId} email={a.email ?? a.userId} premium={a.premium} locked={admin} />,
            ];
          })}
        />
      </OpsSection>}
  </OpsPage>;
}
