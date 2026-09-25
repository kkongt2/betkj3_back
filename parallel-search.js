'use strict';
const ParallelSearch=(()=>{
 const W=typeof module!=='undefined'?require('./weight-search-engine.js'):WeightSearchEngine;
 const H=typeof module!=='undefined'?require('./qpl-history-engine.js'):QplHistoryEngine;
 const S=typeof module!=='undefined'?require('./race-selection-model.js'):RaceSelectionModel;
 function workers(options={}){
  if(options.parallel===false)return 1;
  const cores=Number(options.hardware?.cores)||2,memory=Number(options.hardware?.memory)||0;
  const memoryCap=memory>0?(memory<=2?1:memory<=4?3:8):4;
  return Math.max(1,Math.min(8,memoryCap,Math.floor(cores)-1));
 }
 // Only inputs used by the weighted model and its exact tie fallback are copied.
 function compact(rows,from,to){return rows.filter(r=>r.venue==='seoul'&&r.date>=from&&r.date<=to).map(r=>({...r,horses:r.horses.map(h=>[h[0],h[1],h[2],null,null,null,h[6],h[7]?{starts:h[7].starts,available:h[7].available}:null])}));}
 function merge(outputs,options){
  const objective=options.joint?'product':options.objective,valid=outputs.filter(Boolean);let best=null;
  for(const x of valid)if(x.best&&W.better(x.best,best,objective))best=x.best;
  if(best){best={...best};if(options.joint){
   const folds=new Map(),ratios=new Map();
   for(const x of valid)if(x.best?.joint){
    for(const f of x.best.joint.validation.folds){const prior=folds.get(f.year);if(!prior||f.train.product>prior.train.product||f.train.product===prior.train.product&&f.train.evaluated>prior.train.evaluated)folds.set(f.year,f);}
    for(const r of x.best.joint.ratios){const prior=ratios.get(r.target);if(r.product!==null&&(!prior||r.product>prior.product))ratios.set(r.target,r);}
   }
   const all={total:0,evaluated:0,hits:0,paidHits:0,payoutTotal:0,excluded:0};for(const f of folds.values())for(const k of Object.keys(all))all[k]+=f.test[k];
   const target=options.target;ratios.set(target,{target,...best.all,...best.metrics,ratio:best.all.total?best.all.evaluated/best.all.total:null});
   best.joint={fixed:best.joint?.fixed||null,method:options.method||'local',target,modelLabels:S.JOINT_LABELS,ratios:[40,60,80].map(target=>ratios.get(target)||{target,product:null,ratio:null}),validation:{folds:[...folds.values()].sort((a,b)=>a.year.localeCompare(b.year)),all,metrics:H.metrics(all)}};
  }}
  return {best,count:valid.reduce((n,x)=>n+x.count,0),elapsed:Math.max(0,...valid.map(x=>x.elapsed||0)),stopped:valid.some(x=>x.stopped),objective,balanced:!!options.balanced,method:options.method||'local'};
 }
 async function verify(result,options,evaluate,current){
  if(!result?.best)return result;
  const b=result.best,g=await evaluate({...b.settings,includeScreening:!!options.joint},options.from,options.to,current);if(!g||!current())return null;
  const exact=options.joint?g.screening.points[b.settings.screening.threshold]:g.all;
  for(const k of ['total','evaluated','hits','paidHits'])if(exact[k]!==b.all[k])throw Error('병렬 탐색 결과 검산 불일치');
  if(Math.abs(exact.payoutTotal-b.all.payoutTotal)>1e-7)throw Error('병렬 탐색 배당 검산 불일치');
  b.all=exact;b.metrics=H.metrics(exact);if(options.joint&&b.joint)b.joint.fixed=g.fixedSelection;if(!options.joint)b.comparison=g.comparison;
  return result;
 }
 function create({makeWorker=()=>new Worker('search-island-worker.js?v=fixed-years-1'),now=()=>performance.now()}={}){
  let states=[],settled=false,started=null,stopped=false,aborted=false,timer=null,prepareTimer=null,finishTimer=null,resolveRun,rejectRun,options,progress;
  const cleanup=()=>{clearTimeout(timer);clearTimeout(prepareTimer);clearTimeout(finishTimer);for(const s of states)s.worker?.terminate();};
  function close(value,error){if(settled)return;settled=true;cleanup();if(error){error.beforeStart=started===null;rejectRun(error);}else resolveRun(value);}
  const live=()=>states.filter(s=>!s.failed).length;
  const elapsed=()=>started===null?0:Math.min(options.seconds,(now()-started)/1000);
  function emit(){if(settled)return;const merged=merge(states.map(s=>s.result||s.latest),options);progress({...merged,phase:started===null?'preparing':states.every(s=>s.done||s.latest?.phase==='verifying')?'verifying':'searching',seconds:options.seconds,elapsed:elapsed(),workers:live(),failedWorkers:states.filter(s=>s.failed).length});}
  function complete(){
   if(!states.every(s=>s.done))return;
   const results=states.map(s=>s.result||s.latest),out=merge(results,options);
   if(!results.some(Boolean)&&!stopped){close(null,Error('병렬 작업을 시작하지 못했습니다.'));return;}
   close({...out,elapsed:elapsed(),stopped,workers:live(),failedWorkers:states.filter(s=>s.failed).length});
  }
  function stop(){
   stopped=true;if(settled)return;
   if(started===null){close({...merge([],options),stopped:true,workers:0});return;}
   for(const s of states)if(!s.done)s.worker.postMessage({type:'stop'});
   // Keep the last completed candidate if a worker stops responding.
   clearTimeout(finishTimer);finishTimer=setTimeout(()=>{for(const s of states)if(!s.done){s.done=true;s.failed=true;}complete();},15000);
  }
  function begin(){
   if(settled||started!==null||!states.every(s=>s.ready||s.done))return;
   if(!live()){complete();return;}
   clearTimeout(prepareTimer);started=now();
   for(const s of states)if(!s.done)s.worker.postMessage({type:'start'});
   timer=setTimeout(()=>{for(const s of states)if(!s.done)s.worker.postMessage({type:'stop'});finishTimer=setTimeout(()=>{for(const s of states)if(!s.done){s.done=true;s.failed=true;}complete();},15000);},options.seconds*1000);
   emit();
  }
  function fail(s){if(settled||s.done)return;s.failed=true;s.done=true;s.worker?.terminate();if(started===null)begin();else{emit();complete();}}
  function run(rows,input,count,onProgress){
   options=input;progress=onProgress;return new Promise((resolve,reject)=>{
    resolveRun=resolve;rejectRun=reject;
    if(!Number.isInteger(options.seconds)||options.seconds<1||options.seconds>18000){close(null,Error('탐색 시간은 1~18,000초(최대 300분) 정수로 입력하세요.'));return;}
    const data=compact(rows,options.from,options.to),base=(options.searchSeed??92821)>>>0;
    states=Array.from({length:count},(_,i)=>({index:i,ready:false,done:false,failed:false,latest:null,result:null,worker:null}));
    prepareTimer=setTimeout(()=>{for(const s of states)if(!s.ready)fail(s);},20000);
    for(const s of states){try{
     s.worker=makeWorker();s.worker.onerror=e=>{e.preventDefault?.();fail(s);};s.worker.onmessageerror=()=>fail(s);
     s.worker.onmessage=({data:m})=>{if(settled||s.done)return;if(m.type==='ready'){s.ready=true;begin();}else if(m.type==='progress'){s.latest=m.progress;emit();}else if(m.type==='result'){s.result=m.result;s.done=true;s.worker.terminate();emit();complete();}else if(m.type==='error')fail(s);};
     s.worker.postMessage({type:'init',rows:data,options:{...options,island:s.index,searchSeed:(base+Math.imul(s.index,2654435761))>>>0}});
    }catch{fail(s);}}
    emit();
   });
  }
  return {run,stop,abort:()=>{aborted=true;if(resolveRun)close(null);},get aborted(){return aborted;}};
 }
 return {workers,compact,merge,verify,create};
})();
if(typeof module!=='undefined')module.exports=ParallelSearch;
