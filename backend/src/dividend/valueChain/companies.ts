import type { ValueChainCompany } from "./types";

// US-GAAP filers only (10-K / 10-Q). Foreign filers on IFRS (TSMC, ASML, Cameco)
// use a different taxonomy and are left out rather than mixed in.
// Figures are whole-company: most of these businesses do not report AI separately.
export const VALUE_CHAIN_COMPANIES: ValueChainCompany[] = [
  // Energy & materials — power, grid equipment, copper, enrichment
  { ticker: "CEG", name: "Constellation Energy", cik: 1868275, layer: "energy", entityPattern: /constellation energy corp/i, role: "Nuclear and gas power producer" },
  { ticker: "VST", name: "Vistra", cik: 1692819, layer: "energy", entityPattern: /vistra/i, role: "Power producer" },
  { ticker: "GEV", name: "GE Vernova", cik: 1996810, layer: "energy", entityPattern: /ge vernova/i, role: "Turbines and grid equipment" },
  { ticker: "ETN", name: "Eaton", cik: 1551182, layer: "energy", entityPattern: /eaton/i, role: "Electrical equipment" },
  { ticker: "FCX", name: "Freeport-McMoRan", cik: 831259, layer: "energy", entityPattern: /freeport/i, role: "Copper miner" },
  { ticker: "LEU", name: "Centrus Energy", cik: 1065059, layer: "energy", entityPattern: /centrus/i, role: "Uranium enrichment" },
  // Infrastructure — chips, memory, networking, servers, data-centre power and real estate
  { ticker: "NVDA", name: "NVIDIA", cik: 1045810, layer: "infrastructure", entityPattern: /nvidia/i, role: "AI accelerators" },
  { ticker: "AVGO", name: "Broadcom", cik: 1730168, layer: "infrastructure", entityPattern: /broadcom/i, role: "Custom chips and networking" },
  { ticker: "AMD", name: "AMD", cik: 2488, layer: "infrastructure", entityPattern: /advanced micro devices/i, role: "Accelerators and CPUs" },
  { ticker: "MU", name: "Micron", cik: 723125, layer: "infrastructure", entityPattern: /micron/i, role: "High-bandwidth memory" },
  { ticker: "ANET", name: "Arista Networks", cik: 1596532, layer: "infrastructure", entityPattern: /arista/i, role: "Data-centre networking" },
  { ticker: "SMCI", name: "Super Micro Computer", cik: 1375365, layer: "infrastructure", entityPattern: /super micro/i, role: "AI servers" },
  { ticker: "VRT", name: "Vertiv", cik: 1674101, layer: "infrastructure", entityPattern: /vertiv/i, role: "Data-centre power and cooling" },
  { ticker: "EQIX", name: "Equinix", cik: 1101239, layer: "infrastructure", entityPattern: /equinix/i, role: "Data-centre operator" },
  { ticker: "DLR", name: "Digital Realty", cik: 1297996, layer: "infrastructure", entityPattern: /digital realty/i, role: "Data-centre operator" },
  // Hyperscalers — the main AI capex spenders
  { ticker: "MSFT", name: "Microsoft", cik: 789019, layer: "hyperscalers", entityPattern: /microsoft/i, role: "Azure, Copilot" },
  { ticker: "GOOGL", name: "Alphabet", cik: 1652044, layer: "hyperscalers", entityPattern: /alphabet/i, role: "Google Cloud, Gemini" },
  { ticker: "AMZN", name: "Amazon", cik: 1018724, layer: "hyperscalers", entityPattern: /amazon/i, role: "AWS" },
  { ticker: "META", name: "Meta Platforms", cik: 1326801, layer: "hyperscalers", entityPattern: /meta platforms/i, role: "AI for ads and products" },
  { ticker: "ORCL", name: "Oracle", cik: 1341439, layer: "hyperscalers", entityPattern: /oracle/i, role: "Oracle Cloud Infrastructure" },
  // Apps & adopters — software selling AI to businesses
  { ticker: "CRM", name: "Salesforce", cik: 1108524, layer: "adopters", entityPattern: /salesforce/i, role: "Enterprise software, agents" },
  { ticker: "NOW", name: "ServiceNow", cik: 1373715, layer: "adopters", entityPattern: /servicenow/i, role: "Workflow software" },
  { ticker: "ADBE", name: "Adobe", cik: 796343, layer: "adopters", entityPattern: /adobe/i, role: "Creative software" },
  { ticker: "PLTR", name: "Palantir", cik: 1321655, layer: "adopters", entityPattern: /palantir/i, role: "Data and AI platforms" },
  { ticker: "INTU", name: "Intuit", cik: 896878, layer: "adopters", entityPattern: /intuit/i, role: "Finance and tax software" },
];

export function edgarCompanyUrl(cik: number): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(cik).padStart(10, "0")}&type=10-&dateb=&owner=include&count=40`;
}
