'use strict';
const WeightCurveEngine=(()=>{
 const tuning=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const policy=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy;
 const history=typeof module!=='undefined'?require('./qpl-history-engine.js'):QplHistoryEngine;
 const pairKey=ns=>ns.slice().sort((a,b)=>a-b).join('-');
 function prepare(row){
  const field=row.horses.filter(h=>!Array.isArray(row.starters)||row.starters.map(Number).includes(+h[0])).slice().sort((a,b)=>a[0]-b[0]);
  const valid=!!row.settled&&field.length>0;
  const features=field.map(h=>tuning.featureValues(h[6]));
  const numbers=field.map(h=>+h[0]),available=new Set(row.pairs.map(p=>pairKey(p.slice(0,2))));
  const slow=field.length<=3||features.some(f=>f.length!==tuning.FEATURES.length||f.some(x=>!Number.isFinite(x)||x<0||x>1))||numbers.some((a,i)=>numbers.slice(i+1).some(b=>!available.has(pairKey([a,b]))));
  const uniform=features.length>0&&features.every(f=>f.every((x,j)=>x===features[0][j]));
  return {row,field,numbers,features,valid,slow,uniform,winning:new Map(row.payouts.map(p=>[pairKey(p.numbers),p.odds]))};
 }
 function exact(entry,settings){const result=policy.apply(tuning.apply(tuning.unpack(entry.row),settings),null,settings);return result.qplPolicy.status==='ready'?pairKey(result.pairs[0].numbers):null;}
 // Under this positive-strength top-three model, for a fixed anchor, pair probability
 // strictly increases with partner strength. Near ties and small fields use the exact
 // public model, preserving its floating-point tie behavior and missing-pair policy.
 function pick(entry,settings,values,total){
  if(entry.slow)return exact(entry,settings);
  const order=entry.numbers.map((_,i)=>i).sort((a,b)=>values[b]-values[a]||entry.numbers[a]-entry.numbers[b]);
  for(let j=1;j<order.length;j++)if(Math.abs(values[order[j-1]]-values[order[j]])/total<1e-7)return exact(entry,settings);
  const anchor=order[settings.anchorRank-1];let partner=-1;
  for(let k=settings.min-1;k<Math.min(settings.max,order.length);k++){const candidate=order[k];if(candidate!==anchor&&(partner<0||values[candidate]>values[partner]||values[candidate]===values[partner]&&entry.numbers[candidate]<entry.numbers[partner]))partner=candidate;}
  return partner<0?null:pairKey([entry.numbers[anchor],entry.numbers[partner]]);
 }
 function create(rows,yieldTask=()=>new Promise(r=>setTimeout(r,0))){
  const entries=rows.filter(r=>r.venue==='seoul').map(prepare);
  async function curve(options,index,from,to,isCurrent=()=>true,onProgress=()=>{}){
   if(!Number.isInteger(index)||index<0||index>=tuning.FEATURES.length)throw Error('가중치 항목 확인 필요');
   const settings={...tuning.settings(options),...policy.normalizeRange(options)},others=settings.weights.reduce((s,x,i)=>s+(i===index?0:x),0);
   const points=Array.from({length:101},(_,value)=>({value,valid:others+value>0,total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0}));
   const configs=points.map(p=>({...settings,weights:settings.weights.map((x,i)=>i===index?p.value:x)}));
   for(let ri=0;ri<entries.length;ri++){
    if(!isCurrent())return null;const entry=entries[ri];if(entry.row.date<from||entry.row.date>to)continue;
    const offset=entry.features.map(f=>f.reduce((sum,x,j)=>sum+(j===index?0:x*settings.weights[j]),0));const uniformCache=new Map();
    for(const point of points){point.total++;if(!point.valid||!entry.valid||entry.field.length<settings.min){point.excluded++;continue;}
     let selected;
     if(entry.uniform){const total=others+point.value,raw=entry.features[0].reduce((s,x,j)=>s+x*configs[point.value].weights[j]/total,0)*6.28;let mean=0;for(let i=0;i<entry.field.length;i++)mean+=raw;mean/=entry.field.length;const strength=Math.exp(Math.max(-4,Math.min(4,(raw-mean)*.6)));if(!uniformCache.has(strength))uniformCache.set(strength,exact(entry,configs[point.value]));selected=uniformCache.get(strength);}
     else selected=pick(entry,configs[point.value],offset.map((x,i)=>x+entry.features[i][index]*point.value),others+point.value);
     if(selected===null){point.excluded++;continue;}point.evaluated++;
     if(entry.winning.has(selected)){point.hits++;const amount=entry.winning.get(selected);if(Number.isFinite(amount)&&amount>=1){point.paidHits++;point.payoutTotal+=amount;}}
    }
    if(ri%24===23){onProgress(Math.round((ri+1)/entries.length*100));await yieldTask();}
   }
   if(!isCurrent())return null;
   return {index,from,to,points:points.map(p=>({...p,...(p.valid?history.metrics(p):{rate:null,average:null,product:null})}))};
  }
  async function evaluate(options,from,to,isCurrent=()=>true){
   const settings={...tuning.settings(options),...policy.normalizeRange(options)},total=settings.weights.reduce((a,b)=>a+b,0),g={total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0};
   for(let ri=0;ri<entries.length;ri++){
    if(ri%128===127)await yieldTask();
    if(!isCurrent())return null;const entry=entries[ri];if(entry.row.date<from||entry.row.date>to)continue;g.total++;
    if(!entry.valid||entry.field.length<settings.min||entry.field.length<settings.anchorRank){g.excluded++;continue;}
    const values=entry.features.map(f=>f.reduce((sum,x,j)=>sum+x*settings.weights[j],0));
    const selected=pick(entry,settings,values,total);if(selected===null){g.excluded++;continue;}g.evaluated++;
    if(entry.winning.has(selected)){g.hits++;const amount=entry.winning.get(selected);if(Number.isFinite(amount)&&amount>=1){g.paidHits++;g.payoutTotal+=amount;}}
   }
   return isCurrent()?{all:g,metrics:history.metrics(g)}:null;
  }
  return {curve,evaluate};
 }
 return {create,prepare,pick};
})();
if(typeof module!=='undefined')module.exports=WeightCurveEngine;
