'use strict';
const QplHistoryEngine=(()=>{
 const tuning=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const policy=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy;
 const screening=typeof module!=='undefined'?require('./race-selection-model.js'):RaceSelectionModel;
 const PERIOD={from:'20220101',comparisonFrom:'20230101'};
 const blank=()=>({total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0});
 function sumYears(years,from){const g=blank();for(const [year,x] of Object.entries(years||{}))if(year>=from.slice(0,4))for(const k of Object.keys(g))g[k]+=x[k]||0;return g;}
 const key=ns=>ns.map(Number).sort((a,b)=>a-b).join('-');
 // Evaluate the winning settings unchanged in every year. This is descriptive
 // historical performance, separate from the independently trained validation folds.
 function fixedSelection(results,config,from,to){
  const start=from>'20240101'?from:'20240101',selected=results.filter(r=>r.date>=start&&r.date<=to),threshold=config.screening.threshold;
  const summary=rows=>{const raw=screening.curve(rows).points[threshold];
   // Remove floating-point summation noise before rounding displayed yearly odds.
   const all={...raw,payoutTotal:Math.round(raw.payoutTotal*1e8)/1e8},m=screening.metrics(all);return {all:{...all,...m},metrics:m};};
  const years=[...new Set(selected.map(r=>r.date.slice(0,4)))].sort().map(year=>({year,...summary(selected.filter(r=>r.date.startsWith(year)))}));
  return {from:start,to,...summary(selected),years};
 }
 function create(rows){
  const entries=rows.filter(r=>r.venue==='seoul').map(row=>({row,winning:new Map(row.payouts.map(p=>[key(p.numbers),p.odds]))}));
  const coverageCache=new Map();
  function coverage(from,to){
   const key=from+':'+to;if(coverageCache.has(key))return coverageCache.get(key);
   const c={horses:0,supportKnown:0,fullFive:0,noHistory:0,features:Array.from({length:tuning.FEATURES.length},()=>({available:0,fallback:0,unknown:0}))};
   for(const {row} of entries){if(row.date<from||row.date>to)continue;for(const horse of row.horses){c.horses++;const s=horse[7];if(Number.isInteger(s?.starts)){c.supportKnown++;c.fullFive+=s.starts>=5;c.noHistory+=s.starts===0;}
    let flags=tuning.FEATURES.map((_,i)=>s?.available?.[i]??null);
    if(!s?.available&&s){flags=flags.slice();for(const i of [0,1,4,16])if(Number.isInteger(s.starts))flags[i]=s.starts>0;if(Number.isInteger(s.distanceStarts))flags[2]=s.distanceStarts>0;for(const i of [10,13,14])if(Number.isInteger(s.recordStarts))flags[i]=s.recordStarts>0;if(Number.isInteger(s.recordStarts))flags[15]=s.recordStarts>=3;if(Number.isInteger(s.marginStarts))flags[11]=s.marginStarts>0;}
    flags.forEach((v,i)=>c.features[i][v===true?'available':v===false?'fallback':'unknown']++);
   }}coverageCache.set(key,c);return c;
  }
  function evaluateRow(entry,config){
   const signature=config.modelMode!=='existing'?config.modelMode+':'+tuning.weightsFor(config,entry.row.venue).join(','):'existing';
   if(signature!=='existing'&&entry.signature!==signature){
    const analyzed=tuning.apply(tuning.unpack(entry.row),config),prob=new Map(analyzed.places.map(p=>[+p.numbers[0],p.prob]));
    entry.custom={...entry.row,horses:entry.row.horses.filter(h=>prob.has(h[0])).map(h=>[h[0],prob.get(h[0]),...h.slice(2)]),pairs:analyzed.pairs.map(p=>[...p.numbers,p.prob])};entry.signature=signature;
   }
   const result=policy.apply(tuning.unpack(signature==='existing'?entry.row:entry.custom),null,config),selected=result.qplPolicy.partner;
   const pair=selected?result.pairs[0]:null,hit=!!pair&&entry.winning.has(key(pair.numbers));
   let screen;
   if(config.includeScreening){
    const screenKey=signature+':'+config.anchorRank+':'+config.min+':'+config.max+':'+JSON.stringify(config.screening);
    if(entry.screenKey!==screenKey){entry.screen=screening.score(result,config);entry.screenKey=screenKey;}
    screen=entry.screen;
   }
   return {date:entry.row.date,venue:entry.row.venue,settled:entry.row.settled,
    ...(config.includeScreening?{screening:screen}:{}),
    candidates:pair?[{partner:selected,pick:{prob:pair.prob},hit,payout:hit?entry.winning.get(key(pair.numbers)):null}]:[]};
  }
  async function evaluate(options,from,to,isCurrent=()=>true,onProgress=()=>{}){
   const config={...tuning.settings(options),...policy.normalizeRange(options),includeScreening:options.includeScreening===true},results=[];
   for(let i=0;i<entries.length;i++){
    if(!isCurrent())return null;
    const entry=entries[i];if(entry.row.date>=from&&entry.row.date<=to)results.push(evaluateRow(entry,config));
    if(i%80===79){onProgress(Math.round((i+1)/entries.length*100));await new Promise(resolve=>setTimeout(resolve,0));}
   }
   if(!isCurrent())return null;
   const groups=policy.summarize(results,config,from,to),comparisonFrom=from>PERIOD.comparisonFrom?from:PERIOD.comparisonFrom;
   const comparison=policy.summarize(results,config,comparisonFrom,to);
   return {...groups,from,to,comparison:{from:comparisonFrom,to,all:comparison.all,metrics:metrics(comparison.all)},coverage:coverage(from,to),...(config.includeScreening&&config.screening?{fixedSelection:fixedSelection(results,config,from,to)}:{}),...(config.includeScreening?{screening:screening.curve(results)}:{})};
  }
  return {evaluate,evaluateRow:(i,options)=>evaluateRow(entries[i],{...tuning.settings(options),...policy.normalizeRange(options)})};
 }
 function metrics(g){
  const rate=g.evaluated?g.hits/g.evaluated:null,average=g.paidHits?g.payoutTotal/g.paidHits:null;
  const product=rate===null||g.paidHits!==g.hits?null:g.hits===0?0:rate*average;
  return {rate,average,product};
 }
 async function load(manifest,fetchDocument,onProgress=()=>{}){
  if(manifest.schema===2&&Array.isArray(manifest.rows))return manifest.rows;
  if(manifest.schema!==3||!Array.isArray(manifest.shards)||!manifest.shards.length)throw Error('전체 기간 통계 자료 확인 필요');
  const parts=new Array(manifest.shards.length);let next=0,done=0;
  async function read(){
   while(next<manifest.shards.length){
    const i=next++,shard=manifest.shards[i];
    if(!/^qpl-history-years\/\d{4}\.json$/.test(shard.url))throw Error('Invalid historical year URL');
    const doc=await fetchDocument(shard.url);
    if(doc.schema!==2||doc.policyVersion!==manifest.policyVersion||!Array.isArray(doc.rows)||doc.rows.length!==shard.rows)throw Error('연도별 통계 자료 확인 필요');
    parts[i]=doc.rows;onProgress(++done,manifest.shards.length);
   }
  }
  await Promise.all([read(),read()]);const rows=parts.flat();
  if(rows.length!==manifest.races||new Set(rows.map(r=>[r.date,r.venue,r.race].join(':'))).size!==rows.length)throw Error('전체 통계 경주 수 확인 필요');
  return rows;
 }
 return {create,metrics,load,PERIOD,sumYears,fixedSelection};
})();
if(typeof module!=='undefined')module.exports=QplHistoryEngine;
