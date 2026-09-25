'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../model.js'),T=require('../tuning-model.js'),P=require('../qpl-policy.js'),H=require('../qpl-history-engine.js'),S=require('../race-selection-model.js');
const config={...T.settings(),min:2,max:10,anchorRank:1};
function fixture(index=0){return {venue:'seoul',date:'20260913',race_no:index+1,
 horses:Array.from({length:10},(_,i)=>({number:i+1,name:'말 '+(i+1),weighted_v3_features:Array.from({length:17},(_,j)=>Math.max(0,Math.min(1,.9-i*.07+Math.sin(index*3+i+j)*.13))),weighted_v3_support:{starts:5,available:Array(17).fill(true)}})),
 official_result:{starters:Array.from({length:10},(_,i)=>i+1),pair:{status:'confirmed',payouts:[{numbers:[1,2],odds:4.5},{numbers:[1,3],odds:5.5},{numbers:[2,3],odds:7}]}}};}
const analyzed=(race,settings=config)=>P.apply(T.apply(M.analyze(race),settings),null,settings);
const good=fixture(),scored=S.score(analyzed(good),config);
assert(scored.available&&scored.score>=0&&scored.score<=100);
assert.equal(scored.components.completeness,1);
const changed=structuredClone(good);changed.official_result.pair.payouts=[{numbers:[8,9],odds:999}];
assert.deepEqual(S.score(analyzed(changed),config),scored,'outcomes and payouts cannot affect screening');
const poor=structuredClone(good);poor.horses.forEach(h=>delete h.weighted_v3_support);
assert(S.score(analyzed(poor),config).score<scored.score,'unknown field data must lower quality');
const tied=structuredClone(good);tied.horses.forEach(h=>h.weighted_v3_features.fill(.5));
assert.equal(S.score(analyzed(tied),config).components.stability,0,'number tie breaks are not stability evidence');
const noPair=analyzed(good,{...config,min:20,max:20});assert.equal(S.score(noPair,config).available,false);
assert(!S.qualifies(S.score(noPair,config),0));assert(S.qualifies(scored,0));assert(!S.qualifies(scored,100));
assert.equal(S.strictness(NaN),0);assert.equal(S.strictness(-1),0);assert.equal(S.strictness(120),100);
const record=(score,hit,payout)=>({settled:true,screening:{available:true,score},candidates:[{hit,payout}]});
const rows=[record(20,true,4),record(60,false,null),record(60.001,true,6),{settled:false,screening:scored,candidates:[{hit:true,payout:900}]},{settled:true,screening:{available:false},candidates:[]}];
const c=S.curve(rows);assert.equal(c.total,5);assert.equal(c.eligible,3);assert.equal(c.points[0].ratio,.6);assert.equal(c.points[0].product,10/3);
assert.equal(c.points[60].evaluated,2);assert.equal(c.points[60].product,3);assert.equal(c.points[61].evaluated,0);assert.equal(c.points[100].product,null);
assert.equal(S.curve([record(50,false,null)]).points[0].product,0);
assert.equal(S.curve([record(50,true,null)]).points[0].product,null,'missing winning payout cannot masquerade as zero');
for(let k=0;k<=100;k++){
 const selected=rows.filter(r=>r.settled&&r.candidates.length&&S.qualifies(r.screening,k));
 assert.equal(c.points[k].evaluated,selected.length);
 if(k)assert(c.points[k].evaluated<=c.points[k-1].evaluated);
}
(async()=>{
 const races=Array.from({length:25},(_,i)=>fixture(i));const packed=races.map(r=>T.pack(M.analyze(r)));
 const engine=H.create(packed),plain=await engine.evaluate(config,'20220101','20260920');
 const full=await engine.evaluate({...config,includeScreening:true},'20220101','20260920');
 assert.deepEqual(full.all,plain.all);
 const baseline=full.screening.points[0];assert.equal(baseline.evaluated,plain.all.evaluated);assert.equal(baseline.hits,plain.all.hits);assert(Math.abs(baseline.product-H.metrics(plain.all).product)<1e-12);
 // Independently calculate selected outcomes directly from the public race path.
 for(const level of [0,25,50,75,100]){
  let count=0,returns=0,hits=0;
  for(const race of races){const result=analyzed(race);if(!S.qualifies(S.score(result,config),level))continue;count++;const key=a=>a.slice().sort((a,b)=>a-b).join('-');const paid=race.official_result.pair.payouts.find(p=>key(p.numbers)===key(result.pairs[0].numbers));if(paid){hits++;returns+=paid.odds;}}
  const p=full.screening.points[level];assert.equal(p.evaluated,count);assert.equal(p.hits,hits);assert.equal(p.product,count?returns/count:null);
 }
 const alt={...config,anchorRank:3,min:2,max:5,weights:Array.from({length:17},(_,i)=>i===1?100:0),includeScreening:true};
 assert.deepEqual((await engine.evaluate(alt,'20220101','20260920')).screening,(await H.create(packed).evaluate(alt,'20220101','20260920')).screening,'changed weights/ranges must invalidate screening cache');
 assert.deepEqual((await engine.evaluate({...config,includeScreening:true},'20220101','20260920')).screening,full.screening);
 const cancelled=await engine.evaluate({...config,includeScreening:true},'20220101','20260920',()=>false);assert.equal(cancelled,null);
 if(process.argv.includes('--archive')){
  const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),archive=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows);
  const start=Date.now(),g=await H.create(archive).evaluate({...config,includeScreening:true},'20220101','20260920');
  assert.equal(g.all.evaluated,g.screening.points[0].evaluated);assert.equal(g.all.hits,g.screening.points[0].hits);assert(Math.abs(H.metrics(g.all).product-g.screening.points[0].product)<1e-10);
  console.log(JSON.stringify({milliseconds:Date.now()-start,total:g.all.total,points:[0,25,50,75,100].map(k=>g.screening.points[k])}));
 }
 console.log('PASS independent scoring, no outcome leakage, data quality, thresholds, denominators, missing payouts, public/archive parity and cache invalidation');
})().catch(e=>{console.error(e);process.exitCode=1});
