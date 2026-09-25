'use strict';
const assert=require('node:assert/strict'),S=require('../weight-search-engine.js'),B=require('../weight-balance.js'),T=require('../tuning-model.js'),H=require('../qpl-history-engine.js');
const settings={...T.settings(),anchorRank:3,min:2,max:6};
const group=(hits,payoutTotal,evaluated=100,total=100)=>({total,evaluated,hits,excluded:total-evaluated,paidHits:hits,payoutTotal});
(async()=>{
 for(const balanced of [true,false])for(const objective of ['rate','average','product']){
  let clock=0,state=9182,candidates=[],verified=0;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296),groups=[group(30,120),group(15,180),group(20,200),group(14,1000),group(20,1000,39),group(20,200)];
  const fast=async config=>{clock+=120;assert.equal(config.anchorRank,3);assert.equal(config.min,2);assert.equal(config.max,6);assert.equal(config.weights.reduce((a,b)=>a+b),100);assert(config.weights.every(Number.isInteger));if(balanced)assert(B.valid(config.weights));const all=groups[candidates.length%groups.length];candidates.push({settings:config,all,metrics:H.metrics(all)});return {all};};
  const result=await S.run({settings,seconds:1,objective,balanced,from:'0',to:'9'},fast,async config=>{verified++;return {all:candidates.find(c=>c.settings===config).all};},{now:()=>clock,random});
  const expected=candidates.filter(c=>S.eligible(c.all)).sort((a,b)=>S.better(a,b,objective)?-1:1)[0];assert.equal(result.best.metrics[objective],expected.metrics[objective]);assert.equal(verified,1);assert(result.count>1);assert(result.elapsed<=1);
 }
 let clock=0,stopped=false,verify=0;const partial=await S.run({settings,seconds:1,objective:'product'},async()=>{clock+=100;stopped=true;return null;},async()=>{verify++;},{now:()=>clock,stopped:()=>stopped});assert.equal(partial.best,null);assert.equal(partial.count,0);assert.equal(verify,0);
 clock=0;stopped=false;const stop=await S.run({settings,seconds:1,objective:'rate'},async()=>{clock+=100;stopped=true;return {all:group(25,125)};},async()=>({all:group(25,125)}),{now:()=>clock,stopped:()=>stopped});assert(stop.stopped);assert.equal(stop.best.all.hits,25);
 const abort=await S.run({settings,seconds:1,objective:'rate'},async()=>{throw Error('must not run');},()=>{}, {current:()=>false});assert.equal(abort,null);
 clock=0;await assert.rejects(S.run({settings,seconds:1,objective:'rate'},async()=>{clock=1001;return {all:group(25,125)};},async()=>({all:group(26,130)}),{now:()=>clock}),/일치/);
 await assert.rejects(S.run({settings,seconds:0,objective:'rate'},()=>{},()=>{}),/300분/);
 assert(!S.eligible({...group(20,100),paidHits:19}));assert(S.eligible(group(6,30,40,100)));assert(!S.eligible(group(5,30,40,100)));
 assert.deepEqual(S.normalize(Array(17).fill(1)).reduce((a,b)=>a+b),100);
 console.log('PASS search goals, exact verification, balanced/free integer weights, 15% hit/40% coverage boundaries, incomplete payout rejection, deadline, stop and abort');
 if(process.argv.includes('--archive')){
  const fs=require('fs'),C=require('../weight-curve-engine.js'),manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows),fast=C.create(rows),exact=H.create(rows),seed=JSON.parse(fs.readFileSync('top5-presets.json')).presets[0].settings;
  for(const anchorRank of [1,2,3]){
   const config={...seed,anchorRank};const a=await fast.evaluate(config,'00000000','99999999'),b=await exact.evaluate(config,'00000000','99999999');assert.deepEqual(a.all,b.all);console.log('PASS exact archive statistics',anchorRank,rows.length,a.all.hits,a.all.evaluated);
  }
  const run=await S.run({settings:{...seed,anchorRank:2},seconds:3,objective:'product',balanced:true,from:'00000000',to:'99999999'},fast.evaluate,exact.evaluate);assert(run.count>0);console.log('PASS real archive timed search',JSON.stringify(run));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
