'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>(x*100).toFixed(1)+'%',names={seoul:'서울'},KEY='betkj3-predictions-v1';
let races=[],source=null,current=null,ranked=null,venue='seoul',manual=false,requestId=0,advancedReport=null;
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let selectionRequest=0;

let partnerRange=Betkj3Policy.normalizeRange(),tuningSettings=TuningModel.settings(),qplHistory=null,historyRequest=0;
let historyWorker=null,historyEngine=null,historyEvaluation=0,historyTimer=null;
let weightCurves=null,curveEngine=null,historyReady=null,curveRequest=0,curvePending=null;
let weightSearch=null,searchRequest=0,searchPending=null,searchStopped=false;
let screeningPanel=null,jointEngine=null;
const raceAnalysisCache=new WeakMap();
let syncTuningControls=()=>{},refreshPresetOptions=()=>{};
const strategySettings=()=>({...tuningSettings,...partnerRange,...(tuningSettings.screening?{screening:{...tuningSettings.screening,threshold:(screeningPanel?.value()??tuningSettings.screening.threshold)}}:{})});
const anchorLabel=()=> '연승확률 분석 '+(tuningSettings.anchorRank||1)+'위';
function syncStrategyHelp(){$('#rangeHelp').textContent='현재 설정: '+anchorLabel()+' 축마 + 연승확률 분석 '+partnerRange.min+'~'+partnerRange.max+'위에서 1마리 선택 · 이 기기에 자동 저장';}
function initPartnerRange(){
 try{partnerRange=Betkj3Policy.normalizeRange(JSON.parse(localStorage.getItem('betkj3-partner-range')||'{}'));}catch{}
 const options=Array.from({length:19},(_,i)=>'<option value="'+(i+2)+'">'+(i+2)+'위</option>').join('');
 $('#partnerMin').innerHTML=options;$('#partnerMax').innerHTML=options;
 function update(changed){
  let min=+$('#partnerMin').value,max=+$('#partnerMax').value;
  if(min>max){if(changed==='min')max=min;else min=max;}
  partnerRange=Betkj3Policy.normalizeRange({min,max});
  if(tuningSettings.screening){delete tuningSettings.screening;screeningPanel?.applyModel(null);try{localStorage.setItem('betkj3-tuning',JSON.stringify(tuningSettings));}catch{}}
  try{localStorage.setItem('betkj3-partner-range',JSON.stringify(partnerRange));}catch{}
  sync();renderQplHistory();render();
 }
 function sync(){
  $('#partnerMin').value=String(partnerRange.min);$('#partnerMax').value=String(partnerRange.max);
  syncStrategyHelp();
 }
 $('#partnerMin').onchange=()=>update('min');$('#partnerMax').onchange=()=>update('max');
 $('#retryQplHistory').onclick=loadQplHistory;sync();
}
async function loadQplHistory(){
 const id=++historyRequest;$('#retryQplHistory').hidden=true;
 if(!qplHistory)$('#qplHistoryStats').textContent='과거 경주를 불러오는 중…';
 try{
  const doc=await fetchJSON('qpl-history.json?v=last5-1'+Date.now());
  if(doc.scope!=='seoul'||![2,3].includes(doc.schema)||doc.policyVersion!==Betkj3Policy.VERSION||(doc.schema===2?!Array.isArray(doc.rows):!Array.isArray(doc.shards)))throw Error('통계 자료 형식 확인 필요');
  if(id!==historyRequest)return;qplHistory=doc;setupHistoryEngine();renderQplHistory();
 }catch{
  if(id!==historyRequest)return;
  if(qplHistory)renderQplHistory();else {$('#qplHistoryStats').textContent='과거 통계를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.';screeningPanel?.error();}
  $('#retryQplHistory').hidden=false;
 }
}
function setupHistoryEngine(){
 weightSearch?.reset();
 cancelWeightCurve();historyWorker?.terminate();historyWorker=null;historyEngine=null;curveEngine=null;historyReady=null;
 if(typeof Worker==='function')try{
  historyWorker=new Worker('qpl-history-worker.js?v=fixed-years-1');
  historyWorker.onmessage=({data})=>{if(data.type==='search-progress'||data.type==='search-result'){if(searchPending?.id!==data.searchId)return;if(data.type==='search-progress'){searchPending.progress(data.progress);return;}const pending=searchPending;searchPending=null;if(data.error)pending.reject(Error(data.error));else pending.resolve(data.result);return;}if(data.type==='curve'||data.type==='curve-progress'){if(curvePending?.id!==data.curveId)return;if(data.type==='curve-progress'){curvePending.progress(data.percent);return;}const pending=curvePending;curvePending=null;if(data.error)pending.reject(Error(data.error));else pending.resolve(data.result);return;}if(data.type==='loading'){$('#qplHistoryStats').textContent='평가 기간 자료를 불러오는 중… '+data.done+'/'+data.total+'개 연도';return;}if(data.id!==historyEvaluation)return;if(data.type==='progress'){$('#qplHistoryStats').textContent='2022년 이후 통계를 계산하는 중… '+data.percent+'%';return;}if(data.error){fallbackHistory();return;}showQplHistory(data.groups);};
  historyWorker.onerror=()=>fallbackHistory();
  historyWorker.postMessage({type:'init',manifest:qplHistory});
 }catch{historyWorker=null;}
 weightCurves?.restart();
}
function fallbackHistory(){weightSearch?.reset();cancelWeightCurve();historyWorker?.terminate();historyWorker=null;historyEngine=null;curveEngine=null;historyReady=null;weightCurves?.restart();renderQplHistory();}
function renderQplHistory(){
 screeningPanel?.pending();
 weightSearch?.refresh();
 if(!qplHistory)return;
 weightCurves?.refresh();
 const id=++historyEvaluation,config={...strategySettings(),includeScreening:true},from=QplHistoryEngine.PERIOD.from,to=day().replaceAll('-','');
 clearTimeout(historyTimer);
 $('#qplHistoryStats').textContent='현재 설정으로 과거 경주를 다시 계산하는 중…';
 $('#qplHistoryStats').setAttribute('aria-busy','true');
 historyTimer=setTimeout(async()=>{
  if(id!==historyEvaluation)return;
  if(historyWorker){historyWorker.postMessage({type:'evaluate',id,settings:config,from,to});return;}
  try{
   await getHistoryEngines();if(id!==historyEvaluation)return;
   const groups=await historyEngine.evaluate(config,from,to,()=>id===historyEvaluation);
   if(groups&&id===historyEvaluation)showQplHistory(groups);
  }catch{if(id===historyEvaluation){screeningPanel?.error();$('#qplHistoryStats').textContent='통계 계산에 실패했습니다. 다시 불러오기를 눌러 주세요.';$('#retryQplHistory').hidden=false;$('#qplHistoryStats').setAttribute('aria-busy','false');}}
 },120);
}

