import { brl } from "./format.js";
let chartCat=null; let chartDaily=null;
export function destroyCharts(){ if(chartCat) chartCat.destroy(); if(chartDaily) chartDaily.destroy(); chartCat=null; chartDaily=null; }
export function renderCategoryChart(canvas,labels,values){
  if(chartCat) chartCat.destroy();
  chartCat=new Chart(canvas,{type:"doughnut",data:{labels,datasets:[{data:values}]},options:{responsive:true,plugins:{legend:{position:"bottom"}}}});
}
export function renderDailyChart(canvas,labels,inVals,outVals){
  if(chartDaily) chartDaily.destroy();
  chartDaily=new Chart(canvas,{type:"line",data:{labels,datasets:[{label:"Entradas",data:inVals,tension:.35,fill:true},{label:"Saídas",data:outVals,tension:.35,fill:true}]},
    options:{responsive:true,plugins:{legend:{position:"top"}},scales:{y:{ticks:{callback:(v)=>brl(v).replace(",00","")}}}}});
}
