'use strict';
const JointSearchEngine=(()=>{
 const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const S=typeof module!=='undefined'?require('./race-selection-model.js'):RaceSelectionModel;
 const C=typeof module!=='undefined'?require('./weight-curve-engine.js'):WeightCurveEngine;
 const H=typeof module!=='undefined'?require('./qpl-history-engine.js'):QplHistoryEngine;
 const B=typeof module!=='undefined'?require('./weight-balance.js'):WeightBalance;
 const G=typeof module!=='undefined'?require('./global-weight-search.js'):GlobalWeightSearch;
 const blank=()=>({total:0,evaluated:0,hits:0,paidHits:0,payoutTotal:0,excluded:0});
 const metric=g=>({...g,...H.metrics(g),ratio:g.total?g.evaluated/g.total:null});
 function add(g,p){g.evaluated++;if(p.hit){g.hits++;if(Number.isFinite(p.payout)&&p.payout>=1){g.paidHits++;g.payoutTotal+=p.payout;}}}
 function aggregate(items,threshold){const g=blank();g.total=items.length;for(const p of items)if(p.score!==null&&p.score>=threshold)add(g,p);g.excluded=g.total-g.evaluated;return g;}
 function calibrate(items,target){
  const bins=Array.from({length:100},blank);let eligible=0;
  for(const p of items)if(p.score!==null){eligible++;add(bins[p.score],p);}
  const needed=Math.ceil(items.length*target/100);if(!needed||eligible<needed)return null;
  const g=blank();g.total=items.length;
  for(let threshold=99;threshold>=0;threshold--){for(const k of ['evaluated','hits','paidHits','payoutTotal'])g[k]+=bins[threshold][k];if(g.evaluated>=needed){g.excluded=g.total-g.evaluated;return {threshold,all:g};}}
  return null;
 }
 function eligible(g){return g.evaluated>0&&g.hits===g.paidHits&&g.hits/g.evaluated>=.15;}
 function better(a,b){return !b||a.metrics.product>b.metrics.product+1e-12||Math.abs(a.metrics.product-b.metrics.product)<=1e-12&&a.all.evaluated>b.all.evaluated;}
 function rng(seed){let x=seed>>>0;return ()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};}
 function normalize(w){const sum=w.reduce((s,x)=>s+x,0)||1,raw=w.map(x=>100*x/sum),out=raw.map(Math.floor);for(const i of raw.map((_,i)=>i).sort((a,b)=>(raw[b]-out[b])-(raw[a]-out[a])||a-b).slice(0,100-out.reduce((s,x)=>s+x,0)))out[i]++;return out;}
 // Legacy candidate proposals never depend on test outcomes. DE uses separate populations
 // for the descriptive full-period search and each fold; fold feedback uses training only. Current/saved user weights are
 // allowed in the descriptive full-period search only, not in walk-forward folds.
 function proposals(options,index,random){
  if(index===0&&!(options.island>0))return options.balanced?B.project(options.settings.weights):normalize(options.settings.weights);
  const base=T.defaults();
  if(index===1&&!(options.island>0))return options.balanced?B.project(base):normalize(base);
  if(index%3){for(let k=0;k<5;k++){const a=Math.floor(random()*T.FEATURES.length),b=Math.floor(random()*T.FEATURES.length),n=Math.min(base[a],1+Math.floor(random()*12));base[a]-=n;base[b]+=n;}}
  else for(let i=0;i<T.FEATURES.length;i++)base[i]=Math.pow(random(),2)*100;
  return options.balanced?B.project(base):normalize(base);
 }
 function profiles(){const random=rng(73021),out=[];
  out.push([2,2,0,0,1,1,1,1,0,0,0,0],[2,-2,1,1,1,1,1,0,0,0,2,0],[-1,-1,0,2,1,1,1,0,-1,0,0,1]);
  for(let i=0;i<9;i++)out.push(Array.from({length:12},()=>Math.round(random()*6)-3));return out;
 }
 function create(rows,yieldTask=()=>new Promise(r=>setTimeout(r,0))){
  const entries=rows.filter(r=>r.venue==='seoul').map(C.prepare);
  async function evaluate(settings,from,to,current=()=>true){
   settings={...settings,...T.settings(settings)};
   const out=[],total=settings.weights.reduce((s,x)=>s+x,0);
   for(let i=0;i<entries.length;i++){
    if(i%96===95){await yieldTask();if(!current())return null;}
    const e=entries[i];if(e.row.date<from||e.row.date>to)continue;
    const p={date:e.row.date,features:null,hit:false,payout:null};out.push(p);
    if(!e.valid||e.field.length<settings.min||e.field.length<settings.anchorRank)continue;
    const raw=e.features.map(f=>f.reduce((s,x,j)=>s+x*settings.weights[j],0));
    const pair=C.pick(e,settings,raw,total);if(!pair)continue;
    // Use the exact anchor tie-break on the rare rows delegated to the public model.
    const exact=e.slow||raw.some((x,j)=>raw.some((y,k)=>j!==k&&Math.abs(x-y)/total<1e-7));
    let anchor;
    if(exact){const P=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy;anchor=P.apply(T.apply(T.unpack(e.row),settings),null,settings).qplPolicy.anchor?.number;}
    else anchor=e.numbers.map((_,j)=>j).sort((a,b)=>raw[b]-raw[a]||e.numbers[a]-e.numbers[b]).map(j=>e.numbers[j])[settings.anchorRank-1];
    const partner=pair.split('-').map(Number).find(n=>n!==anchor);
    p.features=S.jointFeatures(e.field.map(h=>({number:h[0],weighted_v3_features:h[6],weighted_v3_support:h[7]})),settings.weights,anchor,partner);
    p.hit=e.winning.has(pair);p.payout=p.hit?e.winning.get(pair):null;
   }
   return current()?out:null;
  }
  async function run(options,verify,control={}){
   if(![40,60,80].includes(options.target)||!Number.isInteger(options.seconds)||options.seconds<1||options.seconds>18000)throw Error('선택 비율과 탐색 시간을 확인해 주세요.');
   const current=control.current||(()=>true),stopped=control.stopped||(()=>false),progress=control.progress||(()=>{}),now=control.now||(()=>performance.now());
   const start=now(),random=rng((options.searchSeed??0)+913721),years=[...new Set(entries.filter(e=>e.row.date>=options.from&&e.row.date<=options.to).map(e=>e.row.date.slice(0,4)))].sort().slice(2);
   const method=G.method(options.method);
   const scopes=method==='de'?[{year:null,search:G.create({seeds:options.island>0?[]:[T.settings(options.settings).weights,T.defaults(),...(options.seeds||[])],balanced:!!options.balanced,random:rng((options.searchSeed??0)+41821)})},...years.map(year=>({year,search:G.create({seeds:options.island>0?[]:[T.defaults()],balanced:!!options.balanced,random:rng((options.searchSeed??0)+ +year+71829)})}))]:[];
   const foldBest=new Map(),bestByTarget=new Map(),targets=[40,60,80],fixedProfiles=profiles();let count=0;
   while(current()&&!stopped()&&now()-start<options.seconds*1000){
    const index=count,scope=method==='de'?scopes[index%scopes.length]:null,weights=scope?scope.search.ask():proposals(options,index,random);if(!weights)break;
    const settings={...T.settings(options.settings),min:options.settings.min,max:options.settings.max,weights};delete settings.screening;
    const points=await evaluate(settings,options.from,scope?.year?Math.min(+options.to,+(scope.year+'1231')).toString():options.to,()=>current()&&!stopped());if(!points)break;count++;
    let fitness=-Infinity;
    for(const coefficients of fixedProfiles){
     const scored=points.map(p=>({...p,score:p.features?S.jointScore(p.features,coefficients):null}));
     for(const target of scope?.year?[]:targets){
      const fit=calibrate(scored,target);if(!fit||!eligible(fit.all))continue;
      const cfg={...settings,screening:{version:S.JOINT_VERSION,coefficients:coefficients.slice(),threshold:fit.threshold,target}};
      const candidate={settings:cfg,all:fit.all,metrics:H.metrics(fit.all)};
      if(better(candidate,bestByTarget.get(target)))bestByTarget.set(target,candidate);
      if(target===options.target)fitness=Math.max(fitness,candidate.metrics.product);
     }
     if(method==='local'&&index===0||method==='de'&&!scope.year)continue;
     for(const year of scope?[scope.year]:years){
      const training=scored.filter(p=>p.date<year+'0101');if(training.length<200)continue;
      const fit=calibrate(training,options.target);if(!fit||!eligible(fit.all))continue;
      const candidate={settings:{...settings,screening:{version:S.JOINT_VERSION,coefficients:coefficients.slice(),threshold:fit.threshold,target:options.target}},all:fit.all,metrics:H.metrics(fit.all)};
      if(scope)fitness=Math.max(fitness,candidate.metrics.product);
      if(better(candidate,foldBest.get(year))){candidate.test=aggregate(scored.filter(p=>p.date.startsWith(year)),fit.threshold);foldBest.set(year,candidate);}
     }
    }
    if(scope)scope.search.tell(fitness);
    progress({method,evolution:scopes[0]?.search.stats(),phase:'searching',count,best:bestByTarget.get(options.target)||null,elapsed:Math.min(options.seconds,(now()-start)/1000),seconds:options.seconds});
    await yieldTask();
   }
   if(!current())return null;
   const best=bestByTarget.get(options.target)||null,elapsed=Math.min(options.seconds,(now()-start)/1000);
   if(best){
    progress({method,evolution:scopes[0]?.search.stats(),phase:'verifying',count,best,elapsed,seconds:options.seconds});
    const exact=await verify({...best.settings,includeScreening:true},options.from,options.to,current);if(!exact||!current())return null;
    const p=exact.screening.points[best.settings.screening.threshold];
    for(const k of ['total','evaluated','hits','paidHits'])if(p[k]!==best.all[k])throw Error('선별 탐색과 실제 계산이 일치하지 않습니다.');
    if(Math.abs(p.payoutTotal-best.all.payoutTotal)>1e-7)throw Error('선별 지급배당 검산 불일치');
    best.all={...p};best.metrics=H.metrics(p);
    const summed=blank(),folds=[];for(const [year,c] of foldBest){for(const k of Object.keys(summed))summed[k]+=c.test[k];folds.push({year,train:metric(c.all),test:metric(c.test),settings:c.settings});}
    best.joint={fixed:exact.fixedSelection,method,target:options.target,ratios:targets.map(target=>({target,...(bestByTarget.has(target)?metric(bestByTarget.get(target).all):{product:null,ratio:null})})),validation:{folds,all:summed,metrics:H.metrics(summed)},modelLabels:S.JOINT_LABELS};
   }
   return {best,count,elapsed,stopped:stopped(),objective:'product',balanced:!!options.balanced,method,evolution:scopes[0]?.search.stats()};
  }
  return {run,evaluate};
 }
 return {create,calibrate,aggregate,proposals,profiles};
})();
if(typeof module!=='undefined')module.exports=JointSearchEngine;
