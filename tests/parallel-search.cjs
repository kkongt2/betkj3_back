'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../parallel-search.js'),W=require('../weight-search-engine.js'),J=require('../joint-search-engine.js'),H=require('../qpl-history-engine.js'),C=require('../weight-curve-engine.js'),T=require('../tuning-model.js');
const options={seconds:1,objective:'product',settings:{...T.settings(),min:2,max:10},from:'20220101',to:'20261231',hardware:{cores:4,memory:8}};
const group=(payout=120)=>({total:100,evaluated:100,hits:25,paidHits:25,payoutTotal:payout,excluded:0});
const candidate=payout=>({settings:options.settings,all:group(payout),metrics:H.metrics(group(payout))});
const output=(payout,count=1)=>({best:candidate(payout),count,elapsed:.5});
(async()=>{
 assert.equal(P.workers(options),3);assert.equal(P.workers({...options,parallel:false}),1);
 assert.equal(P.workers({hardware:{cores:64,memory:2}}),1);assert.equal(P.workers({hardware:{cores:64,memory:4}}),3);
 assert.equal(P.workers({hardware:{cores:64,memory:8}}),8);assert.equal(P.workers({hardware:{cores:64}}),4);assert.equal(P.workers({hardware:{cores:1}}),1);
 const merged=P.merge([output(110,4),output(150,8)],options);assert.equal(merged.count,12);assert.equal(merged.best.metrics.product,1.5);
 const fold=(train,test)=>({year:'2024',train:{...group(train),...H.metrics(group(train))},test:{...group(test),...H.metrics(group(test))},settings:options.settings});
 const a=output(160),b=output(130);a.best.joint={ratios:[],validation:{folds:[fold(120,1000)]}};b.best.joint={ratios:[],validation:{folds:[fold(150,50)]}};
 const joint=P.merge([a,b],{...options,joint:true,target:60});assert.equal(joint.best.metrics.product,1.6);assert.equal(joint.best.joint.validation.metrics.product,.5,'fold winner must use training performance only');
 await assert.rejects(P.verify(output(120),options,async()=>({all:group(130)}),()=>true),/검산/);
 for(const seconds of [600,601,3600,18000]){
  const out=await W.run({...options,seconds},()=>{throw Error('stopped');},()=>{},{stopped:()=>true});assert.equal(out.count,0);
  const j=await J.create([]).run({...options,seconds,target:60},()=>{},{stopped:()=>true});assert.equal(j.count,0);
 }
 await assert.rejects(W.run({...options,seconds:18001},()=>{},()=>{}),/300분/);
 await assert.rejects(J.create([]).run({...options,seconds:18001,target:60},()=>{}));
 // Deterministic, distinct search islands avoid duplicating the common seed sequence.
 for(const method of ['local','de']){
  async function trajectory(island){let clock=0;const seen=[];await W.run({...options,method,island,searchSeed:123+island},async s=>{clock+=100;seen.push(s.weights);return {all:group()};},async()=>({all:group()}),{now:()=>clock,yieldTask:()=>Promise.resolve()});return seen;}
  assert.notDeepEqual(await trajectory(0),await trajectory(1));assert.deepEqual(await trajectory(1),await trajectory(1));
 }
 // Use real packed history, including exact tie handling and screening support.
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows.slice(0,24));
 const compact=P.compact(rows,options.from,options.to);assert(JSON.stringify(compact).length<JSON.stringify(rows).length);
 const exact=await H.create(rows).evaluate({...options.settings,includeScreening:true},options.from,options.to);
 assert.deepEqual(await H.create(compact).evaluate({...options.settings,includeScreening:true},options.from,options.to),exact);
 assert.deepEqual((await C.create(compact).evaluate(options.settings,options.from,options.to)).all,exact.all);
 assert.deepEqual(await J.create(compact).evaluate(options.settings,options.from,options.to),await J.create(rows).evaluate(options.settings,options.from,options.to));
 // Fake workers exercise the coordinator's asynchronous protocol, not search internals.
 let created=[];
 function factory(auto=true){return ()=>{const w={messages:[],terminated:false,postMessage(m){this.messages.push(m);if(m.type==='init'){this.index=created.indexOf(this);queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}if(m.type==='start'){assert(created.every(x=>x.messages.some(m=>m.type==='init')),'start barrier');if(auto)queueMicrotask(()=>{this.onmessage({data:{type:'progress',progress:output(120+this.index,2)}});this.onmessage({data:{type:'progress',progress:output(120+this.index,3)}});this.onmessage({data:{type:'result',result:output(120+this.index,4)}});});}if(m.type==='stop')queueMicrotask(()=>this.onmessage({data:{type:'result',result:{...output(120+this.index,5),stopped:true}}}));},terminate(){this.terminated=true;}};created.push(w);return w;};}
 const reports=[],pool=P.create({makeWorker:factory()});const result=await pool.run(rows,options,3,p=>reports.push(p));
 assert.equal(result.count,12);assert.equal(result.best.metrics.product,1.22);assert.equal(result.workers,3);assert(created.every(w=>w.terminated));assert.equal(new Set(created.map(w=>w.messages[0].options.searchSeed)).size,3);
 assert(reports.every(p=>p.count<=12),'replace snapshots, do not add cumulative counts');
 created=[];const stopping=P.create({makeWorker:factory(false)}),running=stopping.run(rows,{...options,seconds:3600},3,()=>{});await new Promise(r=>setImmediate(r));stopping.stop();assert((await running).stopped);assert(created.every(w=>w.terminated));
 created=[];const aborting=P.create({makeWorker:factory(false)}),abortRun=aborting.run(rows,options,3,()=>{});aborting.abort();assert.equal(await abortRun,null);assert(created.every(w=>w.terminated));
 await assert.rejects(P.create({makeWorker:()=>{throw Error('unsupported');}}).run(rows,options,3,()=>{}),e=>e.beforeStart===true);
 created=[];const timed=P.create({makeWorker:factory(false)}),start=performance.now();const timedOut=await timed.run(rows,options,3,()=>{});assert(performance.now()-start<2500);assert.equal(timedOut.stopped,false);assert.equal(timedOut.count,15);
 console.log('PASS parallel merge, causal fold selection, compact history parity, distinct seeds, 300-minute limits, start barrier, deadline, stop, abort and initialization failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
