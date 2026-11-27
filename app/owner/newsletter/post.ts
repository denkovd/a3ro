// Shared POST helper for the Admin → Newsletter client components.
export async function postNewsletter(payload: Record<string, unknown>): Promise<{ note?: string; to?: string }> {
  const res = await fetch("/api/owner/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({})) as { error?: string; note?: string; to?: string };
  if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
  return body;
}
