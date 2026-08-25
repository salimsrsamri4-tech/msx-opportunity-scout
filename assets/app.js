const TYPE_LABELS = {
  price_move: "حركة سعرية",
  volume_spike: "حجم غير عادي",
  breakout_high: "كسر أعلى",
  breakout_low: "كسر أدنى",
  financial_result: "نتائج مالية",
  dividend_new: "توزيعات جديدة",
  dividend_cutoff_soon: "استحقاق قريب",
  ai_disclosure: "إفصاح لافت (AI)",
};

const TYPE_HELP = {
  price_move: "السعر تحرك بقوة (5% فأكثر) خلال يوم واحد. ليست إشارة شراء/بيع.",
  volume_spike: "تداول أعلى بـ3 أضعاف من المعتاد — اهتمام مفاجئ بالسهم.",
  breakout_high: "أعلى سعر إغلاق خلال آخر 20 جلسة.",
  breakout_low: "أدنى سعر إغلاق خلال آخر 20 جلسة.",
  financial_result: "تغيّر كبير (30%+) في الأرباح الفصلية مقارنة بالفترة السابقة.",
  dividend_new: "إعلان توزيعات أرباح جديد لهذه الشركة (نقدي و/أو أسهم منحة).",
  dividend_cutoff_soon: "تاريخ استحقاق التوزيعات خلال أسبوع — يجب تملّك السهم قبله للاستفادة.",
  ai_disclosure: "إفصاح نصي قرأه الذكاء الاصطناعي وقيّمه كمهم (تغيير إداري، استحواذ، قضية قانونية...).",
};

const WATCHLIST_KEY = "msx-scout-watchlist";

function getWatchlist() {
  try {
    return new Set(JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function toggleWatchlist(symbol) {
  const list = getWatchlist();
  if (list.has(symbol)) list.delete(symbol);
  else list.add(symbol);
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...list]));
  return list;
}

const state = {
  companies: {},
  history: {},
  opportunities: [],
  meta: {},
  activeFilter: "all",
  watchlistOnly: false,
  selectedSymbol: null,
};

async function loadData() {
  const [companies, history, opportunities, meta] = await Promise.all([
    fetchJson("data/companies.json", {}),
    fetchJson("data/history.json", {}),
    fetchJson("data/opportunities.json", []),
    fetchJson("data/meta.json", {}),
  ]);
  state.companies = companies;
  state.history = history;
  state.opportunities = opportunities;
  state.meta = meta;
}

async function fetchJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function renderMeta() {
  const el = document.getElementById("meta-line");
  if (!state.meta.lastRunDate) {
    el.textContent = "لم يُشغَّل النظام بعد.";
    return;
  }
  el.textContent = `آخر تحديث: ${state.meta.lastRunDate} · عدد الشركات المتابَعة: ${state.meta.activeCompanyCount ?? "-"}`;
}

