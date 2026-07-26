import path from "node:path";
import { fileURLToPath } from "node:url";
import { getActiveCompanies } from "./companies.js";
import { getSnapshot } from "./snapshot.js";
import { fetchFinancialResults, sleep } from "./msxApi.js";
import { loadHistory, saveHistory, appendSnapshotToHistory, getPriorEntries } from "./store.js";
import { evaluateTechnicalOpportunities, evaluateFinancialOpportunities } from "./rules.js";
import { sendTelegramMessage } from "./notify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, "..", "data", "history.json");
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

function formatReport(technical, financial, failures) {
  const lines = [];
  lines.push(`رصد فرص بورصة مسقط - ${todayMuscatDate()}`);
  lines.push("");

  if (technical.length === 0 && financial.length === 0) {
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

  const report = formatReport(technical, financial, failures);
  console.log("\n" + report);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (botToken && chatId) {
    await sendTelegramMessage(botToken, chatId, report);
    console.log("\nتم إرسال التقرير عبر تيليجرام.");
  } else {
    console.log("\n(لم يتم الإرسال عبر تيليجرام: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID غير مضبوطين)");
  }
}

main().catch((err) => {
  console.error("فشل تشغيل السكربت:", err);
  process.exit(1);
});
