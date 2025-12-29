import { brl } from "./format.js";

let chartCat=null;
let chartDaily=null;
let chartMonths=null;

const PALETTE=[
  "rgba(13,110,253,.65)","rgba(25,135,84,.65)","rgba(220,53,69,.65)","rgba(255,193,7,.65)",
  "rgba(111,66,193,.65)","rgba(32,201,151,.65)","rgba(13,202,240,.65)","rgba(253,126,20,.65)",
  "rgba(214,51,132,.65)","rgba(108,117,125,.65)"
];

export function destroyCharts(){
  if(chartCat) chartCat.destroy();
  if(chartDaily) chartDaily.destroy();
  if(chartMonths) chartMonths.destroy();
  chartCat=null; chartDaily=null; chartMonths=null;
}

export function renderCategoryChart(canvas,labels,values){
  if(chartCat) chartCat.destroy();
  const colors = labels.map((_,i)=>PALETTE[i%PALETTE.length]);
  chartCat=new Chart(canvas,{
    type:"pie",
    data:{labels,datasets:[{data:values,backgroundColor:colors,borderWidth:0}]},
    options:{responsive:true,plugins:{legend:{position:"bottom"}}}
  });
}

export function renderDailyChart(canvas,labels,inVals,outVals,balanceVals){
  if(chartDaily) chartDaily.destroy();
  const datasets=[
    {label:"Entradas",data:inVals,tension:.35,fill:true},
    {label:"Saídas",data:outVals,tension:.35,fill:true}
  ];
  if(Array.isArray(balanceVals)){
    datasets.push({label:"Saldo",data:balanceVals,tension:.35,fill:false,borderWidth:2,pointRadius:0});
  }
  chartDaily=new Chart(canvas,{
    type:"line",
    data:{labels,datasets},
    options:{
      responsive:true,
      plugins:{legend:{position:"top"}},
      scales:{y:{ticks:{callback:(v)=>brl(v).replace(",00","")}}}
    }
  });
}

export function renderMonthlyChart(canvas,labels,inVals,outVals){
  if(chartMonths) chartMonths.destroy();
  chartMonths=new Chart(canvas,{
    type:"bar",
    data:{labels,datasets:[
      {label:"Entradas",data:inVals},
      {label:"Saídas",data:outVals}
    ]},
    options:{
      responsive:true,
      plugins:{legend:{position:"top"}},
      scales:{
        y:{ticks:{callback:(v)=>brl(v).replace(",00","")}}
      }
    }
  });
}
