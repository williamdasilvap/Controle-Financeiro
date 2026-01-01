import { loadState, saveState, resetState } from "./storage.js";
import { brl, ymd, humanDate, parseMoney, monthKeyFromYMD, monthLabel } from "./format.js";
import { destroyCharts, setChartsPrivacy } from "./charts.js";
const $=(id)=>document.getElementById(id);

function awaitPromise(p){
  try{
    if(p && typeof p.then==="function"){ p.catch(()=>{}); }
  }catch{}
}


// ==============================
// Modo privacidade (ocultar valores)
// ==============================
const PRIVACY_KEY = "financas_privacy_hide_values";
let hideValues = false;
function loadPrivacy(){
  try{ hideValues = localStorage.getItem(PRIVACY_KEY)==="1"; } catch { hideValues=false; }
  setChartsPrivacy(hideValues);
}
function savePrivacy(){
  try{ localStorage.setItem(PRIVACY_KEY, hideValues?"1":"0"); } catch {}
  setChartsPrivacy(hideValues);
}
function moneyText(v){
  return hideValues ? "R$ ***,**" : brl(v);
}
function applyPrivacyToInputs(){
  // inputs de valor (no modal) viram password para mascarar
  const tx=$("txAmount");
  const bd=$("budgetLimit");
  if(tx) tx.setAttribute("type", hideValues?"password":"text");
  if(bd) bd.setAttribute("type", hideValues?"password":"text");
}
function renderPrivacyIcons(){
  const icon = hideValues ? "bi-eye-slash" : "bi-eye";
  const title = hideValues ? "Mostrar valores" : "Ocultar valores";
  if($("btnPrivacy")) $("btnPrivacy").innerHTML = `<i class="bi ${icon}"></i>`;
  if($("btnPrivacy")) $("btnPrivacy").setAttribute("title", title);
  if($("bnPrivacy")) $("bnPrivacy").querySelector("i").className = `bi ${icon}`;
}
function togglePrivacy(){
  hideValues = !hideValues;
  savePrivacy();
  renderPrivacyIcons();
  applyPrivacyToInputs();
  refreshAll();
}

const DEFAULT_CATS=["Salário","Freela","Venda","Investimentos","Moradia","Contas","Alimentação","Mercado","Transporte","Saúde","Educação","Lazer","Assinaturas","Compras","Outros"];
function uid(){ return Date.now().toString(36)+Math.random().toString(36).substring(2,10); }
function emptyState(){ return {categories:[...DEFAULT_CATS],transactions:[],recurring:[],budgets:[],templates:[],quickAdds:[]}; }
let state=loadState()||emptyState();
if(!Array.isArray(state.budgets)) state.budgets=[];
if(!Array.isArray(state.categories)) state.categories=[...DEFAULT_CATS];
if(!Array.isArray(state.transactions)) state.transactions=[];
if(!Array.isArray(state.recurring)) state.recurring=[];
if(!Array.isArray(state.templates)) state.templates=[];
if(!Array.isArray(state.quickAdds) || !state.quickAdds.length){
  // atalhos padrão (você pode editar depois no código, ou a gente cria UI de edição)
  state.quickAdds=[
    {id:uid(),label:"+ Mercado", type:"OUT", cat:"Mercado", desc:"Mercado", amount:0},
    {id:uid(),label:"+ Uber", type:"OUT", cat:"Transporte", desc:"Uber", amount:0},
    {id:uid(),label:"+ Lanche", type:"OUT", cat:"Alimentação", desc:"Lanche", amount:0}
  ];
}


// filtros de período (YYYY-MM-DD)
let filterFrom="";
let filterTo="";

function toast(msg){ $("toastBody").textContent=msg; $("toastTime").textContent="agora"; new bootstrap.Toast($("appToast")).show(); }
function setLastUpdate(){ $("lastUpdate").textContent=new Date().toLocaleString("pt-BR"); }
function signedAmount(t){ const v=Number(t.amount||0); return t.type==="OUT"?-Math.abs(v):Math.abs(v); }
function totalBalance(){ return state.transactions.reduce((a,t)=>a+signedAmount(t),0); }

