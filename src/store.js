import fs from "node:fs";
import path from "node:path";

const MAX_ENTRIES_PER_SYMBOL = 60;

export function loadHistory(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

export function saveHistory(filePath, history) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf8");
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
