'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync:exec}=require('node:child_process');
const Contract=require('../runner-search-contract.js'),T=require('../tuning-model.js'),H=require('../qpl-history-engine.js'),{search}=require('../scripts/runner-search.cjs');
const request={schema:1,requestId:'runner-test',seconds:1,method:'de',objective:'product',parallel:true,balanced:false,joint:false,target:60,settings:{...T.settings(),anchorRank:1,min:2,max:10}};
(async()=>{
 for(const seconds of [1,600,601,3600,18000,86400,172800])assert.equal(Contract.request({...request,seconds}).seconds,seconds);
 for(const changed of [{seconds:172801},{seconds:0},{seconds:NaN},{requestId:'$(command)'},{method:'shell'},{settings:{...request.settings,min:1}},{settings:{...request.settings,weights:Array(21).fill(-1)}}])assert.throws(()=>Contract.request({...request,...changed}));
 const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows.slice(0,50));
 let report;
 for(const joint of [false,true]){
  report=await search({...request,joint},rows,{runId:'123-1'});assert(report.result.workers>=1);assert(report.result.count>0);assert(report.result.best);
  const b=report.result.best,g=await H.create(rows).evaluate({...b.settings,includeScreening:joint},report.from,report.to);assert.equal(b.metrics.product,H.metrics(joint?g.screening.points[b.settings.screening.threshold]:g.all).product);
 }
 const chainedRequest={...request,seconds:2};
 const first=await search(chainedRequest,rows,{runId:'125-1',segmentSeconds:1});
 const resumed=await search(chainedRequest,rows,{runId:'125-1',segmentSeconds:1,previous:first});
 assert.equal(first.result.elapsed,1);assert.equal(resumed.result.elapsed,2);assert.equal(resumed.result.segments,2);assert(resumed.result.count>=first.result.count);assert(resumed.result.best);
 assert.throws(()=>Contract.report({...report,modelVersion:'old-model'}));
 const malicious=structuredClone(report);malicious.result.best.settings.weights[0]='<img>';assert.throws(()=>Contract.report(malicious));
 // Publish in a disposable bare repository; preserve existing results and create a
 // result-only branch without altering source/history or using a public-site token.
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'runner-publish-test-')),repo=path.join(temp,'repo'),bare=path.join(temp,'remote');
 try{
  exec('git',['init','--bare',bare],{stdio:'pipe'});exec('git',['init',repo],{stdio:'pipe'});exec('git',['remote','add','origin',bare],{cwd:repo});fs.mkdirSync(path.join(repo,'_runner-out'));
  for(const runId of ['123-1','124-1']){fs.writeFileSync(path.join(repo,'_runner-out/result.json'),JSON.stringify({...report,runId}));exec(process.execPath,[path.resolve('scripts/publish-runner-result.cjs')],{cwd:repo,stdio:'pipe'});}
  const index=JSON.parse(exec('git',['--git-dir',bare,'show','runner-results:index.json'],{encoding:'utf8'}));assert.equal(index.entries.length,2);
  assert.equal(JSON.parse(exec('git',['--git-dir',bare,'show','runner-results:runs/123-1.json'],{encoding:'utf8'})).runId,'123-1');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 console.log('PASS Runner request validation through 48 hours, checkpoint/resume, real Node CPU workers, ordinary/joint exact parity, report validation and isolated result branch publishing');
})().catch(e=>{console.error(e);process.exitCode=1;});
