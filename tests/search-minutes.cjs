'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const W=require('../weight-search-engine.js'),J=require('../joint-search-engine.js'),T=require('../tuning-model.js'),R=require('../runner-search-contract.js');
const options={seconds:18000,objective:'product',settings:{...T.settings(),anchorRank:1,min:2,max:10},from:'20220101',to:'20260923',balanced:false};
const all={total:100,evaluated:100,hits:25,paidHits:25,payoutTotal:125,excluded:0};
(async()=>{
 // Cross the previous 60-minute ceiling and reach the new 300-minute deadline
 // with a fake monotonic clock, while still performing real candidate selection.
 for(const method of ['local','de']){
  let clock=0;
  const out=await W.run({...options,method},async()=>{clock+=3600001;return {all};},async()=>({all}),{now:()=>clock,yieldTask:()=>Promise.resolve()});
  assert.equal(out.elapsed,18000);assert.equal(out.count,5);assert(out.best);
 }
 let clock=0;const joint=await J.create([],()=>Promise.resolve()).run({...options,target:60},()=>{throw Error('No valid candidate');},{now:()=>clock+=3600001});
 assert.equal(joint.elapsed,18000);assert(joint.count>1);
 // The actual coordinator must schedule a five-hour timer, not five minutes or
 // the former one-hour cap. No real long-running search is started by this test.
 const timers=[],moduleObject={exports:{}};vm.runInNewContext(fs.readFileSync('parallel-search.js','utf8'),{module:moduleObject,require:createRequire(path.resolve('parallel-search.js')),performance:{now:()=>0},setTimeout:(fn,ms)=>{timers.push(ms);return timers.length;},clearTimeout:()=>{}});
 const pool=moduleObject.exports.create({makeWorker:()=>({postMessage(m){if(m.type==='init'){assert.equal(m.options.seconds,18000);queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}},terminate(){}})});
 const pending=pool.run([],options,2,()=>{});await new Promise(r=>setImmediate(r));assert(timers.includes(18000000));pool.abort();assert.equal(await pending,null);
 const request={schema:1,requestId:'minutes-test',...options,joint:false,parallel:true,method:'de',target:60};
 const report={schema:1,modelVersion:T.VERSION,featureCount:21,request,runId:'1-1',from:options.from,to:options.to,finishedAt:new Date().toISOString(),result:{count:0,elapsed:18000,workers:1,best:null}};
 assert.equal(R.report(report).result.elapsed,18000);assert.throws(()=>R.report({...report,result:{...report.result,elapsed:18001}}));
 assert.equal(R.request({...request,seconds:5}).seconds,5,'old Runner results remain readable');assert.equal(R.request({...request,seconds:86400}).seconds,86400);assert.equal(R.request({...request,seconds:172800}).seconds,172800);assert.throws(()=>R.request({...request,seconds:172801}));
 const workflow=fs.readFileSync('.github/workflows/runner-search.yml','utf8'),timeout=+workflow.match(/timeout-minutes: (\d+)/)[1];assert(timeout>300&&timeout<=360);assert(workflow.includes('search10:'));assert(workflow.includes('fromJSON(inputs.request).seconds > 162000'));assert(workflow.includes('runner-search-state-10'));
 console.log('PASS 300-minute local deadlines, five-hour segment timers, 1/2-day Runner chaining, legacy results and job timeout headroom');
})().catch(e=>{console.error(e);process.exitCode=1;});
