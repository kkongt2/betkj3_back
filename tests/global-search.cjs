'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const G=require('../global-weight-search.js'),T=require('../tuning-model.js'),B=require('../weight-balance.js'),W=require('../weight-search-engine.js'),H=require('../qpl-history-engine.js'),J=require('../joint-search-engine.js');
const rng=seed=>()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
const settings={...T.settings(),min:2,max:10};
(async()=>{
 assert.equal(G.method(undefined),'local');assert.throws(()=>G.method('unknown'));
 for(const balanced of [false,true]){
  const optimizer=G.create({seeds:[T.defaults()],balanced,random:rng(87)}),seen=new Set();let initial=-Infinity,best=-Infinity,wide=false,last;
  for(let n=0;n<250;n++){
   const w=optimizer.ask();assert(w);assert.equal(w.length,21);assert.equal(w.reduce((a,b)=>a+b),100);assert(w.every(x=>Number.isInteger(x)&&x>=0&&x<=100));if(balanced)assert(B.valid(w));
   const key=w.join(',');assert(!seen.has(key));seen.add(key);
   if(n>=12&&last&&w.filter((v,i)=>v!==last[i]).length>2)wide=true;last=w;
   const fitness=-w.reduce((s,x,i)=>s+(x-(i===0?100:0))**2,0);if(n<12)initial=Math.max(initial,fitness);best=Math.max(best,fitness);optimizer.tell(fitness);
  }
  assert(wide);assert(best>initial);assert(optimizer.stats().generations>0);assert(optimizer.stats().restarts>0);
 }
 const group=(hits,paid)=>({total:100,evaluated:100,hits,paidHits:hits,payoutTotal:paid,excluded:0});
 for(const objective of ['product','rate','average'])for(const balanced of [false,true]){
  let clock=0,verified=0;const seen=[];
  const out=await W.run({settings,method:'de',seconds:1,objective,balanced,from:'0',to:'9'},async config=>{clock+=5;const all=group(15+config.weights[0],100+config.weights[1]*8);seen.push({settings:config,all,metrics:H.metrics(all)});return {all};},async config=>{verified++;return {all:seen.find(x=>x.settings===config).all};},{now:()=>clock,random:rng(555)});
  assert.equal(out.method,'de');assert(out.evolution.generations>0);assert.equal(verified,1);assert.equal(out.best.metrics[objective],Math.max(...seen.map(x=>x.metrics[objective])));assert.deepEqual(out.best.all,seen.find(x=>x.settings===out.best.settings).all);
 }
 let deadlineClock=0;const expired=await W.run({settings,method:'de',seconds:1,objective:'product'},async()=>{deadlineClock=1001;return null;},()=>{throw Error('no completed candidate');},{now:()=>deadlineClock});assert.equal(expired.count,0);assert.equal(expired.evolution.population,0);
 let stopped=false;
 const partial=await W.run({settings,method:'de',seconds:3,objective:'product'},async()=>{stopped=true;return {all:group(30,120)};},async()=>({all:group(30,120)}),{stopped:()=>stopped});assert(partial.stopped&&partial.best);
 const abort=await W.run({settings,method:'de',seconds:1,objective:'product'},()=>{throw Error('must not evaluate');},()=>{},{current:()=>false});assert.equal(abort,null);
 // More than twelve proposals PER fold forces feedback-driven evolution. Altering
 // held-out payouts must not change the fold's training choice or training score.
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.filter(s=>/202[234]/.test(s.url)).flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows.slice(0,120));
 async function run(data){let count=0;return J.create(data).run({settings,method:'de',seconds:600,target:60,balanced:false,from:'20220101',to:'20241231'},H.create(data).evaluate,{stopped:()=>count>=54,progress:p=>{count=p.count;}});}
 const a=await run(rows),changed=structuredClone(rows);for(const r of changed)if(r.date.startsWith('2024'))r.payouts=r.payouts.map(x=>({...x,odds:x.odds*2}));const b=await run(changed);
 assert(a.evolution.generations>0);assert(a.best?.joint.validation.folds.length===1);const af=a.best.joint.validation.folds[0],bf=b.best.joint.validation.folds[0];
 assert.deepEqual(af.settings,bf.settings);assert.deepEqual(af.train,bf.train);assert.equal(bf.test.payoutTotal,af.test.payoutTotal*2);
 assert.equal(a.best.joint.method,'de');
 console.log('PASS DE multi-weight exploration, feedback improvement, restarts, constraints, all three objectives, exact verification, stop/cancel and evolved fold outcome isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
