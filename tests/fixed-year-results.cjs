'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const H=require('../qpl-history-engine.js'),T=require('../tuning-model.js'),P=require('../parallel-search.js');
const settings={anchorRank:1,modelMode:'custom',weights:[0,3,3,1,0,1,15,6,0,12,1,0,14,0,6,28,0,0,10,0,0],screening:{version:'joint-selection-v1',coefficients:[0,0,2,1,0,-2,-2,-3,-1,0,-1,-1],threshold:28,target:60},min:2,max:10};
(async()=>{
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows),engine=H.create(rows);
 const g=await engine.evaluate({...settings,includeScreening:true},'20220101','20260923');
 assert.equal(g.screening.points[28].product.toFixed(4),'1.2879');
 const v=g.fixedSelection;assert.equal(v.metrics.product.toFixed(4),'1.1566');
 assert.deepEqual(v.years.map(f=>[f.year,f.metrics.product.toFixed(4),f.all.evaluated,f.all.hits]),[['2024','1.0038',560,102],['2025','1.3283',580,107],['2026','1.1262',462,80]]);
 assert.equal(v.all.evaluated,1602);assert.equal(v.all.hits,289);
 // Weighted aggregate and coverage are derived from races, not averaged yearly ratios.
 assert(Math.abs(v.metrics.product-v.all.payoutTotal/v.all.evaluated)<1e-12);
 assert(Math.abs(v.all.evaluated/v.all.total-1602/2833)<1e-12);
 const best={settings,all:g.screening.points[28],metrics:H.metrics(g.screening.points[28]),joint:{validation:{folds:[]},ratios:[]}};
 const result=await P.verify({best,count:1},{joint:true,from:'20220101',to:'20260923'},async()=>g,()=>true);assert.deepEqual(result.best.joint.fixed,v);
 // Fixed-year results must come from the winning candidate, never another island's best year.
 const other=structuredClone(best);other.metrics.product=.5;other.joint.fixed={marker:'other island'};
 const merged=P.merge([{best,count:1},{best:other,count:1}],{joint:true,target:60,method:'de'});assert.deepEqual(merged.best.joint.fixed,v);
 const empty=H.fixedSelection([],{screening:settings.screening},'20220101','20231231');assert.equal(empty.all.total,0);assert.equal(empty.metrics.product,null);assert.deepEqual(empty.years,[]);
 console.log('PASS reported 1.2879 winner: 2024=1.0038, 2025=1.3283, 2026=1.1262, total=1.1566; fixed settings, weighted aggregation, island winner and empty period');
})().catch(e=>{console.error(e);process.exitCode=1});
