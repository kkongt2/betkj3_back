'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const M=require('../model.js'),T=require('../tuning-model.js'),P=require('../qpl-policy.js'),H=require('../qpl-history-engine.js');
const root=path.resolve(__dirname,'..');
const races=Array.from({length:12},(_,ri)=>({date:'20260913',venue:'seoul',race_no:ri+1,start_time:'10:00',title:'서울 경주',horses:Array.from({length:10},(_,i)=>({number:i+1,name:'출전마 '+(i+1),weighted_v3_features:Array.from({length:17},(_,j)=>Math.max(0,Math.min(1,.85-i*.06+Math.sin(ri*3+i+j)*.25))),weighted_v3_support:{starts:ri%6,available:Array(17).fill(ri%3!==0)}})),official_result:{status:'confirmed',starters:Array.from({length:10},(_,i)=>i+1),place:{status:'confirmed',payouts:[{numbers:[1],odds:2},{numbers:[3],odds:3},{numbers:[5],odds:4}]},pair:{status:'confirmed',payouts:[{numbers:[1,3],odds:3+ri},{numbers:[1,5],odds:5},{numbers:[3,5],odds:6}]}}}));
const rows=races.map(r=>T.pack(M.analyze(r)));
const manifest={schema:2,scope:'seoul',policyVersion:P.VERSION,generatedAt:'2026-09-20T00:00:00Z',rows};
const doc={date:'20260913',updated_at:'2026-09-20T00:00:00Z',scope:'seoul',races,calendar:[{date:'20260913',venues:['seoul']}]};
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 const json=p==='/qpl-history.json'?manifest:p==='/data/latest.json'||p.startsWith('/data/calendar/')?doc:null;
 if(json){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(json));return;}
 const file=path.resolve(root,p==='/'?'index.html':'.'+p);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));
});