function cancelWeightCurve(){curveRequest++;if(curvePending){curvePending.resolve(null);curvePending=null;}historyWorker?.postMessage({type:'cancel-curve',curveId:curveRequest});}
async function getHistoryEngines(){
 if(!historyReady){const doc=qplHistory;historyReady=QplHistoryEngine.load(doc,url=>fetchJSON(url+'?t='+Date.now(),60000)).then(rows=>{if(doc!==qplHistory)throw Error('자료가 갱신되었습니다.');historyEngine=QplHistoryEngine.create(rows);curveEngine=WeightCurveEngine.create(rows);jointEngine=JointSearchEngine.create(rows);}).catch(error=>{historyReady=null;throw error;});}
 return historyReady;
}
async function calculateWeightCurve(settings,index,progress){
 const id=++curveRequest,from=QplHistoryEngine.PERIOD.from,to=day().replaceAll('-','');
 if(historyWorker)return new Promise((resolve,reject)=>{curvePending={id,resolve,reject,progress};historyWorker.postMessage({type:'curve',curveId:id,settings,index,from,to});});
 await getHistoryEngines();if(id!==curveRequest)return null;
 return curveEngine.curve(settings,index,from,to,()=>id===curveRequest,progress);
}
function initWeightCurves(){weightCurves=WeightCurves.init({settings:strategySettings,dataKey:()=>qplHistory?JSON.stringify([qplHistory.generatedAt,qplHistory.from,qplHistory.to,qplHistory.races,QplHistoryEngine.PERIOD.from,QplHistoryEngine.PERIOD.comparisonFrom,day()]):'',calculate:calculateWeightCurve,cancel:cancelWeightCurve,apply:(i,value)=>{const input=$('#weight-'+i);input.value=String(value);input.onchange();}});}

function abortWeightSearch(){searchRequest++;searchStopped=true;if(searchPending){searchPending.resolve(null);searchPending=null;}historyWorker?.postMessage({type:'abort-search',searchId:searchRequest});}
function stopWeightSearch(){searchStopped=true;historyWorker?.postMessage({type:'stop-search',searchId:searchRequest});}
async function runWeightSearch(options,progress){
 const id=++searchRequest;searchStopped=false;const config={...options,hardware:{cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory},searchSeed:Math.floor(Math.random()*4294967296),from:QplHistoryEngine.PERIOD.from,to:day().replaceAll('-','')};
 try{config.seeds=StrategyPresets.read(localStorage).map(p=>p.settings.weights);}catch{config.seeds=[];}
 if(historyWorker)return new Promise((resolve,reject)=>{searchPending={id,resolve,reject,progress};historyWorker.postMessage({type:'search',searchId:id,options:config});});
 await getHistoryEngines();if(id!==searchRequest)return null;
 const run=config.joint?(o,f,v,c)=>jointEngine.run(o,v,c):WeightSearchEngine.run;
 return run(config,curveEngine.evaluate,historyEngine.evaluate,{current:()=>id===searchRequest,stopped:()=>searchStopped,progress});
}
async function recalculateRunnerSearch(report){
 if(!qplHistory)throw Error('과거 경주 자료를 불러온 후 다시 시도해 주세요.');
 const id=++searchRequest,options={joint:true,from:report.from,to:report.to};
 if(historyWorker)return new Promise((resolve,reject)=>{searchPending={id,resolve,reject,progress:()=>{}};historyWorker.postMessage({type:'recalculate-search',searchId:id,options,result:report.result});});
 await getHistoryEngines();if(id!==searchRequest)return null;
 return ParallelSearch.verify(report.result,options,historyEngine.evaluate,()=>id===searchRequest);
}
function initWeightSearch(){weightSearch=WeightSearch.init({settings:strategySettings,dataKey:()=>qplHistory?JSON.stringify([qplHistory.generatedAt,qplHistory.from,qplHistory.to,qplHistory.races,QplHistoryEngine.PERIOD.from,QplHistoryEngine.PERIOD.comparisonFrom,day()]):'',run:runWeightSearch,recalculate:recalculateRunnerSearch,abort:abortWeightSearch,stop:stopWeightSearch,pause:value=>weightCurves?.pause(value),apply:applySavedStrategy,save:(name,settings)=>{StrategyPresets.save(localStorage,name,settings);refreshPresetOptions(name);}});}

