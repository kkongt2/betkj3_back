const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');

const fixture={date:'20250928',venue:'seoul',race_no:1,start_time:'10:00',
 horses:Array.from({length:6},(_,i)=>({number:i+1,name:'말'+(i+1),rating:50-i,starts_1y:10,wins_1y:2,seconds_1y:1,thirds_1y:1,weighted_v3_features:Array.from({length:17},(_,j)=>j===0?1-i/7:j===1?i/7:.5)})),
 official_result:{status:'confirmed',starters:[1,2,3,4,5,6],place:{status:'confirmed',payouts:[{numbers:[1],odds:1.1},{numbers:[3],odds:2}]},pair:{status:'confirmed',payouts:[{numbers:[1,3],odds:3}]}}};

const doc={updated_at:'2026-09-14T09:00:00+09:00',scope:'seoul',
 races:[fixture,{...fixture,venue:'busan'},{...fixture,venue:'jeju'}],
 calendar:[{date:fixture.date,venues:['seoul','busan']},{date:'20260911',venues:['jeju','busan']}]};

const nativeModel=require('../model.js'),nativeTuning=require('../tuning-model.js');
const historyDoc={schema:2,policyVersion:'betkj3-configurable-anchor-v3',generatedAt:doc.updated_at,rows:[nativeTuning.pack(nativeModel.analyze(fixture),null)]};
const historicalRows=[{...historyDoc.rows[0],date:'20210108'},...historyDoc.rows];
const historyManifest={schema:3,scope:'seoul',policyVersion:historyDoc.policyVersion,generatedAt:doc.updated_at,from:'20210108',to:fixture.date,races:2,shards:[{url:'qpl-history-years/2021.json',rows:1},{url:'qpl-history-years/2025.json',rows:1}]};

const flush=async()=>{await new Promise(resolve=>setTimeout(resolve,180));for(let i=0;i<100&&nodes['#qplHistoryStats']['aria-busy']==='true';i++)await new Promise(resolve=>setTimeout(resolve,10));};
const nodes={},node=()=>({innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v},addEventListener(t,f){this[t]=f},focus(){}});
for(const m of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))nodes['#'+m[1]]=node();
const venues=['seoul','busan','jeju'].map(venue=>({...node(),dataset:{venue}}));
const savedData=new Map([['betkj3-screening-strictness','75']]);
const requested=[];
const rollingFile=JSON.parse(fs.readFileSync('rolling-report.json'));
const sandbox={console,Intl,Date,Math,Number,Set,Map,JSON,Array,String,Error,Infinity,AbortController,setTimeout,clearTimeout,
 document:{addEventListener(){},getElementById:id=>nodes['#'+id]||null,querySelector:s=>nodes[s]||null,querySelectorAll:()=>venues},
 localStorage:{getItem:k=>savedData.get(k)||null,setItem:(k,v)=>savedData.set(k,v)},
 fetch:async url=>{requested.push(String(url));return {ok:true,json:async()=>{
  const s=String(url);
  if(s.includes('top5-presets.json'))return JSON.parse(fs.readFileSync('top5-presets.json'));
  if(s.includes('rolling-report.json'))return rollingFile;
  if(s.includes('qpl-history.json'))return historyManifest;
  if(s.includes('qpl-history-years/'))return {...historyDoc,rows:[historicalRows[s.includes('2021.json')?0:1]]};
  if(s.includes('calendar/'))return {...doc,date:fixture.date,races:[{...fixture,calendar_archive:true}]};
  return doc;
 }}},
 alert:msg=>{throw Error(msg)}
};

vm.createContext(sandbox);
for(const p of ['model.js','qpl-policy.js','tuning-model.js','race-selection-model.js','race-selection-panel.js','qpl-history-engine.js','weight-curve-engine.js','weight-curves.js','strategy-presets.js','rolling-panel.js','top5-panel.js','weight-balance.js','global-weight-search.js','weight-search-engine.js','parallel-search.js','runner-search-contract.js','runner-search-panel.js','weight-search.js','joint-search-engine.js','history-summary.js','app.js'])vm.runInContext(fs.readFileSync(p,'utf8'),sandbox);

