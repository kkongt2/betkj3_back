'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const J=require('../joint-search-engine.js'),S=require('../race-selection-model.js'),T=require('../tuning-model.js'),H=require('../qpl-history-engine.js'),P=require('../qpl-policy.js'),Presets=require('../strategy-presets.js');
const m=JSON.parse(fs.readFileSync('qpl-history.json'));
const rows=m.shards.filter(s=>s.url.includes('2022')||s.url.includes('2023')||s.url.includes('2024')).flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows.slice(0,240));
const settings={...T.settings(),min:2,max:10};
(async()=>{
 const e=J.create(rows),points=await e.evaluate(settings,'20220101','20241231');
 const coefficients=J.profiles()[1],screening={version:S.JOINT_VERSION,coefficients,threshold:50,target:60},cfg={...settings,screening};
 for(let i=0;i<rows.length;i+=17){const result=P.apply(T.apply(T.unpack(rows[i]),cfg),null,cfg),s=S.score(result,cfg);if(points[i].features)assert.equal(S.jointScore(points[i].features,coefficients),s.score);}
 const scored=points.map(p=>({...p,score:p.features?S.jointScore(p.features,coefficients):null}));
 const fit=J.calibrate(scored,60);assert(fit);assert(fit.all.evaluated>=Math.ceil(rows.length*.6));
 const exact=await H.create(rows).evaluate({...cfg,includeScreening:true},'20220101','20241231');
 for(const [k,v] of Object.entries(J.aggregate(scored,50)))assert(Math.abs(v-exact.screening.points[50][k])<1e-7,k);
 const result=P.apply(T.apply(T.unpack(rows[0]),cfg),null,cfg),before=S.score(result,cfg);result.official_result={pair:{payouts:[{numbers:[1,2],odds:9999}]}};assert.deepEqual(S.score(result,cfg),before,'score never reads payouts');
 const storage={v:null,getItem(){return this.v},setItem(k,v){this.v=v}};Presets.save(storage,'joint',cfg);assert.deepEqual(Presets.read(storage)[0].settings.screening,screening);
 // Fixed candidate budget: perturb only held-out outcomes and confirm training choices
 // stay identical. Date order, labels, payout amounts and selection are all checked.
 async function run(data){let count=0;return J.create(data).run({settings,seconds:30,target:60,balanced:false,from:'20220101',to:'20241231'},H.create(data).evaluate,{stopped:()=>count>=3,progress:p=>{count=p.count;}});}
 const a=await run(rows),changed=structuredClone(rows);for(const r of changed)if(r.date.startsWith('2024'))r.payouts=r.payouts.map(p=>({...p,odds:p.odds*2}));const b=await run(changed);
 assert(a.best?.joint.validation.folds.length===1);assert.deepEqual(a.best.joint.validation.folds[0].settings,b.best.joint.validation.folds[0].settings,'future outcomes cannot affect fold selection');
 assert.deepEqual(a.best.joint.validation.folds[0].train,b.best.joint.validation.folds[0].train);
 assert.equal(b.best.joint.validation.folds[0].test.payoutTotal,2*a.best.joint.validation.folds[0].test.payoutTotal);
 assert.equal(J.calibrate([{score:null,hit:false,payout:null}],40),null);
 assert.equal(S.jointConfig({...screening,coefficients:[NaN]}),null);
 console.log('PASS joint score/live parity, actual selected metrics, quantile ties, payout independence, persistence and chronological outcome isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