const {search}=require('../scripts/runner-search.cjs');
(async()=>{
 const cfg={...T.settings(),anchorRank:1,min:2,max:10};
 let report=await search({schema:1,requestId:'browser-test',seconds:2,method:'de',objective:'product',parallel:true,balanced:false,joint:false,target:60,settings:cfg},rows,{runId:'123-1'});
 assert(report.result.best);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),errors=[];
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  let available=false,bad=false,rawRequests=[];
  await context.route('**/*',async route=>{
   const url=route.request().url();
   if(url.startsWith('http://127.0.0.1:'))return route.continue();
   if(url.startsWith('https://raw.githubusercontent.com/kkongt2/betkj3/refs/heads/runner-results/')){
    assert.equal(route.request().method(),'GET');rawRequests.push(url);
    if(!available)return route.fulfill({status:404,body:'Not found'});
    const body=url.includes('index.json')?{schema:1,entries:[{runId:report.runId,requestId:report.request.requestId,finishedAt:report.finishedAt,method:'de',joint:report.request.joint,seconds:2}]}:bad?{...report,modelVersion:'bad'}:report;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   }
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#pairLead .lead-number').waitFor();
  await page.locator('#weightSearchMinutes').fill('301');await page.locator('#prepareRunnerSearch').click();assert((await page.locator('#runnerSearchStatus').innerText()).includes('1~300분'));
  await page.locator('#weightSearchMinutes').fill('300');await page.locator('#prepareRunnerSearch').click();assert.equal(JSON.parse(await page.locator('#runnerSearchRequest').inputValue()).seconds,18000);
  await page.selectOption('#runnerSearchDuration','86400');await page.locator('#prepareRunnerSearch').click();assert.equal(JSON.parse(await page.locator('#runnerSearchRequest').inputValue()).seconds,86400);await page.selectOption('#runnerSearchDuration','current');
  await page.selectOption('#weightSearchMethod','de');await page.locator('#weightSearchMinutes').fill('2');await page.locator('#weightSearchBalanced').uncheck();
  const before=await page.evaluate(()=>strategySettings());
  await page.locator('#prepareRunnerSearch').click();await page.locator('#runnerSearchRequest').waitFor();const payload=JSON.parse(await page.locator('#runnerSearchRequest').inputValue());assert.equal(payload.seconds,120);assert.equal(payload.method,'de');assert.deepEqual(payload.settings.weights,before.weights);
  assert.equal(await page.locator('#startWeightSearch').isDisabled(),false,'prepare must not launch local search');
  assert.equal(await page.locator('#runnerWorkflowLink').getAttribute('href'),'https://github.com/kkongt2/betkj3/actions/workflows/runner-search.yml');report.request=payload;
  await page.locator('#refreshRunnerSearch').click();await page.waitForFunction(()=>!document.querySelector('#refreshRunnerSearch').disabled);assert.equal(await page.locator('#loadRunnerSearch').isDisabled(),true);
  available=true;await page.reload();await page.locator('#pairLead .lead-number').waitFor();await page.locator('#refreshRunnerSearch').click();await page.waitForFunction(()=>!document.querySelector('#loadRunnerSearch').disabled);
  assert((await page.locator('#runnerSearchResults').innerText()).includes('내 최근 요청'));assert((await page.locator('#runnerSearchResults').innerText()).includes('0.03분'));
  bad=true;await page.locator('#loadRunnerSearch').click();await page.waitForFunction(()=>document.querySelector('#runnerSearchStatus').textContent.includes('실패'));assert.equal(await page.locator('#applyWeightSearch').isDisabled(),true);
  bad=false;await page.locator('#loadRunnerSearch').click();await page.waitForFunction(()=>!document.querySelector('#applyWeightSearch').disabled);assert((await page.locator('#weightSearchStatus').innerText()).includes('Runner 탐색 완료'));
  assert.deepEqual((await page.evaluate(()=>strategySettings())).weights,before.weights,'loading must not apply weights');
  const product=await page.locator('#weightSearchResult .search-metrics strong').nth(2).innerText();assert.equal(product,report.result.best.metrics.product.toFixed(4)+'배');
  await page.locator('#applyWeightSearch').click();assert.deepEqual((await page.evaluate(()=>strategySettings())).weights,report.result.best.settings.weights);assert.equal(await page.locator('#screeningEnabled').isChecked(),false);assert.equal(await page.locator('.screening-badge').count(),0);
  await page.locator('#saveWeightSearch').click();assert((await page.locator('#weightSearchStatus').innerText()).includes('저장'));
  // A legacy joint report has only independently trained validation folds. Import
  // must calculate the fixed winner via the worker, and via the no-worker fallback.
  report=await search({...payload,seconds:2,joint:true},rows,{runId:'124-1'});assert(report.result.best.joint.fixed);const expected=structuredClone(report.result.best.joint.fixed);delete report.result.best.joint.fixed;
  for(const fallback of [false,true]){
   if(fallback){await page.addInitScript(()=>{window.Worker=undefined;});await page.reload();await page.locator('#pairLead .lead-number').waitFor();}
   await page.locator('#refreshRunnerSearch').click();await page.waitForFunction(()=>!document.querySelector('#refreshRunnerSearch').disabled);
   await page.locator('#loadRunnerSearch').click();await page.waitForFunction(()=>!document.querySelector('#applyWeightSearch').disabled,{},{timeout:60000});
   const text=await page.locator('#fixedYearResults').innerText();assert(text.includes('현재 최고 조합 · 2024년 이후 재계산'));assert(text.includes(expected.metrics.product.toFixed(4)+'배'));assert(!text.includes('시간 순서 검증'));
   assert(text.includes('독립적인 미래 성능 검증은 아닙니다'));assert.equal(await page.locator('#fixedYearResults tr[data-year="2026"]').count(),1);
   await page.locator('#applyWeightSearch').click();assert.equal(await page.locator('#screeningEnabled').isChecked(),false);assert.equal(await page.locator('.screening-badge').count(),0);
  }
  await page.locator('#prepareRunnerSearch').click();await page.locator('#weightSearchMinutes').fill('3');await page.locator('#weightSearchMinutes').blur();assert.equal(await page.locator('#runnerPrepared').isHidden(),true);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(rawRequests.length>=4);assert.deepEqual(errors,[]);
  await page.locator('.weight-search').screenshot({path:'/tmp/runner-search-mobile.png'});await context.close();console.log('PASS mobile Runner prepare including 1-day budget without local execution, reload recovery, missing/invalid result, matching result, explicit apply/save, stale request invalidation and screening OFF');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
