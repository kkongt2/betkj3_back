const fs=require('node:fs'),assert=require('node:assert/strict'),model=require('../model.js'),policy=require('../qpl-policy.js'),tuning=require('../tuning-model.js'),engine=require('../qpl-history-engine.js');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));assert.equal(manifest.schema,3);assert.equal(manifest.policyVersion,policy.VERSION);
const history={rows:manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows)};assert.equal(history.rows.length,manifest.races);assert.equal(manifest.scope,'seoul');assert(history.rows.every(r=>r.venue==='seoul'));
if(fs.existsSync('history/2021.jsonl.gz')){assert(manifest.from.startsWith('2021'));assert(history.rows.length>4000);}
const index=new Map(history.rows.map((r,i)=>[[r.date,r.venue,r.race].join(':'),i])),evaluator=engine.create(history.rows);
const settings=[{min:3,max:4},{min:2,max:4,anchorRank:2},{min:3,max:6,anchorRank:3,modelMode:'custom',weights:tuning.defaults()},{min:2,max:4,modelMode:'custom',weights:[0,0,0,100,0,0,0,0,0,0]},{min:3,max:6,modelMode:'custom',weights:[1,1,1,1,1,1,1,1,1,1]}];
const totals=settings.map(()=>({evaluated:0,hits:0,payoutTotal:0}));let count=0;
const key=ns=>ns.map(Number).sort((a,b)=>a-b).join('-');
for(const {race:r,market} of require('../scripts/history-inputs.cjs')()){
  const base=model.analyze(r),i=index.get([r.date,r.venue,r.race_no].join(':'));assert.notEqual(i,undefined);count++;
  settings.forEach((s,j)=>{
   const full=policy.apply(tuning.apply(base,s),null,s),compact=evaluator.evaluateRow(i,s),picked=compact.candidates[0];
   assert.equal(full.qplPolicy.partner?.number,picked?.partner.number);
   if(!picked||!compact.settled)return;
   assert.equal(full.pairs[0].prob,picked.pick.prob);
   const paid=r.official_result.pair.payouts.find(p=>key(p.numbers)===key(full.pairs[0].numbers));
   assert.equal(picked.hit,!!paid);assert.equal(picked.payout,paid?.odds??null);
   const g=totals[j];g.evaluated++;if(paid){g.hits++;g.payoutTotal+=paid.odds;}
  });
}
assert(count>2000,'Full historical archive required');
(async()=>{
 for(let j=0;j<settings.length;j++){
  const start=Date.now(),g=(await evaluator.evaluate(settings[j],'00000000','99999999')).all,expected=totals[j];
  assert.equal(g.evaluated,expected.evaluated);assert.equal(g.hits,expected.hits);assert(Math.abs(g.payoutTotal-expected.payoutTotal)<1e-7);assert.equal(g.hits,g.paidHits);
  const metrics=engine.metrics(g);if(g.evaluated)assert(Math.abs(metrics.product-g.payoutTotal/g.evaluated)<1e-10);
  console.log('PASS archive settings',JSON.stringify(settings[j]),JSON.stringify({...g,...metrics}),Date.now()-start+'ms');
 }
 console.log('PASS',count,'races: live and historical analysis ranks, partners, probabilities and payouts agree for all five configurations');
})().catch(e=>{console.error(e);process.exitCode=1});
