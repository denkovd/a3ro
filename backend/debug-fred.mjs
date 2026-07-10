process.env.FRED_API_KEY = "test-key-fred";
const fredFixture = {
  observations: [
    { date: "2024-01-15", value: "78.50" },
    { date: "2024-01-14", value: "." },
    { date: "2024-01-12", value: "75.30" },
  ],
};
global.fetch = async (url) => {
  console.log("MOCK FETCH CALLED WITH URL:", String(url));
  return new Response(JSON.stringify(fredFixture), { status: 200 });
};
const { FredSource } = await import("./src/sources/fred.ts");
const source = new FredSource();
try {
  const records = await source.fetchLatest(["WTI", "BRENT"]);
  console.log("RECORDS:", JSON.stringify(records, null, 2));
} catch (e) {
  console.log("THREW:", e);
}