function getMonths(){
  const set=new Set(state.transactions.map(t=>monthKeyFromYMD(t.date)));
  const now=new Date(); set.add(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
  return Array.from(set).sort().reverse();
}
function rebuildMonthSelect(){
  const sel=$("monthSelect"); const months=getMonths();
  sel.innerHTML=months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join("");
}
function escapeHtml(s){ return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function ensureCatSelect(){ $("txCat").innerHTML=state.categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(""); }
function monthFilteredTx(){ const m=$("monthSelect").value; return state.transactions.filter(t=>monthKeyFromYMD(t.date)===m); }

function normDate(d){ return String(d||"").slice(0,10); }
function inRange(dateStr, fromStr, toStr){
  const d=normDate(dateStr);
  if(fromStr && d < fromStr) return false;
  if(toStr && d > toStr) return false;
  return true;
}
function activePeriodLabel(){
  if(filterFrom || filterTo){
    const a=filterFrom?humanDate(filterFrom):"—";
    const b=filterTo?humanDate(filterTo):"—";
    return `${a} → ${b}`;
  }
  const m=$("monthSelect").value;
  return `Mês: ${monthLabel(m)}`;
}
function periodStartDate(){
  if(filterFrom) return filterFrom;
  const m=$("monthSelect").value;
  return `${m}-01`;
}

// ==============================
// Lançamentos recorrentes (mensais)
// ==============================
function monthKeyFromDate(dt){
  const y=dt.getFullYear();
  const m=String(dt.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}
function parseMonthKey(yyyyMM){
  const [y,m]=String(yyyyMM||"").split("-");
  return {y:Number(y), m:Number(m)};
}
function addMonths(yyyyMM, delta){
  const {y,m}=parseMonthKey(yyyyMM);
  const d=new Date(y, (m-1)+delta, 1);
  return monthKeyFromDate(d);
}
function lastDayOfMonth(yyyy, mm){
  return new Date(yyyy, mm, 0).getDate(); // mm = 1..12
}
function dateFromMonthAndDay(yyyyMM, day){
  const {y,m}=parseMonthKey(yyyyMM);
  const max=lastDayOfMonth(y,m);
  const dd=Math.min(Math.max(1, Number(day||1)), max);
  return `${y}-${String(m).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
}
function ensureRecurringTxForMonth(rec, yyyyMM){
  // evita duplicar: procura qualquer tx com recurringId + mês
  const exists = state.transactions.some(t=>t.recurringId===rec.id && monthKeyFromYMD(t.date)===yyyyMM);
  if(exists) return false;

  const date = dateFromMonthAndDay(yyyyMM, rec.day);
  const payload={
    id: uid(),
    date,
    type: rec.type,
    desc: rec.desc,
    amount: Math.abs(Number(rec.amount||0)),
    cat: rec.cat||"Outros",
    recurringId: rec.id
  };
  if(payload.cat && !state.categories.includes(payload.cat)) state.categories.push(payload.cat);
  state.transactions.push(payload);
  return true;
}
function applyRecurringUpToCurrentMonth(){
  const current = monthKeyFromDate(new Date());
  let changed=false;
  for(const rec of state.recurring){
    // gera meses faltantes até o mês atual (inclui o atual)
    const start = rec.lastRun ? addMonths(rec.lastRun, 1) : current;
    // se nunca rodou, só gera no mês atual
    if(!rec.lastRun){
      changed = ensureRecurringTxForMonth(rec, current) || changed;
      rec.lastRun = current;
      continue;
    }
    let m = start;
    while(m <= current){
      changed = ensureRecurringTxForMonth(rec, m) || changed;
      rec.lastRun = m;
      m = addMonths(m, 1);
    }
  }
  if(changed){
    saveState(state);
  }
  return changed;
}


function kpis(){
  const monthTx=monthFilteredTx(); let ins=0,outs=0;
  for(const t of monthTx){ const v=Math.abs(Number(t.amount||0)); if(t.type==="IN") ins+=v; else outs+=v; }
  return {ins,outs,net:ins-outs,saldo:totalBalance()};
}
function renderKPIs(){
  const {ins,outs,net,saldo}=kpis();
  $("kSaldo").textContent=moneyText(saldo);
  $("kIn").textContent=moneyText(ins);
  $("kOut").textContent=moneyText(outs);
  $("kNet").textContent=moneyText(net);
  setLastUpdate();
}


function baseTxForPeriod(){
  // Se tiver De/Até, usa o período. Senão, usa o mês selecionado.
  if(filterFrom || filterTo){
    return state.transactions.filter(t=>inRange(t.date, filterFrom, filterTo));
  }
  return monthFilteredTx();
}

function filteredList(){
  const type=$("typeFilter").value;
  const q=($("qSearch").value||"").trim().toLowerCase();
  return baseTxForPeriod().filter(t=>{
    if(type!=="ALL"&&t.type!==type) return false;
    if(q){ const blob=`${t.desc} ${t.cat}`.toLowerCase(); if(!blob.includes(q)) return false; }
    return true;
  }).sort((a,b)=>a.date.localeCompare(b.date)); // asc para cálculo de saldo
}


function renderTxList(){
  const listAsc=filteredList(); // asc
  const listDesc=listAsc.slice().reverse();

  $("txCount").textContent=`${listDesc.length} itens`;
  let sum=0; for(const t of listAsc) sum+=signedAmount(t);
  $("txSum").textContent=moneyText(sum);
  $("txRangeLabel").textContent=activePeriodLabel();

  // saldo anterior ao período (sempre calculado com TODOS os lançamentos, sem filtro de tipo/busca)
  const start=periodStartDate();
  const saldoAnterior = state.transactions
    .filter(t=>t.date < start)
    .reduce((a,t)=>a+signedAmount(t),0);

  // calcula saldo acumulado por dia dentro do período (usando listAsc filtrada)
  const dayTotals=new Map(); // date -> signed sum
  for(const t of listAsc){
    dayTotals.set(t.date,(dayTotals.get(t.date)||0)+signedAmount(t));
  }
  const daysAsc=Array.from(new Set(listAsc.map(t=>t.date))).sort();
  const saldoAposDia=new Map(); // date -> saldo ao final do dia
  let running=saldoAnterior;
  for(const d of daysAsc){
    running += (dayTotals.get(d)||0);
    saldoAposDia.set(d,running);
  }

  const wrap=$("txList"); wrap.innerHTML="";

  // Cabeçalho "Saldo anterior"
  const head=document.createElement("div");
  head.className="tx-day";
  head.innerHTML=`
    <div class="tx-day-head">
      <div>
        <div class="fw-semibold">Saldo anterior</div>
        <div class="small text-secondary">antes de ${humanDate(start)}</div>
      </div>
      <div class="text-end fw-semibold">${moneyText(saldoAnterior)}</div>
    </div>`;
  wrap.appendChild(head);

  // agrupa por dia (desc)
  const byDay=new Map();
  for(const t of listDesc){
    if(!byDay.has(t.date)) byDay.set(t.date,[]);
    byDay.get(t.date).push(t);
  }

  for(const [day,items] of byDay.entries()){
    const daySum = items.reduce((a,t)=>a+signedAmount(t),0);
    const saldoDia = saldoAposDia.get(day) ?? saldoAnterior;

    const block=document.createElement("div");
    block.className="tx-day";
    block.innerHTML=`
      <div class="tx-day-head">
        <div>
          <div class="fw-semibold">${humanDate(day)}</div>
          <div class="small text-secondary">Movimento do dia: <span class="${daySum>=0?"text-success":"text-danger"}">${moneyText(daySum)}</span></div>
        </div>
        <div class="text-end">
          <div class="small text-secondary">Saldo</div>
          <div class="fw-semibold">${moneyText(saldoDia)}</div>
        </div>
      </div>
      <div class="tx-day-body"></div>
    `;
    const body=block.querySelector(".tx-day-body");

    for(const t of items){
      const isIn=t.type==="IN";
      const val=Math.abs(Number(t.amount||0));
      const icon=isIn?"bi-arrow-down-left":"bi-arrow-up-right";
      const color=isIn?"text-success":"text-danger";

      const el=document.createElement("div");
      el.className="tx-item";
      el.innerHTML=`
        <div class="d-flex justify-content-between gap-2">
          <div class="d-flex gap-2">
            <div class="d-grid place-items-center" style="width:34px">
              <i class="bi ${icon} ${color}" style="font-size:1.2rem"></i>
            </div>
            <div>
              <div class="fw-semibold">${escapeHtml(t.desc)}</div>
              <div class="small text-secondary"><span class="tx-badge">${escapeHtml(t.cat||"Outros")}</span></div>
            </div>
          </div>
          <div class="text-end">
            <div class="fw-semibold ${color}">${moneyText(val)}</div>
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

  wrap.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id=btn.getAttribute("data-del");
      if(!confirm("Excluir este lançamento?")) return;
      state.transactions=state.transactions.filter(x=>x.id!==id);
      persistAndRefresh("Lançamento excluído.");
    });
  });
  wrap.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>openEditModal(btn.getAttribute("data-edit")));
  });
}


