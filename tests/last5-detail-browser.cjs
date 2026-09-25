'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const M=require('../model.js'),T=require('../tuning-model.js'),P=require('../qpl-policy.js'),H=require('../qpl-history-engine.js');
const root=path.resolve(__dirname,'..');
const races=Array.from({length:12},(_,ri)=>({date:'20260913',venue:'seoul',race_no:ri+1,start_time:'10:00',title:'서울 경주',horses:Array.from({length:10},(_,i)=>({number:i+1,name:'출전마 '+(i+1),weighted_v3_features:Array.from({length:17},(_,j)=>Math.max(0,Math.min(1,.85-i*.06+Math.sin(ri*3+i+j)*.25))),weighted_v3_support:{starts:ri%6,available:Array(17).fill(ri%3!==0)}})),official_result:{status:'confirmed',starters:Array.from({length:10},(_,i)=>i+1),place:{status:'confirmed',payouts:[{numbers:[1],odds:2},{numbers:[3],odds:3},{numbers:[5],odds:4}]},pair:{status:'confirmed',payouts:[{numbers:[1,3],odds:3+ri},{numbers:[1,5],odds:5},{numbers:[3,5],odds:6}]}}}));
for(const r of races)for(const h of r.horses){
 h.weighted_v3_features=[...h.weighted_v3_features,.2+h.number*.06,.8-h.number*.04,.2+h.number*.05,.6];
 h.weighted_v3_support={starts:5,through:'20260906',available:Array(21).fill(true),detail:{counts:Array(21).fill(5),recent:[0,1,2,3,4].map((i)=>({date:'202608'+String(1+i*7).padStart(2,'0'),finish:5-i,fieldSize:10,form:(5+i)/9,speed:i/2})),finishTrend:.1,speedTrend:.3,finishStd:.2,speedStd:.4,distanceChange:200,previousGrade:4,currentGrade:3,restDays:14,usualRestDays:21}};
 h.weighted_v3_support.available[19]=false;h.weighted_v3_support.detail.counts[19]=0;h.weighted_v3_features[19]=.5;
}
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
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),errors=[];
 try{for(const fallback of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const legacy=T.defaults().slice(0,17);
  await page.addInitScript(({fallback,legacy})=>{if(fallback)window.Worker=undefined;if(!localStorage.getItem('betkj3-tuning'))localStorage.setItem('betkj3-tuning',JSON.stringify({weights:legacy}));},{fallback,legacy});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#pairLead .lead-number').waitFor();
  assert.deepEqual(await page.evaluate(()=>strategySettings().weights),[...legacy,0,0,0,0]);
  assert.equal(await page.locator('#screeningEnabled').isChecked(),false);assert.equal(await page.locator('.screening-badge').count(),0);
  await page.locator('details.card').filter({has:page.locator('#horses')}).locator('> summary').click();
  await page.locator('.horse-detail summary').first().click();
  const detail=page.locator('.horse-detail').first();
  assert((await detail.innerText()).includes('오래된 경주 → 직전 경주'));assert((await detail.innerText()).includes('자료·조건 부족 · 대체값'));assert((await detail.innerText()).includes('거리 +200m'));
  assert.equal(await detail.locator('tbody').nth(0).locator('tr').count(),5);assert.equal(await detail.locator('tbody').nth(1).locator('tr').count(),21);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'detail mobile width');
  await detail.screenshot({path:'/tmp/screening-detail-'+(fallback?'fallback':'worker')+'.png'});
  await page.locator('#weightDetails > summary').click();
  for(let i=17;i<21;i++){const input=page.locator('#weight-'+i);assert.equal(await input.inputValue(),'0');await input.fill('7');await input.dispatchEvent('input');assert.equal(await page.locator('#weight-range-'+i).inputValue(),'7');}
  await page.waitForFunction(()=>!document.querySelector('#qplHistoryStats').textContent.includes('계산 중')); 
  const cfg=await page.evaluate(()=>strategySettings()),exact=await H.create(rows).evaluate(cfg,'20220101','20260920');
  await page.waitForFunction(expected=>document.querySelector('#qplHistoryStats .history-product strong')?.textContent===expected,H.metrics(exact.all).product.toFixed(3)+'배');
  await page.locator('#weight-curve-20').scrollIntoViewIfNeeded();await page.locator('#weight-curve-20 svg').waitFor({timeout:60000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'new controls mobile width');
  await page.reload();await page.locator('#pairLead .lead-number').waitFor();assert.deepEqual(await page.evaluate(()=>strategySettings().weights),cfg.weights);
  assert.equal(await page.locator('.screening-badge').count(),0);
  await context.close();
 }assert.deepEqual(errors,[]);console.log('PASS mobile detail tables, missing/observed distinction, legacy settings, four new controls, curve, persistence and worker/fallback');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
