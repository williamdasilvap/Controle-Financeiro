import { loadState, saveState, resetState } from "./storage.js";
import { brl, ymd, humanDate, parseMoney, monthKeyFromYMD, monthLabel } from "./format.js";

const $ = (id) => document.getElementById(id);

// ==============================
// Preferências (tema / privacidade)
// ==============================
const PREF_THEME_KEY = "cf_theme";
const PREF_HIDE_SALDO_KEY = "cf_hide_saldo";
const PREF_SALDO_MODE_KEY = "cf_saldo_mode"; // REAL | FILTERED

let hideSaldo = (localStorage.getItem(PREF_HIDE_SALDO_KEY) ?? "1") === "1";
let saldoMode = (localStorage.getItem(PREF_SALDO_MODE_KEY) ?? "REAL"); // REAL (todas) / FILTERED (respeita tipo/busca)

function maskedBRL(v) {
  return hideSaldo ? "R$ *,**" : brl(v);
}

function setHideSaldo(next) {
  hideSaldo = !!next;
  localStorage.setItem(PREF_HIDE_SALDO_KEY, hideSaldo ? "1" : "0");
  updateSaldoEyeUI();
  refreshAll();
}

function updateSaldoEyeUI() {
  const btn = $("btnToggleSaldo");
  if (!btn) return;
  btn.innerHTML = hideSaldo ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
}

function setSaldoMode(next) {
  saldoMode = next === "FILTERED" ? "FILTERED" : "REAL";
  localStorage.setItem(PREF_SALDO_MODE_KEY, saldoMode);
  const lab = $("saldoModeLabel");
  if (lab) lab.textContent = saldoMode === "REAL" ? "Saldo real" : "Saldo filtrado";
  renderTxList();
}

