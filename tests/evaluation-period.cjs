'use strict';
const assert=require('assert/strict'),H=require('../qpl-history-engine.js'),T=require('../tuning-model.js'),C=require('../weight-curve-engine.js'),S=require('../weight-search-engine.js');
const fixture=(date,hit=true)=>({venue:'seoul',date,race:1,k:2,models:{place:'test',pair:'test'},horses:Array.from({length:6},(_,i)=>[i+1,.3,1,[],null,null,Array(17).fill(.5),{starts:i===0?0:5,distanceStarts:i===0?0:3,recordStarts:i===0?0:3,marginStarts:i===0?0:5,available:Array(17).fill(i!==0)}]),pairs:Array.from({length:6},(_,i)=>Array.from({length:5-i},(_,j)=>[i+1,i+j+2,.1])).flat(),starters:[1,2,3,4,5,6],settled:true,payouts:[{numbers:hit?[1,2]:[5,6],odds:hit?4:100}]});
(async()=>{
 const settings={...T.settings(),anchorRank:1,min:2,max:2},rows=[fixture('20211231'),fixture('20220101'),fixture('20221231',false),fixture('20230101'),fixture('20270101')],engine=H.create(rows),to='20260913';
 const g=await engine.evaluate(settings,H.PERIOD.from,to);assert.equal(g.all.total,3);assert.equal(g.all.hits,2);assert.equal(g.comparison.all.total,1);assert.equal(g.comparison.all.hits,1);assert.equal(g.metrics,undefined);assert.equal(g.coverage.horses,18);assert.equal(g.coverage.fullFive,15);assert.equal(g.coverage.noHistory,3);assert.deepEqual(g.coverage.features[0],{available:15,fallback:3,unknown:0});
 const legacy=fixture('20220201');legacy.horses.forEach(h=>delete h[7].available);const l=await H.create([legacy]).evaluate(settings,H.PERIOD.from,to);assert.equal(l.coverage.features[3].unknown,6);assert.equal(l.coverage.features[0].available,5);
 const curve=await C.create(rows).curve(settings,0,H.PERIOD.from,to);assert(curve.points.every(p=>p.total===3));assert.equal(curve.points[22].hits,2);
 let clock=0;const fast=C.create(rows),result=await S.run({settings,seconds:1,objective:'product',from:H.PERIOD.from,to},async(s,a,b)=>{const r=await fast.evaluate(s,a,b);clock=1001;return r;},engine.evaluate,{now:()=>clock});assert.equal(result.best.all.total,3);assert.equal(result.best.comparison.all.total,1);
 assert.deepEqual(H.sumYears({'2021':{total:99},'2022':g.all},H.PERIOD.from),g.all);
 if(process.argv.includes('--archive')){
  const fs=require('fs'),manifest=JSON.parse(fs.readFileSync('qpl-history.json')),archive=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows),e=H.create(archive),cut=archive.filter(r=>r.date>=H.PERIOD.from&&r.date<=to),recent=cut.filter(r=>r.date>=H.PERIOD.comparisonFrom),x=await e.evaluate(settings,H.PERIOD.from,to),y=await H.create(cut).evaluate(settings,H.PERIOD.from,to);
  assert(archive.some(r=>r.date.startsWith('2021')));assert.equal(x.all.total,cut.length);assert.equal(x.comparison.all.total,recent.length);assert.deepEqual(x.all,y.all);assert.deepEqual((await C.create(archive).evaluate(settings,H.PERIOD.from,to)).all,x.all);
  console.log('PASS archive retained / main / comparison races:',archive.length,cut.length,recent.length);
 }
 console.log('PASS inclusive 2022/2023 boundaries, original archive retained, future exclusion, exact/fast/curve/search parity, true neutral observations, explicit fallbacks and legacy unknown coverage');
})().catch(e=>{console.error(e);process.exitCode=1});
