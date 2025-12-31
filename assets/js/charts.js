import { brl } from "./format.js";

let chartCat=null;
let chartDaily=null;
let chartMonths=null;

const PALETTE=[
  "rgba(13,110,253,.70)","rgba(25,135,84,.70)","rgba(220,53,69,.70)","rgba(255,193,7,.70)",
  "rgba(111,66,193,.70)","rgba(32,201,151,.70)","rgba(13,202,240,.70)","rgba(253,126,20,.70)",
  "rgba(214,51,132,.70)","rgba(108,117,125,.70)"
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
    type:"doughnut",
    data:{labels,datasets:[{data:values,backgroundColor:colors,borderWidth:0}]},
    options:{
      responsive:true,
      cutout:"55%",
      plugins:{
        legend:{position:"bottom"},
        tooltip:{
          callbacks:{
            label:(ctx)=>{
              const val=Number(ctx.raw||0);
              const total=(ctx.dataset.data||[]).reduce((a,b)=>a+Number(b||0),0);
              const pct= total>0 ? ((val/total)*100).toFixed(1) : "0.0";
              return `${ctx.label}: ${brl(val)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

export function renderDailyChart(canvas,labels,inVals,outVals,balanceVals){
  if(chartDaily) chartDaily.destroy();

  const datasets=[
    {
      label:"Entradas",
      data:inVals,
      tension:.35,
      fill:true,
      borderWidth:2,
      pointRadius:0
    },
    {
      label:"Saídas",
      data:outVals,
      tension:.35,
      fill:true,
      borderWidth:2,
      pointRadius:0
    }
  ];

  if(Array.isArray(balanceVals)){
    datasets.push({
      label:"Saldo (acumulado)",
      data:balanceVals,
      tension:.2,
      fill:false,
      borderWidth:3,
      borderDash:[6,6],
      pointRadius:0
    });
  }

  chartDaily=new Chart(canvas,{
    type:"line",
    data:{labels,datasets},
    options:{
      responsive:true,
      plugins:{legend:{position:"top"}},
      scales:{
        y:{ticks:{callback:(v)=>brl(v).replace(",00","")}}
      }
    }
  });
}

export function renderMonthlyChart(canvas,labels,inVals,outVals){
  if(chartMonths) chartMonths.destroy();

  const saldoVals = labels.map((_,i)=>Math.round((Number(inVals[i]||0)) - (Number(outVals[i]||0))));

  chartMonths=new Chart(canvas,{
    data:{
      labels,
      datasets:[
        {type:"bar", label:"Entradas", data:inVals},
        {type:"bar", label:"Saídas", data:outVals},
        {type:"line", label:"Saldo do mês", data:saldoVals, tension:.25, fill:false, borderWidth:3, pointRadius:0}
      ]
    },
    options:{
      responsive:true,
      plugins:{
        legend:{position:"top"},
        tooltip:{
          callbacks:{
            label:(ctx)=>{
              const v=Number(ctx.raw||0);
              return `${ctx.dataset.label}: ${brl(v)}`;
            }
          }
        }
      },
      scales:{
        y:{ticks:{callback:(v)=>brl(v).replace(",00","")}}
      }
    }
  });
}
