'use strict';
const Top5Panel=(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function init(apply,refresh){
  const root=document.querySelector('#top5Presets'),status=document.querySelector('#top5Status');
  try{
   const response=await fetch('top5-presets.json?v=analysis-rank-2-'+Date.now(),{cache:'no-store'});if(!response.ok)throw Error();const r=await response.json();
   if(r.scope!=='seoul'||r.version!==TuningModel.VERSION||r.presets?.length!==1||!r.weightBalance||r.presets.some(p=>p.settings.weights.some(w=>w<3||w>20)))throw Error();
   const configs=r.presets.map(p=>StrategyPresets.config(p.settings));
   try{if(StrategyPresets.replaceGenerated(localStorage,r.presets.map((p,i)=>({name:p.name,settings:configs[i]})),r.generatedAt+'-analysis-only-1')){refresh();status.textContent='이전 자동 프리셋을 정리하고 1번 프리셋만 저장했습니다.';}}catch(e){status.textContent='자동 저장하지 못했습니다. '+e.message;}
   root.innerHTML=r.presets.map((p,i)=>{const c=configs[i];return '<article class="preset-candidate"><h3>'+esc(p.name)+'</h3><p><strong>연승확률 분석 '+(c.anchorRank||1)+'위 축마 · 두 번째 말 분석 '+c.min+'~'+c.max+'위</strong></p><p class="hint">추천 선정에는 배당을 사용하지 않습니다. 현재 기준의 과거 성적은 아래 복연승 과거 적중 통계에서 이 프리셋을 적용한 뒤 확인하세요.</p><button type="button" data-top5="'+i+'">프리셋 '+p.rank+' 적용·저장</button><details><summary>'+TuningModel.FEATURES.length+'개 가중치 보기</summary><table class="validation-table"><thead><tr><th>요소</th><th>가중치</th></tr></thead><tbody>'+TuningModel.FEATURES.map((f,j)=>'<tr><td>'+esc(f.label)+'</td><td>'+c.weights[j]+'%</td></tr>').join('')+'</tbody></table></details></article>';}).join('');
   const saveAll=document.querySelector('#saveAllTopPresets');saveAll.hidden=false;saveAll.onclick=()=>{try{StrategyPresets.replaceGenerated(localStorage,r.presets.map((p,i)=>({name:p.name,settings:configs[i]})),r.generatedAt+'-analysis-only-1',true);refresh();status.textContent='1번 프리셋을 저장했습니다. 현재 적용된 설정은 유지됩니다.';}catch(e){status.textContent='저장하지 못했습니다. '+e.message;}};
   root.addEventListener('click',event=>{const button=event.target.closest('[data-top5]');if(!button)return;const i=Number(button.dataset.top5);if(!Number.isInteger(i)||!configs[i])return;apply(configs[i]);document.querySelector('#presetName').value=r.presets[i].name;document.querySelector('#saveStrategy').onclick();status.textContent=r.presets[i].name+'을 적용했습니다. '+document.querySelector('#presetStatus').textContent;});
  }catch{root.textContent='1번 프리셋을 불러오지 못했습니다. 새로고침해 주세요.';}
 }
 return {init};
})();
