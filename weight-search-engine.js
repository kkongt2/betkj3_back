'use strict';
const WeightSearchEngine=(()=>{
 const tuning=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const balance=typeof module!=='undefined'?require('./weight-balance.js'):WeightBalance;
 const history=typeof module!=='undefined'?require('./qpl-history-engine.js'):QplHistoryEngine;
 const globalSearch=typeof module!=='undefined'?require('./global-weight-search.js'):GlobalWeightSearch;
 const objectives=['rate','average','product'];
 function normalize(w){const sum=w.reduce((a,b)=>a+b,0)||1,raw=w.map(x=>x*100/sum),out=raw.map(Math.floor);for(const i of raw.map((_,i)=>i).sort((a,b)=>(raw[b]-out[b])-(raw[a]-out[a])||a-b).slice(0,100-out.reduce((a,b)=>a+b,0)))out[i]++;return out;}
 function eligible(g){return g.total>0&&g.evaluated>=Math.ceil(g.total*.4)&&g.hits*20>=g.evaluated*3&&g.hits===g.paidHits;}
 function better(a,b,objective){return !b||a.metrics[objective]>b.metrics[objective]||a.metrics[objective]===b.metrics[objective]&&(a.metrics.product>b.metrics.product||a.metrics.product===b.metrics.product&&a.all.evaluated>b.all.evaluated);}
 async function run(options,fast,verify,control={}){
  const now=control.now||(()=>performance.now()),random=control.random||(options.searchSeed===undefined?Math.random:globalSearch.rng(options.searchSeed)),current=control.current||(()=>true),stopped=control.stopped||(()=>false),progress=control.progress||(()=>{});
  if(!objectives.includes(options.objective))throw Error('탐색 목표를 확인해 주세요.');
  if(!Number.isInteger(options.seconds)||options.seconds<1||options.seconds>18000)throw Error('탐색 시간은 1~18,000초(최대 300분) 정수로 입력하세요.');
  const settings={...options.settings,...tuning.settings(options.settings)},balanced=options.balanced!==false,project=w=>balanced?(balance.valid(w)?w.slice():balance.project(w)):normalize(w),objective=options.objective;
  const method=globalSearch.method(options.method);
  delete settings.screening;
  const yieldTask=control.yieldTask||(()=>new Promise(r=>setTimeout(r,0)));
  const seeds=(options.island>0?[]:[settings.weights,tuning.defaults(),...(options.seeds||[]).filter(tuning.validWeights).map(w=>tuning.settings({weights:w}).weights)]).map(project),seen=new Set(),elite=[];
  const evolution=method==='de'?globalSearch.create({seeds,balanced,random}):null;
  let best=null,count=0,lastProgress=-Infinity;const started=now(),deadline=started+options.seconds*1000;
  const active=()=>current()&&!stopped()&&now()<deadline;
  const report=phase=>{lastProgress=now();progress({phase,count,best,method,evolution:evolution?.stats(),elapsed:Math.min(options.seconds,(now()-started)/1000),seconds:options.seconds});};
  report('searching');
  while(active()){
   let weights=evolution?evolution.ask():seeds.shift();
   if(evolution&&!weights)break;
   if(!weights){
    if(elite.length&&random()<.8){weights=elite[Math.floor(random()*elite.length)].settings.weights.slice();for(let attempt=0;attempt<30;attempt++){const a=Math.floor(random()*tuning.FEATURES.length),b=Math.floor(random()*tuning.FEATURES.length),amount=[1,2,5,10][Math.floor(random()*4)],next=weights.slice();next[a]-=amount;next[b]+=amount;if(a!==b&&next.every(x=>x>=0&&x<=100)&&(!balanced||balance.valid(next))){weights=next;break;}}}
    else weights=project(Array.from({length:tuning.FEATURES.length},()=>Math.pow(random(),3)*100));
   }
   const key=weights.join(',');if(seen.has(key)){await yieldTask();continue;}seen.add(key);
   const config={...settings,weights},result=await fast(config,options.from,options.to,active);if(!current())return null;
   if(evolution){if(!result)break;evolution.tell(eligible(result.all)?history.metrics(result.all)[objective]:-Infinity);}
   if(result){count++;const candidate={settings:config,all:result.all,metrics:history.metrics(result.all)};
    if(eligible(candidate.all)&&Number.isFinite(candidate.metrics[objective])){if(better(candidate,best,objective))best=candidate;elite.push(candidate);elite.sort((a,b)=>better(a,b,objective)?-1:better(b,a,objective)?1:0);elite.length=Math.min(elite.length,8);}
   }
   if(now()-lastProgress>=200)report('searching');
   await yieldTask();
  }
  if(!current())return null;
  const elapsed=Math.min(options.seconds,(now()-started)/1000),wasStopped=stopped();
  if(best){report('verifying');const groups=await verify(best.settings,options.from,options.to,current);if(!current()||!groups)return null;
   const metrics=history.metrics(groups.all);for(const k of ['total','evaluated','hits','paidHits'])if(groups.all[k]!==best.all[k])throw Error('탐색·검산 통계가 일치하지 않습니다. 결과를 적용하지 않았습니다.');
   if(Math.abs(groups.all.payoutTotal-best.all.payoutTotal)>1e-7||!eligible(groups.all))throw Error('최고 후보 검산에 실패했습니다.');
   best={settings:best.settings,all:groups.all,metrics,comparison:groups.comparison};
  }
  return {best,count,elapsed,stopped:wasStopped,objective,balanced,method,evolution:evolution?.stats()};
 }
 return {run,eligible,normalize,better};
})();
if(typeof module!=='undefined')module.exports=WeightSearchEngine;
