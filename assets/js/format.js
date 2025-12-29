export function brl(n){ const v=Number(n||0); return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
export function ymd(date){ const d=new Date(date); const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,"0"); const dd=String(d.getDate()).padStart(2,"0"); return `${yyyy}-${mm}-${dd}`; }
export function humanDate(ymdStr){ const [y,m,d]=ymdStr.split("-"); return `${d}/${m}/${y}`; }
export function parseMoney(v){ let s=String(v??"").trim(); if(!s) return 0; s=s.replaceAll("R$","").trim(); if(s.includes(",")&&!s.includes(".")) s=s.replaceAll(".","").replaceAll(",","."); if(s.includes(".")&&s.includes(",")) s=s.replaceAll(".","").replaceAll(",","."); const n=Number(s); return Number.isFinite(n)?n:0; }
export function monthKeyFromYMD(ymdStr){ return String(ymdStr).slice(0,7); }
export function monthLabel(yyyyMM){ const [y,m]=yyyyMM.split("-"); const names=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${names[Number(m)-1]}/${y}`; }
