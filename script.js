/* COLLAGE PROJECT — deterministic coupled predator–prey–pollution model.
   The derivatives below follow the equations displayed in the interface. */
'use strict';

const PARAMS = [
  { group:'Initial conditions', symbol:'x₀', fields:[['x0','Initial prey population',30,0,200,'1','individuals / ha'],['y0','Initial predator population',8,0,100,'1','individuals / ha'],['P0','Initial pollution concentration',0.2,0,30,'0.1','concentration units']] },
  { group:'Prey parameters', symbol:'x', fields:[['r','Growth rate (r)',0.8,0,3,'0.01','1 / time'],['K0','Carrying capacity (K₀)',100,1,500,'1','prey / ha'],['alpha','Pollution sensitivity (α)',0.08,0,1,'0.005','1 / concentration'],['a','Predation rate (a)',0.03,0,0.2,'0.001','1 / time'],['h','Feeding saturation (h)',0.02,0,0.2,'0.001','ha / prey'],['mux','Pollution mortality (μₓ)',0.005,0,0.2,'0.001','1 / (time·conc.)']] },
  { group:'Predator parameters', symbol:'y', fields:[['e','Conversion efficiency (e)',0.45,0,1,'0.01','dimensionless'],['d','Natural mortality rate (d)',0.25,0,2,'0.01','1 / time'],['muy','Pollution mortality (μᵧ)',0.01,0,0.2,'0.001','1 / (time·conc.)']] },
  { group:'Pollution parameters', symbol:'P', fields:[['Q','External pollution input (Q)',0.08,0,3,'0.01','conc. / time'],['eta','Prey-related generation (η)',0.001,0,0.05,'0.0001','conc. / (prey·time)'],['delta','Natural removal (δ)',0.18,0,2,'0.01','1 / time'],['R','Maximum additional removal (R)',0.5,0,5,'0.01','conc. / time'],['H','Half-saturation constant (H)',2,0.1,30,'0.1','concentration units']] }
];
const DEFAULTS = Object.fromEntries(PARAMS.flatMap(g=>g.fields.map(f=>[f[0],f[2]])));
const PRESETS = {
  balanced:{},
  collapse:{x0:44,y0:18,P0:.15,r:.55,K0:85,alpha:.07,a:.025,h:.02,mux:.004,e:.2,d:.48,muy:.025,Q:.12,eta:.001,delta:.16,R:.35,H:2},
  pollution:{x0:40,y0:9,P0:1.2,r:.8,K0:110,alpha:.32,a:.028,h:.02,mux:.012,e:.42,d:.24,muy:.025,Q:1.55,eta:.003,delta:.09,R:.16,H:2.5},
  boom:{x0:12,y0:2,P0:.1,r:1.65,K0:145,alpha:.035,a:.055,h:.01,mux:.002,e:.52,d:.29,muy:.006,Q:.045,eta:.0006,delta:.22,R:.45,H:2}
};
const TIPS = {
  x0:'Starting prey density at time zero.',y0:'Starting predator density at time zero.',P0:'Starting concentration of environmental pollution.',
  r:'Intrinsic per-capita prey growth rate when resources are plentiful.',K0:'Maximum prey density supported in a clean environment.',alpha:'How quickly pollution reduces the prey carrying capacity.',a:'Rate at which predators encounter and consume prey.',h:'Controls how quickly predation saturates at high prey density.',mux:'Prey mortality per pollution concentration unit.',
  e:'Fraction of consumed prey converted into predator biomass.',d:'Per-capita predator loss from causes other than pollution.',muy:'Predator mortality per pollution concentration unit.',
  Q:'Constant pollution entering from outside the ecosystem.',eta:'Pollution generated in proportion to prey density.',delta:'First-order natural pollution removal rate.',R:'Maximum rate of additional saturating pollution removal.',H:'Pollution concentration at which additional removal reaches half of R.'
};
const UNIT_SHORT={x0:'ind/ha',y0:'ind/ha',P0:'conc.',r:'1/t',K0:'prey/ha',alpha:'1/conc.',a:'ha/(ind·t)',h:'ha/prey',mux:'1/(t·conc.)',e:'—',d:'1/t',muy:'1/(t·conc.)',Q:'conc./t',eta:'conc./(prey·t)',delta:'1/t',R:'conc./t',H:'conc.'};
let values={...DEFAULTS}, result=null, chartMap={}, playTimer=null, playing=false, paused=false, currentIndex=0, activePreset='balanced';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=(n,d=2)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:0}):'—';

