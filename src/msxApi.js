// طبقة الاتصال بواجهات بورصة مسقط (MSX) غير الرسمية.
// هذه نقاط JSON داخلية يستخدمها موقع msx.om نفسه لتغذية شبكاته وجداوله (Kendo Grid)،
// وليست واجهة برمجية معلنة رسميًا - إن توقف الموقع عن العمل بها فقد يتوقف هذا المشروع عن العمل.
const BASE_URL = "https://www.msx.om";
const USER_AGENT = "Mozilla/5.0 (compatible; msx-opportunity-scout/1.0)";

async function postJson(path, body = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MSX API فشل: ${path} -> ${res.status}`);
  const json = await res.json();
  return json.d;
}

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`MSX API فشل: ${path} -> ${res.status}`);
  return res.json();
}

export function fetchCompaniesList() {
  return postJson("/companies.aspx/List");
}

export function fetchCompanySnapshot(symbol) {
  return postJson("/snapshot.aspx/company", { Symbol: symbol }).then((rows) => rows?.[0]);
}

export function fetchFinancialResults() {
  return postJson("/Companies-Fin-Pref.aspx/List");
}

export function fetchDividends(year) {
  return postJson("/dividends.aspx/MasterList", { Year: year });
}

export function fetchCompanyNews(symbol, year, month) {
  return getJson(`/company-news.aspx?s=${symbol}&y=${year}&f=${month}&t=${month}&i=`);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
