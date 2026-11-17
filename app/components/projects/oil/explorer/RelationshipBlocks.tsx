"use client";
/* Four relationship types, never merged: ownership, operation, supply,
   and computed proximity. Each row names its evidence and date. */
import { assetRelationsFor, companyById, nearbyAssets, ownershipChain, provenanceOf, stakeLabel, type AssetRelation, type Graph } from "./graph";
import { Empty, EntityLink, ProvenanceBadge, Section, formatEventDate } from "../../intel/primitives";
import { CORRIDOR_META, type FocusTarget } from "../types";

function CompanyRow({ graph, rel, onFocus }: { graph: Graph; rel: AssetRelation; onFocus: (t: FocusTarget) => void }) {
  const company = companyById(graph, rel.companyId);
  return <div>
    <div className="flex items-start justify-between gap-3">
      <EntityLink onClick={() => onFocus({ kind: "company", id: rel.companyId })} label={`Open company ${company?.name ?? rel.companyId}`}>{company?.name ?? rel.companyId}</EntityLink>
      <ProvenanceBadge kind={provenanceOf(rel.confidence)} />
    </div>
    <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">{rel.basis}{rel.asOf ? ` · as of ${formatEventDate(rel.asOf)}` : ""} · <a href={rel.sourceUrl} target="_blank" rel="noreferrer" className="text-[var(--asset-accent)] underline underline-offset-2">source ↗</a></p>
  </div>;
}

function ParentChain({ graph, companyId, onFocus }: { graph: Graph; companyId: string; onFocus: (t: FocusTarget) => void }) {
  const chain = ownershipChain(graph, companyId);
  if (!chain.length) return <p className="mt-2 text-[11px] text-[var(--ink-3)]">Parent ownership not documented in this coverage.</p>;
  return <ul className="mt-2 space-y-2" aria-label="Parent ownership">
    {chain.map(({ relation, company, depth }) => <li key={relation.id} style={{ paddingLeft: (depth - 1) * 14 }} className="flex items-start gap-2 text-[11px]">
      <span aria-hidden className="mt-[1px] font-mono text-[var(--rel-own)]">└</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <EntityLink onClick={() => onFocus({ kind: "company", id: relation.parentId })}>{company?.name ?? relation.parentId}</EntityLink>
          <span className="font-mono text-[var(--ink-2)]">{relation.role === "group" ? "Group affiliate · share not stated" : stakeLabel(relation.stakePct, relation.asOf)}</span>
        </div>
        <p className="mt-0.5 text-[var(--ink-3)]">{relation.confidence === "reported" ? "Reported · " : ""}<a href={relation.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">source ↗</a></p>
      </div>
    </li>)}
  </ul>;
}

export default function RelationshipBlocks({ graph, assetId, onFocus }: { graph: Graph; assetId: string; onFocus: (t: FocusTarget) => void }) {
  const { operators, owners, former, supply } = assetRelationsFor(graph, assetId);
  const nearby = nearbyAssets(graph, assetId, 400).slice(0, 4);
  return <>
    <Section title="Owned by">
      {owners.length ? <ul className="space-y-4">{owners.map(rel => <li key={rel.id}><CompanyRow graph={graph} rel={rel} onFocus={onFocus} /><ParentChain graph={graph} companyId={rel.companyId} onFocus={onFocus} /></li>)}</ul>
        : <Empty>Ownership is not separately documented in this coverage. The operator is listed below; operating a site does not establish who owns it.</Empty>}
    </Section>
    <Section title="Operated by">
      {operators.length ? <ul className="space-y-4">{operators.map(rel => <li key={rel.id}><CompanyRow graph={graph} rel={rel} onFocus={onFocus} /></li>)}</ul> : <Empty>No current operator documented.</Empty>}
      {former.length > 0 && <ul className="mt-4 space-y-2 border-l border-[var(--line)] pl-3">{former.map(rel => {
        const company = companyById(graph, rel.companyId);
        return <li key={rel.id} className="text-[11px] text-[var(--ink-3)]">Formerly {rel.role === "operates" ? "operated" : "owned"} by <EntityLink onClick={() => onFocus({ kind: "company", id: rel.companyId })}>{company?.name ?? rel.companyId}</EntityLink>{rel.until ? ` until ${formatEventDate(rel.until)}` : ""}</li>;
      })}</ul>}
    </Section>
    <Section title="Supply & customers">
      {supply.length ? null : <Empty>No documented supplier or customer relationships in this coverage. Crude sources and product buyers are not inferred from location or ownership.</Empty>}
    </Section>
    <Section title="Nearby · proximity only" aside={<ProvenanceBadge kind="computed" />}>
      {nearby.length ? <ul className="space-y-2">{nearby.map(n => <li key={n.refinery.id} className="flex items-baseline justify-between gap-3 text-xs">
        <EntityLink onClick={() => onFocus({ kind: "refinery", id: n.refinery.id })}>{n.refinery.name}</EntityLink>
        <span className="shrink-0 text-right font-mono text-[11px] text-[var(--ink-3)]">{n.km < 1 ? "<1" : Math.round(n.km)} km{n.sharedCorridor ? ` · ${CORRIDOR_META.find(c => c.id === n.sharedCorridor)?.title ?? n.sharedCorridor}` : ""}</span>
      </li>)}</ul> : <Empty>No other covered refinery within 400 km.</Empty>}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-3)]">Straight-line distance between site coordinates. Proximity or a shared corridor is not a supply, ownership or operating link.</p>
    </Section>
  </>;
}
