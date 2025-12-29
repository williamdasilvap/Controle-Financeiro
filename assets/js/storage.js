const KEY = "controle_financeiro_v2_mobile";
export function loadState(){ try{ const raw = localStorage.getItem(KEY); return raw?JSON.parse(raw):null; } catch { return null; } }
export function saveState(state){ localStorage.setItem(KEY, JSON.stringify(state)); }
export function resetState(){ localStorage.removeItem(KEY); }
