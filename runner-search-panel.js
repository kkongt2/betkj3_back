'use strict';
const RunnerSearchPanel=(()=>{
 const base='https://raw.githubusercontent.com/kkongt2/betkj3/refs/heads/runner-results/';
 function init(api){
  const el=id=>document.getElementById(id),status=el('runnerSearchStatus'),requestBox=el('runnerSearchRequest'),list=el('runnerSearchResults'),duration=s=>s>=86400&&s%86400===0?(s/86400)+'일':Number((s/60).toFixed(2))+'분';
  let requestId='',loading=false,revision=0,entries=[];
  try{requestId=localStorage.getItem('betkj3-runner-request')||'';}catch{}
  function changed(){if(!requestBox.hidden){requestBox.hidden=true;el('runnerPrepared').hidden=true;status.textContent='조건이 바뀌었습니다. Runner 탐색 준비를 다시 눌러 주세요.';}}
  el('prepareRunnerSearch').onclick=async()=>{
   try{
    if(!api.canPrepare())throw Error('이 기기의 탐색을 중지한 후 준비해 주세요.');
    const request=RunnerSearchContract.request({schema:1,requestId:crypto.randomUUID(),...api.options()});
    requestId=request.requestId;requestBox.value=JSON.stringify(request);requestBox.hidden=false;el('runnerPrepared').hidden=false;
    try{localStorage.setItem('betkj3-runner-request',requestId);}catch{}
    try{await navigator.clipboard.writeText(requestBox.value);status.textContent='조건을 복사했습니다. GitHub에서 Run workflow → request에 붙여넣기 → Run workflow를 누르세요. 아직 실행된 상태는 아닙니다.';}
    catch{requestBox.focus();requestBox.select();status.textContent='아래 조건을 길게 눌러 복사한 뒤 GitHub 실행 화면의 request에 붙여넣으세요. 아직 실행된 상태는 아닙니다.';}
   }catch(e){status.textContent=e.message;}
  };
  el('copyRunnerSearch').onclick=async()=>{try{await navigator.clipboard.writeText(requestBox.value);status.textContent='탐색 조건을 복사했습니다. GitHub 실행 화면에서 붙여넣으세요.';}catch{requestBox.focus();requestBox.select();status.textContent='조건을 길게 눌러 직접 복사해 주세요.';}};
  async function read(file){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(base+file+'?t='+Date.now(),{cache:'no-store',signal:controller.signal});if(r.status===404)return null;if(!r.ok)throw Error('결과 조회 HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
  async function refresh(){
   if(loading)return;loading=true;el('refreshRunnerSearch').disabled=true;
   try{const data=await read('index.json');entries=data?.schema===1&&Array.isArray(data.entries)?data.entries.filter(e=>/^\d+(?:-\d+)?$/.test(e.runId)&&Number.isFinite(Date.parse(e.finishedAt))).slice(0,30):[];
    list.replaceChildren();for(const e of entries){const option=document.createElement('option');option.value=e.runId;option.textContent=new Date(e.finishedAt).toLocaleString()+' · '+(e.joint?'공동':'전체')+' · '+(e.method==='de'?'DE':'혼합')+' · '+duration(e.seconds)+(e.requestId===requestId?' · 내 최근 요청':'');list.append(option);}
    const own=entries.find(e=>e.requestId===requestId);if(own)list.value=own.runId;
    el('loadRunnerSearch').disabled=!entries.length;
    status.textContent=own?'최근 요청의 완료 결과가 있습니다. 결과 불러오기를 누르세요.':requestId?'최근 요청의 완료 결과는 아직 없습니다. GitHub에서 실행 여부·진행·실패 상태를 확인하세요.':entries.length?'완료된 결과를 선택해 불러오세요.':'아직 저장된 Runner 결과가 없습니다.';
   }catch(e){status.textContent='Runner 결과 조회 실패: '+e.message;}finally{loading=false;el('refreshRunnerSearch').disabled=false;}
  }
  el('refreshRunnerSearch').onclick=refresh;
  el('loadRunnerSearch').onclick=async()=>{
   const selected=entries.find(e=>e.runId===list.value);if(!selected)return;const id=++revision;el('loadRunnerSearch').disabled=true;
   try{const raw=await read('runs/'+selected.runId+'.json');if(id!==revision)return;if(!raw||raw.runId!==selected.runId)throw Error('선택한 실행 결과를 찾지 못했습니다.');const report=RunnerSearchContract.report(raw);status.textContent='현재 최고 조합의 연도별 성적을 재계산 중…';if(await api.receive(report)===false){status.textContent='설정이 변경되어 결과 불러오기를 취소했습니다.';return;}status.textContent='Runner 결과를 불러왔습니다. '+report.from+'~'+report.to+' 자료 기준 · 완료 '+new Date(report.finishedAt).toLocaleString()+'. 아래에서 결과를 확인하고 적용·저장하세요.';}
   catch(e){status.textContent='결과 불러오기 실패: '+e.message;}finally{if(id===revision)el('loadRunnerSearch').disabled=!entries.length;}
  };
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  return {changed};
 }
 return {init};
})();
