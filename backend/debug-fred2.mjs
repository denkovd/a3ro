process.env.FRED_API_KEY = "test-key-fred";
global.fetch = async (url) => {
  console.log("MOCK FETCH CALLED:", String(url));
  return new Response(JSON.stringify({observations:[{date:"2024-01-15",value:"78.50"}]}), { status: 200 });
};
const mod = await import("./src/sources/fred.ts");
console.log("module keys:", Object.keys(mod));
const source = new mod.FredSource();
console.log("descriptor:", JSON.stringify(source.descriptor));
console.log("apiKey via any-cast:", (source).apiKey);
const records = await source.fetchLatest(["WTI"]);
console.log("records for WTI only:", records.length);
