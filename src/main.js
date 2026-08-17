import path from "node:path";
import { fileURLToPath } from "node:url";
import { getActiveCompanies } from "./companies.js";
import { getSnapshot } from "./snapshot.js";
import { fetchFinancialResults, fetchDividends, sleep } from "./msxApi.js";
import {
  loadHistory,
  saveHistory,
  appendSnapshotToHistory,
  getPriorEntries,
  saveCompaniesSnapshot,
  appendOpportunitiesLog,
  saveMeta,
  loadDividendState,
  saveDividendState,
  loadSeenNewsIds,
  saveSeenNewsIds,
} from "./store.js";
import {
  evaluateTechnicalOpportunities,
  evaluateFinancialOpportunities,
  evaluateDividendOpportunities,
} from "./rules.js";
import { collectDisclosureOpportunities } from "./disclosures.js";
import { sendTelegramMessage } from "./notify.js";
import { sendEmail } from "./notifyEmail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, "..", "data", "history.json");
const COMPANIES_PATH = path.join(__dirname, "..", "data", "companies.json");
const OPPORTUNITIES_PATH = path.join(__dirname, "..", "data", "opportunities.json");
const META_PATH = path.join(__dirname, "..", "data", "meta.json");
const DIVIDEND_STATE_PATH = path.join(__dirname, "..", "data", "dividendState.json");
const SEEN_NEWS_PATH = path.join(__dirname, "..", "data", "seenNews.json");
const REQUEST_DELAY_MS = 300; // تهدئة معدل الطلبات تجاه موقع البورصة

function todayMuscatDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(new Date());
}

async function collectSnapshotsAndTechnicalOpportunities(companies, history, today) {
  const opportunities = [];
  const failures = [];

  for (const company of companies) {
    try {
      const snapshot = await getSnapshot(company.symbol);
      if (snapshot && snapshot.ltp !== null) {
        const priorEntries = getPriorEntries(history, company.symbol, today);
        opportunities.push(...evaluateTechnicalOpportunities(company, snapshot, priorEntries));
        appendSnapshotToHistory(history, company.symbol, {
          date: today,
          close: snapshot.close ?? snapshot.ltp,
          volume: snapshot.volume,
        });
      }
    } catch (err) {
      failures.push({ symbol: company.symbol, error: err.message });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return { opportunities, failures };
}

function formatReport(technical, financial, dividends, disclosures, failures) {
  const lines = [];
  lines.push(`رصد فرص بورصة مسقط - ${todayMuscatDate()}`);
  lines.push("");

  if (technical.length === 0 && financial.length === 0 && dividends.length === 0 && disclosures.length === 0) {
    lines.push("لا توجد فرص لافتة اليوم وفق المعايير الحالية.");
  } else {
    if (technical.length > 0) {
      lines.push("إشارات فنية (سعر/حجم):");
      for (const o of technical) lines.push(`• [${o.symbol}] ${o.name}: ${o.message}`);
      lines.push("");
    }
    if (financial.length > 0) {
      lines.push("نتائج مالية لافتة:");
      for (const o of financial) lines.push(`• [${o.symbol}] ${o.name}: ${o.message}`);
      lines.push("");
    }
    if (dividends.length > 0) {
      lines.push("توزيعات أرباح:");
      for (const o of dividends) lines.push(`• [${o.symbol}] ${o.name}: ${o.message}`);
      lines.push("");
    }
    if (disclosures.length > 0) {
      lines.push("إفصاحات لافتة (تحليل ذكاء اصطناعي):");
      for (const o of disclosures) lines.push(`• [${o.symbol}] ${o.name}: ${o.message}`);
    }
  }

  if (failures.length > 0) {
    lines.push("");
    lines.push(`تعذّر جلب بيانات ${failures.length} رمزًا (لن يؤثر على بقية النتائج).`);
  }

  return lines.join("\n");
}

async function main() {
  const today = todayMuscatDate();
  const history = loadHistory(HISTORY_PATH);

  const companies = await getActiveCompanies();
  console.log(`عدد الشركات المدرجة النشطة: ${companies.length}`);
  saveCompaniesSnapshot(COMPANIES_PATH, companies);

  const { opportunities: technical, failures } = await collectSnapshotsAndTechnicalOpportunities(
    companies,
    history,
    today
  );
  saveHistory(HISTORY_PATH, history);

  let financial = [];
  try {
    const financialResults = await fetchFinancialResults();
    financial = evaluateFinancialOpportunities(financialResults);
  } catch (err) {
    console.warn("تعذّر جلب النتائج المالية:", err.message);
  }

  let dividends = [];
  const dividendState = loadDividendState(DIVIDEND_STATE_PATH);
  try {
    const dividendRows = await fetchDividends(Number(today.slice(0, 4)));
    dividends = evaluateDividendOpportunities(dividendRows, dividendState);
    saveDividendState(DIVIDEND_STATE_PATH, dividendState);
  } catch (err) {
    console.warn("تعذّر جلب بيانات توزيعات الأرباح:", err.message);
  }

  let disclosures = [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const seenNewsIds = loadSeenNewsIds(SEEN_NEWS_PATH);
    try {
      const result = await collectDisclosureOpportunities({ companies, apiKey, seenNewsIds });
      disclosures = result.opportunities;
      console.log(
        `تحليل الإفصاحات: حُلِّل ${result.analyzedCount} إفصاحًا${
          result.skippedCount > 0 ? `، وتأجيل ${result.skippedCount} لليوم التالي` : ""
        }.`
      );
      if (result.failures.length > 0) {
        console.warn(`تعذّر جلب/تحليل إفصاحات ${result.failures.length} رمزًا.`);
      }
    } catch (err) {
      console.warn("تعذّر تحليل الإفصاحات بالذكاء الاصطناعي:", err.message);
    }
    saveSeenNewsIds(SEEN_NEWS_PATH, seenNewsIds);
  }

  appendOpportunitiesLog(OPPORTUNITIES_PATH, today, [...technical, ...financial, ...dividends, ...disclosures]);
  saveMeta(META_PATH, {
    lastRunDate: today,
    lastRunAt: new Date().toISOString(),
    activeCompanyCount: companies.length,
  });

  const report = formatReport(technical, financial, dividends, disclosures, failures);
  console.log("\n" + report);

  let sent = false;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (botToken && chatId) {
    await sendTelegramMessage(botToken, chatId, report);
    console.log("\nتم إرسال التقرير عبر تيليجرام.");
    sent = true;
  }

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const emailTo = process.env.EMAIL_TO || emailUser;
  if (emailUser && emailPass) {
    await sendEmail({
      user: emailUser,
      pass: emailPass,
      to: emailTo,
      subject: `رصد فرص بورصة مسقط - ${today}`,
      text: report,
    });
    console.log("\nتم إرسال التقرير عبر البريد الإلكتروني.");
    sent = true;
  }

  if (!sent) {
    console.log(
      "\n(لم يتم إرسال التقرير: لم تُضبط بيانات تيليجرام (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) ولا البريد الإلكتروني (EMAIL_USER/EMAIL_PASS))"
    );
  }
}

main().catch((err) => {
  console.error("فشل تشغيل السكربت:", err);
  process.exit(1);
});
