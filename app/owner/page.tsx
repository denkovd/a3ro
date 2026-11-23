import { redirect } from "next/navigation";
import { requireOwner } from "../../lib/ownerGuard";

export const dynamic = "force-dynamic";

export default async function OwnerHome() {
  await requireOwner();
  redirect("/owner/scorecard");
}
