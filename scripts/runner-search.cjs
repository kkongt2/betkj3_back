'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const Contract=require('../runner-search-contract.js'),P=require('../parallel-search.js'),H=require('../qpl-history-engine.js'),T=require('../tuning-model.js');
const SEGMENT_SECONDS=18000;
function checkpoint(previous,request,metadata){
 if(!previous)return null;
 const report=Contract.report(previous);
 if(JSON.stringify(report.request)!==JSON.stringify(request))throw Error('Runner checkpoint request does not match the current request.');
 if(metadata.sourceSha&&report.sourceSha&&metadata.sourceSha!==report.sourceSha)throw Error('Runner checkpoint source does not match the current commit.');
 return report;
}
async function search(request,rows,metadata={}){
 request=Contract.request(request);
 const previous=checkpoint(metadata.previous,request,metadata),done=previous?.result.elapsed||0,remaining=request.seconds-done;
 if(remaining<=0)return previous;
 const cap=metadata.segmentSeconds===undefined?SEGMENT_SECONDS:metadata.segmentSeconds;
 if(!Number.isInteger(cap)||cap<1||cap>SEGMENT_SECONDS)throw Error('Runner segment must be 1~18,000 seconds.');
 const segmentSeconds=Math.min(cap,remaining),cores=os.availableParallelism?.()||os.cpus().length,workers=request.parallel?Math.min(8,cores):1;
 const priorBest=previous?.result.best||null,runtimeSettings=priorBest?.settings||request.settings;
 const options={...request,seconds:segmentSeconds,settings:runtimeSettings,seeds:[request.settings.weights,...(priorBest?[priorBest.settings.weights]:[])],from:H.PERIOD.from,to:metadata.to||new Date().toISOString().slice(0,10).replaceAll('-',''),searchSeed:crypto.randomBytes(4).readUInt32LE()};
 const pool=P.create({makeWorker:()=>{
  const worker=new Worker(path.join(__dirname,'runner-search-worker.cjs')),adapter={postMessage:m=>worker.postMessage(m),terminate:()=>worker.terminate()};
  worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.(e));worker.on('exit',code=>{if(code!==0)adapter.onerror?.(Error('Worker exit '+code));});return adapter;
 }});
 let last=0;const start=previous?.startedAt||new Date().toISOString();
 const stop=()=>pool.stop();process.on('SIGINT',stop);process.on('SIGTERM',stop);
 try{
  let result=await pool.run(rows,options,workers,p=>{if(Date.now()-last>10000){last=Date.now();console.log(JSON.stringify({phase:p.phase,segment:(previous?.result.segments||0)+1,segmentMinutes:+(p.elapsed/60).toFixed(2),totalMinutes:+((done+p.elapsed)/60).toFixed(2),count:p.count,workers:p.workers,product:p.best?.metrics.product}));}});
  if(!result||result.failedWorkers)throw Error('Runner worker failed; incomplete results were not published.');
  result=await P.verify(result,options,H.create(rows).evaluate,()=>true);
  if(previous){
   const merged=P.merge([previous.result,result],request);
   merged.elapsed=Math.min(request.seconds,previous.result.elapsed+result.elapsed);
   merged.workers=Math.max(previous.result.workers,result.workers);
   merged.failedWorkers=0;
   merged.stopped=result.stopped;
   result=merged;
  }
  result.segments=(previous?.result.segments||0)+1;
  return Contract.report({schema:1,modelVersion:T.VERSION,featureCount:T.FEATURES.length,request,runId:metadata.runId||previous?.runId||'0',sourceSha:metadata.sourceSha||previous?.sourceSha||'',dataGeneratedAt:metadata.dataGeneratedAt||previous?.dataGeneratedAt||'',from:options.from,to:options.to,startedAt:start,finishedAt:new Date().toISOString(),result});
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);pool.abort();}
}
async function main(){
 const raw=process.env.SEARCH_REQUEST||fs.readFileSync(process.argv[2],'utf8');if(raw.length>10000)throw Error('Request too large');
 const request=Contract.request(JSON.parse(raw)),manifest=JSON.parse(fs.readFileSync('qpl-history.json','utf8'));
 const rows=manifest.shards.flatMap(s=>{if(!/^qpl-history-years\/[-a-zA-Z0-9.]+\.json$/.test(s.url))throw Error('Unexpected archive path');return JSON.parse(fs.readFileSync(s.url,'utf8')).rows;});
 let previous=null;const previousPath=process.env.PREVIOUS_RESULT;if(previousPath){if(!fs.existsSync(previousPath))throw Error('Runner checkpoint file is missing.');previous=JSON.parse(fs.readFileSync(previousPath,'utf8'));}
 const report=await search(request,rows,{previous,runId:(process.env.GITHUB_RUN_ID||'0')+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1'),sourceSha:process.env.GITHUB_SHA||'',dataGeneratedAt:manifest.generatedAt});
 fs.mkdirSync('_runner-out',{recursive:true});fs.writeFileSync('_runner-out/result.json',JSON.stringify(report));
 if(process.env.GITHUB_STEP_SUMMARY){const r=report.result,b=r.best,total=request.seconds>=3600?(r.elapsed/3600).toFixed(2)+'시간':(r.elapsed/60).toFixed(2)+'분';fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Runner 탐색 구간 완료\n\n요청: ${request.requestId}\n\n누적 ${r.segments||1}개 구간 · ${r.count}회 평가 · ${total}\n\n${b?'적중률 '+(100*b.metrics.rate).toFixed(2)+'% · 평균배당 '+b.metrics.average.toFixed(4)+' · 곱 '+b.metrics.product.toFixed(4):'조건을 만족한 후보 없음'}\n\n[사이트에서 결과 불러오기](https://kkongt2.github.io/betkj3/)\n`);}
 console.log('RUNNER_RESULT',JSON.stringify({runId:report.runId,segments:report.result.segments,count:report.result.count,workers:report.result.workers,elapsed:report.result.elapsed,product:report.result.best?.metrics.product}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={search,SEGMENT_SECONDS};
