import { loadState, saveState, resetState } from "./storage.js";
import { brl, ymd, humanDate, parseMoney, monthKeyFromYMD, monthLabel } from "./format.js";
import { destroyCharts, renderCategoryChart, renderDailyChart } from "./charts.js";
const $=(id)=>document.getElementById(id);

const DEFAULT_CATS=["Salário","Freela","Venda","Investimentos","Moradia","Contas","Alimentação","Mercado","Transporte","Saúde","Educação","Lazer","Assinaturas","Compras","Outros"];
function uid(){ return Date.now().toString(36)+Math.random().toString(36).substring(2,10); }
function emptyState(){ return {categories:[...DEFAULT_CATS],transactions:[]}; }
let state=loadState()||emptyState();

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

function kpis(){
  const monthTx=monthFilteredTx(); let ins=0,outs=0;
  for(const t of monthTx){ const v=Math.abs(Number(t.amount||0)); if(t.type==="IN") ins+=v; else outs+=v; }
  return {ins,outs,net:ins-outs,saldo:totalBalance()};
}
function renderKPIs(){
  const {ins,outs,net,saldo}=kpis();
  $("kSaldo").textContent=brl(saldo); $("kIn").textContent=brl(ins); $("kOut").textContent=brl(outs); $("kNet").textContent=brl(net);
  setLastUpdate();
}

