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
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');let content=fs.readFileSync(file);if(file.endsWith('/app.js'))content=content.toString().replace('run:runWeightSearch,', 'run:(o,p)=>{window.__requestedSearchSeconds=o.seconds;return runWeightSearch({...o,seconds:Math.min(o.seconds,2)},p);},');res.end(content);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),errors=[];
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});Object.defineProperty(navigator,'deviceMemory',{get:()=>8});});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#pairLead .lead-number').waitFor();
  assert.equal(await page.locator('#weightSearchParallel').isChecked(),true);assert.equal(await page.locator('#weightSearchMinutes').getAttribute('max'),'300');
  await page.locator('#weightSearchMinutes').fill('301');await page.locator('#startWeightSearch').click();assert((await page.locator('#weightSearchStatus').innerText()).includes('1~300분'));
  for(const method of ['local','de'])for(const mode of ['all','joint']){
   await page.selectOption('#weightSearchMethod',method);await page.selectOption('#weightSearchMode',mode);await page.locator('#weightSearchMinutes').fill('1');
   await page.locator('#startWeightSearch').click();await page.waitForFunction(()=>!document.querySelector('#applyWeightSearch').disabled,{},{timeout:60000});
   assert.equal(await page.evaluate(()=>window.__requestedSearchSeconds),60);const status=await page.locator('#weightSearchStatus').innerText();assert(status.includes('병렬 3개 작업'),status);assert(status.includes('검산 완료'));console.log(method,mode,status);
   const found=await page.locator('#weightSearchResult .search-metrics strong').nth(2).innerText();await page.locator('#applyWeightSearch').click();const cfg=await page.evaluate(()=>strategySettings());
   const evaluated=await H.create(rows).evaluate({...cfg,includeScreening:true},'20220101','20260920');const metric=mode==='joint'?evaluated.screening.points[cfg.screening.threshold]:H.metrics(evaluated.all);assert.equal(found,metric.product.toFixed(4)+'배');
   assert.equal(await page.locator('#screeningEnabled').isChecked(),false);assert.equal(await page.locator('.screening-badge').count(),0);
  }
  await page.locator('#weightSearchMinutes').fill('300');await page.locator('#startWeightSearch').click();
  await page.waitForFunction(()=>document.querySelector('#weightSearchStatus').textContent.includes('/ 300분'));
  assert.equal(await page.evaluate(()=>window.__requestedSearchSeconds),18000);await page.locator('#stopWeightSearch').click();await page.waitForFunction(()=>!document.querySelector('#startWeightSearch').disabled,{},{timeout:30000});assert((await page.locator('#weightSearchStatus').innerText()).includes('중지 완료'));
  await page.locator('#startWeightSearch').click();await page.locator('#weightSearchParallel').uncheck();assert.equal(await page.locator('#applyWeightSearch').isDisabled(),true);
  await page.reload();await page.locator('#pairLead .lead-number').waitFor();assert.equal(await page.locator('#weightSearchParallel').isChecked(),false);
  await page.locator('#weightSearchMinutes').fill('1');await page.locator('#startWeightSearch').click();await page.waitForFunction(()=>!document.querySelector('#applyWeightSearch').disabled,{},{timeout:60000});assert((await page.locator('#weightSearchStatus').innerText()).includes('단일 작업'));
  await page.locator('#weightSearchParallel').check();await context.route('**/search-island-worker.js*',r=>r.abort());
  await page.locator('#startWeightSearch').click();await page.waitForFunction(()=>!document.querySelector('#applyWeightSearch').disabled,{},{timeout:60000});assert((await page.locator('#weightSearchStatus').innerText()).includes('단일 작업'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.weight-search').screenshot({path:'/tmp/parallel-search-mobile.png'});
  await context.close();assert.deepEqual(errors,[]);console.log('PASS mobile parallel local/DE all/joint, exact parity, 300-minute start/stop, option persistence, cancellation, worker-failure fallback and screening OFF');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