function renderCategory(){
  const base = monthFilteredTx().filter(t=>t.type==="OUT");
  const totals = {};
  for(const t of base){
    const c=t.cat||"Outros";
    totals[c]=(totals[c]||0)+Math.abs(Number(t.amount||0));
  }
  const items = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  const total = items.reduce((s,[,v])=>s+v,0) || 0;

  const barsEl = $("catBars") || $("catList");
  if(!barsEl) return;

  if(total===0){
    barsEl.innerHTML = `<div class="text-secondary small">Sem gastos no período.</div>`;
    const legendEl = $("catLegend");
    if(legendEl) legendEl.innerHTML="";
    return;
  }

  barsEl.innerHTML = items.map(([cat,val])=>{
    const pct = total>0 ? (val/total)*100 : 0;
    const pctTxt = pct.toFixed(1);
    return `
      <div class="mb-2">
        <div class="d-flex justify-content-between small">
          <div class="text-truncate me-2">${escapeHtml(cat)}</div>
          <div>${pctTxt}%</div>
        </div>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join("");

  const legendEl = $("catLegend");
  if(legendEl){
    legendEl.innerHTML = items.map(([cat,val])=>{
      const pct = total>0 ? ((val/total)*100).toFixed(1) : "0.0";
      return `<div class="d-flex justify-content-between small">
        <div class="text-truncate me-2">${escapeHtml(cat)}</div>
        <div>${moneyText(val)} <span class="text-secondary">(${pct}%)</span></div>
      </div>`;
    }).join("");
  }
}

function renderMonthly(){
  // Gastos (últimos 6 meses) em barras Bootstrap (participação no total)
  const el = $("monthBars");
  if(!el) return;

  const months = getMonths().slice(0,6).reverse(); // asc
  const outMap = new Map();
  for(const m of months) outMap.set(m,0);

  for(const t of state.transactions){
    const m = monthKeyFromYMD(t.date);
    if(!outMap.has(m)) continue;
    if(t.type !== "OUT") continue;
    const v = Math.abs(Number(t.amount||0));
    outMap.set(m, outMap.get(m) + v);
  }

  const items = months.map(m=>({ key:m, label: monthLabel(m), val: Math.round(outMap.get(m)||0) }));
  const total = items.reduce((s,it)=>s+Number(it.val||0),0) || 0;

  if(total===0){
    el.innerHTML = `<div class="text-secondary small">Sem gastos no período.</div>`;
    return;
  }

  el.innerHTML = items.map(it=>{
    const pct = total>0 ? (it.val/total)*100 : 0;
    const pctTxt = pct.toFixed(1);
    return `
      <div class="mb-2">
        <div class="d-flex justify-content-between small">
          <div class="text-truncate me-2">${escapeHtml(it.label)}</div>
          <div>${pctTxt}%</div>
        </div>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join("");
}



function applyCategoryChange(fromCat,toCat,{removeOld=false}={}){
  const from=String(fromCat||"").trim();
  const to=String(toCat||"").trim();
  if(!from||!to) return {changed:false,msg:"Selecione as categorias."};
  if(from===to) return {changed:false,msg:"Categorias iguais."};

  // garante categoria destino
  if(!state.categories.includes(to)) state.categories.push(to);

  // aplica em lançamentos
  for(const t of state.transactions){
    if((t.cat||"Outros")===from) t.cat=to;
  }
  // metas
  for(const b of state.budgets){
    if((b.cat||"Outros")===from) b.cat=to;
  }
  // recorrências
  for(const r of state.recurring){
    if((r.cat||"Outros")===from) r.cat=to;
  }
  // modelos
  for(const m of state.templates){
    if((m.cat||"Outros")===from) m.cat=to;
  }
  // atalhos
  for(const q of state.quickAdds){
    if((q.cat||"Outros")===from) q.cat=to;
  }

  if(removeOld){
    state.categories = state.categories.filter(c=>c!==from);
  }
  normalizeCategories();
  return {changed:true,msg:`Categoria "${from}" → "${to}".`};
}

function renameCategory(fromCat,newName){
  const from=String(fromCat||"").trim();
  const to=String(newName||"").trim();
  if(!from||!to) return {changed:false,msg:"Nome inválido."};
  if(from===to) return {changed:false,msg:"Nada a mudar."};
  const res=applyCategoryChange(from,to,{removeOld:true});
  return res;
}

function refreshCatsUI(){
  // selects do app
  normalizeCategories();
  rebuildMonthSelect(); // caso a lista de categorias mexa com metas/recorrências etc.
  ensureCatSelect();
  ensureBudgetCatSelect();
  renderCategory();
  renderBudgets();
  renderBudgetAlerts();
  renderTopExpenses();
}

function fillCatSelects(){
  const fromSel=$("catFrom");
  const toSel=$("catTo");
  if(!fromSel||!toSel) return;
  const opts=state.categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  fromSel.innerHTML=opts;
  toSel.innerHTML=opts;
  // tenta manter seleção
  if(!toSel.value && state.categories.length) toSel.value=state.categories[0];
}
function renderCatsManage(){
  const wrap=$("catsManageList");
  if(!wrap) return;
  wrap.innerHTML = state.categories.map(cat=>{
    const safe=escapeHtml(cat);
    return `
      <div class="tx-item">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <div class="fw-semibold text-truncate">${safe}</div>
          <div class="d-flex gap-1 flex-shrink-0">
            <button class="btn btn-sm btn-outline-secondary" data-cat-rename="${safe}" title="Renomear"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-cat-delete="${safe}" title="Excluir"><i class="bi bi-trash3"></i></button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  wrap.querySelectorAll("[data-cat-rename]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const from=btn.getAttribute("data-cat-rename");
      const to=prompt(`Renomear categoria:\n\n${from}\n\nNovo nome:`, from);
      if(to===null) return;
      const res=renameCategory(from,to);
      if(res.changed){
        saveState(state);
        fillCatSelects();
        renderCatsManage();
        refreshCatsUI();
        toast(res.msg);
      }else{
        toast(res.msg);
      }
    });
  });

  wrap.querySelectorAll("[data-cat-delete]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const from=btn.getAttribute("data-cat-delete");
      if(state.categories.length<=1) return toast("Você precisa ter pelo menos 1 categoria.");
      // Pré-preenche o batch para o usuário escolher o destino
      fillCatSelects();
      if($("catFrom")) $("catFrom").value=from;
      if($("catTo") && $("catTo").value===from){
        const other=state.categories.find(c=>c!==from);
        if(other) $("catTo").value=other;
      }
      $("catRemoveOld") && ($("catRemoveOld").checked=true);
      toast('Escolha "Para" e clique em "Aplicar" para excluir/juntar.');
    });
  });
}

function ensureBudgetCatSelect(){
  const sel=$("budgetCat"); if(!sel) return;
  const current=sel.value;
  sel.innerHTML = state.categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if(current) sel.value=current;
}
function monthSpentByCategory(){
  const monthTx=monthFilteredTx().filter(t=>t.type==="OUT");
  const map=new Map();
  for(const t of monthTx){
    const c=t.cat||"Outros";
    map.set(c,(map.get(c)||0)+Math.abs(Number(t.amount||0)));
  }
  return map;
}
function renderBudgets(){
  const wrap=$("budgetList");
  if(!wrap) return;
  const spentMap=monthSpentByCategory();
  if(!state.budgets.length){
    wrap.innerHTML = `<div class="tx-item"><div class="small text-secondary">Nenhuma meta cadastrada ainda.</div></div>`;
    return;
  }
  wrap.innerHTML = state.budgets.map(b=>{
    const spent = spentMap.get(b.cat)||0;
    const limit = Math.max(0, Number(b.limit||0));
    const pct = limit>0 ? (spent/limit)*100 : 0;
    const status = pct>=100 ? "Estourou" : (pct>=80 ? "Atenção" : "Ok");
    const barClass = pct>=100 ? "bg-danger" : (pct>=80 ? "bg-warning" : "bg-success");
    return `
      <div class="tx-item">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="fw-semibold">${escapeHtml(b.cat)}</div>
            <div class="small text-secondary">${moneyText(spent)} de ${moneyText(limit)} • <span class="badge-soft">${status}</span></div>
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary" data-bedit="${b.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-bdel="${b.id}"><i class="bi bi-trash3"></i></button>
          </div>
        </div>
        <div class="progress mt-2" style="height:10px;border-radius:999px;">
          <div class="progress-bar ${barClass}" role="progressbar" style="width:${Math.min(100, Math.round(pct||0))}%"></div>
        </div>
        <div class="small text-secondary mt-1">${Math.round(pct||0)}%</div>
      </div>
    `;
  }).join("");

  wrap.querySelectorAll("[data-bdel]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id=btn.getAttribute("data-bdel");
      if(!confirm("Excluir esta meta?")) return;
      state.budgets = state.budgets.filter(x=>x.id!==id);
      saveState(state); refreshAll();
  awaitPromise(requirePinIfNeeded()); toast("Meta removida.");
    });
  });
  wrap.querySelectorAll("[data-bedit]").forEach(btn=>{
    btn.addEventListener("click", ()=>openBudgetModal(btn.getAttribute("data-bedit")));
  });
}


function renderBudgetAlerts(){
  const box=$("budgetAlerts");
  const list=$("budgetAlertList");
  if(!box || !list) return;

  const spentMap=monthSpentByCategory();
  if(!state.budgets.length){
    box.textContent="Nenhuma meta cadastrada ainda.";
    list.innerHTML="";
    return;
  }

  const alerts=[];
  for(const b of state.budgets){
    const spent=spentMap.get(b.cat)||0;
    const limit=Math.max(0, Number(b.limit||0));
    const pct = limit>0 ? (spent/limit)*100 : 0;
    if(pct>=100) alerts.push({level:"danger",txt:`${b.cat}: estourou (${Math.round(pct)}%)`,spent,limit});
    else if(pct>=80) alerts.push({level:"warning",txt:`${b.cat}: atenção (${Math.round(pct)}%)`,spent,limit});
  }

  if(!alerts.length){
    box.textContent="Tudo ok: nenhuma meta passou de 80% no mês selecionado.";
    list.innerHTML="";
    return;
  }

  box.textContent=`Você tem ${alerts.length} alerta(s) de meta no mês selecionado.`;
  list.innerHTML = alerts.map(a=>`
    <div class="tx-item">
      <div class="d-flex justify-content-between align-items-center gap-2">
        <div class="fw-semibold">${escapeHtml(a.txt)}</div>
        <span class="badge bg-${a.level}">${moneyText(a.spent)} / ${moneyText(a.limit)}</span>
      </div>
    </div>
  `).join("");
}

function renderTopExpenses(){
  const wrap=$("topOutList");
  if(!wrap) return;
  const monthTx=monthFilteredTx().filter(t=>t.type==="OUT")
    .slice()
    .sort((a,b)=>Number(b.amount||0)-Number(a.amount||0))
    .slice(0,5);

  if(!monthTx.length){
    wrap.innerHTML = `<div class="small text-secondary">Sem gastos no mês.</div>`;
    return;
  }

  wrap.innerHTML = monthTx.map((t,i)=>`
    <div class="tx-item">
      <div class="d-flex justify-content-between gap-2">
        <div>
          <div class="fw-semibold">${i+1}. ${escapeHtml(t.desc)}</div>
          <div class="small text-secondary">${humanDate(t.date)} • <span class="tx-badge">${escapeHtml(t.cat||"Outros")}</span></div>
        </div>
        <div class="fw-semibold text-danger">${moneyText(Math.abs(Number(t.amount||0)))}</div>
      </div>
    </div>
  `).join("");
}

function openBudgetModal(id){
  ensureBudgetCatSelect();
  const modalEl=$("modalBudget");
  if(!modalEl) return;
  const isEdit=!!id;
  $("budgetModalTitle").textContent=isEdit?"Editar meta":"Nova meta";
  $("budgetId").value=id||"";
  if(isEdit){
    const b=state.budgets.find(x=>x.id===id);
    if(b){ $("budgetCat").value=b.cat; $("budgetLimit").value=String(b.limit).replace(".",","); }
  }else{
    $("budgetCat").value=state.categories.includes("Alimentação")?"Alimentação":(state.categories[0]||"Outros");
    $("budgetLimit").value="";
  }
  new bootstrap.Modal(modalEl).show();
}
function saveBudgetFromModal(){
  const id=$("budgetId").value||uid();
  const cat=$("budgetCat").value||"Outros";
  const limit=parseMoney($("budgetLimit").value);
  const existing=state.budgets.find(x=>x.id===id);
  if(existing){ existing.cat=cat; existing.limit=limit; }
  else state.budgets.push({id,cat,limit});
  saveState(state); refreshAll(); toast("Meta salva.");
  bootstrap.Modal.getInstance($("modalBudget"))?.hide();
}

function refreshAll(){renderKPIs(); renderTxList(); destroyCharts(); renderCategory(); renderMonthly(); renderBudgets(); renderBudgetAlerts(); renderTopExpenses(); }
function persistAndRefresh(msg){ saveState(state); rebuildMonthSelect(); ensureCatSelect(); refreshAll(); if(msg) toast(msg); }


function renderQuickAdds(){
  const box=$("quickAdds");
  if(!box) return;
  box.innerHTML = (state.quickAdds||[]).map(q=>`
    <button type="button" class="quick-btn" data-qa="${escapeHtml(q.id)}">${escapeHtml(q.label||q.desc||"+")}</button>
  `).join("");
  box.querySelectorAll("[data-qa]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.getAttribute("data-qa");
      const q=state.quickAdds.find(x=>x.id===id);
      if(!q) return;
      $("txType").value=q.type||"OUT";
      if(q.desc) $("txDesc").value=q.desc;
      if(q.cat) $("txCat").value=q.cat;
      if(q.amount && Number(q.amount)>0){
        const cur=$("txAmount").value.trim();
        if(!cur) $("txAmount").value=String(q.amount).replace(".",",");
      }
    });
  });
}

function renderTemplates(){
  const wrap=$("templatesList");
  if(!wrap) return;
  if(!state.templates?.length){
    wrap.innerHTML = `<div class="small text-secondary">Nenhum modelo ainda. Use "Salvar modelo" no lançamento.</div>`;
    return;
  }
  wrap.innerHTML = state.templates.map(t=>`
    <div class="template-card">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div>
          <div class="fw-semibold">${escapeHtml(t.label||t.desc||"Modelo")}</div>
          <div class="small text-secondary">${escapeHtml(t.type==="IN"?"Ganho":"Gasto")} • <span class="tx-badge">${escapeHtml(t.cat||"Outros")}</span> • ${moneyText(Number(t.amount||0))}</div>
        </div>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-primary" data-tpl-use="${escapeHtml(t.id)}"><i class="bi bi-play-fill"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-tpl-del="${escapeHtml(t.id)}"><i class="bi bi-trash3"></i></button>
        </div>
      </div>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-tpl-use]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.getAttribute("data-tpl-use");
      const t=state.templates.find(x=>x.id===id);
      if(!t) return;
      openModalNew();
      $("txType").value=t.type||"OUT";
      $("txDesc").value=t.desc||"";
      $("txAmount").value=String(Math.abs(Number(t.amount||0))).replace(".",",");
      if(t.cat && state.categories.includes(t.cat)) $("txCat").value=t.cat;
      // fecha o modal de modelos
      bootstrap.Modal.getInstance($("modalTemplates"))?.hide();
    });
  });
  wrap.querySelectorAll("[data-tpl-del]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.getAttribute("data-tpl-del");
      if(!confirm("Excluir este modelo?")) return;
      state.templates = state.templates.filter(x=>x.id!==id);
      saveState(state);
      renderTemplates();
      toast("Modelo removido.");
    });
  });
}

