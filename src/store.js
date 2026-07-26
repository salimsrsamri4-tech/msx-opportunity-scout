import fs from "node:fs";
import path from "node:path";

const MAX_ENTRIES_PER_SYMBOL = 60;
const MAX_OPPORTUNITY_LOG_ENTRIES = 3000;

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function loadHistory(filePath) {
  return loadJson(filePath, {});
}

export function saveHistory(filePath, history) {
  saveJson(filePath, history);
}

export function appendSnapshotToHistory(history, symbol, entry) {
  const list = history[symbol] ?? [];
  const withoutToday = list.filter((e) => e.date !== entry.date);
  withoutToday.push(entry);
  withoutToday.sort((a, b) => (a.date < b.date ? -1 : 1));
  history[symbol] = withoutToday.slice(-MAX_ENTRIES_PER_SYMBOL);
  return history;
}

export function getPriorEntries(history, symbol, excludingDate) {
  return (history[symbol] ?? []).filter((e) => e.date !== excludingDate);
}

export function saveCompaniesSnapshot(filePath, companies) {
  const map = {};
  for (const c of companies) {
    map[c.symbol] = { nameAr: c.nameAr, nameEn: c.nameEn, market: c.market, sector: c.sector };
  }
  saveJson(filePath, map);
}

export function appendOpportunitiesLog(filePath, date, opportunities) {
  const log = loadJson(filePath, []);
  for (const o of opportunities) log.push({ date, ...o });
  const trimmed = log.slice(-MAX_OPPORTUNITY_LOG_ENTRIES);
  saveJson(filePath, trimmed);
  return trimmed;
}

export function saveMeta(filePath, meta) {
  saveJson(filePath, meta);
}
