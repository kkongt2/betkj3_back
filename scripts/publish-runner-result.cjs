'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync:exec}=require('node:child_process'),C=require('../runner-search-contract.js');
const result=C.report(JSON.parse(fs.readFileSync('_runner-out/result.json','utf8'))),dir=fs.mkdtempSync(path.join(os.tmpdir(),'runner-result-'));
const env={...process.env,GIT_INDEX_FILE:path.join(dir,'index'),GIT_AUTHOR_NAME:'github-actions[bot]',GIT_AUTHOR_EMAIL:'41898282+github-actions[bot]@users.noreply.github.com',GIT_COMMITTER_NAME:'github-actions[bot]',GIT_COMMITTER_EMAIL:'41898282+github-actions[bot]@users.noreply.github.com'};
const git=(args,input)=>exec('git',args,{encoding:'utf8',env,input,stdio:['pipe','pipe','pipe']}).trim();
try{
 for(let attempt=0;attempt<4;attempt++){
  let parent=null,entries=[];
  const exists=git(['ls-remote','--heads','origin','runner-results']);
  if(exists){git(['fetch','origin','refs/heads/runner-results']);parent=git(['rev-parse','FETCH_HEAD']);entries=JSON.parse(git(['show',parent+':index.json'])).entries;}
  git(['read-tree','--empty']);
  const entry={runId:result.runId,requestId:result.request.requestId,finishedAt:result.finishedAt,method:result.request.method,joint:result.request.joint,seconds:result.request.seconds,product:result.result.best?.metrics.product??null};
  entries=[entry,...entries.filter(x=>x.runId!==entry.runId)].sort((a,b)=>b.finishedAt.localeCompare(a.finishedAt)).slice(0,30);
  function add(file,content){const sha=git(['hash-object','-w','--stdin'],content);git(['update-index','--add','--cacheinfo','100644',sha,file]);}
  add('index.json',JSON.stringify({schema:1,entries}));add('runs/'+entry.runId+'.json',JSON.stringify(result));
  for(const e of entries)if(e.runId!==entry.runId){if(!/^\d+(?:-\d+)?$/.test(e.runId))throw Error('Invalid previous run ID');const file='runs/'+e.runId+'.json',sha=git(['rev-parse',parent+':'+file]);git(['update-index','--add','--cacheinfo','100644',sha,file]);}
  const tree=git(['write-tree']),commit=git(['commit-tree',tree,...(parent?['-p',parent]:[]),'-m','Save Runner search '+entry.runId]);
  try{git(['push','origin',commit+':refs/heads/runner-results']);console.log('Published Runner result '+entry.runId);break;}catch(e){if(attempt===3)throw e;}
 }
}finally{fs.rmSync(dir,{recursive:true,force:true});}