function filteredList(){
  const type=$("typeFilter").value;
  const q=($("qSearch").value||"").trim().toLowerCase();

  // Filtro por intervalo de datas (YYYY-MM-DD). Comparação de string funciona nesse formato.
  const df=($("dateFrom")?.value||"").trim();
  const dt=($("dateTo")?.value||"").trim();

  return monthFilteredTx().filter(t=>{
    if(type!=="ALL"&&t.type!==type) return false;

    if(df && String(t.date) < df) return false;
    if(dt && String(t.date) > dt) return false;

    if(q){
      const blob=`${t.desc} ${t.cat}`.toLowerCase();
      if(!blob.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=>b.date.localeCompare(a.date));
}

function renderTxList(){
  const list=filteredList();
  $("txCount").textContent=`${list.length} itens`;

  let sum=0; for(const t of list) sum+=signedAmount(t);
  $("txSum").textContent=brl(sum);

  // Texto do período aplicado (no estilo "extrato")
  const df=($("dateFrom")?.value||"").trim();
  const dt=($("dateTo")?.value||"").trim();
  if(df||dt){
    const a=df?humanDate(df):"—";
    const b=dt?humanDate(dt):"—";
    $("txRange").textContent=`Período: ${a} → ${b}`;
  }else{
    $("txRange").textContent="Período: mês selecionado";
  }

  // Pré-calcula total por dia (somando entradas e saídas do filtro atual)
  const dayTotal=new Map();
  for(const t of list){
    dayTotal.set(t.date,(dayTotal.get(t.date)||0)+signedAmount(t));
  }

  const wrap=$("txList"); wrap.innerHTML="";
  let currentDay=null;

  for(const t of list){
    if(t.date!==currentDay){
      currentDay=t.date;
      const net=dayTotal.get(currentDay)||0;
      const netClass=net>=0?"text-success":"text-danger";
      const head=document.createElement("div");
      head.className="tx-day";
      head.innerHTML=`
        <div class="date"><i class="bi bi-calendar3 me-1"></i>${humanDate(currentDay)}</div>
        <div class="day-total ${netClass}">${brl(Math.abs(net))}${net<0?"-":""}</div>
      `;
      wrap.appendChild(head);
    }

    const isIn=t.type==="IN";
    const val=Math.abs(Number(t.amount||0));
    const icon=isIn?"bi-arrow-down-left":"bi-arrow-up-right";
    const color=isIn?"text-success":"text-danger";

    const el=document.createElement("div");
    el.className="tx-item";
    el.setAttribute("data-type", t.type);
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
          <div class="fw-semibold ${color}">${brl(val)}</div>
          <div class="d-flex justify-content-end gap-1 mt-1">
            <button class="btn btn-sm btn-outline-secondary" data-edit="${t.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-del="${t.id}"><i class="bi bi-trash3"></i></button>
          </div>
        </div>
      </div>`;
    wrap.appendChild(el);
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
  const monthTx=monthFilteredTx().filter(t=>t.type==="OUT");
  const map=new Map();
  for(const t of monthTx){
    const c=t.cat||"Outros";
    map.set(c,(map.get(c)||0)+Math.abs(Number(t.amount||0)));
  }
  const sorted=Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10);
  renderCategoryChart($("chartCat"), sorted.map(x=>x[0]), sorted.map(x=>Math.round(x[1])));
  $("catList").innerHTML=sorted.map(([c,v])=>`
    <div class="tx-item"><div class="d-flex align-items-center justify-content-between">
      <div class="fw-semibold">${escapeHtml(c)}</div><div class="fw-semibold">${brl(v)}</div>
    </div></div>`).join("") || `<div class="small text-secondary">Sem gastos no mês.</div>`;
}

function renderDaily(){
  const now=new Date(); const from=new Date(now); from.setDate(now.getDate()-29);
  const mapIn=new Map(); const mapOut=new Map();
  for(let i=0;i<30;i++){ const d=new Date(from); d.setDate(from.getDate()+i); const key=ymd(d); mapIn.set(key,0); mapOut.set(key,0); }
  for(const t of state.transactions){
    if(!mapIn.has(t.date)) continue;
    const v=Math.abs(Number(t.amount||0));
    if(t.type==="IN") mapIn.set(t.date,mapIn.get(t.date)+v); else mapOut.set(t.date,mapOut.get(t.date)+v);
  }
  const labels=Array.from(mapIn.keys()).map(k=>k.slice(5));
  const inVals=Array.from(mapIn.values()).map(v=>Math.round(v));
  const outVals=Array.from(mapOut.values()).map(v=>Math.round(v));
  renderDailyChart($("chartDaily"), labels, inVals, outVals);
}

function refreshAll(){ renderKPIs(); renderTxList(); destroyCharts(); renderCategory(); renderDaily(); }
function persistAndRefresh(msg){ saveState(state); rebuildMonthSelect(); ensureCatSelect(); refreshAll(); if(msg) toast(msg); }

function openModalNew(){
  $("txModalTitle").textContent="Novo lançamento";
  $("txId").value=""; $("txDate").value=ymd(new Date()); $("txType").value="OUT";
  $("txDesc").value=""; $("txAmount").value=""; $("txCatNew").value="";
  $("txCat").value=state.categories.includes("Outros")?"Outros":state.categories[0];
  new bootstrap.Modal($("modalTx")).show();
}
function openEditModal(id){
  const t=state.transactions.find(x=>x.id===id); if(!t) return;
  $("txModalTitle").textContent="Editar lançamento";
  $("txId").value=t.id; $("txDate").value=t.date; $("txType").value=t.type;
  $("txDesc").value=t.desc; $("txAmount").value=String(Math.abs(Number(t.amount||0))).replace(".",",");
  $("txCatNew").value=""; $("txCat").value=t.cat||"Outros";
  new bootstrap.Modal($("modalTx")).show();
}
function saveTxFromModal(){
  const id=$("txId").value||uid();
  const date=$("txDate").value; const type=$("txType").value;
  const desc=$("txDesc").value.trim(); const amount=parseMoney($("txAmount").value);
  let cat=$("txCat").value; const catNew=$("txCatNew").value.trim();
  if(catNew){ cat=catNew; if(!state.categories.includes(catNew)) state.categories.push(catNew); }
  if(!date||!desc||!amount){ toast("Preencha data, descrição e valor."); return; }
  const payload={id,date,type,desc,amount:Math.abs(amount),cat};
  const idx=state.transactions.findIndex(x=>x.id===id);
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
  document.querySelectorAll(".bn-item[data-nav]").forEach(b=>b.classList.remove("active"));
  document.querySelector(`.bn-item[data-nav="${name}"]`)?.classList.add("active");
}
function setupNav(){
  document.querySelectorAll(".bn-item[data-nav]").forEach(btn=>{
    btn.addEventListener("click",()=>showView(btn.getAttribute("data-nav")));
  });
}
function setupFilters(){
  // espelha os controles do topo para o offcanvas
  $("qSearch2").value=$("qSearch").value;
  $("typeFilter2").value=$("typeFilter").value;

  // inicializa filtro de data vazio
  if($("dateFrom")) $("dateFrom").value = "";
  if($("dateTo")) $("dateTo").value = "";

  const apply=()=>{
    $("qSearch").value=$("qSearch2").value;
    $("typeFilter").value=$("typeFilter2").value;

    bootstrap.Offcanvas.getInstance($("filters")).hide();
    renderTxList();
  };

  $("btnApplyFilters").addEventListener("click", apply);

  $("btnClearFilters").addEventListener("click",()=>{
    $("qSearch").value=""; $("qSearch2").value="";
    $("typeFilter").value="ALL"; $("typeFilter2").value="ALL";
    if($("dateFrom")) $("dateFrom").value="";
    if($("dateTo")) $("dateTo").value="";
    bootstrap.Offcanvas.getInstance($("filters")).hide();
    renderTxList(); toast("Filtros limpos.");
  });

  $("qSearch").addEventListener("input",()=>{ $("qSearch2").value=$("qSearch").value; renderTxList(); });
  $("typeFilter").addEventListener("change",()=>{ $("typeFilter2").value=$("typeFilter").value; renderTxList(); });

  // quando mexer nas datas, já atualiza o "extrato"
  $("dateFrom")?.addEventListener("change",()=>renderTxList());
  $("dateTo")?.addEventListener("change",()=>renderTxList());
}
function setup(){
  rebuildMonthSelect(); ensureCatSelect();
  $("monthSelect").value=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  $("monthSelect").addEventListener("change",refreshAll);

  $("btnAddTx").addEventListener("click",openModalNew);
  $("btnSaveTx").addEventListener("click",saveTxFromModal);

  $("btnDemo").addEventListener("click",genDemo);
  $("btnExport").addEventListener("click",exportCsv);
  $("btnBackup").addEventListener("click",backupJson);

  $("restoreFile").addEventListener("change",async (e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    try{ await restoreJson(f); } catch(err){ toast("Falha ao restaurar."); console.error(err); }
    e.target.value="";
  });

  $("btnReset").addEventListener("click",()=>{
    if(!confirm("Zerar todos os dados salvos?")) return;
    resetState(); state=emptyState(); persistAndRefresh("Dados zerados.");
  });

  $("btnToday").addEventListener("click",()=>{
    $("monthSelect").value=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
    refreshAll();
  });

  saveState(state); refreshAll();
}
setupTheme(); setupNav(); setupFilters(); setup(); showView("home");
