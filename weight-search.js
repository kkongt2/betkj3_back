'use strict';
const WeightSearch=(()=>{
 function fixedView(v){
  if(!v)return '<p class="hint">탐색 완료 후 현재 최고 조합의 연도별 성적을 재계산합니다.</p>';
  const pct=x=>x===null?'—':(100*x).toFixed(2)+'%',odds=x=>x===null?'—':x.toFixed(4)+'배';
  return '<div id="fixedYearResults"><p><b>현재 최고 조합 · 2024년 이후 재계산 · '+odds(v.metrics.product)+'</b><br>적중률 '+pct(v.metrics.rate)+' · 평균 적중배당 '+odds(v.metrics.average)+'<br>적중 '+v.all.hits+' / 평가 '+v.all.evaluated+'경주 · 실제 선택 '+pct(v.all.total?v.all.evaluated/v.all.total:null)+'</p><table class="validation-table"><thead><tr><th>평가 연도</th><th>선택 비율</th><th>적중률 × 배당</th></tr></thead><tbody>'+v.years.map(f=>'<tr data-year="'+f.year+'"><td>'+f.year+'</td><td>'+pct(f.all.total?f.all.evaluated/f.all.total:null)+'</td><td>'+odds(f.metrics.product)+'</td></tr>').join('')+'</tbody></table><p class="hint">'+(v.years.length?'위 최고 조합의 가중치·축마·상대 순위·경기 선별 기준을 모든 연도에 동일하게 적용했습니다. 연도별 실제 선택 비율은 달라질 수 있습니다.':'2024년 이후 평가할 경주 자료가 없습니다.')+' '+v.from+'~'+v.to+' 자료 기준. 해당 기간 결과도 조합 탐색에 사용했으므로 독립적인 미래 성능 검증은 아닙니다.</p></div>';
 }
 function jointView(candidate){
  const j=candidate.joint,pct=x=>x===null?'—':(100*x).toFixed(2)+'%',odds=x=>x===null?'—':x.toFixed(4)+'배';
  return '<p><b>목표 '+j.target+'% · 선별 기준 '+candidate.settings.screening.threshold+'점 이상</b></p><table class="validation-table"><thead><tr><th>목표 비율</th><th>실제 선택</th><th>과거 탐색 최고</th></tr></thead><tbody>'+j.ratios.map(r=>'<tr><td>'+r.target+'%</td><td>'+pct(r.ratio)+'</td><td>'+odds(r.product)+'</td></tr>').join('')+'</tbody></table><p class="hint">각 비율에서 찾은 가중치와 선별 기준은 서로 다를 수 있습니다. 적용·저장은 선택한 목표 '+j.target+'% 결과입니다. 다른 비율을 적용하려면 목표 비율을 바꾸고 다시 탐색하세요.</p>'+fixedView(j.fixed)+'<details><summary>적용할 경기 선별 기준 보기</summary><table class="validation-table"><tbody>'+j.modelLabels.map((label,i)=>'<tr><td>'+label+'</td><td>'+candidate.settings.screening.coefficients[i]+'</td></tr>').join('')+'</tbody></table><p class="hint">양수는 값이 클수록, 음수는 값이 작을수록 선별 점수를 높입니다. 배당은 과거 성과 평가에만 사용하며 경기 전 선별 입력에는 사용하지 않습니다.</p></details>';
 }
 function init(api){
  const el=id=>document.getElementById(id),start=el('startWeightSearch'),stop=el('stopWeightSearch'),status=el('weightSearchStatus'),result=el('weightSearchResult'),apply=el('applyWeightSearch'),save=el('saveWeightSearch');
  const labels={rate:'적중률',average:'평균 적중배당',product:'적중률 × 평균배당'};
  const methodLabels={local:'기존 혼합 탐색',de:'전역 탐색 · 차분 진화(DE)'};
  const methodControl=el('weightSearchMethod'),parallelControl=el('weightSearchParallel'),runnerDuration=el('runnerSearchDuration');
  try{parallelControl.checked=localStorage.getItem('betkj3-search-parallel')!=='false';}catch{}
  const workerLabel=p=>p.workers>1?'병렬 '+p.workers+'개 작업':'단일 작업';
  try{methodControl.value=localStorage.getItem('betkj3-search-method')==='de'?'de':'local';}catch{methodControl.value='local';}
  function methodHelp(){el('weightSearchMethodHelp').textContent=methodControl.value==='de'?'후보군 12개를 여러 지점에서 시작해 교차·변이·재시작합니다. 여러 가중치를 동시에 변경하며 결과는 합계 100%, 1% 단위입니다. 우선 1~2분으로 시도하세요. 전역 최적해 보장 아님 · 선택한 순위 범위와 균형 제한 안에서 탐색합니다. 공동 탐색의 선별 계수는 기존 12개 후보를 비교합니다.':'좋은 후보 근처에서 1·2·5·10%를 이동하고 무작위 조합도 섞습니다. 전역 최적해 보장 아님 · 선택한 순위 범위와 균형 제한 안에서 탐색합니다.';}
  methodHelp();
  let token=0,busy=false,snapshot='',best=null;
  const key=()=>JSON.stringify([api.settings(),api.dataKey()]);
  const options=()=>{const minutes=Number(el('weightSearchMinutes').value);if(!Number.isInteger(minutes)||minutes<1||minutes>300)throw Error('탐색 시간은 1~300분 정수로 입력하세요.');return {seconds:minutes*60,parallel:parallelControl.checked,method:methodControl.value,objective:el('weightSearchGoal').value,balanced:el('weightSearchBalanced').checked,settings:api.settings(),joint:el('weightSearchMode').value==='joint',target:+el('weightSearchTarget').value};};
  const runnerOptions=()=>{const out=options(),choice=runnerDuration?.value||'current';if(choice==='current')return out;const seconds=Number(choice);if(![86400,172800].includes(seconds))throw Error('Runner 탐색 시간을 확인해 주세요.');return {...out,seconds};};
  const runner=RunnerSearchPanel.init({options:runnerOptions,canPrepare:()=>!busy,receive:async report=>{
   invalidate('현재 최고 조합의 연도별 성적을 재계산 중…');const id=++token,o=report.request;let out=report.result;
   busy=true;snapshot=key();buttons();stop.disabled=true;api.pause(true);
   try{
    if(o.joint&&out.best)out=await api.recalculate(report);
    if(id!==token||!out)return false;
    methodControl.value=o.method;methodHelp();el('weightSearchGoal').value=o.objective;el('weightSearchMode').value=o.joint?'joint':'all';el('weightSearchTarget').value=String(o.target);el('weightSearchGoal').disabled=o.joint;el('weightSearchTarget').disabled=!o.joint;
    best=out.best;display(best);status.textContent='Runner 탐색 완료 · '+workerLabel(out)+' · '+out.count.toLocaleString()+'회 평가 · '+(out.elapsed/60).toFixed(2)+'분 · '+(best?'검산 완료 · 적용 버튼을 누르면 반영됩니다.':'조건을 만족한 후보 없음');return true;
   }catch(e){if(id===token){best=null;result.textContent='';status.textContent='Runner 결과 재계산 실패: '+e.message;}throw e;}
   finally{if(id===token){busy=false;buttons();api.pause(false);}}
  }});
  function buttons(){start.disabled=busy;stop.disabled=!busy;apply.disabled=save.disabled=busy||!best;}
  function display(candidate){if(!candidate){result.textContent='조건을 만족한 후보가 아직 없습니다.';return;}const m=candidate.metrics,g=candidate.all,s=candidate.settings;
   result.innerHTML='<p><b>'+labels[el('weightSearchGoal').value]+' 기준 탐색 중 최고</b> · '+methodLabels[methodControl.value]+'<br>'+'연승확률 분석 '+s.anchorRank+'위 축마 · 두 번째 말 분석 '+s.min+'~'+s.max+'위</p><div class="search-metrics"><span>적중률<strong>'+(m.rate*100).toFixed(2)+'%</strong></span><span>평균 적중배당<strong>'+m.average.toFixed(3)+'배</strong></span><span>적중률 × 평균배당<strong>'+m.product.toFixed(4)+'배</strong></span></div><p class="hint">적중 '+g.hits.toLocaleString()+' / 평가 '+g.evaluated.toLocaleString()+'경주 · 전체 '+g.total.toLocaleString()+'경주의 '+(g.evaluated/g.total*100).toFixed(2)+'%</p>'+(candidate.joint?jointView(candidate):HistorySummary.comparison(candidate.comparison))+'<details><summary>탐색 가중치 '+TuningModel.FEATURES.length+'개 보기</summary><table class="validation-table"><tbody>'+TuningModel.FEATURES.map((f,i)=>'<tr><td>'+f.label+'</td><td>'+s.weights[i]+'%</td></tr>').join('')+'</tbody></table></details>';
  }
  function invalidate(message){token++;api.abort();busy=false;best=null;api.pause(false);buttons();result.textContent='';status.textContent=message;}
  function refresh(){runner.changed();if(snapshot&&snapshot!==key()){snapshot='';invalidate('설정 또는 자료가 바뀌었습니다. 현재 설정으로 다시 탐색하세요.');}}
  start.onclick=async()=>{
   const minutes=Number(el('weightSearchMinutes').value);if(!Number.isInteger(minutes)||minutes<1||minutes>300){status.textContent='탐색 시간은 1~300분 정수로 입력하세요.';return;}const seconds=minutes*60;
   if(!api.dataKey()){status.textContent='과거 자료를 불러온 뒤 시작해 주세요.';return;}
   const id=++token;snapshot=key();busy=true;best=null;buttons();api.pause(true);display(null);status.textContent='2022년 이후 자료 준비 중… (준비 시간은 탐색 시간에서 제외)';
   try{const out=await api.run({seconds,parallel:parallelControl.checked,method:methodControl.value,objective:el('weightSearchGoal').value,balanced:el('weightSearchBalanced').checked,settings:api.settings(),joint:el('weightSearchMode').value==='joint',target:+el('weightSearchTarget').value},p=>{
    if(id!==token)return;display(p.best);stop.disabled=p.phase==='verifying';status.textContent=p.phase==='preparing'?(p.fallback?'병렬 작업을 시작하지 못해 단일 작업을 준비합니다…':workerLabel(p)+' 준비 중… (준비 시간 제외)'):p.phase==='verifying'?'최고 후보를 기존 통계 계산으로 검산 중…':workerLabel(p)+' · '+(p.elapsed/60).toFixed(2)+' / '+minutes+'분 · '+p.count.toLocaleString()+'회 평가'+(p.evolution?' · 전체 후보군 '+p.evolution.population+'/'+p.evolution.populationSize+' · '+p.evolution.generations+'세대':'');
   });if(id!==token)return;best=out?.best||null;display(best);status.textContent=out?(out.stopped?'중지 완료':'탐색 완료')+' · '+methodLabels[out.method||'local']+' · '+workerLabel(out)+' · '+(out.elapsed/60).toFixed(2)+'분 · '+out.count.toLocaleString()+'회 평가'+(out.failedWorkers?' · 응답 없는 작업 '+out.failedWorkers+'개 제외':'')+(best?' · 검산 완료':' · 적중률 15%·평가 비율 40% 조건을 만족한 조합이 없습니다. 시간을 늘리거나 순위 범위를 바꿔 주세요.'):'탐색이 취소되었습니다.';
   }catch(e){if(id===token){best=null;result.textContent='';status.textContent='탐색 실패: '+e.message;}}
   finally{if(id===token){busy=false;buttons();api.pause(false);}}
  };
  stop.onclick=()=>{api.stop();stop.disabled=true;status.textContent='중지 후 완료된 후보 중 최고 조합을 검산합니다…';};
  apply.onclick=()=>{if(!best)return;const selected=best; snapshot='';const saved=api.apply(selected.settings);snapshot=key();status.textContent='탐색 결과를 적용했습니다.'+(selected.settings.screening?' 선별 ON/OFF 상태는 유지됩니다. 위 경기 선별 사용을 켜면 적용한 기준으로 표시됩니다.':'')+(saved?' 이 기기의 현재 설정에 저장했습니다.':' 현재 설정 자동 저장에 실패했습니다.');};
  save.onclick=()=>{if(!best)return;try{const name='자동탐색 '+labels[el('weightSearchGoal').value]+' '+new Date().toISOString().slice(0,19).replace('T',' ');api.save(name,best.settings);status.textContent='“'+name+'” 설정을 저장했습니다. 저장한 설정에서 불러올 수 있습니다.';}catch(e){status.textContent='저장 실패: '+e.message;}};
  if(runnerDuration)runnerDuration.onchange=()=>runner.changed();
  for(const id of ['weightSearchParallel','weightSearchMethod','weightSearchMinutes','weightSearchGoal','weightSearchBalanced','weightSearchMode','weightSearchTarget'])el(id).onchange=()=>{runner.changed();if(id==='weightSearchParallel'){try{localStorage.setItem('betkj3-search-parallel',String(parallelControl.checked));}catch{}}if(id==='weightSearchMethod'){methodHelp();try{localStorage.setItem('betkj3-search-method',methodControl.value);}catch{}}if(id==='weightSearchMode'&&el('weightSearchMode').value==='joint')el('weightSearchBalanced').checked=false;if(el('weightSearchMode').value==='joint')el('weightSearchGoal').value='product';el('weightSearchGoal').disabled=el('weightSearchMode').value==='joint';el('weightSearchTarget').disabled=el('weightSearchMode').value!=='joint';snapshot='';invalidate('탐색 조건을 변경했습니다. 시작 버튼을 눌러 주세요.');};
  buttons();return {refresh,reset:()=>{snapshot='';invalidate('자료를 다시 준비합니다. 잠시 후 탐색을 시작해 주세요.');}};
 }
 return {init};
})();
