import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultLabConfig, LAB_RULES, LAB_TRENDS_PATH, runInternalResearch, withLabTrends, type LabTrends } from "../../../../backend/src/macro/internalResearch";
import type { ResearchDataset } from "../../../../backend/src/macro/backtestResearch";
import { localResearchRequestAllowed } from "../../_lib/internalResearchAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
const allowed = (request: Request) => localResearchRequestAllowed(request, process.env.NODE_ENV);
const dataset = async (): Promise<ResearchDataset> => {
  const published: ResearchDataset = JSON.parse(await readFile(resolve(process.cwd(), "public/data/regime-backtest.json"), "utf8"));
  const trends: LabTrends | null = await readFile(resolve(process.cwd(), LAB_TRENDS_PATH), "utf8").then(JSON.parse, () => null);
  return withLabTrends(published, trends);
};

export async function GET(request: Request) {
  if (!allowed(request)) return response({ error: "Not found" }, 404);
  try {
    const data = await dataset();
    return response({ config: defaultLabConfig(data.through), rules: LAB_RULES, through: data.through, generatedAt: data.generatedAt });
  } catch { return response({ error: "Research history could not be loaded." }, 503); }
}
export async function POST(request: Request) {
  if (!allowed(request)) return response({ error: "Not found" }, 404);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "JSON settings are required." }, 415);
  const body = await request.text();
  if (body.length > 16384) return response({ error: "Settings are too large." }, 413);
  let value: unknown;
  try { value = JSON.parse(body); } catch { return response({ error: "Invalid JSON settings." }, 400); }
  try { return response(runInternalResearch(await dataset(), value)); }
  catch (error) { return response({ error: error instanceof Error ? error.message : "Research calculation failed." }, 400); }
}