// ==============================
// Estado
// ==============================
const DEFAULT_CATS = [
  "Salário", "Freela", "Venda", "Investimentos",
  "Moradia", "Contas", "Alimentação", "Mercado", "Transporte",
  "Saúde", "Educação", "Lazer", "Assinaturas", "Compras", "Outros"
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

function emptyState() {
  return { categories: [...DEFAULT_CATS], transactions: [], recurring: [], budgets: [] };
}

// normaliza categoria e evita duplicata por maiúsc/minúsc
function normalizeCategoryName(s) {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  return t;
}

function getExistingCategoryOrSelf(name) {
  const n = normalizeCategoryName(name);
  if (!n) return "Outros";
  const hit = state.categories.find(c => String(c).toLowerCase() === n.toLowerCase());
  return hit || n;
}

// valida/normaliza restore
function normalizeState(obj) {
  const st = emptyState();
  if (!obj || typeof obj !== "object") return st;

  if (Array.isArray(obj.categories)) {
    for (const c of obj.categories) {
      const cn = normalizeCategoryName(c);
      if (!cn) continue;
      if (!st.categories.some(x => x.toLowerCase() === cn.toLowerCase())) st.categories.push(cn);
    }
  }

  if (Array.isArray(obj.transactions)) {
    for (const t of obj.transactions) {
      const date = String(t?.date ?? "").slice(0, 10);
      const type = (t?.type === "IN" || t?.type === "OUT") ? t.type : null;
      const desc = String(t?.desc ?? "").trim();
      const amount = Math.abs(Number(t?.amount ?? 0));
      if (!date || date.length !== 10) continue;
      if (!type) continue;
      if (!desc) continue;
      if (!Number.isFinite(amount)) continue;

      const cat = getExistingCategoryOrSelf(t?.cat ?? "Outros");
      const id = String(t?.id ?? uid());
      const recurringId = t?.recurringId ? String(t.recurringId) : undefined;

      if (cat && !st.categories.some(x => x.toLowerCase() === cat.toLowerCase())) st.categories.push(cat);

      st.transactions.push({ id, date, type, desc, amount, cat, ...(recurringId ? { recurringId } : {}) });
    }
  }

  if (Array.isArray(obj.recurring)) {
    for (const r of obj.recurring) {
      const id = String(r?.id ?? "");
      const desc = String(r?.desc ?? "").trim();
      const type = (r?.type === "IN" || r?.type === "OUT") ? r.type : null;
      const amount = Math.abs(Number(r?.amount ?? 0));
      const day = Math.min(31, Math.max(1, Number(r?.day ?? 1)));
      const lastRun = r?.lastRun ? String(r.lastRun).slice(0, 7) : "";
      if (!id || !desc || !type || !Number.isFinite(amount)) continue;

      const cat = getExistingCategoryOrSelf(r?.cat ?? "Outros");
      if (cat && !st.categories.some(x => x.toLowerCase() === cat.toLowerCase())) st.categories.push(cat);

      st.recurring.push({ id, desc, type, amount, cat, day, ...(lastRun ? { lastRun } : {}) });
    }
  }

  if (Array.isArray(obj.budgets)) {
    for (const b of obj.budgets) {
      const id = String(b?.id ?? uid());
      const cat = getExistingCategoryOrSelf(b?.cat ?? "Outros");
      const limit = Math.max(0, Number(b?.limit ?? 0));
      if (!Number.isFinite(limit)) continue;
      st.budgets.push({ id, cat, limit });
      if (cat && !st.categories.some(x => x.toLowerCase() === cat.toLowerCase())) st.categories.push(cat);
    }
  }

  return st;
}

let state = normalizeState(loadState());
if (!Array.isArray(state.budgets)) state.budgets = [];
if (!Array.isArray(state.categories)) state.categories = [...DEFAULT_CATS];
if (!Array.isArray(state.transactions)) state.transactions = [];
if (!Array.isArray(state.recurring)) state.recurring = [];

// filtros de período (YYYY-MM-DD)
let filterFrom = "";
let filterTo = "";

// ==============================
// Util
// ==============================
function toast(msg) {
  $("toastBody").textContent = msg;
  $("toastTime").textContent = "agora";
  bootstrap.Toast.getOrCreateInstance($("appToast")).show();
}

function setLastUpdate() {
  $("lastUpdate").textContent = new Date().toLocaleString("pt-BR");
}

function signedAmount(t) {
  const v = Number(t.amount || 0);
  return t.type === "OUT" ? -Math.abs(v) : Math.abs(v);
}

function totalBalance() {
  return state.transactions.reduce((a, t) => a + signedAmount(t), 0);
}

function getMonths() {
  const set = new Set(state.transactions.map(t => monthKeyFromYMD(t.date)));
  const now = new Date();
  set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  return Array.from(set).sort().reverse();
}

function rebuildMonthSelect() {
  const sel = $("monthSelect");
  const months = getMonths();
  sel.innerHTML = months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join("");
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureCatSelect() {
  $("txCat").innerHTML = state.categories
    .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
}

function ensureBudgetCatSelect() {
  const sel = $("budgetCat");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = state.categories
    .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
  if (current) sel.value = current;
}

function monthFilteredTx() {
  const m = $("monthSelect").value;
  return state.transactions.filter(t => monthKeyFromYMD(t.date) === m);
}

function normDate(d) {
  return String(d || "").slice(0, 10);
}

function inRange(dateStr, fromStr, toStr) {
  const d = normDate(dateStr);
  if (fromStr && d < fromStr) return false;
  if (toStr && d > toStr) return false;
  return true;
}

function activePeriodLabel() {
  if (filterFrom || filterTo) {
    const a = filterFrom ? humanDate(filterFrom) : "—";
    const b = filterTo ? humanDate(filterTo) : "—";
    return `${a} → ${b}`;
  }
  const m = $("monthSelect").value;
  return `Mês: ${monthLabel(m)}`;
}

function periodStartDate() {
  if (filterFrom) return filterFrom;
  const m = $("monthSelect").value;
  return `${m}-01`;
}

// ==============================
// Lançamentos recorrentes (mensais)
// ==============================
function monthKeyFromDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseMonthKey(yyyyMM) {
  const [y, m] = String(yyyyMM || "").split("-");
  return { y: Number(y), m: Number(m) };
}

function addMonths(yyyyMM, delta) {
  const { y, m } = parseMonthKey(yyyyMM);
  const d = new Date(y, (m - 1) + delta, 1);
  return monthKeyFromDate(d);
}

function lastDayOfMonth(yyyy, mm) {
  return new Date(yyyy, mm, 0).getDate(); // mm = 1..12
}

function dateFromMonthAndDay(yyyyMM, day) {
  const { y, m } = parseMonthKey(yyyyMM);
  const max = lastDayOfMonth(y, m);
  const dd = Math.min(Math.max(1, Number(day || 1)), max);
  return `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function ensureRecurringTxForMonth(rec, yyyyMM) {
  const exists = state.transactions.some(t => t.recurringId === rec.id && monthKeyFromYMD(t.date) === yyyyMM);
  if (exists) return false;

  const date = dateFromMonthAndDay(yyyyMM, rec.day);
  const cat = getExistingCategoryOrSelf(rec.cat || "Outros");

  const payload = {
    id: uid(),
    date,
    type: rec.type,
    desc: rec.desc,
    amount: Math.abs(Number(rec.amount || 0)),
    cat,
    recurringId: rec.id
  };

  if (payload.cat && !state.categories.some(x => x.toLowerCase() === payload.cat.toLowerCase())) state.categories.push(payload.cat);
  state.transactions.push(payload);
  return true;
}

function applyRecurringUpToCurrentMonth() {
  const current = monthKeyFromDate(new Date());
  let changed = false;

  for (const rec of state.recurring) {
    const start = rec.lastRun ? addMonths(rec.lastRun, 1) : current;

    if (!rec.lastRun) {
      changed = ensureRecurringTxForMonth(rec, current) || changed;
      rec.lastRun = current;
      continue;
    }

    let m = start;
    while (m <= current) {
      changed = ensureRecurringTxForMonth(rec, m) || changed;
      rec.lastRun = m;
      m = addMonths(m, 1);
    }
  }

  if (changed) saveState(state);
  return changed;
}

// ==============================
// KPIs / Home
// ==============================
function kpis() {
  const monthTx = monthFilteredTx();
  let ins = 0, outs = 0;
  for (const t of monthTx) {
    const v = Math.abs(Number(t.amount || 0));
    if (t.type === "IN") ins += v;
    else outs += v;
  }
  return { ins, outs, net: ins - outs, saldo: totalBalance() };
}

function renderKPIs() {
  const { ins, outs, net, saldo } = kpis();
  $("kSaldo").textContent = maskedBRL(saldo);
  $("kIn").textContent = maskedBRL(ins);
  $("kOut").textContent = maskedBRL(outs);
  $("kNet").textContent = maskedBRL(net);
  setLastUpdate();
}

function monthSpentByCategory() {
  const monthTx = monthFilteredTx().filter(t => t.type === "OUT");
  const map = new Map();
  for (const t of monthTx) {
    const c = t.cat || "Outros";
    map.set(c, (map.get(c) || 0) + Math.abs(Number(t.amount || 0)));
  }
  return map;
}

function renderBudgetAlerts() {
  const box = $("budgetAlerts");
  const list = $("budgetAlertList");
  if (!box || !list) return;

  const spentMap = monthSpentByCategory();
  if (!state.budgets.length) {
    box.textContent = "Nenhuma meta cadastrada ainda.";
    list.innerHTML = "";
    return;
  }

  const alerts = [];
  for (const b of state.budgets) {
    const spent = spentMap.get(b.cat) || 0;
    const limit = Math.max(0, Number(b.limit || 0));
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    if (pct >= 100) alerts.push({ level: "danger", txt: `${b.cat}: estourou (${Math.round(pct)}%)`, spent, limit });
    else if (pct >= 80) alerts.push({ level: "warning", txt: `${b.cat}: atenção (${Math.round(pct)}%)`, spent, limit });
  }

  if (!alerts.length) {
    box.textContent = "Tudo ok: nenhuma meta passou de 80% no mês selecionado.";
    list.innerHTML = "";
    return;
  }

  box.textContent = `Você tem ${alerts.length} alerta(s) de meta no mês selecionado.`;
  list.innerHTML = alerts.map(a => `
    <div class="tx-item">
      <div class="d-flex justify-content-between align-items-center gap-2">
        <div class="fw-semibold">${escapeHtml(a.txt)}</div>
        <span class="badge bg-${a.level}">${brl(a.spent)} / ${brl(a.limit)}</span>
      </div>
    </div>
  `).join("");
}

function renderTopExpenses() {
  const wrap = $("topOutList");
  if (!wrap) return;

  const monthTx = monthFilteredTx()
    .filter(t => t.type === "OUT")
    .slice()
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 5);

  if (!monthTx.length) {
    wrap.innerHTML = `<div class="small text-secondary">Sem gastos no mês.</div>`;
    return;
  }

  wrap.innerHTML = monthTx.map((t, i) => `
    <div class="tx-item">
      <div class="d-flex justify-content-between gap-2">
        <div>
          <div class="fw-semibold">${i + 1}. ${escapeHtml(t.desc)}</div>
          <div class="small text-secondary">${humanDate(t.date)} • <span class="tx-badge">${escapeHtml(t.cat || "Outros")}</span></div>
        </div>
        <div class="fw-semibold text-danger">${brl(Math.abs(Number(t.amount || 0)))}</div>
      </div>
    </div>
  `).join("");
}

// ==============================
// "Gráficos" via Bootstrap (sem Chart.js)
// ==============================
function renderCategory() {
  const monthTx = monthFilteredTx().filter(t => t.type === "OUT");
  const map = new Map();
  for (const t of monthTx) {
    const c = t.cat || "Outros";
    map.set(c, (map.get(c) || 0) + Math.abs(Number(t.amount || 0)));
  }

  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((a, [, v]) => a + v, 0) || 0;

  const bars = $("catBars");
  if (bars) {
    bars.innerHTML = sorted.slice(0, 8).map(([c, v]) => {
      const pct = total > 0 ? Math.round((v / total) * 100) : 0;
      return `
        <div class="tx-item">
          <div class="d-flex justify-content-between">
            <div class="fw-semibold">${escapeHtml(c)}</div>
            <div class="fw-semibold">${brl(v)}</div>
          </div>
          <div class="progress mt-2" style="height:10px;border-radius:999px;">
            <div class="progress-bar" role="progressbar" style="width:${pct}%"></div>
          </div>
          <div class="small text-secondary mt-1">${pct}%</div>
        </div>
      `;
    }).join("") || `<div class="small text-secondary">Sem gastos no mês.</div>`;
  }

  const list = $("catList");
  if (list) {
    list.innerHTML = sorted.slice(0, 10).map(([c, v]) => `
      <div class="tx-item">
        <div class="d-flex justify-content-between align-items-center">
          <div class="fw-semibold">${escapeHtml(c)}</div>
          <div class="fw-semibold">${brl(v)}</div>
        </div>
      </div>
    `).join("") || `<div class="small text-secondary">Sem gastos no mês.</div>`;
  }
}

function renderDaily() {
  const wrap = $("dailyBars");
  if (!wrap) return;

  // últimos 14 dias (visual mais “limpo”)
  const now = new Date();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(ymd(d));
  }

  const inMap = new Map(days.map(d => [d, 0]));
  const outMap = new Map(days.map(d => [d, 0]));

  for (const t of state.transactions) {
    if (!inMap.has(t.date)) continue;
    const v = Math.abs(Number(t.amount || 0));
    if (t.type === "IN") inMap.set(t.date, inMap.get(t.date) + v);
    else outMap.set(t.date, outMap.get(t.date) + v);
  }

  const max = Math.max(
    ...days.map(d => (inMap.get(d) || 0) + (outMap.get(d) || 0)),
    1
  );

  wrap.innerHTML = days.map(d => {
    const vin = inMap.get(d) || 0;
    const vout = outMap.get(d) || 0;
    const pin = Math.round((vin / max) * 100);
    const pout = Math.round((vout / max) * 100);

    return `
      <div class="tx-item">
        <div class="d-flex justify-content-between align-items-center">
          <div class="fw-semibold">${humanDate(d)}</div>
          <div class="small text-secondary">IN ${brl(vin)} • OUT ${brl(vout)}</div>
        </div>

        <div class="mt-2">
          <div class="small text-secondary">Entradas</div>
          <div class="progress" style="height:10px;border-radius:999px;">
            <div class="progress-bar bg-success" style="width:${pin}%"></div>
          </div>
        </div>

        <div class="mt-2">
          <div class="small text-secondary">Saídas</div>
          <div class="progress" style="height:10px;border-radius:999px;">
            <div class="progress-bar bg-danger" style="width:${pout}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderMonthly() {
  const wrap = $("monthsBars");
  if (!wrap) return;

  const months = getMonths().slice(0, 6).reverse();
  const inMap = new Map(months.map(m => [m, 0]));
  const outMap = new Map(months.map(m => [m, 0]));

  for (const t of state.transactions) {
    const m = monthKeyFromYMD(t.date);
    if (!inMap.has(m)) continue;
    const v = Math.abs(Number(t.amount || 0));
    if (t.type === "IN") inMap.set(m, inMap.get(m) + v);
    else outMap.set(m, outMap.get(m) + v);
  }

  const max = Math.max(
    ...months.map(m => (inMap.get(m) || 0) + (outMap.get(m) || 0)),
    1
  );

  wrap.innerHTML = months.map(m => {
    const vin = inMap.get(m) || 0;
    const vout = outMap.get(m) || 0;
    const net = vin - vout;
    const pin = Math.round((vin / max) * 100);
    const pout = Math.round((vout / max) * 100);

    return `
      <div class="tx-item">
        <div class="d-flex justify-content-between">
          <div class="fw-semibold">${monthLabel(m)}</div>
          <div class="fw-semibold ${net >= 0 ? "text-success" : "text-danger"}">${brl(net)}</div>
        </div>

        <div class="small text-secondary mt-1">Entradas ${brl(vin)} • Saídas ${brl(vout)}</div>

        <div class="mt-2">
          <div class="progress" style="height:10px;border-radius:999px;">
            <div class="progress-bar bg-success" style="width:${pin}%"></div>
            <div class="progress-bar bg-danger" style="width:${pout}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ==============================
// Extrato / lista
// ==============================
function baseTxForPeriod() {
  if (filterFrom || filterTo) {
    return state.transactions.filter(t => inRange(t.date, filterFrom, filterTo));
  }
  return monthFilteredTx();
}

function filteredList() {
  const type = $("typeFilter").value;
  const q = ($("qSearch").value || "").trim().toLowerCase();

  return baseTxForPeriod()
    .filter(t => {
      if (type !== "ALL" && t.type !== type) return false;
      if (q) {
        const blob = `${t.desc} ${t.cat}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date)); // asc
}

function saldoAnteriorFor(start) {
  if (saldoMode === "REAL") {
    return state.transactions
      .filter(t => t.date < start)
      .reduce((a, t) => a + signedAmount(t), 0);
  }

  const type = $("typeFilter").value;
  const q = ($("qSearch").value || "").trim().toLowerCase();

  return state.transactions
    .filter(t => t.date < start)
    .filter(t => {
      if (type !== "ALL" && t.type !== type) return false;
      if (q) {
        const blob = `${t.desc} ${t.cat}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    })
    .reduce((a, t) => a + signedAmount(t), 0);
}

function renderTxList() {
  const listAsc = filteredList(); // asc
  const listDesc = listAsc.slice().reverse();

  $("txCount").textContent = `${listDesc.length} itens`;
  let sum = 0;
  for (const t of listAsc) sum += signedAmount(t);
  $("txSum").textContent = brl(sum);
  $("txRangeLabel").textContent = activePeriodLabel();

  const start = periodStartDate();
  const saldoAnterior = saldoAnteriorFor(start);

  // totais por dia (asc)
  const dayTotals = new Map();
  for (const t of listAsc) {
    dayTotals.set(t.date, (dayTotals.get(t.date) || 0) + signedAmount(t));
  }
  const daysAsc = Array.from(new Set(listAsc.map(t => t.date))).sort();

  const saldoAposDia = new Map();
  let running = saldoAnterior;
  for (const d of daysAsc) {
    running += (dayTotals.get(d) || 0);
    saldoAposDia.set(d, running);
  }

  const wrap = $("txList");
  wrap.innerHTML = "";

  const head = document.createElement("div");
  head.className = "tx-day";
  head.innerHTML = `
    <div class="tx-day-head">
      <div>
        <div class="fw-semibold">Saldo anterior</div>
        <div class="small text-secondary">antes de ${humanDate(start)}</div>
      </div>
      <div class="text-end fw-semibold">${maskedBRL(saldoAnterior)}</div>
    </div>`;
  wrap.appendChild(head);

  // agrupa por dia
  const byDay = new Map();
  for (const t of listDesc) {
    if (!byDay.has(t.date)) byDay.set(t.date, []);
    byDay.get(t.date).push(t);
  }

  // garante ordem DESC de dias
  const daysDesc = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));

  for (const day of daysDesc) {
    const items = byDay.get(day) || [];
    const daySum = items.reduce((a, t) => a + signedAmount(t), 0);
    const saldoDia = saldoAposDia.get(day) ?? saldoAnterior;

    const block = document.createElement("div");
    block.className = "tx-day";
    block.innerHTML = `
      <div class="tx-day-head">
        <div>
          <div class="fw-semibold">${humanDate(day)}</div>
          <div class="small text-secondary">Movimento do dia: <span class="${daySum >= 0 ? "text-success" : "text-danger"}">${brl(daySum)}</span></div>
        </div>
        <div class="text-end">
          <div class="small text-secondary">Saldo</div>
          <div class="fw-semibold">${maskedBRL(saldoDia)}</div>
        </div>
      </div>
      <div class="tx-day-body"></div>
    `;
    const body = block.querySelector(".tx-day-body");

    for (const t of items) {
      const isIn = t.type === "IN";
      const val = Math.abs(Number(t.amount || 0));
      const icon = isIn ? "bi-arrow-down-left" : "bi-arrow-up-right";
      const color = isIn ? "text-success" : "text-danger";

      const el = document.createElement("div");
      el.className = "tx-item";
      el.innerHTML = `
        <div class="d-flex justify-content-between gap-2">
          <div class="d-flex gap-2">
            <div class="d-grid place-items-center" style="width:34px">
              <i class="bi ${icon} ${color}" style="font-size:1.2rem"></i>
            </div>
            <div>
              <div class="fw-semibold">${escapeHtml(t.desc)}</div>
              <div class="small text-secondary"><span class="tx-badge">${escapeHtml(t.cat || "Outros")}</span></div>
            </div>
          </div>
          <div class="text-end">
            <div class="fw-semibold ${color}">${brl(val)}</div>
            <div class="d-flex justify-content-end gap-1 mt-1">
              <button class="btn btn-sm btn-outline-secondary" data-edit="${t.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" data-del="${t.id}"><i class="bi bi-trash3"></i></button>
            </div>
          </div>
        </div>`;
      body.appendChild(el);
    }
    wrap.appendChild(block);
  }

  wrap.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (!confirm("Excluir este lançamento?")) return;
      state.transactions = state.transactions.filter(x => x.id !== id);
      persistAndRefresh("Lançamento excluído.");
    });
  });

  wrap.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.getAttribute("data-edit")));
  });
}

// ==============================
// Metas
// ==============================
function renderBudgets() {
  const wrap = $("budgetList");
  if (!wrap) return;

  const spentMap = monthSpentByCategory();

  if (!state.budgets.length) {
    wrap.innerHTML = `<div class="tx-item"><div class="small text-secondary">Nenhuma meta cadastrada ainda.</div></div>`;
    return;
  }

  wrap.innerHTML = state.budgets.map(b => {
    const spent = spentMap.get(b.cat) || 0;
    const limit = Math.max(0, Number(b.limit || 0));
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    const status = pct >= 100 ? "Estourou" : (pct >= 80 ? "Atenção" : "Ok");
    const barClass = pct >= 100 ? "bg-danger" : (pct >= 80 ? "bg-warning" : "bg-success");

    return `
      <div class="tx-item">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="fw-semibold">${escapeHtml(b.cat)}</div>
            <div class="small text-secondary">${brl(spent)} de ${brl(limit)} • <span class="badge-soft">${status}</span></div>
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary" data-bedit="${b.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-bdel="${b.id}"><i class="bi bi-trash3"></i></button>
          </div>
        </div>
        <div class="progress mt-2" style="height:10px;border-radius:999px;">
          <div class="progress-bar ${barClass}" role="progressbar" style="width:${Math.min(100, Math.round(pct || 0))}%"></div>
        </div>
        <div class="small text-secondary mt-1">${Math.round(pct || 0)}%</div>
      </div>
    `;
  }).join("");

  wrap.querySelectorAll("[data-bdel]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-bdel");
      if (!confirm("Excluir esta meta?")) return;
      state.budgets = state.budgets.filter(x => x.id !== id);
      saveState(state);
      refreshAll();
      toast("Meta removida.");
    });
  });

  wrap.querySelectorAll("[data-bedit]").forEach(btn => {
    btn.addEventListener("click", () => openBudgetModal(btn.getAttribute("data-bedit")));
  });
}

function openBudgetModal(id) {
  ensureBudgetCatSelect();
  const modalEl = $("modalBudget");
  if (!modalEl) return;

  const isEdit = !!id;
  $("budgetModalTitle").textContent = isEdit ? "Editar meta" : "Nova meta";
  $("budgetId").value = id || "";

  if (isEdit) {
    const b = state.budgets.find(x => x.id === id);
    if (b) {
      $("budgetCat").value = b.cat;
      $("budgetLimit").value = String(b.limit).replace(".", ",");
    }
  } else {
    $("budgetCat").value = state.categories.includes("Alimentação") ? "Alimentação" : (state.categories[0] || "Outros");
    $("budgetLimit").value = "";
  }

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function saveBudgetFromModal() {
  const id = $("budgetId").value || uid();
  const cat = getExistingCategoryOrSelf($("budgetCat").value || "Outros");
  const limit = parseMoney($("budgetLimit").value);

  const existing = state.budgets.find(x => x.id === id);
  if (existing) {
    existing.cat = cat;
    existing.limit = limit;
  } else {
    state.budgets.push({ id, cat, limit });
  }

  if (cat && !state.categories.some(x => x.toLowerCase() === cat.toLowerCase())) state.categories.push(cat);

  saveState(state);
  refreshAll();
  toast("Meta salva.");
  bootstrap.Modal.getOrCreateInstance($("modalBudget")).hide();
}

// ==============================
// Modal de lançamento
// ==============================
function openModalNew() {
  $("txModalTitle").textContent = "Novo lançamento";
  $("txId").value = "";
  $("txDate").value = ymd(new Date());
  $("txType").value = "OUT";
  $("txDesc").value = "";
  $("txAmount").value = "";
  $("txCatNew").value = "";
  $("txCat").value = state.categories.includes("Outros") ? "Outros" : state.categories[0];

  if ($("txRecurring")) {
    $("txRecurring").checked = false;
    $("txRecurringDay").value = String(new Date().getDate());
    $("txRecurringOpts")?.classList.add("d-none");
  }

  bootstrap.Modal.getOrCreateInstance($("modalTx")).show();
}

function openEditModal(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;

  $("txModalTitle").textContent = "Editar lançamento";
  $("txId").value = t.id;
  $("txDate").value = t.date;
  $("txType").value = t.type;
  $("txDesc").value = t.desc;
  $("txAmount").value = String(Math.abs(Number(t.amount || 0))).replace(".", ",");
  $("txCatNew").value = "";
  $("txCat").value = t.cat || "Outros";

  if ($("txRecurring")) {
    const isRec = !!t.recurringId;
    $("txRecurring").checked = isRec;
    const dd = Number(String(t.date || "").slice(8, 10)) || new Date().getDate();
    $("txRecurringDay").value = String(dd);
    $("txRecurringOpts")?.classList.toggle("d-none", !isRec);
  }

  bootstrap.Modal.getOrCreateInstance($("modalTx")).show();
}

function saveTxFromModal() {
  const id = $("txId").value || uid();
  const date = $("txDate").value;
  const type = $("txType").value;
  const desc = $("txDesc").value.trim();
  const amount = parseMoney($("txAmount").value);

  let cat = $("txCat").value;
  const catNew = normalizeCategoryName($("txCatNew").value);

  if (catNew) {
    cat = getExistingCategoryOrSelf(catNew);
    if (!state.categories.some(x => x.toLowerCase() === cat.toLowerCase())) state.categories.push(cat);
  } else {
    cat = getExistingCategoryOrSelf(cat);
  }

  if (!date || !desc || !amount) {
    toast("Preencha data, descrição e valor.");
    return;
  }

  const idx = state.transactions.findIndex(x => x.id === id);
  const previous = idx >= 0 ? state.transactions[idx] : null;
  const prevRecurringId = previous?.recurringId || "";

  const wantsRecurring = !!$("txRecurring") && $("txRecurring").checked;
  const day = $("txRecurringDay")
    ? Number($("txRecurringDay").value || String(date).slice(8, 10))
    : Number(String(date).slice(8, 10));

  const payload = { id, date, type, desc, amount: Math.abs(amount), cat };

  if (wantsRecurring) {
    const recId = prevRecurringId || uid();
    payload.recurringId = recId;

    const monthOfThisTx = monthKeyFromYMD(date);
    const existingRec = state.recurring.find(r => r.id === recId);
    const recPayload = { id: recId, desc, amount: Math.abs(amount), cat, type, day, lastRun: monthOfThisTx };

    if (existingRec) {
      existingRec.desc = recPayload.desc;
      existingRec.amount = recPayload.amount;
      existingRec.cat = recPayload.cat;
      existingRec.type = recPayload.type;
      existingRec.day = recPayload.day;
      if (!existingRec.lastRun || existingRec.lastRun < monthOfThisTx) existingRec.lastRun = monthOfThisTx;
    } else {
      state.recurring.push(recPayload);
    }
  } else {
    if (prevRecurringId) {
      state.recurring = state.recurring.filter(r => r.id !== prevRecurringId);
    }
  }

  if (idx >= 0) state.transactions[idx] = payload;
  else state.transactions.push(payload);

  saveState(state);
  bootstrap.Modal.getOrCreateInstance($("modalTx")).hide();
  persistAndRefresh(idx >= 0 ? "Lançamento atualizado." : "Lançamento adicionado.");
}

// ==============================
// Demo / Backup
// ==============================
function genDemo() {
  const catsOut = ["Moradia", "Contas", "Alimentação", "Mercado", "Transporte", "Saúde", "Assinaturas", "Compras", "Lazer", "Outros"];
  const catsIn = ["Salário", "Freela", "Venda", "Investimentos"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const now = new Date();
  const tx = [];

  for (let i = 0; i < 110; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - Math.floor(Math.random() * 85));
    const isOut = Math.random() < 0.74;
    const type = isOut ? "OUT" : "IN";
    const amount = isOut ? (20 + Math.random() * 450) : (120 + Math.random() * 2500);

    tx.push({
      id: uid(),
      date: ymd(d),
      type,
      desc: isOut ? pick(["mercado", "uber", "ifood", "farmacia", "netflix", "conta luz", "padaria", "amazon"]) : pick(["salário", "pix recebido", "freela", "venda"]),
      amount: Math.round(amount),
      cat: isOut ? pick(catsOut) : pick(catsIn)
    });
  }

  state = emptyState();
  const used = new Set(tx.map(t => t.cat));
  state.categories = Array.from(new Set([...state.categories, ...used]));
  state.transactions = tx.sort((a, b) => b.date.localeCompare(a.date));
  persistAndRefresh("Dados demo gerados.");
}

function exportCsv() {
  const rows = [["date", "type", "description", "category", "amount"]];
  const list = state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date));

  for (const t of list) {
    rows.push([t.date, t.type, t.desc, t.cat, String(Math.abs(Number(t.amount || 0)))]);
  }

  const csv = rows.map(r => r.map(x => {
    const s = String(x ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  }).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lancamentos.csv";
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV exportado.");
}

function backupJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "financas-backup.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Backup gerado.");
}

async function restoreJson(file) {
  const txt = await file.text();
  const obj = JSON.parse(txt);
  const next = normalizeState(obj);
  state = next;
  persistAndRefresh("Backup restaurado.");
}

// ==============================
// Tema + navegação
// ==============================
function setupTheme() {
  const html = document.documentElement;

  const applyTheme = (theme) => {
    const t = (theme === "dark") ? "dark" : "light";
    html.setAttribute("data-bs-theme", t);
    localStorage.setItem(PREF_THEME_KEY, t);
    $("btnTheme").innerHTML = t === "dark" ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
  };

  applyTheme(localStorage.getItem(PREF_THEME_KEY) || html.getAttribute("data-bs-theme") || "light");

  const toggle = () => {
    const next = html.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  };

  $("btnTheme")?.addEventListener("click", toggle);
}

function showView(name) {
  $("view-home").classList.toggle("d-none", name !== "home");
  $("view-tx").classList.toggle("d-none", name !== "tx");
  $("view-budgets")?.classList.toggle("d-none", name !== "budgets");
  document.querySelectorAll(".bn-item[data-nav]").forEach(b => b.classList.remove("active"));
  document.querySelector(`.bn-item[data-nav="${name}"]`)?.classList.add("active");
}

function setupNav() {
  document.querySelectorAll(".bn-item[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.getAttribute("data-nav")));
  });

  $("btnAddBudget")?.addEventListener("click", () => openBudgetModal());
  $("btnGoBudgets")?.addEventListener("click", () => showView("budgets"));
  $("btnSaveBudget")?.addEventListener("click", saveBudgetFromModal);
}

// ==============================
// Filtros / ranges + fix PWA (getOrCreateInstance)
// ==============================
function setupFilters() {
  $("qSearch2").value = $("qSearch").value;
  $("typeFilter2").value = $("typeFilter").value;
  if ($("dateFrom2")) $("dateFrom2").value = filterFrom;
  if ($("dateTo2")) $("dateTo2").value = filterTo;

  const apply = () => {
    $("qSearch").value = $("qSearch2").value;
    $("typeFilter").value = $("typeFilter2").value;
    filterFrom = $("dateFrom2")?.value || "";
    filterTo = $("dateTo2")?.value || "";
    bootstrap.Offcanvas.getOrCreateInstance($("filters")).hide();
    renderTxList();
  };

  $("btnApplyFilters").addEventListener("click", apply);

  $("btnClearFilters").addEventListener("click", () => {
    $("qSearch").value = "";
    $("qSearch2").value = "";
    $("typeFilter").value = "ALL";
    $("typeFilter2").value = "ALL";
    filterFrom = "";
    filterTo = "";
    if ($("dateFrom2")) $("dateFrom2").value = "";
    if ($("dateTo2")) $("dateTo2").value = "";
    bootstrap.Offcanvas.getOrCreateInstance($("filters")).hide();
    renderTxList();
    toast("Filtros limpos.");
  });

  $("qSearch").addEventListener("input", () => {
    $("qSearch2").value = $("qSearch").value;
    renderTxList();
  });

  $("typeFilter").addEventListener("change", () => {
    $("typeFilter2").value = $("typeFilter").value;
    renderTxList();
  });

  const setRange = (from, to) => {
    filterFrom = from || "";
    filterTo = to || "";
    if ($("dateFrom2")) $("dateFrom2").value = filterFrom;
    if ($("dateTo2")) $("dateTo2").value = filterTo;
    renderTxList();
  };

  $("btnRangeToday")?.addEventListener("click", () => {
    const d = ymd(new Date());
    setRange(d, d);
  });

  $("btnRange7")?.addEventListener("click", () => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    setRange(ymd(from), ymd(now));
  });

  $("btnRange30")?.addEventListener("click", () => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 29);
    setRange(ymd(from), ymd(now));
  });

  $("btnRangeMonth")?.addEventListener("click", () => setRange("", ""));

  $("btnRangeAll")?.addEventListener("click", () => {
    const dates = state.transactions.map(t => t.date).sort();
    if (!dates.length) return setRange("", "");
    setRange(dates[0], dates[dates.length - 1]);
  });
}

// ==============================
// Refresh + persist
// ==============================
function refreshAll() {
  renderKPIs();
  renderTxList();
  renderCategory();
  renderDaily();
  renderMonthly();
  renderBudgets();
  renderBudgetAlerts();
  renderTopExpenses();
}

function persistAndRefresh(msg) {
  saveState(state);
  rebuildMonthSelect();
  ensureCatSelect();
  refreshAll();
  if (msg) toast(msg);
}

// ==============================
// Setup
// ==============================
function setup() {
  applyRecurringUpToCurrentMonth();

  rebuildMonthSelect();
  ensureCatSelect();

  const mm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  $("monthSelect").value = mm;
  $("monthSelect").addEventListener("change", refreshAll);

  $("btnAddTx").addEventListener("click", openModalNew);
  $("btnSaveTx").addEventListener("click", saveTxFromModal);

  if ($("txRecurring")) {
    $("txRecurring").addEventListener("change", () => {
      const on = $("txRecurring").checked;
      $("txRecurringOpts")?.classList.toggle("d-none", !on);
      if (on && $("txRecurringDay") && !$("txRecurringDay").value) {
        $("txRecurringDay").value = String(new Date().getDate());
      }
    });
  }

  $("btnDemo").addEventListener("click", genDemo);
  $("btnExport").addEventListener("click", exportCsv);
  $("btnBackup").addEventListener("click", backupJson);

  $("restoreFile").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await restoreJson(f);
    } catch (err) {
      toast("Falha ao restaurar.");
      console.error(err);
    }
    e.target.value = "";
  });

  $("btnReset").addEventListener("click", () => {
    if (!confirm("Zerar todos os dados salvos?")) return;
    resetState();
    state = emptyState();
    persistAndRefresh("Dados zerados.");
  });

  $("btnToday").addEventListener("click", () => {
    $("monthSelect").value = mm;
    refreshAll();
  });

  $("btnToggleSaldo")?.addEventListener("click", () => setHideSaldo(!hideSaldo));
  updateSaldoEyeUI();

  $("btnSaldoMode")?.addEventListener("click", () => {
    setSaldoMode(saldoMode === "REAL" ? "FILTERED" : "REAL");
  });
  setSaldoMode(saldoMode);

  saveState(state);
  refreshAll();
}

setupTheme();
setupNav();
setupFilters();
setup();
showView("home");
