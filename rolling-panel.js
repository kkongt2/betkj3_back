'use strict';
const RollingPanel=(()=>{
 const pct=x=>(x*100).toFixed(1)+'%',esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const row=(label,g)=>{const m=QplHistoryEngine.metrics(g);return '<tr><td>'+esc(label)+'</td><td>'+g.hits+' / '+g.evaluated+'<br><small>대상 '+g.total+' · '+pct(g.evaluated/g.total)+'</small></td><td>'+pct(m.rate??0)+'</td><td>'+(m.average?.toFixed(2)??'—')+'</td><td>'+(m.product?.toFixed(3)??'—')+'</td></tr>';};
 const table=body=>'<div class="table-scroll"><table class="validation-table"><thead><tr><th>평가</th><th>적중 / 경주</th><th>적중률</th><th>평균배당</th><th>곱</th></tr></thead><tbody>'+body+'</tbody></table></div>';
 async function init(apply){
  const root=document.querySelector('#rollingReport'),button=document.querySelector('#applyRolling'),status=document.querySelector('#rollingStatus');
  try{
   const response=await fetch('rolling-report.json?v=analysis-rank-1-'+Date.now(),{cache:'no-store'});if(!response.ok)throw Error();const r=await response.json();
   if(r.scope!=='seoul'||r.version!==TuningModel.VERSION||r.policyVersion!==Betkj3Policy.VERSION||!r.folds?.length)throw Error();
   const config=StrategyPresets.config(r.live.settings),g=r.selected.all;
   root.innerHTML='<p class="hint">'+esc(r.from)+' ~ '+esc(r.to)+' · '+r.folds.length+'개 분기 · 전체 서울 자료 '+r.sourceRaces.toLocaleString()+'경주<br>이전 24·36개월 중 마지막 3개월로 선택 → 다음 3개월 평가<br>최소 평가 조건: 각 분기 서울 전체 경주의 40% 이상</p>'+table(row('분기별 고정 조합',g))+'<p class="hint">분기별 설정을 당시 이전 자료로 정해 연결한 결과입니다. 현재 가중치로 전체 과거를 재계산한 아래 통계와 다릅니다.<br>일마감 최대 낙폭: 경주당 베팅액의 '+r.selected.maxDrawdown.toFixed(1)+'배</p><details><summary>보정 기록 방식 비교</summary>'+table(r.recordComparison.map(x=>row(x.label,x.all)).join(''))+'</details><details><summary>분기별 서울 평가</summary>'+table(r.folds.map(f=>row(f.from.slice(0,4)+'년 '+(Math.floor((+f.from.slice(4,6)-1)/3)+1)+'분기'+(f.partial?' (진행중)':''),f.selected)).join(''))+'<p class="hint">'+r.folds.map(f=>esc(f.from)+' · '+f.months+'개월 · '+esc(f.style)).join('<br>')+'</p></details><p><strong>최근 서울 검증 선택 조합</strong><br>'+'연승확률 분석 '+(config.anchorRank||1)+'위 축마 · 분석 '+config.min+'~'+config.max+'위<br>'+esc(r.live.style)+' · '+r.live.months+'개월</p><details><summary>서울 선택 가중치</summary><div class="table-scroll"><table class="validation-table"><thead><tr><th>지표</th><th>가중치</th></tr></thead><tbody>'+TuningModel.FEATURES.map((f,i)=>'<tr><td>'+esc(f.label)+'</td><td>'+config.weights[i]+'%</td></tr>').join('')+'</tbody></table></div></details><p class="hint">'+esc(r.note)+'</p>';
   button.hidden=false;button.onclick=()=>{const saved=apply(config);status.textContent='서울 검증 선택 조합을 불러왔습니다.'+(saved?' 이름을 정해 현재 설정 저장을 누르면 보관됩니다.':' 자동 저장에는 실패했습니다.');};
  }catch{root.textContent='분석순위 기준 반복 검증 결과를 준비 중입니다.';button.hidden=true;}
 }
 return {init};
})();
