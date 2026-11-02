import type { Queryable } from "@a3ro/oil-backend";
import { CAPITAL_METHODOLOGY, validateCapitalDataset, type CapitalDataset } from "../../../lib/costOfCapital";

export async function readCapitalDataset(db: Queryable): Promise<CapitalDataset> {
  const result = await db.query(
    `select payload from cost_of_capital_observations where methodology = $1
     order by as_of desc, market_id limit 168`, [CAPITAL_METHODOLOGY],
  );
  const dataset = { version: 2 as const, methodology: CAPITAL_METHODOLOGY,
    observations: result.rows.map((row) => row.payload) as CapitalDataset["observations"] };
  validateCapitalDataset(dataset);
  if (!dataset.observations.length) throw new Error("Capital observations have not been published.");
  return dataset;
}
