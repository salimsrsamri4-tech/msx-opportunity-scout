import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHistory, loadOpportunitiesLog, loadWatchlist, loadCompaniesSnapshot } from "./store.js";
import { sendTelegramMessage } from "./notify.js";
import { sendEmail } from "./notifyEmail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, "..", "data", "history.json");
const COMPANIES_PATH = path.join(__dirname, "..", "data", "companies.json");
const OPPORTUNITIES_PATH = path.join(__dirname, "..", "data", "opportunities.json");
const WATCHLIST_PATH = path.join(__dirname, "..", "data", "watchlist.json");

const WEEK_WINDOW_DAYS = 7;

function todayMuscatDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(new Date());
}

function computeWeeklyChange(entries) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const cutoff = new Date(Date.now() - WEEK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const inWindow = sorted.filter((e) => new Date(e.date) >= cutoff);
  if (inWindow.length < 2) return null;
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  if (!first.close || !last.close) return null;
  return {
    changePct: ((last.close - first.close) / first.close) * 100,
    latestClose: last.close,
  };
}

function buildDigest(watchlist, companies, history, opportunitiesLog) {
  const cutoff = new Date(Date.now() - WEEK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const lines = [];
  lines.push(`ملخص أسبوعي لقائمة متابعتك - ${todayMuscatDate()}`);
  lines.push("");

  for (const symbol of watchlist) {
    const company = companies[symbol];
    const name = company?.nameAr ?? symbol;
    const entries = history[symbol] ?? [];
    const change = computeWeeklyChange(entries);

    lines.push(`[${symbol}] ${name}`);
    if (change) {
      const dir = change.changePct >= 0 ? "▲" : "▼";
      lines.push(`  السعر الحالي: ${change.latestClose} | التغير هذا الأسبوع: ${dir} ${Math.abs(change.changePct).toFixed(2)}%`);
    } else {
      lines.push("  لا توجد بيانات سعرية كافية بعد لهذا الأسبوع.");
    }

    const weekOpps = opportunitiesLog.filter((o) => o.symbol === symbol && new Date(o.date) >= cutoff);
    if (weekOpps.length > 0) {
      for (const o of weekOpps) lines.push(`  • [${o.date}] ${o.message}`);
    } else {
      lines.push("  لا توجد فرص مرصودة لهذا السهم هذا الأسبوع.");
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const watchlist = loadWatchlist(WATCHLIST_PATH);
  if (watchlist.length === 0) {
    console.log("قائمة المتابعة الأسبوعية فارغة (data/watchlist.json) — لن يُرسَل ملخص.");
    return;
  }

  const companies = loadCompaniesSnapshot(COMPANIES_PATH);
  const history = loadHistory(HISTORY_PATH);
  const opportunitiesLog = loadOpportunitiesLog(OPPORTUNITIES_PATH);

  const report = buildDigest(watchlist, companies, history, opportunitiesLog);
  console.log("\n" + report);

  let sent = false;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (botToken && chatId) {
    await sendTelegramMessage(botToken, chatId, report);
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
      subject: `ملخص أسبوعي لقائمة متابعتك - ${todayMuscatDate()}`,
      text: report,
    });
    sent = true;
  }

  if (!sent) {
    console.log("(لم يُرسَل: لم تُضبط بيانات تيليجرام أو البريد الإلكتروني)");
  }
}

main().catch((err) => {
  console.error("فشل تشغيل الملخص الأسبوعي:", err);
  process.exit(1);
});
