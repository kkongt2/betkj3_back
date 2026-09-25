'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../tuning-model.js'),C=require('../weight-curve-engine.js'),H=require('../qpl-history-engine.js'),P=require('../qpl-policy.js'),S=require('../race-selection-model.js');
const old=[1,2,3,12,0,6,29,1,20,1,0,0,15,4,1,1,4],cfg={...T.settings({weights:old}),min:2,max:10};
assert.deepEqual(cfg.weights,[...old,0,0,0,0]);assert.equal(T.FEATURES.length,21);
const row={date:'20250101',venue:'seoul',race:1,k:3,models:{place:'test',pair:'test'},settled:true,starters:[1,2,3,4,5,6,7,8],payouts:[{numbers:[7,8],odds:4}],horses:Array.from({length:8},(_,i)=>[i+1,.3,1,[],null,null,Array.from({length:21},(_,j)=>j>=17?i/7:.5),{starts:5,available:Array(21).fill(true)}]),pairs:[]};
for(let a=1;a<=8;a++)for(let b=a+1;b<=8;b++)row.pairs.push([a,b,.1]);
(async()=>{
 for(let j=17;j<21;j++){
  const weights=Array(21).fill(0);weights[j]=100;const settings={...cfg,weights};
  const exact=P.apply(T.apply(T.unpack(row),settings),null,settings);assert.deepEqual(exact.pairs[0].numbers.slice().sort((a,b)=>a-b),[7,8]);
  const e=await H.create([row]).evaluate(settings,'0','9'),fast=await C.create([row]).evaluate(settings,'0','9');assert.deepEqual(e.all,fast.all);assert.equal(H.metrics(e.all).product,4);
  const curve=await C.create([row]).curve(settings,j,'0','9');assert.equal(curve.points[100].product,4);assert.equal(curve.points[0].valid,false);
 }
 const legacy=structuredClone(row);legacy.horses.forEach(h=>{h[6]=h[6].slice(0,17);h[7].available=h[7].available.slice(0,17);});
 const legacyResult=T.apply(T.unpack(legacy),cfg);assert(legacyResult.horses.every(h=>Number.isFinite(h.prob)));
 assert.deepEqual(T.apply(T.unpack(row),cfg).pairs,legacyResult.pairs);
 if(process.argv.includes('--archive')){
  const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(x=>JSON.parse(fs.readFileSync(x.url)).rows);
  for(const r of rows)for(const h of r.horses){assert.equal(h[6].length,21);assert.equal(h[7].detail.counts.length,21);assert.equal(h[7].available.length,21);assert(!h[7].detail.recent);if(h[7].through)assert(h[7].through<r.date);}
  for(const file of fs.readdirSync('data/calendar'))for(const r of JSON.parse(fs.readFileSync('data/calendar/'+file)).races)for(const h of r.horses){const recent=h.weighted_v3_support.detail.recent;assert(recent.length<=5);assert(recent.every(x=>x.date<r.date));}
  const altered={...cfg,weights:cfg.weights.map((v,i)=>i>=17?5:v),includeScreening:true};
  const exact=await H.create(rows).evaluate(altered,'20220101','99999999'),fast=await C.create(rows).evaluate(altered,'20220101','99999999');assert.deepEqual(exact.all,fast.all);
  // Fixed legacy settings must give identical pairs when supplementary columns are removed.
  for(const r of rows){const stripped=structuredClone(r);stripped.horses.forEach(h=>{h[6]=h[6].slice(0,17);h[7].available=h[7].available.slice(0,17);});const a=P.apply(T.apply(T.unpack(r),cfg),null,cfg),b=P.apply(T.apply(T.unpack(stripped),cfg),null,cfg);assert.deepEqual(a.pairs,b.pairs);assert.deepEqual(S.score(a,cfg),S.score(b,cfg));}
  console.log('PASS',rows.length,'archive races: prior-date detail, new-weight exact/fast parity and unchanged legacy pairs/screening');
 }
 console.log('PASS saved 17→21 migration, zero-weight compatibility, all new metrics affect picks, curve parity and legacy data fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
