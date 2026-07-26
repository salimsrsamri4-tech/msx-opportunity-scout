import { fetchCompanySnapshot } from "./msxApi.js";

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function getSnapshot(symbol) {
  const d = await fetchCompanySnapshot(symbol);
  if (!d) return null;
  return {
    symbol: d.Symbol,
    ltp: num(d.LTP),
    prevClose: num(d.PrevClose),
    open: num(d.OpenPrice),
    high: num(d.High),
    low: num(d.Low),
    close: num(d.ClosePrice),
    volume: num(d.Volume),
    turnover: num(d.Turnover),
    changePct: num(d.Change),
    changeVal: num(d.ChangeVal),
    noOfTrades: num(d.NoOfTrades),
  };
}
