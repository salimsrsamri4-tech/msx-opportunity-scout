const TYPE_LABELS = {
  price_move: "حركة سعرية",
  volume_spike: "حجم غير عادي",
  breakout_high: "كسر أعلى",
  breakout_low: "كسر أدنى",
  financial_result: "نتائج مالية",
};

const state = {
  companies: {},
  history: {},
  opportunities: [],
  meta: {},
  activeFilter: "all",
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
  const items = [...state.opportunities]
    .filter((o) => state.activeFilter === "all" || matchesFilter(o.type, state.activeFilter))
    .reverse()
    .slice(0, 150);

  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state">لا توجد فرص مرصودة بعد ضمن هذا الفلتر.</div>';
    return;
  }

  list.innerHTML = items
    .map(
      (o) => `
      <div class="opp-item">
        <div class="opp-top">
          <span class="badge ${o.type}">${TYPE_LABELS[o.type] ?? o.type}</span>
          <span class="opp-symbol" data-symbol="${o.symbol}">${o.symbol}</span>
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
}

function matchesFilter(type, filter) {
  if (filter === "technical") return type !== "financial_result";
  if (filter === "financial") return type === "financial_result";
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
    panel.innerHTML = '<div class="placeholder">ابحث عن رمز أو اسم شركة، أو اضغط على أي فرصة في القائمة لعرض تفاصيلها هنا.</div>';
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

  panel.innerHTML = `
    <div class="company-header">
      <div>
        <div class="name">${escapeHtml(company?.nameAr ?? symbol)}</div>
        <div class="symbol">${symbol}${company?.nameEn ? " · " + escapeHtml(company.nameEn) : ""}</div>
      </div>
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
            <span class="badge ${o.type}">${TYPE_LABELS[o.type] ?? o.type}</span>
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

async function init() {
  await loadData();
  renderMeta();
  renderOpportunities();
  renderCompanyPanel();
  setupFilters();
  setupSearch();
}

init();
