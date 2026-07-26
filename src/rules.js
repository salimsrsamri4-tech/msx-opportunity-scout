export const THRESHOLDS = {
  priceChangePct: 5, // تحرك سعري يومي حاد
  volumeSpikeMultiplier: 3, // حجم تداول أعلى من المتوسط بهذا المعامل
  minHistoryForVolume: 5, // أقل عدد أيام سابقة قبل اعتبار الحجم "غير عادي"
  breakoutLookbackDays: 20, // نطاق أعلى/أدنى سعر للمقارنة
  profitChangePct: 30, // نسبة تغير الأرباح الفصلية اللافتة
  recentNewsDays: 3, // اعتبار نتائج الأرباح "حديثة" خلال كم يوم
};

function average(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function evaluateTechnicalOpportunities(company, snapshot, priorEntries) {
  const opportunities = [];
  if (!snapshot || snapshot.ltp === null) return opportunities;

  if (snapshot.changePct !== null && Math.abs(snapshot.changePct) >= THRESHOLDS.priceChangePct) {
    const direction = snapshot.changePct > 0 ? "ارتفاع" : "انخفاض";
    opportunities.push({
      type: "price_move",
      symbol: company.symbol,
      name: company.nameAr,
      message: `${direction} حاد بنسبة ${snapshot.changePct}% (السعر الحالي ${snapshot.ltp})`,
    });
  }

  if (priorEntries.length >= THRESHOLDS.minHistoryForVolume && snapshot.volume) {
    const recentVolumes = priorEntries.slice(-THRESHOLDS.minHistoryForVolume).map((e) => e.volume ?? 0);
    const avgVolume = average(recentVolumes);
    if (avgVolume && snapshot.volume >= avgVolume * THRESHOLDS.volumeSpikeMultiplier) {
      opportunities.push({
        type: "volume_spike",
        symbol: company.symbol,
        name: company.nameAr,
        message: `حجم تداول غير عادي: ${snapshot.volume.toLocaleString("en")} مقابل متوسط ${Math.round(avgVolume).toLocaleString("en")}`,
      });
    }
  }

  if (priorEntries.length >= 3 && snapshot.close !== null) {
    const lookback = priorEntries.slice(-THRESHOLDS.breakoutLookbackDays);
    const closes = lookback.map((e) => e.close).filter((c) => c !== null && c !== undefined);
    if (closes.length >= 3) {
      const maxClose = Math.max(...closes);
      const minClose = Math.min(...closes);
      if (snapshot.close > maxClose) {
        opportunities.push({
          type: "breakout_high",
          symbol: company.symbol,
          name: company.nameAr,
          message: `كسر أعلى سعر إغلاق خلال آخر ${closes.length} جلسة (${snapshot.close} > ${maxClose})`,
        });
      } else if (snapshot.close < minClose) {
        opportunities.push({
          type: "breakout_low",
          symbol: company.symbol,
          name: company.nameAr,
          message: `كسر أدنى سعر إغلاق خلال آخر ${closes.length} جلسة (${snapshot.close} < ${minClose})`,
        });
      }
    }
  }

  return opportunities;
}

export function evaluateFinancialOpportunities(financialResults, now = new Date()) {
  const cutoff = new Date(now.getTime() - THRESHOLDS.recentNewsDays * 24 * 60 * 60 * 1000);
  return financialResults
    .filter((r) => {
      const changePct = Number(r.Change_Per);
      if (!Number.isFinite(changePct) || Math.abs(changePct) < THRESHOLDS.profitChangePct) return false;
      const newsDate = new Date(r.NewsDate);
      return Number.isFinite(newsDate.getTime()) && newsDate >= cutoff;
    })
    .map((r) => {
      const direction = Number(r.Change_Per) > 0 ? "نمو" : "تراجع";
      return {
        type: "financial_result",
        symbol: r.Symbol,
        name: r.LongNameAr,
        message: `${direction} الأرباح ${r.Change_Per}% للربع ${r.QuarterAr} ${r.Year} (نُشر ${r.NewsDate})`,
      };
    });
}
