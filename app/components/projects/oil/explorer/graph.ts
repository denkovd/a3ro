"use client";
import { useMemo } from "react";
import { COMPANIES, ASSET_RELATIONS, COMPANY_RELATIONS, SUPPLY_RELATIONS, type Confidence } from "../../../../../lib/oil/companies";
import type { Graph } from "../../../../../lib/oil/assetGraph";
import type { Refinery, RefineryEvent } from "../refineries";
import { formatEventDate, type Provenance, type TimelineItem } from "../../intel/primitives";

export * from "../../../../../lib/oil/assetGraph";
export * from "../../../../../lib/oil/companies";

/** One graph per refinery list: feed-merged events flow into filters and timelines. */
export function useOilGraph(refineries: Refinery[]): Graph {
  return useMemo(() => ({ refineries, companies: COMPANIES, assetRelations: ASSET_RELATIONS, companyRelations: COMPANY_RELATIONS, supplyRelations: SUPPLY_RELATIONS }), [refineries]);
}

export const provenanceOf = (c: Confidence | undefined): Provenance => c === "government" ? "government" : c === "reported" ? "reported" : "operator";

const LABEL: Record<RefineryEvent["kind"], string> = {
  closure: "Closure", idled: "Idled", outage: "Outage", maintenance: "Maintenance", restart: "Restart",
  disruption: "Disruption", notice: "Notice", project: "Project", ownership: "Ownership",
};

export function eventToTimeline(e: RefineryEvent, reviewedAt: string): TimelineItem {
  const operating = ["closure", "idled", "outage", "maintenance", "restart", "disruption"].includes(e.kind);
  const meta: string[] = [];
  if (e.scope && e.scope !== "facility") meta.push(`Scope: ${e.scope === "group" ? "company group, not this facility alone" : "processing unit"}`);
  if (e.affectedUnits?.length) meta.push(`Units: ${e.affectedUnits.join(", ")}`);
  if (e.affectedProducts?.length) meta.push(`Products: ${e.affectedProducts.join(", ")}`);
  if (operating) meta.push(`Unavailable capacity: ${e.affectedCapacityKbd == null ? "unquantified" : `${e.affectedCapacityKbd} kb/d`} · restart: ${e.expectedRestart ?? "unconfirmed"}`);
  meta.push(`Verified ${(e.verifiedAt ?? reviewedAt).slice(0, 10)} · ${e.publishedAt ? `published ${e.publishedAt.slice(0, 10)}` : "publication date unavailable"}`);
  return {
    id: e.id ?? `${e.date}-${e.kind}`,
    date: e.date,
    label: LABEL[e.kind],
    tone: operating ? "operating" : e.kind === "project" ? "project" : e.kind === "ownership" ? "ownership" : "notice",
    title: e.title,
    detail: e.detail,
    meta,
    provenance: provenanceOf(e.confidence),
    sourceUrl: e.sourceUrl,
  };
}

/** "62.5% · as of 9 Apr 2025" — stakes are shown exactly as recorded, with the date they describe. */
export function stakeLabel(stakePct: number | null, asOf: string | null) {
  const stake = stakePct === null ? "Share not stated" : `${stakePct}%`;
  return asOf ? `${stake} · as of ${formatEventDate(asOf)}` : stake;
}