function renderControls(){
  const host=$('#controls'); host.innerHTML='';
  PARAMS.forEach((group,gi)=>{
    const section=document.createElement('section');section.className='control-group';
    const heading=document.createElement('h3');heading.className='group-title';heading.innerHTML=`<span class="group-icon">${group.symbol}</span>${group.group}`;section.append(heading);
    group.fields.forEach(([id,label,value,min,max,step,unit])=>{
      const row=document.createElement('div');row.className='control-item';
      row.innerHTML=`<div class="control-top"><label class="control-label" for="num-${id}" title="${TIPS[id]}">${label}</label><div class="control-value-wrap" title="Units: ${unit}"><input class="control-number" id="num-${id}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><span class="control-unit">${UNIT_SHORT[id]}</span></div></div><input class="control-range" id="range-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}" title="${TIPS[id]}">`;
      section.append(row);
      const num=row.querySelector(`#num-${id}`),range=row.querySelector(`#range-${id}`);
      const update=(raw,source)=>{let v=Number(raw);if(!Number.isFinite(v))return;v=Math.min(max,Math.max(min,v));values[id]=v;num.value=String(v);range.value=String(v);activePreset='custom';$$('.preset').forEach(b=>b.classList.remove('active'));if($('#autoRun').checked)recalculate();};
      range.addEventListener('input',()=>update(range.value,'range'));num.addEventListener('input',()=>{if(num.value!=='')update(num.value,'number')});num.addEventListener('change',()=>{if(num.value==='')num.value=values[id];else update(num.value,'number')});
    });host.append(section);
  });
}
function syncControls(){for(const [id,v] of Object.entries(values)){const n=$(`#num-${id}`),r=$(`#range-${id}`);if(n&&r){n.value=v;r.value=v;}}}
function applyPreset(name){activePreset=name;values={...DEFAULTS,...PRESETS[name]};syncControls();$$('.preset').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));recalculate();}

