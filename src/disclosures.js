import { fetchCompanyNews, sleep } from "./msxApi.js";
import { analyzeDisclosure, stripHtml } from "./aiAnalysis.js";

const NEWS_REQUEST_DELAY_MS = 200;
const AI_REQUEST_DELAY_MS = 300;
const RECENT_NEWS_DAYS = 3; // اعتبار الإفصاح "حديثًا" خلال كم يوم
const MAX_ITEMS_ANALYZED_PER_RUN = 40; // سقف عدد الإفصاحات المُحلَّلة بالذكاء الاصطناعي في كل تشغيل، لضبط التكلفة والوقت

// seenNewsIds يُحدَّث بالمرجع (mutated in place) ليحفظه main.js لاحقًا،
// حتى لا نُعيد تحليل (وندفع ثمن) نفس الإفصاح مرتين. عناصر تتجاوز السقف اليومي
// تبقى خارج seenNewsIds عمدًا فتتم إعادة محاولتها في التشغيل التالي بدل فقدانها.
export async function collectDisclosureOpportunities({ companies, apiKey, seenNewsIds, now = new Date() }) {
  const opportunities = [];
  const failures = [];
  if (!apiKey) return { opportunities, failures, analyzedCount: 0, skippedCount: 0 };

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const cutoff = new Date(now.getTime() - RECENT_NEWS_DAYS * 24 * 60 * 60 * 1000);

  const candidates = [];
  for (const company of companies) {
    try {
      const newsItems = await fetchCompanyNews(company.symbol, year, month);
      for (const item of newsItems) {
        if (seenNewsIds.has(item.NewsID)) continue;
        const itemDate = new Date(item.DateTime);
        if (!Number.isFinite(itemDate.getTime()) || itemDate < cutoff) continue;
        candidates.push({ company, item });
      }
    } catch (err) {
      failures.push({ symbol: company.symbol, error: err.message });
    }
    await sleep(NEWS_REQUEST_DELAY_MS);
  }

  const toAnalyze = candidates.slice(0, MAX_ITEMS_ANALYZED_PER_RUN);

  for (const { company, item } of toAnalyze) {
    seenNewsIds.add(item.NewsID);
    try {
      const bodyText = stripHtml(item.BodyAr || item.BodyEn);
      if (!bodyText) continue;
      const result = await analyzeDisclosure(apiKey, {
        titleAr: item.TitleAr,
        titleEn: item.TitleEn,
        bodyText,
      });
      if (result.significant) {
        opportunities.push({
          type: "ai_disclosure",
          symbol: company.symbol,
          name: company.nameAr,
          message: `[${result.category}] ${result.summary}`,
        });
      }
    } catch (err) {
      failures.push({ symbol: company.symbol, error: err.message });
    }
    await sleep(AI_REQUEST_DELAY_MS);
  }

  return {
    opportunities,
    failures,
    analyzedCount: toAnalyze.length,
    skippedCount: Math.max(0, candidates.length - toAnalyze.length),
  };
}