function showQplHistory(groups){
 if(groups.screening)screeningPanel?.show(groups.screening);
 const from=QplHistoryEngine.PERIOD.from,to=day().replaceAll('-',''),g=groups.all,m=QplHistoryEngine.metrics(g);
 const eligibleDates=qplHistory.schema===3?qplHistory.shards.filter(s=>s.to>=from&&s.from<=to).flatMap(s=>[s.from<from?from:s.from,s.to>to?to:s.to]).sort():(qplHistory.rows||[]).filter(r=>r.date>=from&&r.date<=to).map(r=>r.date).sort();
 const format=d=>d.slice(0,4)+'.'+d.slice(4,6)+'.'+d.slice(6,8);
 $('#qplHistoryStats').setAttribute('aria-busy','false');
 $('#qplHistoryStats').innerHTML='<p class="hint">'+anchorLabel()+' + 분석 '+partnerRange.min+'~'+partnerRange.max+'위 · '+TuningModel.label(tuningSettings.modelMode)+' · 서울 경주만'+'<br>'+(eligibleDates.length?format(eligibleDates[0])+' ~ '+format(eligibleDates.at(-1)):'기간 내 경주 없음')+'</p><div class="history-totals"><div>적중 횟수<strong>'+g.hits.toLocaleString()+'회</strong></div><div>평가 경주<strong>'+g.evaluated.toLocaleString()+'경주</strong></div><div>과거 적중률<strong>'+(m.rate===null?'—':pct(m.rate))+'</strong></div><div>평균 적중 배당<strong>'+(m.average===null?'—':m.average.toFixed(2)+'배')+'</strong>'+(g.paidHits<g.hits?'<small>배당 확인 '+g.paidHits+' / '+g.hits+'적중</small>':'')+'</div><div class="history-product">적중률 × 평균배당<strong>'+(m.product===null?'—':m.product.toFixed(3)+'배')+'</strong><small>'+(m.product===null?'평가 또는 배당 자료 부족':'세전 환급률 '+pct(m.product))+'</small></div></div><table class="validation-table"><thead><tr><th>경마장</th><th>적중 / 평가</th><th>적중률</th></tr></thead><tbody>'+Object.keys(names).map(v=>{const x=groups[v];return '<tr><td>'+names[v]+'</td><td>'+x.hits+' / '+x.evaluated+'</td><td>'+(x.evaluated?pct(x.hits/x.evaluated):'—')+'</td></tr>';}).join('')+'</tbody></table><p class="hint">전체 '+g.total.toLocaleString()+'경주 중 '+g.excluded.toLocaleString()+'경주 제외 · 자료 갱신 '+esc(new Date(qplHistory.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+'</p>'+HistorySummary.comparison(groups.comparison)+HistorySummary.coverage(groups.coverage);
}
function initTuning(){
 try{tuningSettings=TuningModel.settings(JSON.parse(localStorage.getItem('betkj3-tuning')||'{}'));}catch{}
 const editing=()=>tuningSettings.weights;
 function setWeights(weights){tuningSettings=TuningModel.settings({...tuningSettings,weights});}
 function sync(){
  $('#anchorRank').value=String(tuningSettings.anchorRank||1);
  TuningModel.FEATURES.forEach((f,i)=>{$('#weight-'+i).value=String(tuningSettings.weights[i]);$('#weight-range-'+i).value=String(tuningSettings.weights[i]);});
  $('#weightStatus').textContent='서울 전용 가중치 · 합계 '+tuningSettings.weights.reduce((a,b)=>a+b,0)+'% (계산 시 100% 환산)';syncStrategyHelp();
 }
 function update(){if(tuningSettings.screening){delete tuningSettings.screening;screeningPanel?.applyModel(null);}try{localStorage.setItem('betkj3-tuning',JSON.stringify(tuningSettings));}catch{}sync();renderQplHistory();render();}
 $('#anchorRank').onchange=()=>{tuningSettings.anchorRank=+$('#anchorRank').value;update();};
 TuningModel.FEATURES.forEach((f,i)=>{
  const change=node=>{const value=node.value.trim(),weights=TuningModel.FEATURES.map((_,i)=>editing()[i]??0);weights[i]=value===''?NaN:Number(value);if(!TuningModel.validWeights(weights)){$('#weightStatus').textContent='0~100 사이 정수를 입력하세요. 최소 한 요소는 1% 이상이어야 합니다.';return false;}setWeights(weights);update();return true;};
  for(const id of ['#weight-'+i,'#weight-range-'+i]){const node=$(id);node.oninput=()=>change(node);node.onchange=()=>{if(!change(node))node.value=String(editing()[i]??0);};}
 });
 $('#resetWeights').onclick=()=>{setWeights(TuningModel.defaults());update();};syncTuningControls=sync;sync();
}
function applySavedStrategy(settings){
 const config=StrategyPresets.config(settings);
 tuningSettings=TuningModel.settings(config);partnerRange=Betkj3Policy.normalizeRange(config);
 screeningPanel?.applyModel(config.screening);
 $('#partnerMin').value=String(partnerRange.min);$('#partnerMax').value=String(partnerRange.max);syncTuningControls();
 let persisted=true;try{localStorage.setItem('betkj3-tuning',JSON.stringify(tuningSettings));localStorage.setItem('betkj3-partner-range',JSON.stringify(partnerRange));}catch{persisted=false;}
 renderQplHistory();render();return persisted;
}
function initStrategyPresets(){
 const status=$('#presetStatus'),select=$('#savedStrategy');
 function refresh(selected=''){
  const entries=StrategyPresets.read(localStorage);
  select.innerHTML='<option value="">설정을 선택하세요</option>'+entries.map(p=>'<option value="'+esc(p.name)+'">'+esc(p.name)+'</option>').join('');
  select.value=selected;$('#loadStrategy').disabled=!selected;$('#deleteStrategy').disabled=!selected;
 }
 const error=e=>{status.textContent=e.name==='QuotaExceededError'?'브라우저 저장 공간이 부족해 저장하지 못했습니다.':e.message||'설정을 저장하지 못했습니다.';};
 refreshPresetOptions=refresh;try{refresh();}catch(e){error(e);}
 select.onchange=()=>{$('#loadStrategy').disabled=!select.value;$('#deleteStrategy').disabled=!select.value;};
 $('#saveStrategy').onclick=()=>{try{const name=$('#presetName').value.trim();StrategyPresets.save(localStorage,name,strategySettings());refresh(name);status.textContent='“'+name+'” 설정을 저장했습니다.';}catch(e){error(e);}};
 $('#loadStrategy').onclick=()=>{try{const p=StrategyPresets.read(localStorage).find(p=>p.name===select.value);if(!p)throw Error('불러올 설정을 선택하세요.');const saved=applySavedStrategy(p.settings);$('#presetName').value=p.name;status.textContent='“'+p.name+'” 설정을 불러왔습니다.'+(saved?'':' 현재 설정 자동 저장에는 실패했습니다.');}catch(e){error(e);}};
 $('#deleteStrategy').onclick=()=>{try{const name=select.value;if(!name)throw Error('삭제할 설정을 선택하세요.');StrategyPresets.remove(localStorage,name);refresh();status.textContent='“'+name+'” 설정을 삭제했습니다.';}catch(e){error(e);}};
}

function analyzeForSite(r){
 const config=strategySettings(),key=JSON.stringify(config),cached=raceAnalysisCache.get(r);
 if(cached?.key===key)return cached.result;
 const result=Betkj3Policy.apply(TuningModel.apply(analyze(r),tuningSettings),null,config);
 result.screening=RaceSelectionModel.score(result,config);raceAnalysisCache.set(r,{key,result});return result;
}
function screeningValue(){return screeningPanel?.value()??0;}
function screeningEnabled(){return screeningPanel?.enabled()===true;}
function screeningBadge(r){return screeningEnabled()?RaceSelectionPanel.badge(r.screening,screeningValue()):'';}
function initScreening(){
 screeningPanel=RaceSelectionPanel.init({model:()=>tuningSettings.screening,change:()=>{if(current)render();else renderOverview();}});
 $('#screeningOnly').onchange=renderOverview;
}
function policyExplanationHTML(r){
 const p=r.qplPolicy;if(p?.status!=='ready')return '<p class="hint">'+esc(p?.reason||'분석 순위 확인 필요')+'</p>';
 return '<div class="qpl-policy"><b>'+anchorLabel()+': '+p.anchor.number+'번 · 추정 '+pct(p.anchor.prob)+'</b><span>동반입상확률 비교</span>'+[...p.candidates].sort((a,b)=>a.partner.rank-b.partner.rank).map(c=>'<span class="'+(c.partner.number===p.partner.number?'policy-chosen':'')+'">분석 '+c.partner.rank+'위 '+c.partner.number+'번 · 연승 '+pct(c.partner.prob)+' · 조합 '+pct(c.pick.prob)+(c.partner.number===p.partner.number?' · 선택':'')+'</span>').join('')+'<small>연승확률 동률: 마번 순. 조합 확률 동률: 상대 말 연승확률 → 마번 순.</small></div>';
}
function browseFrom(){const d=day().split('-').map(Number),last=new Date(Date.UTC(d[0]-1,d[1],0)).getUTCDate();return String(d[0]-1)+String(d[1]).padStart(2,'0')+String(Math.min(d[2],last)).padStart(2,'0');}
function matchingPayout(market,numbers){const key=a=>a.map(Number).sort((a,b)=>a-b).join('-');return market?.status==='confirmed'&&Array.isArray(numbers)&&market.payouts?.find(p=>key(p.numbers)===key(numbers));}
function hitHTML(r,type,numbers){return matchingPayout(r.official_result?.[type],numbers)?'<span class="hit-badge">✓ 적중</span>':'';}
function breakEvenOdds(p){const odds=1/p;return Number.isFinite(p)&&p>0&&p<=1+1e-9&&Number.isFinite(odds)?Math.max(1,odds).toFixed(2):null;}
function probabilityHTML(p){const odds=breakEvenOdds(p);return '<span class="probability-values"><span class="probability-rate">'+(odds?pct(p):'—')+'</span><span class="break-even">손익분기배당 '+(odds?'약 '+odds+'배':'—')+'</span></span>';}
function start(r){const d=String(r.date||'').replaceAll('-','');return /^\d{8}$/.test(d)&&/^\d{2}:\d{2}$/.test(r.start_time||'')?Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${r.start_time}:00+09:00`):NaN;}
function setVenue(v){if(v!=='seoul')return;venue='seoul';document.querySelectorAll('[data-venue]').forEach(b=>{b.classList.toggle('active',b.dataset.venue===v);b.setAttribute('aria-pressed',b.dataset.venue===v)});}
function records(){try{let a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a.filter(x=>x.venue==='seoul'):[]}catch{return []}}
function put(a){try{localStorage.setItem(KEY,JSON.stringify(a));return true}catch{$('#saveStatus').textContent='기기에 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.';return false}}
function timingReasons(r){const why=[];if(String(r.date)<day().replaceAll('-',''))why.push('지난 경주 조회 · '+(r.calendar_archive?'경주일 이전 이력으로':'현재 정보로')+' 재계산한 후보');else if(!Number.isFinite(start(r)))why.push('출발 시각 확인 필요');else if(start(r)<=Date.now())why.push(String(r.date)<day().replaceAll('-','')?'지난 경주 조회 · 현재 정보로 재계산한 후보':'이미 출발한 경주');if(!manual&&(!source?.updated_at||Date.now()-Date.parse(source.updated_at)>30*60000||!Number.isFinite(Date.parse(source.updated_at))))why.push('갱신 후 30분 경과 · 최신 출전정보 확인 필요');return why;}
function why(r,x,type){return [...candidateReasons(r,x,type),...timingReasons(r),...(manual?['직접 입력 / 데모']:[])];}
function isSelected(r,type){return !manual&&r.mode==='accuracy'&&r.selection?.[type]?.qualified===true&&timingReasons(r).length===0;}
function officialResultHTML(r,type,numbers,scope='lead'){
 if(String(r.date)>=day().replaceAll('-','')&&(!Number.isFinite(start(r))||start(r)>Date.now()))return '';
 const result=r.official_result,market=result?.[type];
 const title='<span class="result-label">실제 결과 · 지급배당</span>';
 if(market?.status==='confirmed'&&market.payouts?.length){
  const hit=matchingPayout(market,numbers);
  return '<span class="official-result">'+title+market.payouts.map(x=>'<span class="result-line'+(x===hit?' result-hit':'')+'"><strong>'+x.numbers.map(n=>esc(n)).join('–')+(type==='place'?'번':'')+'</strong><span>'+Number(x.odds).toFixed(1)+'배</span></span>').join('')+'</span>';
 }
 return '<span class="official-result">'+title+'<span class="result-pending">'+(market?.status==='refunded'?'환불':result?.status==='unavailable'?'결과 불러오기 대기':'공식 결과 확인 중')+'</span></span>';
}
function pickHTML(x,r,type,lead=false){
 if(!x)return '<p class="hint">'+esc(r.qplPolicy?.reason||'후보 없음')+'</p>'+(!manual?officialResultHTML(r,type):'');
 const reasons=why(r,x,type),name=x.names.map(esc).join(' · '),num=x.numbers.join(' – '),selected=false;
 if(!lead)return `<div class="candidate"><span><b>${num}</b> ${name}${manual?'':hitHTML(r,type,x.numbers)}</span><span class="candidate-metrics"><span class="candidate-probability-label">추정확률</span>${probabilityHTML(x.prob)}</span></div>`;
 const status=selected?'선별 후보':reasons.length?'확인 필요 · 후보 제공':'일반 후보';
 const explanation=type==='pair'?anchorLabel()+'와 연승확률 분석 '+partnerRange.min+'~'+partnerRange.max+'위 중 동반입상확률이 가장 높은 조합':reasons.length?reasons.join(' · '):'전체 경주용 모델의 1순위 후보';
 const pick=isSelected(r,type)?r.selectivePicks[type]:null;
 const selectionHTML=type==='pair'?screeningBadge(r)+policyExplanationHTML(r):pick?'<div class="selective-pick"><span class="selected-tag">선별용 모델 후보</span><strong>'+pick.numbers.join(' – ')+'</strong><span>'+pick.names.map(esc).join(' · ')+'</span><small>추정 '+probabilityHTML(pick.prob)+'</small><small>검증 기준 충족</small></div>':'<p class="hint">'+esc(r.selection?.[type]?.reason||'선별 검증 대기')+'</p>';
 return `<div class="status ${selected?'selected':reasons.length?'hold':''}">${status}</div><div class="lead-number">${num}</div>${manual?'':hitHTML(r,type,x.numbers)}<p class="lead-name">${name}</p><div class="prob"><small>추정 ${type==='place'?'입상':'동반입상'}</small>${probabilityHTML(x.prob)}</div><p class="hint">${esc(explanation)}</p>${selectionHTML}${manual?'':officialResultHTML(r,type,x.numbers)}`;
}
function horseDetailHTML(h){
 const s=h.weighted_v3_support,d=s?.detail;
 if(!d)return '<p class="hint">최근 흐름 상세 자료 미확인 · 기존 지표로 계산</p>';
 const num=(v,digits=1)=>Number.isFinite(v)?v.toFixed(digits):'자료 부족',signed=(v,digits=1)=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(digits):'자료 부족';
 const recent=(d.recent||[]).map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+num(x.finish,0)+' / '+num(x.fieldSize,0)+'두</td><td>'+num(x.form*100)+'점</td><td>'+signed(x.speed)+'초</td></tr>').join('');
 const grade=g=>Number.isInteger(g)?g+'등급':'미확인';
 const conditions='직전 대비 거리 '+(Number.isFinite(d.distanceChange)?signed(d.distanceChange,0)+'m':'미확인')+' · 등급 '+grade(d.previousGrade)+' → '+grade(d.currentGrade)+' · 휴양 '+num(d.restDays,0)+'일 / 평소 '+num(d.usualRestDays,0)+'일';
 const rows=TuningModel.FEATURES.map((f,j)=>{const present=s.available?.[j],count=d.counts?.[j],v=h.weighted_v3_features?.[j];return '<tr><td>'+esc(f.label)+'</td><td>'+num(v*100)+'</td><td>'+(Number.isInteger(count)?count+'건':'미확인')+'</td><td>'+(present===true?'자료·조건 충족':present===false?'자료·조건 부족 · 대체값':'미확인')+'</td></tr>';}).join('');
 return '<details class="horse-detail"><summary>최근 5경주 흐름 · 자료 개수</summary><p class="hint">오래된 경주 → 직전 경주 · '+s.starts+'/5경주 확보</p><div class="table-scroll"><table class="validation-table"><thead><tr><th>경주일</th><th>착순 / 두수</th><th>두수 보정</th><th>보정 기록</th></tr></thead><tbody>'+recent+'</tbody></table></div><p class="hint">착순 추세 '+(Number.isFinite(d.finishTrend)?signed(d.finishTrend*100)+'점/경주':'자료 부족')+' · 기록 추세 '+(Number.isFinite(d.speedTrend)?signed(d.speedTrend)+'초/경주':'자료 부족')+'<br>착순 변동 '+(Number.isFinite(d.finishStd)?num(d.finishStd*100)+'점':'자료 부족')+' · 기록 변동 '+(Number.isFinite(d.speedStd)?num(d.speedStd)+'초':'자료 부족')+'</p><p class="hint">추세는 양수일수록 개선, 변동은 작을수록 안정적입니다. 추세는 자료 수에 따라 0 쪽으로 보정합니다. 보정 기록은 이전 기준 기록보다 빠를수록 높습니다.</p><p class="hint">'+esc(conditions)+'<br>조건 변화는 참고 정보이며 유불리를 일괄 가산하지 않습니다.</p><div class="table-scroll"><table class="validation-table"><thead><tr><th>지표</th><th>점수</th><th>근거</th><th>상태</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="hint">같은 50점이어도 실제 관측값과 대체값을 구분합니다. 근거 수가 적으면 해당 점수의 근거도 제한적입니다. 지표마다 기간과 조건이 다릅니다. 기수·조교사는 이전 365일, 상대 레이팅은 현재 출전마 수, 출전 간격은 이전 간격 수입니다. 추가 지표는 가중치가 0%면 추천 점수에 반영되지 않습니다.</p></details>';
}

function render(){if(!current)return;ranked=analyzeForSite(current);const r=ranked;$('#analysis').hidden=false;$('#raceTitle').textContent=(names[r.venue]||r.venue_name||'직접 입력')+' '+r.race_no+'R';$('#raceMeta').textContent=[r.date,r.title,manual?'직접 입력 / 데모':''].filter(Boolean).join(' · ');$('#horseCount').textContent=r.horses.length+'두';$('#placeRule').textContent=r.k+'착 이내';$('#modeHelp').textContent='연승과 복연승 모두 '+TuningModel.label(tuningSettings.modelMode)+'의 연승확률 분석 순위를 기준으로 합니다. 복연승은 '+anchorLabel()+' + 분석 '+partnerRange.min+'~'+partnerRange.max+'위 중 동반입상확률이 가장 높은 조합입니다.';const warning=timingReasons(r);if(tuningSettings.modelMode==='custom'&&r.horses.some(h=>!h.weighted_v3_features))warning.push('수정 지표 전적 자료가 없는 말은 중립값으로 계산합니다.');$('#raceWarning').hidden=!warning.length;$('#raceWarning').textContent=warning.join(' · ');$('#placeLead').innerHTML=pickHTML(r.places[0],r,'place',true);$('#pairLead').innerHTML=pickHTML(r.pairs[0],r,'pair',true);$('#placeList').innerHTML=r.places.slice(1,5).map(x=>pickHTML(x,r,'place')).join('');$('#pairList').innerHTML='<p class="hint">복연승은 새 기준을 통과한 한 조합만 표시합니다.</p>';$('#horses').innerHTML=r.horses.map(h=>`<div class="horse"><strong>${h.number} ${esc(h.name)} · ${probabilityHTML(h.prob)}</strong><p class="hint">${h.reasons.map(esc).join(' · ')}</p><p class="hint">레이팅 ${esc(h.rating??'—')} · 부담 ${esc(h.burden??'—')}kg · 마체중 ${esc(h.horse_weight??'미발표')} · 데이터 ${Math.round(h.quality*100)}%</p>${horseDetailHTML(h)}</div>`).join('');$('#savePrediction').disabled=!r.pairs.length||manual||!Number.isFinite(start(r))||start(r)<=Date.now()||warning.length>0;renderOverview();}
function select(r,isManual=false){if(r.venue!=='seoul')throw Error('서울 경주만 분석할 수 있습니다.');current=r;manual=isManual;if(names[r.venue])setVenue(r.venue);const d=String(r.date||'');if(/^\d{8}$/.test(d))$('#date').value=d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8);if(r.race_no)$('#raceNo').value=r.race_no;$('#saveStatus').textContent='경주·추천 기준별 최초 기록을 보존합니다.';renderSelectors();render();}
async function fetchJSON(url,timeoutMs=8000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const res=await fetch(url,{cache:'no-store',signal:controller.signal});if(!res.ok)throw Error('HTTP '+res.status);return await res.json();}finally{clearTimeout(timer);}
}
async function fetchLiveDocument(){
 // Workflow commits do not rebuild branch-based Pages. Read the live data branch directly.
 const stamp=Date.now(),urls=['https://raw.githubusercontent.com/kkongt2/betkj3/main/data/latest.json?t='+stamp,'data/latest.json?t='+stamp];
 let last,legacy;
 for(const url of urls){try{const doc=await fetchJSON(url);if(!Array.isArray(doc.races))throw Error('데이터 형식 오류');if(!Array.isArray(doc.calendar)){legacy=doc;continue;}return doc;}catch(e){last=e;}}
 if(legacy)return legacy;
 throw last;
}
async function load(){const id=++requestId;$('#dataStatus').textContent='경주 정보를 확인하는 중…';try{const doc=await fetchLiveDocument();if(id!==requestId)return false;source={...doc,calendar:(doc.calendar||[]).filter(d=>d.venues?.includes('seoul')).map(d=>({...d,venues:['seoul']}))};races=doc.races.filter(r=>r.venue==='seoul');$('#dataStatus').textContent=`갱신 ${doc.updated_at?.replace('T',' ').slice(0,16)||'시각 미확인'} · ${races.length}개 경주`;return true}catch(e){if(id===requestId)$('#dataStatus').textContent='불러오기 실패 · 새로고침을 눌러 다시 시도하세요.';return false}}
function save(){render();if($('#savePrediction').disabled)return;const r=ranked,key=[r.date,r.venue,r.race_no,r.mode].join(':');let all=records();if(all.some(x=>x.id===key)){$('#saveStatus').textContent='이미 기록한 경주입니다. 최초 추천을 유지합니다.';return}const copy=(x,t)=>({numbers:x.numbers,prob:x.prob,held:timingReasons(r).length>0,selected:t==='pair'?screeningEnabled()&&RaceSelectionModel.qualifies(r.screening,screeningValue())&&timingReasons(r).length===0:isSelected(r,t),screening:t==='pair'&&screeningEnabled()?{...r.screening,strictness:screeningValue()}:null,selected_pick:isSelected(r,t)?{numbers:r.selectivePicks[t].numbers,prob:r.selectivePicks[t].prob,model:advancedReport.model}:null,model:r.models[t],...(t==='pair'?{range:{...partnerRange},settings:strategySettings()}:{}),selectionVersion:isSelected(r,t)?advancedReport?.dataset_sha256:null});all.push({id:key,date:r.date,venue:r.venue,race:r.race_no,mode:r.mode,model:r.model,historyThrough:r.history_through||null,saved:new Date().toISOString(),start:start(r),k:r.k,field:r.horses.map(h=>+h.number),place:copy(r.places[0],'place'),pair:copy(r.pairs[0],'pair'),result:null});if(put(all)){$('#saveStatus').textContent='기록했습니다. 경주 후 공식 결과를 입력하세요.';renderHistory();}}
function stat(all,type,mode,selectedOnly=false){const eligible=all.filter(x=>x.mode===mode&&!x[type].held&&(!selectedOnly||x[type].selected===true)),done=eligible.filter(x=>x.result),hit=done.filter(x=>selectedOnly&&x[type].selected_pick?x[type].selected_pick.numbers.every(n=>(type==='place'?x.result.placeWinners:x.result.finish).includes(n)):x.result[type+'Hit']).length,paid=done.filter(x=>!x.result[type+'Hit']||x.result[type+'Odds']!=null),returns=paid.reduce((s,x)=>s+(x.result[type+'Hit']?x.result[type+'Odds']:0),0);return `<div class="stat">${type==='place'?'연승':'복연승'} · ${mode==='accuracy'?(selectedOnly?'선별 후보':'전체 후보'):'수익성'}<b>${done.length?pct(hit/done.length):'—'}</b>${hit}/${done.length} 적중 · 대기 ${eligible.length-done.length}${selectedOnly?'':`<br>환수율 ${paid.length?pct(returns/paid.length):'—'} (${paid.length}건)`}</div>`;}
function renderHistory(){const all=records();$('#stats').innerHTML=['place','pair'].flatMap(t=>[stat(all,t,'accuracy'),stat(all,t,'accuracy',true)]).join('');$('#history').innerHTML=all.length?[...all].reverse().map(x=>`<details class="record"><summary>${esc(names[x.venue]||x.venue)} ${esc(x.date)} ${x.race}R · 적중률 ${x.result?'· 결과 입력됨':''}</summary><p>연승 ${x.place.numbers.join('-')}${x.place.held?' (보류)':''}${x.place.selected_pick?' · 별도 선별 '+x.place.selected_pick.numbers.join('-'):''} / 복연승 ${x.pair.numbers.join('-')}${x.pair.held?' (보류)':''}${x.pair.selected_pick?' · 별도 선별 '+x.pair.selected_pick.numbers.join('-'):''}</p><p>${esc(x.saved.replace('T',' ').slice(0,19))} UTC 저장 · 모델 ${esc(x.model)}</p>${x.result?`<p>공식 착순 ${x.result.finish.join(' → ')} · 연승 ${x.result.placeHit?'적중':'미적중'} / 복연승 ${x.result.pairHit?'적중':'미적중'}</p>`:''}<form data-record="${esc(x.id)}"><label>공식 1·2·3착 마번<input name="finish" required placeholder="예: 2,7,4" value="${x.result?.finish.join(',')||''}"></label><label>공식 연승 입상 마번 (취소로 기준이 바뀐 경우 수정)<input name="placeWinners" required placeholder="예: 2,7,4" value="${x.result?.placeWinners.join(',')||''}"></label><div class="result-fields"><label>추천 연승의 확정 배당<input name="placeOdds" type="number" min="1" step="0.01" placeholder="적중 시 입력" value="${x.result?.placeOdds??''}"></label><label>추천 복연승의 확정 배당<input name="pairOdds" type="number" min="1" step="0.01" placeholder="적중 시 입력" value="${x.result?.pairOdds??''}"></label></div><p class="hint">마사회 확정 결과를 확인해 입력하세요. 동착·환불 경주는 입력하지 마세요.</p><button type="submit" ${Date.now()<x.start?'disabled':''}>${x.result?'결과 수정':'결과 저장'}</button></form></details>`).join(''):'<p class="hint">아직 기록이 없습니다. 경주 전에 추천을 기록해 보세요.</p>';}
$('#history').addEventListener('submit',e=>{e.preventDefault();try{const f=e.target,all=records(),x=all.find(v=>v.id===f.dataset.record);if(!x||Date.now()<x.start)throw Error('경주 시작 후 입력할 수 있습니다.');const nums=v=>v.trim().split(/[,\s]+/).map(Number),finish=nums(f.elements.finish.value),pw=nums(f.elements.placeWinners.value);for(const a of [finish,pw])if(a.some(n=>!x.field.includes(n))||new Set(a).size!==a.length)throw Error('기록된 출전마의 서로 다른 마번을 입력하세요.');if(finish.length!==3||![2,3].includes(pw.length)||pw.some((n,i)=>n!==finish[i]))throw Error('착순 3두와 공식 연승 입상마 2~3두를 착순대로 입력하세요.');const odd=v=>v===''?null:Number(v),po=odd(f.elements.placeOdds.value),qo=odd(f.elements.pairOdds.value);if([po,qo].some(v=>v!==null&&(!Number.isFinite(v)||v<1)))throw Error('배당은 1 이상으로 입력하세요.');x.result={finish,placeWinners:pw,placeHit:pw.includes(x.place.numbers[0]),pairHit:x.pair.numbers.every(n=>finish.includes(n)),placeOdds:po,pairOdds:qo,entered:new Date().toISOString()};if(put(all))renderHistory();}catch(err){alert(err.message)}});
function venueDates(){return [...new Set([...races.filter(r=>r.venue===venue).map(r=>String(r.date)),...(source?.calendar||[]).filter(d=>d.venues.includes(venue)).map(d=>d.date)])].filter(d=>/^\d{8}$/.test(d)&&d>=browseFrom()).sort();}
function dateRaces(d){return races.filter(r=>r.venue===venue&&String(r.date)===d).sort((a,b)=>+a.race_no-+b.race_no);}
function renderOverview(){
 const list=dateRaces($('#date').value.replaceAll('-',''));$('#overview').hidden=!list.length;
 let selected=0;
 $('#raceOverview').innerHTML=list.map(card=>{
  try{
   const r=analyzeForSite(card,'accuracy'),fresh=timingReasons(r).length===0;
   const has=kind=>screeningEnabled()&&fresh&&r.selection?.[kind]?.qualified;
   const screened=RaceSelectionModel.qualifies(r.screening,screeningValue());
   if(screened)selected++;
   if(screeningEnabled()&&$('#screeningOnly').checked&&!screened)return '';
   const cell=kind=>{const x=kind==='place'?r.places[0]:r.pairs[0];if(!x)return '<span><small>복연승</small><small>'+esc(r.qplPolicy?.reason||'분석 순위 확인 필요')+'</small>'+officialResultHTML(card,kind,null,'overview')+'</span>';return '<span><small>'+(kind==='place'?'연승':'복연승')+'</small><b>'+x.numbers.join(' – ')+'</b>'+hitHTML(card,kind,x.numbers)+'<small>'+probabilityHTML(x.prob)+'</small>'+(has(kind)?'<small class="selected-tag">선별 '+r.selectivePicks[kind].numbers.join('–')+'</small>':'')+(kind==='pair'?screeningBadge(r)+'<small class="policy-tag">'+anchorLabel()+' + 분석 '+r.qplPolicy.partner.rank+'위</small>':'')+officialResultHTML(card,kind,x.numbers,'overview')+'</span>'};
   return '<div class="overview-row '+(!manual&&current?.date===r.date&&+current?.race_no===+r.race_no?'active':'')+'" data-overview-race="'+Number(r.race_no)+'"><button type="button" class="overview-select" data-overview-race="'+Number(r.race_no)+'" aria-label="'+Number(r.race_no)+'경주 선택"><b>'+Number(r.race_no)+'R</b><small>'+esc(r.start_time||'')+'</small></button>'+cell('place')+cell('pair')+'</div>';
  }catch{return '<p class="hint">'+Number(card.race_no)+'R · 출전정보 확인 필요</p>'}
 }).join('');
 const enabled=['place','pair'].some(k=>advancedReport?.policies?.[k]?.approved);
 $('#overviewStatus').textContent=!screeningEnabled()?'서울 '+list.length+'경주 · 현재 가중치로 계산한 후보와 실제 결과':'서울 '+list.length+'경주 중 선별 '+selected+'경주 ('+(list.length?selected/list.length*100:0).toFixed(1)+'%) · 엄격도 '+screeningValue()+' · 현재 설정 기준';
 if(screeningEnabled()&&$('#screeningOnly').checked&&!selected)$('#raceOverview').innerHTML='<p class="screening-empty">이 날짜에 선별된 경기가 없습니다. 엄격도를 낮추거나 전체 경기를 표시하세요.</p>';
}
$('#raceOverview').addEventListener('click',e=>{const b=e.target.closest('[data-overview-race]');if(!b)return;const r=dateRaces($('#date').value.replaceAll('-','')).find(x=>+x.race_no===+b.dataset.overviewRace);if(r)select(r);});
function renderSelectors(){
 const allDates=venueDates(),selected=$('#date').value.replaceAll('-',''),months=[...new Set(allDates.map(d=>d.slice(0,6)))].reverse();
 const selectedMonth=selected.slice(0,6)||months[0]||'';
 $('#calendarMonth').innerHTML=months.map(m=>'<option value="'+m+'">'+m.slice(0,4)+'년 '+Number(m.slice(4))+'월</option>').join('');$('#calendarMonth').value=selectedMonth;
 const dates=allDates.filter(d=>d.startsWith(selectedMonth));let month='';
 $('#dateCalendar').innerHTML=dates.length?dates.map(d=>{
  const key=d.slice(0,6),heading=month!==key?'<div class="calendar-month">'+d.slice(0,4)+'년 '+Number(d.slice(4,6))+'월</div>':'';month=key;
  const weekday=new Intl.DateTimeFormat('ko-KR',{weekday:'short',timeZone:'Asia/Seoul'}).format(new Date(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T12:00:00+09:00'));
  return heading+'<button type="button" data-date="'+d+'" aria-pressed="'+(d===selected)+'" aria-label="'+d.slice(0,4)+'년 '+Number(d.slice(4,6))+'월 '+Number(d.slice(6,8))+'일 '+weekday+'요일" class="date-choice '+(d===selected?'active':'')+'"><span>'+weekday+'</span><strong>'+Number(d.slice(6,8))+'</strong></button>';
 }).join(''):'<p class="hint">서울에 공개된 경주일이 없습니다.</p>';
 const list=dateRaces(selected);$('#raceButtons').innerHTML=list.length?list.map(r=>'<button type="button" data-race="'+Number(r.race_no)+'" aria-pressed="'+(+r.race_no===+$('#raceNo').value)+'" class="race-choice '+(+r.race_no===+$('#raceNo').value?'active':'')+'">'+Number(r.race_no)+'R</button>').join(''):'<p class="hint">선택 가능한 경주가 없습니다.</p>';
}
async function chooseAvailable(){
 const request=++selectionRequest;
 const dates=venueDates();let d=$('#date').value.replaceAll('-','');if(!dates.includes(d))d=dates.find(x=>x>=day().replaceAll('-',''))||dates.at(-1)||'';
 $('#date').value=d?d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8):'';
 const archiveNeeded=d<day().replaceAll('-','')&&(source?.calendar||[]).some(x=>x.date===d)&&!dateRaces(d).every(r=>r.calendar_archive||r.archiveLoaded);
 if(d&&(!dateRaces(d).length||archiveNeeded)){
  const requestedVenue=venue;current=null;ranked=null;$('#analysis').hidden=true;$('#overview').hidden=true;renderSelectors();
  $('#dataStatus').textContent=d+' 경주를 불러오는 중…';
  try{
   const doc=await fetchPublicJSON('data/calendar/'+d+'.json');
   if(request!==selectionRequest)return;
   if(doc.date!==d||!Array.isArray(doc.races)||doc.races.some(r=>r.date!==d)||!doc.races.some(r=>r.venue===requestedVenue))throw Error('날짜별 경주 확인 필요');
   races=races.filter(r=>r.date!==d).concat(doc.races.filter(r=>r.venue==='seoul').map(r=>({...r,archiveLoaded:true})));
   $('#dataStatus').textContent=d+' · '+dateRaces(d).length+'개 경주';
  }catch{if(request===selectionRequest)$('#dataStatus').textContent='지난 경주를 불러오지 못했습니다. 날짜를 다시 누르거나 새로고침해 주세요.';return;}
 }
 const list=dateRaces(d),r=list.find(x=>+x.race_no===+$('#raceNo').value)||list[0];
 if(r)select(r);else{current=null;ranked=null;$('#analysis').hidden=true;$('#raceNo').value='';renderSelectors();renderOverview();}
}
$('#date').value=day();$('#raceNo').value='1';renderSelectors();
$('#calendarMonth').onchange=()=>{const d=venueDates().find(d=>d.startsWith($('#calendarMonth').value));if(d){$('#date').value=d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8);$('#raceNo').value='1';chooseAvailable();}};
document.querySelectorAll('[data-venue]').forEach(b=>b.onclick=()=>{setVenue(b.dataset.venue);chooseAvailable();});
function showSelected(){chooseAvailable();}
$('#dateCalendar').addEventListener('click',e=>{const b=e.target.closest('button[data-date]');if(!b||!venueDates().includes(b.dataset.date))return;const d=b.dataset.date;$('#date').value=d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8);$('#raceNo').value='1';chooseAvailable();});
$('#raceButtons').addEventListener('click',e=>{const b=e.target.closest('button[data-race]');if(!b)return;const r=dateRaces($('#date').value.replaceAll('-','')).find(x=>+x.race_no===+b.dataset.race);if(r)select(r);});
$('#loadBtn').onclick=async()=>{if(await load())chooseAvailable();await loadQplHistory()};$('#nextBtn').onclick=async()=>{if(!await load())return;const future=races.filter(x=>x.venue===venue&&start(x)>Date.now()).sort((a,b)=>start(a)-start(b));if(future[0])select(future[0]);else{chooseAvailable();$('#dataStatus').textContent='서울의 예정 경주가 없습니다.';}};
$('#savePrediction').onclick=save;$('#manualBtn').onclick=()=>{try{const r=JSON.parse($('#manualJson').value);analyze(r);select(r,true)}catch(e){alert('출전마 JSON을 확인하세요. '+e.message)}};
$('#demoBtn').onclick=()=>select({venue,date:day().replaceAll('-',''),race_no:1,title:'데모 · 실제 경주 아님',horses:Array.from({length:8},(_,i)=>({number:i+1,name:'샘플 '+(i+1),rating:50-i*2,burden:54,starts_1y:10,wins_1y:i<2?2:0,seconds_1y:2,thirds_1y:1,distance_starts:5,distance_top3:i<3?3:1,recent_finishes:[i+1,3,5],jockey_stats_1y:{place_rate:.3},trainer_stats_1y:{place_rate:.25},horse_weight:480}))},true);
$('#lockBtn').onclick=()=>{$('#lockScreen').hidden=false;$('#pinInput').focus()};$('#unlockBtn').onclick=()=>{if($('#pinInput').value==='1234'){$('#lockScreen').hidden=true;$('#pinInput').value='';$('#lockError').textContent=''}else $('#lockError').textContent='PIN이 다릅니다.';};
async function fetchPublicJSON(path){
 for(const url of ['https://raw.githubusercontent.com/kkongt2/betkj3/main/'+path,path]){
  try{return await fetchJSON(url+'?t='+Date.now());}catch{}
 }
 throw Error('불러오기 실패');
}
initPartnerRange();initTuning();initScreening();initWeightCurves();initStrategyPresets();initWeightSearch();RollingPanel.init(applySavedStrategy);Top5Panel.init(applySavedStrategy,()=>refreshPresetOptions());loadQplHistory();renderHistory();load().then(ok=>{if(!ok)return;const future=races.filter(x=>start(x)>Date.now()).sort((a,b)=>start(a)-start(b));if(future[0])select(future[0]);else showSelected()});
// Expire selection badges even when the user keeps the page open across the start time.
if(typeof setInterval==='function')setInterval(()=>{if(current)render();},60000);
document.addEventListener?.('visibilitychange',()=>{if(!document.hidden&&current)render();});

