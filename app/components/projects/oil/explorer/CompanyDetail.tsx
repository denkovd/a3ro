"use client";
import { companyAssets, companyById, ownershipChain, provenanceOf, stakeLabel, subsidiaries, type Graph } from "./graph";
import { Empty, EntityLink, Kicker, ProvenanceBadge, Section, SourceFooter } from "../../intel/primitives";
import { capacityLabel, refineryCondition } from "../refineries";
import type { FocusTarget } from "../types";

const ROLE: Record<"operates" | "owns", string> = { operates: "Operates", owns: "Owns" };

export default function CompanyDetail({ graph, companyId, onFocus, onFit }: { graph: Graph; companyId: string; onFocus: (t: FocusTarget) => void; onFit: () => void }) {
  const company = companyById(graph, companyId);
  if (!company) return <Empty>Company not found in this coverage.</Empty>;
  const assets = companyAssets(graph, companyId);
  const current = assets.filter(a => !a.former);
  const former = assets.filter(a => a.former);
  const parents = ownershipChain(graph, companyId);
  const children = subsidiaries(graph, companyId);
  const assetRels = graph.assetRelations.filter(r => r.companyId === companyId);
  const sources = [
    { label: "Company reference", url: company.sourceUrl },
    ...assetRels.map(r => ({ label: `${graph.refineries.find(x => x.id === r.assetId)?.name ?? r.assetId} · ${r.role === "owns" ? "ownership" : "operation"}`, url: r.sourceUrl })),
    ...[...parents.map(p => p.relation), ...children].map(r => ({ label: `${companyById(graph, r.parentId)?.name ?? r.parentId} → ${companyById(graph, r.childId)?.name ?? r.childId}`, url: r.sourceUrl })),
  ];

  return <div className="space-y-5">
    <div>
      <Kicker>{company.kind === "state" ? "State owner" : "Company"} · {company.country}</Kicker>
      <h3 className="mt-2 text-xl leading-tight text-[var(--ink)]">{company.name}</h3>
      {company.aliases?.length ? <p className="mt-1 text-xs text-[var(--ink-3)]">Also: {company.aliases.join(" · ")}</p> : null}
      {company.note && <p className="mt-3 border-l-2 border-[var(--asset-accent-line)] pl-3 text-xs leading-relaxed text-[var(--ink-2)]">{company.note}</p>}
    </div>

    <dl className="grid grid-cols-3 gap-px bg-[var(--line)] text-center">
      {[["Refineries", String(current.length)], ["Operates", String(current.filter(a => a.roles.includes("operates")).length)], ["Owns", String(current.filter(a => a.roles.includes("owns")).length)]].map(([k, v]) => <div key={k} className="bg-[var(--depth-1)] px-2 py-3"><dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">{k}</dt><dd className="mt-1 font-mono text-lg text-[var(--ink)]">{v}</dd></div>)}
    </dl>
    {current.length > 0 && <button type="button" onClick={onFit} className="w-full border border-[var(--line)] px-3 py-2 text-left text-xs text-[var(--asset-accent)] hover:bg-white/[0.04]">Show {current.length === 1 ? "site" : `all ${current.length} sites`} on map →</button>}

    <Section title="Refineries in coverage">
      {current.length ? <ul className="divide-y divide-[var(--line)]">{current.map(a => {
        const condition = refineryCondition(a.refinery);
        return <li key={a.refinery.id} className="py-3">
          <div className="flex items-baseline justify-between gap-3"><EntityLink onClick={() => onFocus({ kind: "refinery", id: a.refinery.id })}>{a.refinery.name}</EntityLink><span className="shrink-0 font-mono text-[11px] text-[var(--ink-2)]">{capacityLabel(a.refinery)}</span></div>
          <p className="mt-1 text-[11px] text-[var(--ink-3)]">{a.refinery.country} · <span style={{ color: condition.color }}>{condition.label}</span></p>
          <p className="mt-1 flex flex-wrap gap-1.5">{a.roles.map(role => <span key={role} className="border border-[var(--line-2)] px-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-2)]">{ROLE[role]}</span>)}
            {a.via.length > 0 && <span className="font-mono text-[10px] text-[var(--ink-3)]">via {a.via.map(id => companyById(graph, id)?.name ?? id).join(" → ")}</span>}</p>
        </li>;
      })}</ul> : <Empty>No refinery in this coverage is documented as owned or operated by {company.name}, directly or through a documented subsidiary.</Empty>}
      {former.length > 0 && <div className="mt-3 border-l border-[var(--line)] pl-3">{former.map(a => <p key={a.refinery.id} className="text-[11px] text-[var(--ink-3)]">Formerly {a.roles.map(r => ROLE[r].toLowerCase()).join(" and ")} <EntityLink onClick={() => onFocus({ kind: "refinery", id: a.refinery.id })}>{a.refinery.name}</EntityLink></p>)}</div>}
    </Section>

    <Section title="Owned by">
      {parents.length ? <ul className="space-y-3">{parents.map(({ relation, company: p, depth }) => <li key={relation.id} style={{ paddingLeft: (depth - 1) * 14 }}>
        <div className="flex items-start justify-between gap-3"><EntityLink onClick={() => onFocus({ kind: "company", id: relation.parentId })}>{p?.name ?? relation.parentId}</EntityLink><ProvenanceBadge kind={provenanceOf(relation.confidence)} /></div>
        <p className="mt-1 font-mono text-[11px] text-[var(--ink-2)]">{relation.role === "group" ? "Group affiliate · share not stated" : stakeLabel(relation.stakePct, relation.asOf)}{relation.childId !== companyId ? ` · of ${companyById(graph, relation.childId)?.name ?? relation.childId}` : ""}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">{relation.basis}</p>
      </li>)}</ul> : <Empty>Parent ownership not documented in this coverage.</Empty>}
    </Section>

    {children.length > 0 && <Section title="Documented holdings">
      <ul className="space-y-3">{children.map(rel => <li key={rel.id}>
        <div className="flex items-start justify-between gap-3"><EntityLink onClick={() => onFocus({ kind: "company", id: rel.childId })}>{companyById(graph, rel.childId)?.name ?? rel.childId}</EntityLink><ProvenanceBadge kind={provenanceOf(rel.confidence)} /></div>
        <p className="mt-1 font-mono text-[11px] text-[var(--ink-2)]">{rel.role === "group" ? "Group affiliate · share not stated" : stakeLabel(rel.stakePct, rel.asOf)}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">{rel.basis}</p>
      </li>)}</ul>
    </Section>}

    <Section title="Supply & customers"><Empty>No documented supplier or customer relationships in this coverage.</Empty></Section>

    <SourceFooter sources={sources} reviewed={[{ label: "Company & relationships", date: [company.reviewedAt, ...assetRels.map(r => r.reviewedAt)].sort().at(-1) ?? null }]} note={<>Ownership shares are shown exactly as the source states them, with the date they describe. Holdings outside the {graph.refineries.length} covered refineries are not listed.</>} />
  </div>;
}
