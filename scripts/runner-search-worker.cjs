'use strict';
const {parentPort}=require('node:worker_threads'),{setImmediate:yieldTask}=require('node:timers/promises');
const H=require('../qpl-history-engine.js'),C=require('../weight-curve-engine.js'),J=require('../joint-search-engine.js'),W=require('../weight-search-engine.js');
let prepared,stopped=false,lastProgress=-Infinity;
parentPort.on('message',async data=>{
 if(data.type==='stop'){stopped=true;return;}
 try{
  if(data.type==='init'){prepared={options:data.options,history:H.create(data.rows),engine:data.options.joint?J.create(data.rows,yieldTask):C.create(data.rows,yieldTask)};parentPort.postMessage({type:'ready'});return;}
  if(data.type==='start'){
   const {options,history,engine}=prepared,control={stopped:()=>stopped,yieldTask,progress:p=>{if(p.phase!=='searching'||performance.now()-lastProgress>=250){lastProgress=performance.now();parentPort.postMessage({type:'progress',progress:p});}}};
   const result=options.joint?await engine.run(options,history.evaluate,control):await W.run(options,engine.evaluate,history.evaluate,control);
   parentPort.postMessage({type:'result',result});
  }
 }catch(e){parentPort.postMessage({type:'error',error:e.message});}
});