function derivatives(s){
  const [x,y,P]=s, {r,K0,alpha,a,h,mux,e,d,muy,Q,eta,delta,R,H}=values;
  const denom=1+h*x, pollutionDenom=H+P;
  const safeDenom=Math.abs(denom)<1e-12?(denom<0?-1e-12:1e-12):denom;
  const safePollutionDenom=Math.abs(pollutionDenom)<1e-12?(pollutionDenom<0?-1e-12:1e-12):pollutionDenom;
  const capacity=K0*Math.exp(-alpha*P);
  return [r*x*(1-x/Math.max(capacity,1e-12))-(a*x*y)/safeDenom-mux*P*x,(e*a*x*y)/safeDenom-d*y-muy*P*y,Q+eta*x-delta*P-(R*P)/safePollutionDenom];
}
function rk4Step(s,dt){
  const add=(v,k,f)=>v.map((n,i)=>n+f*k[i]);
  const k1=derivatives(s),k2=derivatives(add(s,k1,dt/2)),k3=derivatives(add(s,k2,dt/2)),k4=derivatives(add(s,k3,dt));
  return s.map((v,i)=>v+dt*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
}
function simulate(){
  const duration=Number($('#duration').value),dt=Number($('#timeStep').value);
  if(!(duration>0)||!(dt>0)||!Number.isFinite(duration)||!Number.isFinite(dt)){showWarning('Duration and time step must both be positive finite numbers.');return null;}
  const steps=Math.ceil(duration/dt);
  if(steps>200000){showWarning(`This run needs ${steps.toLocaleString()} RK4 steps. Increase the time step or shorten the duration (maximum 200,000 steps).`);return null;}
  const times=[0],xs=[values.x0],ys=[values.y0],ps=[values.P0],caps=[values.K0*Math.exp(-values.alpha*values.P0)];
  let state=[values.x0,values.y0,values.P0],warnings=[],unstable=false;
  for(let i=0;i<steps;i++){
    const step=Math.min(dt,duration-i*dt),next=rk4Step(state,step);
    if(next.some(v=>!Number.isFinite(v))){warnings.push(`Non-finite value detected at t=${fmt(i*dt,4)}; integration stopped to avoid drawing invalid results.`);unstable=true;break;}
    if(next.some(v=>Math.abs(v)>1e7)){warnings.push(`A state exceeded 10,000,000 at t=${fmt((i+1)*step,4)}; integration stopped because this run is numerically unstable.`);unstable=true;break;}
    if(next.some(v=>v < -1e-7)){if(!warnings.some(w=>w.includes('negative state')))warnings.push('RK4 produced a negative state. Values were clipped to zero for ecological non-negativity; reduce the time step if this occurs unexpectedly.');}
    state=next.map(v=>Math.max(0,v));
    const t=Math.min(duration,(i+1)*dt);times.push(t);xs.push(state[0]);ys.push(state[1]);ps.push(state[2]);caps.push(values.K0*Math.exp(-values.alpha*state[2]));
  }
  if(!warnings.length)$('#warningBox').hidden=true;else showWarning(warnings.join(' '));
  return {times,xs,ys,ps,caps,baseline:values.K0,warnings,unstable,dt,duration};
}
function showWarning(msg){const box=$('#warningBox');box.textContent='Numerical notice: '+msg;box.hidden=false;}
function chartOptions(yTitle,legend=true){return {responsive:true,maintainAspectRatio:false,animation:{duration:220},interaction:{mode:'index',intersect:false},plugins:{legend:{display:legend,position:'top',align:'end',labels:{color:'#52647a',boxWidth:14,boxHeight:2,usePointStyle:true,pointStyle:'line',font:{family:'DM Sans',size:9},padding:13}},tooltip:{backgroundColor:'#ffffff',borderColor:'#cbd6e4',borderWidth:1,titleColor:'#24354d',bodyColor:'#52647a',padding:9,displayColors:true}},scales:{x:{type:'linear',title:{display:true,text:'Time',color:'#64748b',font:{family:'DM Sans',size:9}},ticks:{color:'#64748b',maxTicksLimit:8,font:{family:'DM Mono',size:8}},grid:{color:'#e1e7ef'}},y:{title:{display:true,text:yTitle,color:'#64748b',font:{family:'DM Sans',size:9}},ticks:{color:'#64748b',maxTicksLimit:6,font:{family:'DM Mono',size:8}},grid:{color:'#e1e7ef'},beginAtZero:true}}};}
const cursorPlugin={id:'simulationCursor',afterDraw(chart){if(!playing||!result)return;const x=chart.scales.x.getPixelForValue(result.times[currentIndex]||0),{ctx,chartArea}=chart;ctx.save();ctx.strokeStyle='rgba(64,84,108,.38)';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x,chartArea.top);ctx.lineTo(x,chartArea.bottom);ctx.stroke();ctx.restore();}};
function makeChart(id,type,data,options){const c=new Chart($(`#${id}`),{type,data,options,plugins:[cursorPlugin]});chartMap[id]=c;return c;}
function initCharts(){
  Chart.defaults.color='#64748b';Chart.defaults.font.family='DM Sans';
  makeChart('populationChart','line',{datasets:[{label:'Prey',data:[],borderColor:'#16835d',backgroundColor:'#16835d',borderWidth:2,pointRadius:0,tension:.28},{label:'Predator',data:[],borderColor:'#c65e24',backgroundColor:'#c65e24',borderWidth:2,pointRadius:0,tension:.28}]},chartOptions('Individuals / ha'));
  makeChart('pollutionChart','line',{datasets:[{label:'Pollution',data:[],borderColor:'#7650a8',backgroundColor:'#7650a8',borderWidth:2,pointRadius:0,tension:.28,fill:{target:'origin',above:'rgba(118,80,168,.08)'}}]},chartOptions('Concentration',false));
  makeChart('phaseChart','scatter',{datasets:[{label:'Trajectory',data:[],showLine:true,borderColor:'#16835d',backgroundColor:'#16835d',borderWidth:1.6,pointRadius:0,tension:.2},{label:'Start',data:[],backgroundColor:'#3475bd',borderColor:'#3475bd',pointRadius:4,pointHoverRadius:5}]},chartOptions('Predator / ha',false));chartMap.phaseChart.options.scales.x.title.text='Prey / ha';
  makeChart('capacityChart','line',{datasets:[{label:'Baseline K₀',data:[],borderColor:'#3475bd',borderDash:[5,4],borderWidth:1.5,pointRadius:0,tension:0},{label:'Adjusted K(P)',data:[],borderColor:'#7650a8',borderWidth:2,pointRadius:0,tension:.25}]},chartOptions('Prey / ha'));
}
function sample(arr,n=1300){if(arr.length<=n)return arr.map((_,i)=>i);const out=[];for(let i=0;i<n;i++)out.push(Math.round(i*(arr.length-1)/(n-1)));return [...new Set(out)];}
function xy(times,vals,ids){return ids.map(i=>({x:times[i],y:vals[i]}));}
function updateCharts(){
  if(!result)return;const ids=sample(result.times),t=result.times;
  const pop=chartMap.populationChart;pop.data.datasets[0].data=xy(t,result.xs,ids);pop.data.datasets[1].data=xy(t,result.ys,ids);pop.update('none');
  const pol=chartMap.pollutionChart;pol.data.datasets[0].data=xy(t,result.ps,ids);pol.update('none');
  const phase=chartMap.phaseChart;phase.data.datasets[0].data=ids.map(i=>({x:result.xs[i],y:result.ys[i]}));phase.data.datasets[1].data=[{x:result.xs[0],y:result.ys[0]}];phase.update('none');
  const cap=chartMap.capacityChart;cap.data.datasets[0].data=ids.map(i=>({x:t[i],y:result.baseline}));cap.data.datasets[1].data=xy(t,result.caps,ids);cap.update('none');
}
function trend(a){if(a.length<2)return 'steady';const n=Math.max(1,Math.floor(a.length*.1)),first=a.slice(Math.max(0,a.length-2*n),a.length-n||undefined),last=a.slice(-n),avg=x=>x.reduce((u,v)=>u+v,0)/Math.max(1,x.length),delta=avg(last)-avg(first),scale=Math.max(1e-8,Math.abs(avg(first)));return delta/scale>.02?'increasing':delta/scale<-.02?'decreasing':'steady';}
function analysis(){
  const {xs,ys,ps,caps,times}=result,n=xs.length,last=Math.max(1,Math.floor(n*.12)),slope=a=>trend(a),calcTrend=a=>slope(a);
  const tx=calcTrend(xs),ty=calcTrend(ys),tp=calcTrend(ps),eqWindow=Math.min(n-1,Math.max(1,Math.floor(n*.05))),rel=(a)=>Math.abs(a[n-1]-a[n-1-eqWindow])/Math.max(1,Math.abs(a[n-1]));
  const equilibrium=rel(xs)<.025&&rel(ys)<.025&&rel(ps)<.025;
  const start=Math.floor(n*.45),seg=xs.slice(start),reversals=seg.slice(2).reduce((count,v,i)=>{const prev=seg[i+1]-seg[i],cur=v-seg[i+1];return count+(prev*cur<0?1:0)},0),osc=reversals>=3;
  const maxY=ys.reduce((m,v)=>Math.max(m,v),0),risk=ys[n-1]<Math.max(.1,maxY*.05),impact=100*(1-caps[n-1]/Math.max(values.K0,1e-12));
  $('#equilibriumBadge').textContent=equilibrium?'NEAR EQUILIBRIUM':osc?'OSCILLATORY':'TRANSIENT';
  const items=[
    ['Prey trajectory',`The prey population is ${tx} over the final portion of the simulated interval, ending at ${fmt(xs[n-1])} individuals / ha.`],
    ['Predator trajectory',`The predator population is ${ty} over the final portion, ending at ${fmt(ys[n-1])} individuals / ha.`],
    ['Pollution trend',`Pollution is ${tp} near the end of the run; the final concentration is ${fmt(ps[n-1])}.`],
    ['Equilibrium status',equilibrium?`All three state variables changed by less than 2.5% across the final ${fmt(times[n-1]-times[n-1-eqWindow],2)} time units.`:`The state is still changing: at least one population or pollution level shifted by 2.5% or more over the final window.`],
    ['Population oscillations',osc?`${reversals} prey direction changes were found in the latter part of the run, indicating oscillatory dynamics.`:'No repeated prey turning pattern was detected in the latter part of this run.'],
    ['Predator extinction risk',risk?`Risk signal: predators finish at ${fmt(ys[n-1])}, below 5% of their simulated peak (or near zero).`:`Predators finish at ${fmt(ys[n-1])}, above 5% of their simulated peak; this run does not indicate near-term extinction.`],
    ['Pollution effect on habitat',`Pollution lowers carrying capacity by ${fmt(impact,1)}% relative to K₀; adjusted K is ${fmt(caps[n-1])} prey / ha.`]
  ];
  $('#analysisGrid').innerHTML=items.map(([h,p])=>`<article class="analysis-item"><h3><i></i>${h}</h3><p>${p}</p></article>`).join('');
  $('#trendPrey').textContent=arrow(tx);$('#trendPredator').textContent=arrow(ty);$('#trendPollution').textContent=arrow(tp);$('#capacityImpact').textContent=`−${fmt(impact,1)}% vs K₀`;
}
function arrow(t){return t==='increasing'?'↗':t==='decreasing'?'↘':'→';}
function updateStats(index=result.times.length-1){const i=Math.max(0,Math.min(index,result.times.length-1));$('#statPrey').textContent=fmt(result.xs[i]);$('#statPredator').textContent=fmt(result.ys[i]);$('#statPollution').textContent=fmt(result.ps[i],3);$('#statCapacity').textContent=fmt(result.caps[i]);}
function recalculate(){stopPlayback();result=simulate();if(!result)return;currentIndex=result.times.length-1;updateCharts();updateStats();analysis();$('#runState').textContent=result.unstable?'WARNING':'READY';}
function stopPlayback(){if(playTimer){clearInterval(playTimer);playTimer=null;}playing=false;paused=false;$$('.chart-card canvas').forEach(c=>{const ch=Chart.getChart(c);if(ch)ch.update('none')});}
function startPlayback(){if(!result)return;if(result.unstable){showWarning('This run stopped early due to numerical instability; adjust the parameters or time step before playing it.');return;}stopPlayback();playing=true;paused=false;currentIndex=0;updateStats(0);$('#runState').textContent='RUNNING';playTimer=setInterval(()=>{const stride=Math.max(1,Math.ceil(result.times.length/250));currentIndex=Math.min(result.times.length-1,currentIndex+stride);updateStats(currentIndex);Object.values(chartMap).forEach(c=>c.draw());if(currentIndex>=result.times.length-1){stopPlayback();$('#runState').textContent='COMPLETE';updateStats();}},45);}
function pausePlayback(){if(!playing)return;paused=true;playing=false;if(playTimer){clearInterval(playTimer);playTimer=null;}$('#runState').textContent='PAUSED';}
function resumePlayback(){if(!paused||!result)return;playing=true;paused=false;$('#runState').textContent='RUNNING';playTimer=setInterval(()=>{const stride=Math.max(1,Math.ceil(result.times.length/250));currentIndex=Math.min(result.times.length-1,currentIndex+stride);updateStats(currentIndex);Object.values(chartMap).forEach(c=>c.draw());if(currentIndex>=result.times.length-1){stopPlayback();$('#runState').textContent='COMPLETE';updateStats();}},45);}
function resetRun(){stopPlayback();if(!result)recalculate();currentIndex=0;updateStats(0);Object.values(chartMap).forEach(c=>c.draw());$('#runState').textContent='READY';}
function csvExport(){if(!result)return;const rows=['Time,Prey,Predator,Pollution,Carrying Capacity'];for(let i=0;i<result.times.length;i++)rows.push([result.times[i],result.xs[i],result.ys[i],result.ps[i],result.caps[i]].map(n=>Number(n).toPrecision(10)).join(','));download(new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}),'collage-project-simulation.csv');}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}
function graphExports(){const names=['ecosystem-populations','pollution-concentration','phase-portrait','carrying-capacity'];Object.values(chartMap).forEach((c,i)=>{c.canvas.toBlob(b=>download(b,`collage-${names[i]}.png`));});}
function dashboardImage(){
  const canv=document.createElement('canvas'),ctx=canv.getContext('2d'),W=1600,H=1200;canv.width=W;canv.height=H;
  ctx.fillStyle='#f3f6fb';ctx.fillRect(0,0,W,H);ctx.fillStyle='#172338';ctx.font='700 36px Arial';ctx.fillText('COLLAGE PROJECT',50,58);ctx.fillStyle='#52647a';ctx.font='17px Arial';ctx.fillText('Predator–Prey Dynamics Under Environmental Pollution',50,88);
  const stats=[['FINAL PREY POPULATION',$('#statPrey').textContent,'#16835d'],['FINAL PREDATOR POPULATION',$('#statPredator').textContent,'#c65e24'],['FINAL POLLUTION LEVEL',$('#statPollution').textContent,'#7650a8'],['FINAL CARRYING CAPACITY',$('#statCapacity').textContent,'#3475bd']];
  stats.forEach((s,i)=>{let x=50+i*380;ctx.fillStyle='#ffffff';ctx.fillRect(x,115,360,90);ctx.strokeStyle='#d9e1ec';ctx.strokeRect(x,115,360,90);ctx.fillStyle='#64748b';ctx.font='12px Arial';ctx.fillText(s[0],x+15,140);ctx.fillStyle=s[2];ctx.font='bold 29px Arial';ctx.fillText(s[1],x+15,182);});
  const charts=[['populationChart',50,235,730,385],['pollutionChart',820,235,730,385],['phaseChart',50,640,730,385],['capacityChart',820,640,730,385]];
  charts.forEach(([id,x,y,w,h])=>{const chart=chartMap[id],img=new Image();img.src=chart.toBase64Image();ctx.fillStyle='#ffffff';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#d9e1ec';ctx.strokeRect(x,y,w,h);ctx.drawImage(img,x+8,y+8,w-16,h-16);});
  ctx.fillStyle='#64748b';ctx.font='11px Arial';ctx.fillText('RK4 coupled-system simulation · Values computed from the displayed model',50,1070);
  canv.toBlob(blob=>download(blob,'collage-project-dashboard.png'));
}
function bindActions(){
  $$('.preset').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
  $('#resetAll').addEventListener('click',()=>applyPreset('balanced'));
  $('#startButton').addEventListener('click',()=>{recalculate();startPlayback();});
  $('#pauseButton').addEventListener('click',pausePlayback);$('#resumeButton').addEventListener('click',resumePlayback);$('#restartButton').addEventListener('click',startPlayback);$('#resetButton').addEventListener('click',resetRun);
  $('#duration').addEventListener('change',()=>{if($('#autoRun').checked)recalculate();});$('#timeStep').addEventListener('change',()=>{if($('#autoRun').checked)recalculate();});
  $('#autoRun').addEventListener('change',e=>{if(e.target.checked)recalculate();});
  $('#equationToggle').addEventListener('click',()=>{const p=$('#equationsPanel'),show=p.hidden;p.hidden=!show;$('#equationToggle').setAttribute('aria-expanded',String(show));if(show)p.scrollIntoView({behavior:'smooth',block:'nearest'});});
  $('#csvButton').addEventListener('click',csvExport);$('#graphsButton').addEventListener('click',graphExports);$('#imageButton').addEventListener('click',dashboardImage);
}
renderControls();initCharts();bindActions();applyPreset('balanced');