function saveAsTemplateFromModal(){
  const type=$("txType").value;
  const desc=$("txDesc").value.trim();
  const amount=parseMoney($("txAmount").value);
  const cat=$("txCat").value||"Outros";
  if(!desc || !amount){ toast("Preencha descrição e valor para salvar modelo."); return; }
  const label = prompt("Nome do modelo:", desc) || desc;
  state.templates.push({id:uid(), label, type, desc, amount:Math.abs(amount), cat});
  saveState(state);
  toast("Modelo salvo.");
}

function openModalNew(){
  $("txModalTitle").textContent="Novo lançamento";
  $("txId").value=""; $("txDate").value=ymd(new Date()); $("txType").value="OUT";
  $("txDesc").value=""; $("txAmount").value=""; $("txCatNew").value="";
  $("txCat").value=state.categories.includes("Outros")?"Outros":state.categories[0];

  // recorrência (se existir no HTML)
  if($("txRecurring")){
    $("txRecurring").checked=false;
    $("txRecurringDay").value=String(new Date().getDate());
    $("txRecurringOpts")?.classList.add("d-none");
  }
  renderQuickAdds();
  renderQuickAdds();
  new bootstrap.Modal($("modalTx")).show();
}
function openEditModal(id){
  const t=state.transactions.find(x=>x.id===id); if(!t) return;
  $("txModalTitle").textContent="Editar lançamento";
  $("txId").value=t.id; $("txDate").value=t.date; $("txType").value=t.type;
  $("txDesc").value=t.desc; $("txAmount").value=String(Math.abs(Number(t.amount||0))).replace(".",",");
  $("txCatNew").value=""; $("txCat").value=t.cat||"Outros";

  // recorrência (se existir no HTML)
  if($("txRecurring")){
    const isRec=!!t.recurringId;
    $("txRecurring").checked=isRec;
    const dd=Number(String(t.date||"").slice(8,10))||new Date().getDate();
    $("txRecurringDay").value=String(dd);
    $("txRecurringOpts")?.classList.toggle("d-none", !isRec);
  }
  new bootstrap.Modal($("modalTx")).show();
}
function saveTxFromModal(){
  const id=$("txId").value||uid();
  const date=$("txDate").value; const type=$("txType").value;
  const desc=$("txDesc").value.trim(); const amount=parseMoney($("txAmount").value);
  let cat=$("txCat").value; const catNew=$("txCatNew").value.trim();
  if(catNew){ cat=catNew; if(!state.categories.includes(catNew)) state.categories.push(catNew); }
  if(!date||!desc||!amount){ toast("Preencha data, descrição e valor."); return; }

  const idx=state.transactions.findIndex(x=>x.id===id);
  const previous = idx>=0 ? state.transactions[idx] : null;
  const prevRecurringId = previous?.recurringId || "";

  // recorrência (se existir no HTML)
  const wantsRecurring = !!$("txRecurring") && $("txRecurring").checked;
  const day = $("txRecurringDay") ? Number($("txRecurringDay").value||String(date).slice(8,10)) : Number(String(date).slice(8,10));

  const payload={id,date,type,desc,amount:Math.abs(amount),cat};

  if(wantsRecurring){
    const recId = prevRecurringId || uid();
    payload.recurringId = recId;

    const monthOfThisTx = monthKeyFromYMD(date);
    const existingRec = state.recurring.find(r=>r.id===recId);
    const recPayload = { id: recId, desc, amount: Math.abs(amount), cat, type, day, lastRun: monthOfThisTx };

    if(existingRec){
      existingRec.desc = recPayload.desc;
      existingRec.amount = recPayload.amount;
      existingRec.cat = recPayload.cat;
      existingRec.type = recPayload.type;
      existingRec.day = recPayload.day;
      // garante que lastRun não volte pra trás
      if(!existingRec.lastRun || existingRec.lastRun < monthOfThisTx) existingRec.lastRun = monthOfThisTx;
    }else{
      state.recurring.push(recPayload);
    }
  }else{
    // se era recorrente e o usuário desmarcou, remove a regra (para não gerar nos próximos meses)
    if(prevRecurringId){
      state.recurring = state.recurring.filter(r=>r.id!==prevRecurringId);
    }
  }

  if(idx>=0) state.transactions[idx]=payload; else state.transactions.push(payload);
  saveState(state);
  bootstrap.Modal.getInstance($("modalTx")).hide();
  persistAndRefresh(idx>=0?"Lançamento atualizado.":"Lançamento adicionado.");
}

