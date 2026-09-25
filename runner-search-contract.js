'use strict';
const RunnerSearchContract=(()=>{
 const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const S=typeof module!=='undefined'?require('./race-selection-model.js'):RaceSelectionModel;
 const H=typeof module!=='undefined'?require('./qpl-history-engine.js'):QplHistoryEngine;
 const MAX_RUNNER_SECONDS=172800;
 const fail=()=>{throw Error('Runner 탐색 자료 형식 또는 범위를 확인해 주세요.');};
 function settings(s){
  if(!s||!T.validWeights(s.weights)||s.weights.length!==T.FEATURES.length||![1,2,3].includes(s.anchorRank)||![s.min,s.max].every(x=>Number.isInteger(x)&&x>=2&&x<=20)||s.min>s.max)fail();
  if(s.screening&&!S.jointConfig(s.screening))fail();
  return {...T.settings(s),anchorRank:s.anchorRank,min:s.min,max:s.max};
 }
 function request(x){
  if(!x||x.schema!==1||typeof x.requestId!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(x.requestId))fail();
  if(!Number.isInteger(x.seconds)||x.seconds<1||x.seconds>MAX_RUNNER_SECONDS||!['local','de'].includes(x.method)||!['rate','average','product'].includes(x.objective)||typeof x.joint!=='boolean'||typeof x.balanced!=='boolean'||typeof x.parallel!=='boolean'||![40,60,80].includes(x.target))fail();
  return {schema:1,requestId:x.requestId,seconds:x.seconds,method:x.method,objective:x.joint?'product':x.objective,joint:x.joint,balanced:x.balanced,parallel:x.parallel,target:x.target,settings:settings(x.settings)};
 }
 function stats(g){
  if(!g||!['total','evaluated','hits','paidHits','excluded'].every(k=>Number.isSafeInteger(g[k])&&g[k]>=0)||!Number.isFinite(g.payoutTotal)||g.payoutTotal<0||g.evaluated>g.total||g.hits>g.evaluated||g.paidHits>g.hits||g.excluded!==g.total-g.evaluated)fail();
  return {...g,...H.metrics(g),ratio:g.total?g.evaluated/g.total:null};
 }
 function report(x){
  if(!x||x.schema!==1||x.modelVersion!==T.VERSION||x.featureCount!==T.FEATURES.length||!/^\d+(?:-\d+)?$/.test(x.runId)||!/^\d{8}$/.test(x.from)||!/^\d{8}$/.test(x.to)||!Number.isFinite(Date.parse(x.finishedAt)))fail();
  x.request=request(x.request);const r=x.result;
  if(!r||!Number.isSafeInteger(r.count)||r.count<0||!Number.isFinite(r.elapsed)||r.elapsed<0||r.elapsed>x.request.seconds||!Number.isInteger(r.workers)||r.workers<1||r.workers>8)fail();
  r.method=x.request.method;r.objective=x.request.objective;
  if(r.best){const b=r.best;b.settings=settings(b.settings);b.all=stats(b.all);b.metrics=H.metrics(b.all);
   if(!b.all.evaluated||b.all.hits!==b.all.paidHits||b.metrics.rate<.15)fail();
   if(b.comparison){b.comparison.all=stats(b.comparison.all);b.comparison.metrics=H.metrics(b.comparison.all);}
   if(x.request.joint){const j=b.joint;if(!j||j.target!==x.request.target||!b.settings.screening||!Array.isArray(j.ratios)||j.ratios.length!==3||!Array.isArray(j.validation?.folds)||j.validation.folds.length>50)fail();
    j.modelLabels=S.JOINT_LABELS;j.method=x.request.method;
    j.ratios=j.ratios.map(r=>{if(![40,60,80].includes(r.target))fail();return r.product===null?{target:r.target,product:null,ratio:null}:{target:r.target,...stats(r)};});
    if(j.fixed){const v=j.fixed;if(!/^\d{8}$/.test(v.from)||!/^\d{8}$/.test(v.to)||!Array.isArray(v.years)||v.years.length>50)fail();
     v.all=stats(v.all);v.metrics=S.metrics(v.all);const seen=new Set();v.years=v.years.map(f=>{if(!/^\d{4}$/.test(f.year)||seen.has(f.year))fail();seen.add(f.year);const all=stats(f.all);return {year:f.year,all,metrics:S.metrics(all)};});
     for(const k of ['total','evaluated','hits','paidHits','excluded','payoutTotal'])if(Math.abs(v.years.reduce((n,f)=>n+f.all[k],0)-v.all[k])>1e-7)fail();
    }
    j.validation.all=stats(j.validation.all);j.validation.metrics=H.metrics(j.validation.all);
    j.validation.folds=j.validation.folds.map(f=>{if(!/^\d{4}$/.test(f.year))fail();return {year:f.year,train:stats(f.train),test:stats(f.test),settings:settings(f.settings)};});
   }else delete b.joint;
  }
  return x;
 }
 return {request,report,MAX_RUNNER_SECONDS};
})();
if(typeof module!=='undefined')module.exports=RunnerSearchContract;
