'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),t=require('../tuning-model.js'),p=require('../qpl-policy.js'),h=require('../qpl-history-engine.js'),c=require('../weight-curve-engine.js');
let state=54298;const rand=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
function fixture(n,race){const horses=Array.from({length:n},(_,i)=>[i+1,.3,1,[],null,null,Array.from({length:17},()=>rand())]);return {venue:'seoul',date:'20250101',race,k:n<=7?2:3,horses,pairs:horses.flatMap((a,i)=>horses.slice(i+1).map(b=>[a[0],b[0],.1])),starters:horses.map(a=>a[0]),settled:true,payouts:[{numbers:[1,2],odds:3.4},{numbers:[2,3],odds:5.2},{numbers:[1,3],odds:2.1}]};}
function direct(rows,settings,from='00000000',to='99999999'){
 const g={total:0,evaluated:0,hits:0,excluded:0,paidHits:0,payoutTotal:0};
 for(const row of rows){if(row.venue!=='seoul'||row.date<from||row.date>to)continue;g.total++;if(!row.settled){g.excluded++;continue;}
  const result=p.apply(t.apply(t.unpack(row),settings),null,settings);if(result.qplPolicy.status!=='ready'){g.excluded++;continue;}g.evaluated++;
  const ns=result.pairs[0].numbers.slice().sort((a,b)=>a-b).join('-'),paid=row.payouts.find(x=>x.numbers.slice().sort((a,b)=>a-b).join('-')===ns);
  if(paid){g.hits++;if(Number.isFinite(paid.odds)&&paid.odds>=1){g.paidHits++;g.payoutTotal+=paid.odds;}}
 }
 return {...g,...h.metrics(g)};
}
function same(point,expected){for(const key of ['total','evaluated','hits','excluded','paidHits'])assert.equal(point[key],expected[key],key+' at '+point.value);for(const key of ['payoutTotal','rate','average','product']){if(expected[key]===null)assert.equal(point[key],null);else assert(Math.abs(point[key]-expected[key])<1e-9,key+' at '+point.value+': '+point[key]+' vs '+expected[key]);}}
(async()=>{
 const rows=Array.from({length:12},(_,i)=>fixture(3+i%10,i+1));
 const uniform=fixture(11,30);uniform.horses.forEach(x=>x[6].fill(.5));rows.push(uniform);
 const duplicate=fixture(8,31);duplicate.horses[1][6]=duplicate.horses[0][6].slice();rows.push(duplicate);
 const near=fixture(9,32);near.horses[1][6]=near.horses[0][6].map(x=>x+1e-12);rows.push(near);
 rows.push(fixture(8,33),{...fixture(8,34),starters:[]},{...fixture(8,35),starters:[1,2,3,4,5,6]},{...fixture(8,36),settled:false},{...fixture(8,37),venue:'busan'},{...fixture(8,38),pairs:[]},{...fixture(8,39),date:'20240101'});
 const missing=fixture(8,40);missing.horses[0][6]=null;rows.push(missing);
 const evaluator=c.create(rows);
 for(const anchorRank of [1,2,3])for(const index of [0,8,16]){
  const settings={anchorRank,weights:t.defaults(),min:3,max:9},result=await evaluator.curve(settings,index,'20250101','20250101');
  const single=await evaluator.evaluate(settings,'20250101','20250101');same({...single.all,...single.metrics},direct(rows,settings,'20250101','20250101'));
  assert.equal(result.points.length,101);for(const point of result.points){const s={...settings,weights:settings.weights.map((x,i)=>i===index?point.value:x)};same(point,direct(rows,s,'20250101','20250101'));}
 }
 const w=Array(17).fill(0);w[0]=100;const zero=await evaluator.curve({weights:w,min:2,max:2},0,'00000000','99999999');assert.equal(zero.points[0].valid,false);assert.equal(zero.points[0].product,null);same(zero.points[100],direct(rows,{weights:w,min:2,max:2}));
 assert.equal(await evaluator.curve({weights:w},0,'00000000','99999999',()=>false),null);
 console.log('PASS all 101 points against exact model: analysis ranks, ties, tiny gaps, uniform strengths, scratched runners, unavailable pairs, date/venue exclusions, zero total and cancellation');
 if(process.argv.includes('--archive')){
  const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),archive=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows),settings=JSON.parse(fs.readFileSync('top5-presets.json')).presets[0].settings,engine=c.create(archive);
  for(let i=0;i<17;i++){const start=Date.now(),curve=await engine.curve(settings,i,'00000000','99999999');for(const value of new Set([0,settings.weights[i],100,...([0,8,16].includes(i)?[1,25,50,75,99]:[])])){const s={...settings,weights:settings.weights.map((x,j)=>j===i?value:x)};same(curve.points[value],direct(archive,s));}console.log('PASS full Seoul archive curve',i,archive.length,'races',Date.now()-start+'ms');}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
