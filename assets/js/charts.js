import { brl } from "./format.js";
let chartCat=null; let chartDaily=null;

const PALETTE = [
  "rgba(13,110,253,.75)",  // azul
  "rgba(25,135,84,.75)",   // verde
  "rgba(220,53,69,.75)",   // vermelho
  "rgba(255,193,7,.80)",   // amarelo
  "rgba(111,66,193,.75)",  // roxo
  "rgba(13,202,240,.75)",  // ciano
  "rgba(253,126,20,.78)",  // laranja
  "rgba(32,201,151,.75)",  // teal
  "rgba(214,51,132,.72)",  // rosa
  "rgba(108,117,125,.72)"  // cinza
];

function paletteFor(n){
  const out=[];
  for(let i=0;i<n;i++) out.push(PALETTE[i % PALETTE.length]);
  return out;
}

export function destroyCharts(){
  if(chartCat) chartCat.destroy();
  if(chartDaily) chartDaily.destroy();
  chartCat=null; chartDaily=null;
}

export function renderCategoryChart(canvas,labels,values){
  if(chartCat) chartCat.destroy();

  chartCat=new Chart(canvas,{
    type:"pie",
    data:{
      labels,
      datasets:[{
        data:values,
        backgroundColor: paletteFor(values.length),
        borderWidth: 1,
        borderColor: "rgba(255,255,255,.65)"
      }]
    },
    options:{
      responsive:true,
      plugins:{
        legend:{position:"bottom", labels:{usePointStyle:true, boxWidth:10}},
        tooltip:{
          callbacks:{
            label:(ctx)=> `${ctx.label}: ${brl(ctx.parsed)}`
          }
        }
      }
    }
  });
}

export function renderDailyChart(canvas,labels,inVals,outVals){
  if(chartDaily) chartDaily.destroy();

  chartDaily=new Chart(canvas,{
    type:"line",
    data:{
      labels,
      datasets:[
        {
          label:"Entradas",
          data:inVals,
          tension:.35,
          fill:true,
          borderWidth:2,
          pointRadius:2,
          borderColor:"rgba(25,135,84,.9)",
          backgroundColor:"rgba(25,135,84,.18)"
        },
        {
          label:"Saídas",
          data:outVals,
          tension:.35,
          fill:true,
          borderWidth:2,
          pointRadius:2,
          borderColor:"rgba(220,53,69,.9)",
          backgroundColor:"rgba(220,53,69,.16)"
        }
      ]
    },
    options:{
      responsive:true,
      plugins:{
        legend:{position:"top", labels:{usePointStyle:true, boxWidth:10}},
        tooltip:{
          callbacks:{
            label:(ctx)=> `${ctx.dataset.label}: ${brl(ctx.parsed.y)}`
          }
        }
      },
      scales:{
        y:{ticks:{callback:(v)=>brl(v).replace(",00","")}}
      }
    }
  });
}
