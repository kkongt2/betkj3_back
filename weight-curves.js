'use strict';
const WeightCurves=(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=x=>x===null?'—':x.toFixed(3)+'배',pct=x=>x===null?'—':(x*100).toFixed(2)+'%';
 function view(result,settings,index){
  const current=result.points[settings.weights[index]],available=result.points.filter(p=>p.valid&&p.product!==null);
  if(!available.length)return '<p class="curve-empty">평가할 수 있는 경주가 없습니다. 축마와 순위 범위를 확인하세요.</p>';
  const best=available.reduce((a,b)=>b.product>a.product?b:a),min=Math.min(...available.map(p=>p.product)),max=Math.max(...available.map(p=>p.product));
  const pad=Math.max(.025,(max-min)*.12),lo=Math.max(0,Math.min(1,min-pad)),hi=Math.max(1,max+pad),x=v=>52+v*2.92,y=v=>164-(v-lo)/(hi-lo)*128;
  let path='',started=false;for(const p of result.points){if(!p.valid||p.product===null){started=false;continue;}path+=(started?' L':'M')+x(p.value).toFixed(2)+','+y(p.product).toFixed(2);started=true;}
  const ticks=[lo,(lo+hi)/2,hi].map(v=>'<line class="curve-grid" x1="52" x2="344" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="44" y="'+(y(v)+4)+'" text-anchor="end">'+v.toFixed(3)+'</text>').join('');
  const total=settings.weights.reduce((a,b)=>a+b,0),share=total?settings.weights[index]/total*100:0;
  const details=p=>p.product===null?'자료 부족':'적중률 '+pct(p.rate)+' × 평균배당 '+(p.average===null?'—':p.average.toFixed(2)+'배')+' · '+p.evaluated.toLocaleString()+'경주';
  return '<p class="curve-title">적중률 × 평균배당 <span>(배)</span></p><svg class="weight-curve-svg" data-curve-plot="'+index+'" viewBox="0 0 360 203" role="slider" tabindex="0" aria-label="'+esc(TuningModel.FEATURES[index].label)+' 가중치 변화 그래프" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+settings.weights[index]+'"><title>입력 가중치별 과거 적중률 × 평균배당</title>'+ticks+'<line class="curve-break-even" x1="52" x2="344" y1="'+y(1)+'" y2="'+y(1)+'"/><path class="curve-line" d="'+path+'"/><circle class="curve-best-dot" cx="'+x(best.value)+'" cy="'+y(best.product)+'" r="3"/>'+(current?.product!==null&&current?.valid?'<line class="curve-marker" x1="'+x(current.value)+'" x2="'+x(current.value)+'" y1="30" y2="170"/><circle class="curve-current-dot" cx="'+x(current.value)+'" cy="'+y(current.product)+'" r="5"/>':'')+'<text x="52" y="187" text-anchor="start">0%</text><text x="198" y="187" text-anchor="middle">50%</text><text x="344" y="187" text-anchor="end">100%</text></svg><p class="curve-current">현재 입력 '+settings.weights[index]+'% <small>· 환산 비중 '+share.toFixed(1)+'%</small><strong>'+number(current?.product??null)+'</strong></p><p class="curve-detail">'+(current?.valid?details(current):'전체 가중치가 0인 설정은 계산할 수 없습니다.')+'</p><div class="curve-best"><span>이 항목 최고 <b>'+best.value+'% · '+number(best.product)+'</b></span><button type="button" class="secondary" data-curve-best="'+best.value+'">최고값 적용</button></div><p class="curve-detail">'+details(best)+'<br>다른 '+(TuningModel.FEATURES.length-1)+'개 입력값 고정 · 1% 간격 계산 · 점선은 1.000배</p>';
 }
 function init(api){
  const details=document.querySelector('#weightDetails'),roots=Array.from({length:TuningModel.FEATURES.length},(_,i)=>document.querySelector('#weight-curve-'+i));
  let active=null,timer=null,paused=false;const visible=new Set(),cache=new Map();
  const key=(i,s)=>JSON.stringify([api.dataKey(),s.anchorMode,s.anchorRank??1,s.min,s.max,s.weights.map((x,j)=>j===i?null:x)]);
  const placeholder=(i,message)=>{roots[i].setAttribute('aria-busy','true');roots[i].innerHTML='<p class="curve-title">적중률 × 평균배당 변화</p><p class="curve-empty">'+esc(message)+'</p>';};
  function show(i){const s=api.settings(),c=cache.get(i);if(c?.key===key(i,s)){roots[i].innerHTML=view(c.result,s,i);roots[i].setAttribute('aria-busy','false');return true;}return false;}
  function schedule(){clearTimeout(timer);timer=setTimeout(pump,180);}
  async function pump(){
   if(paused||!details.open||active||!api.dataKey())return;
   const s=api.settings(),i=[...visible].sort((a,b)=>a-b).find(i=>cache.get(i)?.key!==key(i,s));if(i===undefined)return;
   const job={i,key:key(i,s)};active=job;placeholder(i,'2022년 이후 서울 경주를 계산하는 중…');
   try{const result=await api.calculate(s,i,percent=>{if(active===job)placeholder(i,'2022년 이후 서울 경주 계산 중… '+percent+'%');});if(active!==job)return;if(result&&job.key===key(i,api.settings())){cache.set(i,{key:job.key,result});show(i);}else visible.delete(i);}
   catch{if(active===job){roots[i].setAttribute('aria-busy','false');roots[i].innerHTML='<p class="curve-empty">그래프 계산에 실패했습니다.</p><button type="button" data-curve-retry>다시 계산</button>';visible.delete(i);}}
   finally{if(active===job){active=null;schedule();}}
  }
  function refresh(){const s=api.settings();if(active&&active.key!==key(active.i,s)){api.cancel();active=null;}for(let i=0;i<TuningModel.FEATURES.length;i++)if(!show(i))placeholder(i,'화면에 보이면 새 설정으로 계산합니다.');schedule();}
  roots.forEach((root,i)=>{
   root.addEventListener('click',e=>{const best=e.target.closest('[data-curve-best]'),retry=e.target.closest('[data-curve-retry]'),plot=e.target.closest('[data-curve-plot]');if(best)api.apply(i,+best.dataset.curveBest);else if(retry){visible.add(i);schedule();}else if(plot){const box=plot.getBoundingClientRect();api.apply(i,Math.max(0,Math.min(100,Math.round(((e.clientX-box.left)/box.width*360-52)/2.92))));}});
   root.addEventListener('keydown',e=>{if(!e.target.closest('[data-curve-plot]'))return;const value=api.settings().weights[i],next={ArrowLeft:value-1,ArrowDown:value-1,ArrowRight:value+1,ArrowUp:value+1,Home:0,End:100}[e.key];if(next===undefined)return;e.preventDefault();api.apply(i,Math.max(0,Math.min(100,next)));root.querySelector('[data-curve-plot]')?.focus();});
  });
  if(typeof IntersectionObserver==='function'){const observer=new IntersectionObserver(entries=>{for(const entry of entries){const i=roots.indexOf(entry.target);if(entry.isIntersecting)visible.add(i);else visible.delete(i);}schedule();},{rootMargin:'250px 0px'});roots.forEach(root=>observer.observe(root));}
  else roots.forEach((_,i)=>visible.add(i));
  details.addEventListener('toggle',()=>{if(!details.open){if(active){api.cancel();active=null;}}else schedule();});refresh();return {refresh,pause(value){paused=value;if(value&&active){api.cancel();active=null;}if(!value)refresh();},restart(){if(active){api.cancel();active=null;}refresh();}};
 }
 return {init,view};
})();
if(typeof module!=='undefined')module.exports=WeightCurves;