function renderOpportunities() {
  const list = document.getElementById("opp-list");
  const watchlist = getWatchlist();
  const items = [...state.opportunities]
    .filter((o) => state.activeFilter === "all" || matchesFilter(o.type, state.activeFilter))
    .filter((o) => !state.watchlistOnly || watchlist.has(o.symbol))
    .reverse()
    .slice(0, 150);

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">${
      state.watchlistOnly ? "لا توجد فرص لشركات في قائمة متابعتك بعد." : "لا توجد فرص مرصودة بعد ضمن هذا الفلتر."
    }</div>`;
    return;
  }

  list.innerHTML = items
    .map(
      (o) => `
      <div class="opp-item">
        <div class="opp-top">
          <span class="badge ${o.type}" title="${TYPE_HELP[o.type] ?? ""}">${TYPE_LABELS[o.type] ?? o.type}</span>
          <span class="opp-symbol" data-symbol="${o.symbol}">${o.symbol}</span>
          <button class="star-btn" data-star-symbol="${o.symbol}" title="أضف/أزل من المتابعة">${
        watchlist.has(o.symbol) ? "★" : "☆"
      }</button>
          <span class="opp-date">${o.date}</span>
        </div>
        <div class="opp-name">${escapeHtml(o.name ?? "")}</div>
        <div class="opp-msg">${escapeHtml(o.message ?? "")}</div>
      </div>`
    )
    .join("");

  list.querySelectorAll(".opp-symbol").forEach((el) => {
    el.addEventListener("click", () => selectCompany(el.dataset.symbol));
  });

  list.querySelectorAll(".star-btn").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWatchlist(el.dataset.starSymbol);
      renderOpportunities();
      if (state.selectedSymbol === el.dataset.starSymbol) renderCompanyPanel();
    });
  });
}

const TECHNICAL_TYPES = new Set(["price_move", "volume_spike", "breakout_high", "breakout_low"]);
const DIVIDEND_TYPES = new Set(["dividend_new", "dividend_cutoff_soon"]);

function matchesFilter(type, filter) {
  if (filter === "technical") return TECHNICAL_TYPES.has(type);
  if (filter === "financial") return type === "financial_result";
  if (filter === "dividends") return DIVIDEND_TYPES.has(type);
  if (filter === "ai") return type === "ai_disclosure";
  return true;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setupFilters() {
  document.querySelectorAll(".filters button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filters button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeFilter = btn.dataset.filter;
      renderOpportunities();
    });
  });

  const watchlistToggle = document.getElementById("watchlist-only-toggle");
  watchlistToggle.addEventListener("change", () => {
    state.watchlistOnly = watchlistToggle.checked;
    renderOpportunities();
  });
}

function setupSearch() {
  const input = document.getElementById("search-input");
  const dropdown = document.getElementById("search-dropdown");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      dropdown.style.display = "none";
      dropdown.innerHTML = "";
      return;
    }
    const matches = Object.entries(state.companies)
      .filter(
        ([symbol, c]) =>
          symbol.toLowerCase().includes(q) ||
          (c.nameAr ?? "").toLowerCase().includes(q) ||
          (c.nameEn ?? "").toLowerCase().includes(q)
      )
      .slice(0, 15);

    if (matches.length === 0) {
      dropdown.innerHTML = '<div>لا نتائج</div>';
      dropdown.style.display = "block";
      return;
    }

    dropdown.innerHTML = matches
      .map(([symbol, c]) => `<div data-symbol="${symbol}"><strong>${symbol}</strong> — ${escapeHtml(c.nameAr ?? c.nameEn ?? "")}</div>`)
      .join("");
    dropdown.style.display = "block";

    dropdown.querySelectorAll("div[data-symbol]").forEach((el) => {
      el.addEventListener("click", () => {
        selectCompany(el.dataset.symbol);
        dropdown.style.display = "none";
        input.value = "";
      });
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-results")) dropdown.style.display = "none";
  });
}

function selectCompany(symbol) {
  state.selectedSymbol = symbol;
  renderCompanyPanel();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCompanyPanel() {
  const panel = document.getElementById("company-panel");
  const symbol = state.selectedSymbol;

  if (!symbol) {
    const watchlist = [...getWatchlist()];
    if (watchlist.length === 0) {
      panel.innerHTML = '<div class="placeholder">ابحث عن رمز أو اسم شركة، أو اضغط على أي فرصة في القائمة لعرض تفاصيلها هنا.<br />اضغط ☆ بجانب أي فرصة لإضافتها إلى قائمة متابعتك.</div>';
      return;
    }
    panel.innerHTML = `
      <h3 style="margin-top:0">⭐ قائمة متابعتك</h3>
      ${watchlist
        .map((s) => {
          const c = state.companies[s];
          const entries = (state.history[s] ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
          const latest = entries[entries.length - 1];
          return `
          <div class="opp-item watchlist-item" data-symbol="${s}">
            <div class="opp-top">
              <span class="opp-symbol" data-symbol="${s}">${s}</span>
              <span class="opp-date">${escapeHtml(c?.nameAr ?? "")}</span>
              ${latest ? `<span style="margin-right:auto">${latest.close}</span>` : ""}
            </div>
          </div>`;
        })
        .join("")}
      <button class="copy-watchlist-btn" id="copy-watchlist-btn">📋 انسخ القائمة لتفعيل الملخص الأسبوعي بالبريد</button>
      <p class="disclaimer" id="copy-watchlist-hint">الصق هذا في ملف <code>data/watchlist.json</code> على GitHub لتشغيل الملخص الأسبوعي المخصص لهذه الشركات.</p>
    `;
    panel.querySelectorAll(".opp-symbol").forEach((el) => {
      el.addEventListener("click", () => selectCompany(el.dataset.symbol));
    });
    document.getElementById("copy-watchlist-btn").addEventListener("click", async () => {
      const json = JSON.stringify(watchlist);
      try {
        await navigator.clipboard.writeText(json);
        document.getElementById("copy-watchlist-btn").textContent = "✅ تم النسخ!";
      } catch {
        document.getElementById("copy-watchlist-hint").textContent = json;
      }
    });
    return;
  }

  const company = state.companies[symbol];
  const entries = (state.history[symbol] ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = entries[entries.length - 1];
  const prev = entries[entries.length - 2];
  const companyOpps = state.opportunities.filter((o) => o.symbol === symbol).reverse().slice(0, 20);

  let priceHtml = "";
  if (latest) {
    const change = prev ? (((latest.close - prev.close) / prev.close) * 100).toFixed(2) : null;
    const dir = change !== null ? (change >= 0 ? "up" : "down") : "";
    priceHtml = `
      <div class="price-row">
        <span class="price">${latest.close}</span>
        ${change !== null ? `<span class="change ${dir}">${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}%</span>` : ""}
      </div>`;
  }

  const watchlist = getWatchlist();
  panel.innerHTML = `
    <div class="company-header">
      <div>
        <div class="name">${escapeHtml(company?.nameAr ?? symbol)}</div>
        <div class="symbol">${symbol}${company?.nameEn ? " · " + escapeHtml(company.nameEn) : ""}</div>
      </div>
      <button class="star-btn large" id="panel-star-btn" title="أضف/أزل من المتابعة">${
        watchlist.has(symbol) ? "★" : "☆"
      }</button>
    </div>
    ${priceHtml}
    <div id="chart-holder"></div>
    <div class="company-opps">
      <h3>الفرص المرصودة لهذه الشركة</h3>
      ${
        companyOpps.length === 0
          ? '<div class="empty-state">لا توجد فرص مسجّلة لهذه الشركة بعد.</div>'
          : companyOpps
              .map(
                (o) => `
        <div class="opp-item">
          <div class="opp-top">
            <span class="badge ${o.type}" title="${TYPE_HELP[o.type] ?? ""}">${TYPE_LABELS[o.type] ?? o.type}</span>
            <span class="opp-date">${o.date}</span>
          </div>
          <div class="opp-msg">${escapeHtml(o.message ?? "")}</div>
        </div>`
              )
              .join("")
      }
    </div>
  `;

  if (entries.length >= 2) {
    document.getElementById("chart-holder").innerHTML = buildChartSvg(entries);
  }

  document.getElementById("panel-star-btn").addEventListener("click", () => {
    toggleWatchlist(symbol);
    renderCompanyPanel();
    renderOpportunities();
  });
}

function buildChartSvg(entries) {
  const width = 600;
  const height = 160;
  const padding = 8;
  const closes = entries.map((e) => e.close).filter((c) => c !== null && c !== undefined);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const points = entries.map((e, i) => {
    const x = padding + (i / (entries.length - 1)) * (width - padding * 2);
    const y = height - padding - ((e.close - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastUp = entries[entries.length - 1].close >= entries[0].close;
  const stroke = lastUp ? "var(--up)" : "var(--down)";

  return `
    <svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <polyline points="${points.join(" ")}" fill="none" stroke="${stroke}" stroke-width="2" />
    </svg>`;
}

const WEEKLY_WINDOW_DAYS = 7;
const WEEKLY_TOP_N = 5;

function computeWeeklyMovers() {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WEEKLY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const movers = [];

  for (const [symbol, entries] of Object.entries(state.history)) {
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
    const inWindow = sorted.filter((e) => new Date(e.date) >= windowStart);
    if (inWindow.length < 2) continue;
    const first = inWindow[0];
    const last = inWindow[inWindow.length - 1];
    if (!first.close || !last.close) continue;
    const changePct = ((last.close - first.close) / first.close) * 100;
    if (!Number.isFinite(changePct)) continue;
    movers.push({ symbol, changePct, latest: last.close });
  }

  movers.sort((a, b) => b.changePct - a.changePct);
  return {
    gainers: movers.slice(0, WEEKLY_TOP_N),
    losers: movers.slice(-WEEKLY_TOP_N).reverse().filter((m) => m.changePct < 0),
  };
}

function renderMoverList(movers) {
  if (movers.length === 0) return '<div class="empty-state">لا توجد بيانات كافية بعد.</div>';
  return movers
    .map(
      (m) => `
      <div class="mover-row" data-symbol="${m.symbol}">
        <span class="opp-symbol" data-symbol="${m.symbol}">${m.symbol}</span>
        <span class="mover-name">${escapeHtml(state.companies[m.symbol]?.nameAr ?? "")}</span>
        <span class="change ${m.changePct >= 0 ? "up" : "down"}">${m.changePct >= 0 ? "▲" : "▼"} ${Math.abs(m.changePct).toFixed(2)}%</span>
      </div>`
    )
    .join("");
}

function renderWeeklyMovers() {
  const { gainers, losers } = computeWeeklyMovers();
  const holder = document.getElementById("weekly-movers");
  holder.innerHTML = `
    <div class="mover-col">
      <h3>📈 الأكثر ارتفاعًا</h3>
      ${renderMoverList(gainers)}
    </div>
    <div class="mover-col">
      <h3>📉 الأكثر انخفاضًا</h3>
      ${renderMoverList(losers)}
    </div>
  `;
  holder.querySelectorAll(".opp-symbol").forEach((el) => {
    el.addEventListener("click", () => selectCompany(el.dataset.symbol));
  });
}

const TRACK_RECORD_HORIZON_SESSIONS = 5; // عدد جلسات التداول بعد الإشارة لقياس أثرها

function computeSignalTrackRecord() {
  const statsByType = {};
  for (const o of state.opportunities) {
    const entries = (state.history[o.symbol] ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const idx = entries.findIndex((e) => e.date === o.date);
    if (idx === -1) continue;
    const futureIdx = idx + TRACK_RECORD_HORIZON_SESSIONS;
    if (futureIdx >= entries.length) continue;
    const signalClose = entries[idx].close;
    const futureClose = entries[futureIdx].close;
    if (!signalClose || !futureClose) continue;
    const changePct = ((futureClose - signalClose) / signalClose) * 100;

    const bucket = statsByType[o.type] ?? { count: 0, wins: 0, totalChange: 0 };
    bucket.count += 1;
    if (changePct > 0) bucket.wins += 1;
    bucket.totalChange += changePct;
    statsByType[o.type] = bucket;
  }
  return statsByType;
}

function renderTrackRecord() {
  const holder = document.getElementById("track-record");
  const stats = computeSignalTrackRecord();
  const types = Object.keys(stats);

  if (types.length === 0) {
    holder.innerHTML =
      '<div class="empty-state">لا توجد بيانات كافية بعد لقياس أداء الإشارات — يحتاج الأمر عدة أسابيع من التشغيل التلقائي المتراكم.</div>';
    return;
  }

  holder.innerHTML = `
    <table class="track-table">
      <thead>
        <tr>
          <th>نوع الإشارة</th>
          <th>عدد الحالات المقاسة</th>
          <th>نسبة الحالات التي ارتفع فيها السعر</th>
          <th>متوسط التغير</th>
        </tr>
      </thead>
      <tbody>
        ${types
          .map((t) => {
            const s = stats[t];
            const winRate = ((s.wins / s.count) * 100).toFixed(0);
            const avgChange = (s.totalChange / s.count).toFixed(2);
            return `
          <tr>
            <td><span class="badge ${t}">${TYPE_LABELS[t] ?? t}</span></td>
            <td>${s.count}</td>
            <td>${winRate}%</td>
            <td class="${avgChange >= 0 ? "up" : "down"}">${avgChange >= 0 ? "▲" : "▼"} ${Math.abs(avgChange)}%</td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
    <p class="disclaimer">القياس: التغير في السعر بعد ${TRACK_RECORD_HORIZON_SESSIONS} جلسات تداول من تاريخ الإشارة. هذا سجل وصفي للماضي فقط، ولا يضمن تكرار نفس النتيجة مستقبلاً.</p>
  `;
}

async function init() {
  await loadData();
  renderMeta();
  renderOpportunities();
  renderCompanyPanel();
  renderWeeklyMovers();
  renderTrackRecord();
  setupFilters();
  setupSearch();
}

init();