(async()=>{await flush();
 assert.equal(vm.runInContext('races.every(r=>r.venue==="seoul")',sandbox),true);
 assert(!vm.runInContext('venueDates().includes("20260911")',sandbox));
 assert(!/부경|제주|전국|weightVenue|analysisModel|anchorMode|최종배당/.test(fs.readFileSync('index.html','utf8')));
 assert.equal(vm.runInContext('current.calendar_archive',sandbox),true);

 // Recommendations must be available without loading any final-odds resource.
 assert(!requested.some(x=>x.includes('market-odds')));
 assert(!nodes['#placeLead'].innerHTML.includes('data-result-toggle'));
 assert(!nodes['#pairLead'].innerHTML.includes('data-result-toggle'));
 assert(nodes['#pairLead'].innerHTML.includes('동반입상확률 비교'));
 assert(nodes['#pairLead'].innerHTML.includes('연승확률 분석 1위'));
 assert(nodes['#pairLead'].innerHTML.includes('분석 3위'));
 assert(!nodes['#pairLead'].innerHTML.includes('최종배당'));

 assert.equal(nodes['#screeningEnabled'].checked,false);
 assert.equal(nodes['#screeningControls'].hidden,true);
 assert(!nodes['#pairLead'].innerHTML.includes('screening-badge'));
 assert(!nodes['#raceOverview'].innerHTML.includes('screening-badge'));
 nodes['#screeningEnabled'].checked=true;nodes['#screeningEnabled'].onchange();
 assert(nodes['#pairLead'].innerHTML.includes('screening-badge'));
 nodes['#screeningOnly'].checked=true;
 nodes['#screeningEnabled'].checked=false;nodes['#screeningEnabled'].onchange();
 assert.equal(nodes['#screeningOnly'].checked,false);
 assert(!nodes['#raceOverview'].innerHTML.includes('screening-badge'));
 assert(!nodes['#overviewStatus'].textContent.includes('선별'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('100.0%'));
 assert(!nodes['#qplHistoryStats'].innerHTML.includes('2021.01.08'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('2023년 이후 비교'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('실제 전적 확보'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('미확인'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('1경주'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('평균 적중 배당<strong>3.00배'));

 nodes['#partnerMin'].value='2';nodes['#partnerMin'].onchange();await flush();
 assert(nodes['#qplHistoryStats'].innerHTML.includes('0.0%'));
 assert(nodes['#pairLead'].innerHTML.includes('분석 2위'));

 nodes['#partnerMin'].value='3';nodes['#partnerMax'].value='6';nodes['#partnerMax'].onchange();await flush();
 assert(nodes['#pairLead'].innerHTML.includes('분석 3위'));
 assert(nodes['#rangeHelp'].textContent.includes('3~6위'));

 nodes['#anchorRank'].value='2';nodes['#anchorRank'].onchange();await flush();
 assert(nodes['#pairLead'].innerHTML.includes('연승확률 분석 2위'));
 assert.equal(vm.runInContext('tuningSettings.anchorRank',sandbox),2);

 const previous=vm.runInContext('ranked.places[0].prob',sandbox);
 nodes['#weight-0'].value='34';nodes['#weight-0'].oninput();await flush();
 assert.equal(vm.runInContext('tuningSettings.weights[0]',sandbox),34);
 assert.equal(vm.runInContext('ranked.models.place',sandbox),'user-weighted-seoul-last5-v2');
 assert.notEqual(vm.runInContext('ranked.places[0].prob',sandbox),previous);
 assert(nodes['#qplHistoryStats'].innerHTML.includes('서울 최근 5경주 가중치'));
 assert(nodes['#qplHistoryStats'].innerHTML.includes('적중률 × 평균배당'));

 nodes['#weight-0'].value='34.5';nodes['#weight-0'].onchange();assert.equal(nodes['#weight-0'].value,'34');
 nodes['#presetName'].value='테스트 <설정>';nodes['#saveStrategy'].onclick();
 assert(nodes['#presetStatus'].textContent.includes('저장했습니다'));
 assert(nodes['#savedStrategy'].innerHTML.includes('&lt;설정&gt;'));
 nodes['#weight-0'].value='50';nodes['#weight-0'].oninput();
 nodes['#partnerMin'].value='2';nodes['#partnerMin'].onchange();
 nodes['#loadStrategy'].onclick();await flush();
 assert.equal(vm.runInContext('tuningSettings.weights[0]',sandbox),34);
 assert.equal(vm.runInContext('partnerRange.min',sandbox),3);
 assert.equal(nodes['#anchorRank'].value,'2');
 assert(nodes['#presetStatus'].textContent.includes('불러왔습니다'));
 nodes['#deleteStrategy'].onclick();assert(nodes['#presetStatus'].textContent.includes('삭제했습니다'));

 // A stale odds-era rolling report is hidden; regenerated analysis-only reports are accepted.
 if(rollingFile.policyVersion===historyDoc.policyVersion){
  assert.equal(nodes['#applyRolling'].hidden,false);
  nodes['#applyRolling'].onclick();await flush();
 }else{
  assert.equal(nodes['#applyRolling'].hidden,true);
  assert(nodes['#rollingReport'].textContent.includes('분석순위 기준'));
 }

 const top=JSON.parse(fs.readFileSync('top5-presets.json'));assert.equal(top.presets.length,1);
 assert(nodes['#top5Presets'].innerHTML.includes('프리셋 1 적용·저장'));
 assert(nodes['#top5Presets'].innerHTML.includes('추천 선정에는 배당을 사용하지 않습니다'));
 const beforeAll=vm.runInContext('JSON.stringify(strategySettings())',sandbox);
 nodes['#saveAllTopPresets'].onclick();
 assert(nodes['#top5Status'].textContent.includes('1번 프리셋을 저장'));
 assert.equal(vm.runInContext('JSON.stringify(strategySettings())',sandbox),beforeAll);
 nodes['#top5Presets'].click({target:{closest:()=>({dataset:{top5:'0'}})}});await flush();
 assert.equal(vm.runInContext('tuningSettings.weights.join(",")',sandbox),require('../tuning-model.js').settings(top.presets[0].settings).weights.join(','));
 assert.equal(vm.runInContext('partnerRange.min',sandbox),top.presets[0].settings.min);

 assert(!requested.some(x=>x.includes('market-odds')));
 assert(!nodes['#raceOverview'].innerHTML.includes('최종배당 대기'));
 assert(!nodes['#raceOverview'].innerHTML.includes('출전정보 확인 필요'));
 console.log('PASS analysis-only QPL selection, no final-odds fetch, one preset, controls, history and result display');
})().catch(e=>{console.error(e);process.exitCode=1});
