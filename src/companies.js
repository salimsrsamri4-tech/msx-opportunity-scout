import { fetchCompaniesList } from "./msxApi.js";

// Listed: "1" و "2" يعنيان مُدرجة حاليًا (نشطة)، بينما "3" تعني شركة مشطوبة/غير مدرجة.
const ACTIVE_LISTED_CODES = new Set(["1", "2"]);

export async function getActiveCompanies() {
  const rows = await fetchCompaniesList();
  return rows
    .filter((r) => ACTIVE_LISTED_CODES.has(r.Listed))
    .map((r) => ({
      symbol: r.Symbol,
      nameAr: r.LongNameAr,
      nameEn: r.LongNameEn,
      market: r.Market,
      sector: r.Sector,
    }));
}
