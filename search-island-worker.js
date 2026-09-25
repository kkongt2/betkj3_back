'use strict';
importScripts('model.js?v=fixed-years-1','tuning-model.js?v=fixed-years-1','qpl-policy.js?v=fixed-years-1','race-selection-model.js?v=fixed-years-1','qpl-history-engine.js?v=fixed-years-1','weight-curve-engine.js?v=fixed-years-1','weight-balance.js?v=fixed-years-1','global-weight-search.js?v=fixed-years-1','weight-search-engine.js?v=fixed-years-1','joint-search-engine.js?v=fixed-years-1');
let prepared=null,stopped=false;
// MessageChannel gives stop messages a turn without the nested-timer 4 ms clamp.
const channel=new MessageChannel(),queue=[];channel.port1.onmessage=()=>queue.shift()?.();
const yieldTask=()=>new Promise(resolve=>{queue.push(resolve);channel.port2.postMessage(0);});
onmessage=async({data})=>{
 if(data.type==='stop'){stopped=true;return;}
 try{
  if(data.type==='init'){
   const history=QplHistoryEngine.create(data.rows),engine=data.options.joint?JointSearchEngine.create(data.rows,yieldTask):WeightCurveEngine.create(data.rows,yieldTask);
   prepared={history,engine,options:data.options};postMessage({type:'ready'});return;
  }
  if(data.type==='start'){
   let lastProgress=-Infinity;
   const {history,engine,options}=prepared,control={stopped:()=>stopped,yieldTask,progress:p=>{if(p.phase!=='searching'||performance.now()-lastProgress>=200){lastProgress=performance.now();postMessage({type:'progress',progress:p});}}};
   const result=options.joint?await engine.run(options,history.evaluate,control):await WeightSearchEngine.run(options,engine.evaluate,history.evaluate,control);
   postMessage({type:'result',result});
  }
 }catch(e){postMessage({type:'error',error:String(e.message||e)});}
};
