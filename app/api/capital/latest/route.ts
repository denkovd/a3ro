import { createDb } from "@a3ro/oil-backend";
import { readCapitalDataset } from "../../_lib/capitalStore";
import fallback from "../../../../public/data/cost-of-capital.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readCapitalDataset(await createDb());
    return Response.json({ ...data, storage: "database" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // The bundled observations keep their original dates; a DB failure never makes old data appear fresh.
    return Response.json({ ...fallback, storage: "bundled-fallback" }, { headers: { "Cache-Control": "no-store" } });
  }
}