function genDemo(){
  const catsOut=["Moradia","Contas","Alimentação","Mercado","Transporte","Saúde","Assinaturas","Compras","Lazer","Outros"];
  const catsIn=["Salário","Freela","Venda","Investimentos"];
  const pick=(a)=>a[Math.floor(Math.random()*a.length)];
  const now=new Date();
  const tx=[];
  for(let i=0;i<110;i++){
    const d=new Date(now); d.setDate(now.getDate()-Math.floor(Math.random()*85));
    const isOut=Math.random()<0.74; const type=isOut?"OUT":"IN";
    const amount=isOut?(20+Math.random()*450):(120+Math.random()*2500);
    tx.push({id:uid(),date:ymd(d),type,desc:isOut?pick(["mercado","uber","ifood","farmacia","netflix","conta luz","padaria","amazon"]):pick(["salário","pix recebido","freela","venda"]),amount:Math.round(amount),cat:isOut?pick(catsOut):pick(catsIn)});
  }
  state=emptyState();
  const used=new Set(tx.map(t=>t.cat));
  state.categories=Array.from(new Set([...state.categories,...used]));
  state.transactions=tx.sort((a,b)=>b.date.localeCompare(a.date));
  persistAndRefresh("Dados demo gerados.");
}
function exportCsv(){
  const rows=[["date","type","description","category","amount"]];
  const list=state.transactions.slice().sort((a,b)=>a.date.localeCompare(b.date));
  for(const t of list) rows.push([t.date,t.type,t.desc,t.cat,String(Math.abs(Number(t.amount||0)))]);
  const csv=rows.map(r=>r.map(x=>{ const s=String(x??""); return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s; }).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="lancamentos.csv"; a.click(); URL.revokeObjectURL(url);
  toast("CSV exportado.");
}
function backupJson(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="financas-backup.json"; a.click(); URL.revokeObjectURL(url);
  toast("Backup gerado.");
}
async function restoreJson(file){
  const txt=await file.text(); const obj=JSON.parse(txt);
  if(!obj||!Array.isArray(obj.transactions)) throw new Error("Arquivo inválido");
  state=obj; persistAndRefresh("Backup restaurado.");
}


// ==============================
// PIN simples (bloqueio do app)
// ==============================
const PIN_HASH_KEY="financas_pin_hash";
let pinUnlocked=false;

async function hashPin(pin){
  const enc=new TextEncoder().encode(String(pin));
  if(crypto?.subtle?.digest){
    const buf=await crypto.subtle.digest("SHA-256", enc);
    const bytes=new Uint8Array(buf);
    // base64
    let bin=""; for(const b of bytes) bin+=String.fromCharCode(b);
    return btoa(bin);
  }
  // fallback bem simples (não ideal, mas não quebra)
  return String(pin).split("").reverse().join("") + "_";
}
function isPinEnabled(){
  try{ return !!localStorage.getItem(PIN_HASH_KEY); }catch{ return false; }
}
function setUiLocked(locked){
  document.querySelector("header.appbar")?.classList.toggle("d-none", locked);
  document.querySelector("nav.bottom-nav")?.classList.toggle("d-none", locked);
  document.querySelector("#btnAddTx")?.classList.toggle("d-none", locked);
  document.querySelector("#main")?.classList.toggle("d-none", locked);
}
async function requirePinIfNeeded(){
  if(!isPinEnabled()) return;
  if(pinUnlocked) return;
  setUiLocked(true);
  const modalEl=$("modalUnlock");
  const m=new bootstrap.Modal(modalEl);
  $("pinEnter").value="";
  $("pinErr").classList.add("d-none");
  m.show();
}
async function tryUnlock(){
  const pin=$("pinEnter").value.trim();
  const saved=localStorage.getItem(PIN_HASH_KEY);
  const h=await hashPin(pin);
  if(saved && h===saved){
    pinUnlocked=true;
    $("pinErr").classList.add("d-none");
    bootstrap.Modal.getInstance($("modalUnlock"))?.hide();
    setUiLocked(false);
    refreshAll();
    toast("Desbloqueado.");
  }else{
    $("pinErr").classList.remove("d-none");
  }
}
async function openPinSettings(){
  $("pinNew").value=""; $("pinConfirm").value="";
  new bootstrap.Modal($("modalPin")).show();
}
async function savePin(){
  const a=$("pinNew").value.trim();
  const b=$("pinConfirm").value.trim();
  if(!/^\d{4,8}$/.test(a)) return toast("PIN deve ter 4 a 8 dígitos.");
  if(a!==b) return toast("PIN e confirmação não batem.");
  const h=await hashPin(a);
  try{ localStorage.setItem(PIN_HASH_KEY,h); }catch{}
  pinUnlocked=true;
  toast("PIN salvo.");
  bootstrap.Modal.getInstance($("modalPin"))?.hide();
}
function disablePin(){
  if(!confirm("Desativar o PIN?")) return;
  try{ localStorage.removeItem(PIN_HASH_KEY); }catch{}
  pinUnlocked=true;
  toast("PIN desativado.");
  bootstrap.Modal.getInstance($("modalPin"))?.hide();
}

function setupTheme(){
  const toggle=()=>{
    const html=document.documentElement;
    const next=html.getAttribute("data-bs-theme")==="dark"?"light":"dark";
    html.setAttribute("data-bs-theme",next);
    $("btnTheme").innerHTML=next==="dark"?'<i class="bi bi-sun"></i>':'<i class="bi bi-moon-stars"></i>';
  };
  $("btnTheme").addEventListener("click",toggle);
  $("bnTheme").addEventListener("click",toggle);
}
function showView(name){
  $("view-home").classList.toggle("d-none",name!=="home");
  $("view-tx").classList.toggle("d-none",name!=="tx");
  $("view-budgets")?.classList.toggle("d-none",name!=="budgets");
  document.querySelectorAll(".bn-item[data-nav]").forEach(b=>b.classList.remove("active"));
  document.querySelector(`.bn-item[data-nav="${name}"]`)?.classList.add("active");
}
function setupNav(){
  document.querySelectorAll(".bn-item[data-nav]").forEach(btn=>{
    btn.addEventListener("click",()=>showView(btn.getAttribute("data-nav")));
  });
  $("btnAddBudget")?.addEventListener("click", ()=>openBudgetModal());
  $("btnBudgetNew")?.addEventListener("click", ()=>openBudgetModal());
  $("btnGoBudgets")?.addEventListener("click", ()=>showView("budgets"));
  $("btnSaveBudget")?.addEventListener("click", saveBudgetFromModal);

}
function setupFilters(){

  $("qSearch2").value=$("qSearch").value;
  $("typeFilter2").value=$("typeFilter").value;
  if($("dateFrom2")) $("dateFrom2").value=filterFrom;
  if($("dateTo2")) $("dateTo2").value=filterTo;

  const apply=()=>{
    $("qSearch").value=$("qSearch2").value;
    $("typeFilter").value=$("typeFilter2").value;
    filterFrom=$("dateFrom2")?.value||"";
    filterTo=$("dateTo2")?.value||"";
    bootstrap.Offcanvas.getInstance($("filters")).hide();
    renderTxList();
  };

  $("btnApplyFilters").addEventListener("click",apply);

  $("btnClearFilters").addEventListener("click",()=>{
    $("qSearch").value=""; $("qSearch2").value="";
    $("typeFilter").value="ALL"; $("typeFilter2").value="ALL";
    filterFrom=""; filterTo="";
    if($("dateFrom2")) $("dateFrom2").value="";
    if($("dateTo2")) $("dateTo2").value="";
    bootstrap.Offcanvas.getInstance($("filters")).hide();
    renderTxList(); toast("Filtros limpos.");
  });

  $("qSearch").addEventListener("input",()=>{ $("qSearch2").value=$("qSearch").value; renderTxList(); });
  $("typeFilter").addEventListener("change",()=>{ $("typeFilter2").value=$("typeFilter").value; renderTxList(); });

  // atalhos de período
  const setRange=(from,to)=>{
    filterFrom=from||""; filterTo=to||"";
    if($("dateFrom2")) $("dateFrom2").value=filterFrom;
    if($("dateTo2")) $("dateTo2").value=filterTo;
    renderTxList();
  };
  $("btnRangeToday")?.addEventListener("click",()=>{
    const d=ymd(new Date()); setRange(d,d);
  });
  $("btnRange7")?.addEventListener("click",()=>{
    const now=new Date(); const from=new Date(now); from.setDate(now.getDate()-6);
    setRange(ymd(from), ymd(now));
  });
  $("btnRange30")?.addEventListener("click",()=>{
    const now=new Date(); const from=new Date(now); from.setDate(now.getDate()-29);
    setRange(ymd(from), ymd(now));
  });
  $("btnRangeMonth")?.addEventListener("click",()=>{
    setRange("",""); // volta pro filtro de mês
  });
  $("btnRangeAll")?.addEventListener("click",()=>{
    // período inteiro (pega do mínimo ao máximo)
    const dates=state.transactions.map(t=>t.date).sort();
    if(!dates.length) return setRange("","");
    setRange(dates[0], dates[dates.length-1]);
  });

}
function setup(){
  // preferências
  loadPrivacy();
  renderPrivacyIcons();
  applyPrivacyToInputs();

  // Gera lançamentos recorrentes pendentes (antes de renderizar)
  applyRecurringUpToCurrentMonth();

  rebuildMonthSelect(); ensureCatSelect();
  $("monthSelect").value=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  $("monthSelect").addEventListener("change",refreshAll);

  $("btnAddTx").addEventListener("click",openModalNew);
  $("btnSaveTx").addEventListener("click",saveTxFromModal);

  // botão olho (ocultar/mostrar)
  $("btnPrivacy")?.addEventListener("click",togglePrivacy);
  $("bnPrivacy")?.addEventListener("click",togglePrivacy);

  // olhos dos campos de valor (modais)
  $("toggleTxAmount")?.addEventListener("click",()=>{
    const el=$("txAmount");
    if(!el) return;
    const isPwd = el.getAttribute("type")==="password";
    el.setAttribute("type", isPwd ? "text" : "password");
  });
  $("toggleBudgetLimit")?.addEventListener("click",()=>{
    const el=$("budgetLimit");
    if(!el) return;
    const isPwd = el.getAttribute("type")==="password";
    el.setAttribute("type", isPwd ? "text" : "password");
  });

  // UI: mostrar/ocultar opções de recorrência
  if($("txRecurring")){
    $("txRecurring").addEventListener("change",()=>{
      const on = $("txRecurring").checked;
      $("txRecurringOpts")?.classList.toggle("d-none", !on);
      if(on && $("txRecurringDay") && !$("txRecurringDay").value){
        $("txRecurringDay").value = String(new Date().getDate());
      }
    });
  }

  $("btnDemo").addEventListener("click",genDemo);
  $("btnExport").addEventListener("click",exportCsv);
  $("btnBackup").addEventListener("click",backupJson);

$("btnCats")?.addEventListener("click",()=>{
  fillCatSelects();
  renderCatsManage();
  new bootstrap.Modal($("modalCats")).show();
});
$("btnTemplates")?.addEventListener("click",()=>{
  renderTemplates();
  new bootstrap.Modal($("modalTemplates")).show();
});
$("btnPin")?.addEventListener("click",()=>{
  openPinSettings();
});


  $("restoreFile").addEventListener("change",async (e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    try{ await restoreJson(f); } catch(err){ toast("Falha ao restaurar."); console.error(err); }
    e.target.value="";
  });

  
$("btnAddCat")?.addEventListener("click",()=>{
  const name=$("catNewName").value.trim();
  if(!name) return;
  if(!state.categories.includes(name)) state.categories.push(name);
  normalizeCategories();
  $("catNewName").value="";
  saveState(state);
  fillCatSelects();
  renderCatsManage();
  refreshCatsUI();
  toast("Categoria adicionada.");
});
$("btnBatchCat")?.addEventListener("click",()=>{
  const from=$("catFrom")?.value||"";
  const to=$("catTo")?.value||"";
  const removeOld=!!$("catRemoveOld")?.checked;
  const res=applyCategoryChange(from,to,{removeOld});
  if(res.changed){
    saveState(state);
    fillCatSelects();
    renderCatsManage();
    refreshCatsUI();
    toast(res.msg);
  }else toast(res.msg);
});
$("btnSaveAsTemplate")?.addEventListener("click", saveAsTemplateFromModal);

// PIN
$("btnSavePin")?.addEventListener("click", savePin);
$("btnDisablePin")?.addEventListener("click", disablePin);
$("btnUnlock")?.addEventListener("click", tryUnlock);
$("pinEnter")?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") tryUnlock(); });

$("btnReset").addEventListener("click",()=>{
    if(!confirm("Zerar todos os dados salvos?")) return;
    resetState(); state=emptyState(); persistAndRefresh("Dados zerados.");
  });

  $("btnToday")?.addEventListener("click",()=>{
    $("monthSelect").value=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
    refreshAll();
  });

  saveState(state); refreshAll();
}
setupTheme(); setupNav(); setupFilters(); setup(); showView("home");
