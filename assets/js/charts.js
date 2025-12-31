import { brl } from "./format.js";

let chartCat=null;
let chartDaily=null;
let chartMonths=null;

// modo privacidade: quando true, valores monetários são mascarados
let privacy=false;

export function setChartsPrivacy(v){
  privacy = !!v;
}

const PALETTE=[
  "rgba(13,110,253,.70)","rgba(25,135,84,.70)","rgba(220,53,69,.70)","rgba(255,193,7,.70)",
  "rgba(111,66,193,.70)","rgba(32,201,151,.70)","rgba(13,202,240,.70)","rgba(253,126,20,.70)",
  "rgba(214,51,132,.70)","rgba(108,117,125,.70)"
];

function moneyTick(v){
  if(privacy) return "•••";
  return brl(v).replace(",00","");
}

function moneyLabel(v){
  if(privacy) return "R$ ***,**";
  return brl(v);
}

export function destroyCharts(){
  if(chartCat) chartCat.destroy();
  if(chartDaily) chartDaily.destroy();
  if(chartMonths) chartMonths.destroy();
  chartCat=null; chartDaily=null; chartMonths=null;
}

export function renderCategoryChart(canvas,labels,values){
  if(chartCat) chartCat.destroy();
  const colors = labels.map((_,i)=>PALETTE[i%PALETTE.length]);

  // Barras horizontais (top categorias)
  chartCat=new Chart(canvas,{
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"Gasto",
        data:values,
        backgroundColor:colors,
        borderWidth:0,
        borderRadius:10,
      }]
    },
    options:{
      responsive:true,
      indexAxis:"y",
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            label:(ctx)=>`${ctx.label}: ${moneyLabel(ctx.raw)}`
          }
        }
      },
      scales:{
        x:{ticks:{callback:(v)=>moneyTick(v)}},
        y:{ticks:{autoSkip:false}}
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
      borderColor:"rgba(25,135,84,.9)",
      backgroundColor:"rgba(25,135,84,.18)",
      pointRadius:2
    },
    {
      label:"Saídas",
      data:outVals,
      tension:.35,
      fill:true,
      borderWidth:2,
      borderColor:"rgba(220,53,69,.9)",
      backgroundColor:"rgba(220,53,69,.14)",
      pointRadius:2
    }
  ];

  if(Array.isArray(balanceVals)){
    datasets.push({
      label:"Saldo (acumulado)",
      data:balanceVals,
      tension:.25,
      fill:false,
      borderWidth:3,
      borderDash:[6,6],
      borderColor:"rgba(13,110,253,.95)",
      pointRadius:0,
      yAxisID:"y"
    });
  }

  chartDaily=new Chart(canvas,{
    type:"line",
    data:{labels,datasets},
    options:{
      responsive:true,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{position:"top"},
        tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${moneyLabel(ctx.raw)}`}}
      },
      scales:{
        y:{ticks:{callback:(v)=>moneyTick(v)}}
      }
    }
  });
}

export function renderMonthlyChart(canvas,labels,inVals,outVals){
  if(chartMonths) chartMonths.destroy();

  const netVals = labels.map((_,i)=>Math.round((Number(inVals[i]||0) - Number(outVals[i]||0))));

  chartMonths=new Chart(canvas,{
    type:"bar",
    data:{
      labels,
      datasets:[
        {
          label:"Entradas",
          data:inVals,
          backgroundColor:"rgba(25,135,84,.55)",
          borderWidth:0
        },
        {
          label:"Saídas",
          data:outVals,
          backgroundColor:"rgba(220,53,69,.50)",
          borderWidth:0
        },
        {
          type:"line",
          label:"Saldo do mês (entradas - saídas)",
          data:netVals,
          borderColor:"rgba(13,110,253,.95)",
          borderWidth:3,
          pointRadius:2,
          tension:.25
        }
      ]
    },
    options:{
      responsive:true,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{position:"top"},
        tooltip:{callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${moneyLabel(ctx.raw)}`}}
      },
      scales:{
        y:{ticks:{callback:(v)=>moneyTick(v)}}
      }
    }
  });
}
