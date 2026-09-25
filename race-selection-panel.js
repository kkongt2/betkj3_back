'use strict';
const RaceSelectionPanel=(()=>{
 const pct=x=>x===null?'—':(x*100).toFixed(2)+'%',odds=x=>x===null?'—':x.toFixed(4)+'배';
 function plot(data,value){
  const valid=data.points.filter(p=>p.product!==null);if(!valid.length)return '<p class="hint">평가할 수 있는 경기가 없습니다.</p>';
  const hi=Math.max(1.2,...valid.map(p=>p.product))*1.05,x=v=>42+v*2.96,y=v=>152-v/hi*120;
  let path='',started=false;for(const p of data.points){if(p.product===null){started=false;continue;}path+=(started?' L':'M')+x(p.strictness).toFixed(2)+','+y(p.product).toFixed(2);started=true;}
  const p=data.points[value];
  return '<svg class="screening-plot" viewBox="0 0 360 190" role="img" aria-label="엄격도별 선별 경기의 적중률 곱하기 평균배당"><title>가로축 엄격도 · 세로축 적중률 × 평균배당</title>'+[0,1,hi].map(v=>'<line x1="42" x2="338" y1="'+y(v)+'" y2="'+y(v)+'" class="curve-grid"/><text x="36" y="'+(y(v)+4)+'" text-anchor="end">'+v.toFixed(2)+'</text>').join('')+'<path class="curve-line" d="'+path+'"/><line class="curve-marker" x1="'+x(value)+'" x2="'+x(value)+'" y1="26" y2="158"/>'+(p.product!==null?'<circle class="curve-current-dot" cx="'+x(value)+'" cy="'+y(p.product)+'" r="4"/>':'')+'<text x="42" y="178">0 · 전체</text><text x="190" y="178" text-anchor="middle">엄격도 50</text><text x="338" y="178" text-anchor="end">100 · 없음</text></svg>';
 }
 function view(data,value){
  const p=data.points[value],base=data.points[0],delta=p.product===null||base.product===null?null:p.product-base.product;
  return '<div class="screening-metrics"><div>실제 경기 선택 비율<strong id="screeningRatio">'+pct(p.ratio)+'</strong><small id="screeningCount">'+p.evaluated.toLocaleString()+' / '+p.total.toLocaleString()+'경기</small></div><div class="screening-primary">선별 후 적중률 × 평균배당<strong id="screeningProduct">'+odds(p.product)+'</strong><small>'+(delta===null?'선택 경기 또는 배당 자료 부족':'전체 대비 '+(delta>=0?'+':'')+delta.toFixed(4)+'배')+'</small></div></div><div class="screening-detail"><span>적중률 <b id="screeningRate">'+pct(p.rate)+'</b></span><span>평균 적중 배당 <b id="screeningAverage">'+odds(p.average)+'</b></span><span>적중 <b>'+p.hits.toLocaleString()+' / '+p.evaluated.toLocaleString()+'</b></span></div><p class="hint">전체 평가 가능 경기: '+base.evaluated.toLocaleString()+'경기 · '+odds(base.product)+'<br>선별 제외 '+(data.eligible-p.evaluated).toLocaleString()+'경기 · 조합/결과 자료 부족 '+data.unavailable.toLocaleString()+'경기'+(p.paidHits!==p.hits?'<br>적중 배당 미확인 '+(p.hits-p.paidHits)+'건 · 곱 계산 보류':'')+'</p>'+(p.evaluated===0?'<p class="screening-empty">선택된 평가 경기가 없습니다. 엄격도를 낮춰 주세요.</p>':'')+plot(data,value)+'<table class="validation-table screening-table"><thead><tr><th>엄격도</th><th>실제 선택 비율</th><th>적중률 × 배당</th></tr></thead><tbody>'+[0,25,50,75,100].map(v=>{const point=data.points[v];return '<tr'+(v===value?' class="active"':'')+'><td><button type="button" class="quiet" data-screening-level="'+v+'">'+v+'</button></td><td>'+pct(point.ratio)+'</td><td>'+odds(point.product)+'</td></tr>';}).join('')+'</tbody></table>';
 }
 function badge(screening,value){
  if(!screening?.available)return '<small class="screening-badge skipped">선별 불가 · 조합 없음</small>';
  const selected=RaceSelectionModel.qualifies(screening,value);
  return '<small class="screening-badge '+(selected?'chosen':'skipped')+'">'+(selected?'선별 통과':'선별 제외')+' · '+screening.score.toFixed(1)+'점 / 기준 '+value+'</small>';
 }
 function init(api){
  const range=document.querySelector('#screeningStrictness'),input=document.querySelector('#screeningStrictnessNumber'),root=document.querySelector('#screeningStats');
  const toggle=document.querySelector('#screeningEnabled');
  let value=0,data=null,enabled=false;
  try{value=RaceSelectionModel.strictness(localStorage.getItem('betkj3-screening-strictness'));}catch{}
  try{enabled=localStorage.getItem('betkj3-screening-enabled')==='true';}catch{}
  function sync(){
   toggle.checked=enabled;
   const model=api.model?.();document.querySelector('#screeningModelInfo').textContent=model?'공동 탐색 선별 모델 · 목표 '+model.target+'% · 축마/상대마 격차, 출전 두수, 전적 및 마체중 자료 등 12개 지표. 점수는 적중확률이 아닙니다. 엄격도를 조절하면 목표 비율과 달라질 수 있습니다.':'기존 고정 규칙 모델 · 조합 안정성 35%, 전적 충실도 25%, 경쟁마 격차 25%, 동반입상확률 우위 15%. 공동 탐색 결과를 적용하면 별도 선별 기준으로 전환됩니다.';
   document.querySelector('#screeningControls').hidden=!enabled;
   document.querySelector('#screeningToggleStatus').textContent=enabled?'ON · 경기 선별 사용 중':'OFF · 경기 선별을 사용하지 않습니다.';
   document.querySelector('#screeningOnlyControl').hidden=!enabled;
   document.querySelector('#screeningOnly').disabled=!enabled;
   if(!enabled)document.querySelector('#screeningOnly').checked=false;
   range.value=String(value);input.value=String(value);
   document.querySelector('#screeningLevel').textContent=value===0?'전체 선택':value===100?'선택 없음':'선별 점수 '+value+'점 이상';
   if(data&&enabled)root.innerHTML=view(data,value);
  }
  toggle.onchange=()=>{enabled=toggle.checked;try{localStorage.setItem('betkj3-screening-enabled',String(enabled));}catch{}sync();api.change(value);};
  function set(next){if(!enabled)return;value=RaceSelectionModel.strictness(next);try{localStorage.setItem('betkj3-screening-strictness',String(value));}catch{}sync();api.change(value);}
  range.oninput=()=>set(range.value);input.oninput=()=>{if(input.value.trim()!==''&&Number.isFinite(+input.value))set(input.value);};input.onchange=()=>set(input.value);
  document.querySelector('#screeningLess').onclick=()=>set(value-1);document.querySelector('#screeningMore').onclick=()=>set(value+1);
  root.addEventListener('click',e=>{const b=e.target.closest('[data-screening-level]');if(b)set(+b.dataset.screeningLevel);});
  sync();return {value:()=>value,enabled:()=>enabled,applyModel(model){value=model?.threshold??0;data=null;try{localStorage.setItem('betkj3-screening-strictness',String(value));}catch{}sync();},pending(){data=null;root.setAttribute('aria-busy','true');root.textContent='현재 조합 설정으로 경기 선별 점수를 계산하는 중…';},show(result){data=result;root.setAttribute('aria-busy','false');sync();},error(){data=null;root.setAttribute('aria-busy','false');root.textContent='선별 통계를 불러오지 못했습니다. 과거 통계 다시 불러오기를 눌러 주세요.';}};
 }
 return {init,view,badge};
})();
if(typeof module!=='undefined')module.exports=RaceSelectionPanel;
