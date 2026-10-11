import * as XLSX from "xlsx";
export function publicEiaFixture(url: string | URL) {
  const filename = new URL(String(url)).pathname.split("/").at(-1)!;
  const series = filename.replace(/[dw]\.xls$/, "");
  const serial = Math.floor((Date.now() - Date.UTC(1899,11,30)) / 86_400_000) - 7;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Sourcekey",series],["Date","Value"],[serial,2]]), "Data 1");
  return new Response(XLSX.write(book, { type: "array", bookType: "xlsx" }), { status: 200 });
}
