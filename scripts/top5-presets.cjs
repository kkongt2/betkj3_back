'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const balance=require('./weight-balance.cjs');
const {RULES,select,weightMove}=require('./family-selection.cjs');
const t=require('../tuning-model.js'),{run}=require('./evaluate-seoul.cjs'),{exportTrain,evaluate}=require('./rolling-search.cjs');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json'));assert.equal(manifest.scope,'seoul');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date<today);assert(rows.every(r=>r.venue==='seoul'));
const minimum=Math.ceil(rows.length*.4),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'seoul-top1-')),input=path.join(tmp,'races.txt'),output=path.join(tmp,'top.json'),seed=path.join(tmp,'seeds.txt');
const parents=JSON.parse(fs.readFileSync('preset-bases.json')),parent=parents.bases.find(p=>p.id===3);assert(parent);
const base={...parent,settings:{...parent.settings,anchorRank:parent.settings.anchorRank||1,weights:t.settings(parent.settings).weights}};
delete base.settings.anchorMode;
exportTrain(rows,input);
const board=[];let tried=0,tested=0,exact=0;const baselines=[];
const projected=balance.project(base.settings.weights);
fs.writeFileSync(seed,[1,base.settings.min,base.settings.max,...projected,balance.RULES.minimum,balance.RULES.maximum,balance.RULES.groups.length,...balance.RULES.groups.flatMap(g=>[g.min,g.max,g.indices.length,...g.indices])].join(' '));
cp.execFileSync('/tmp/search-top5',[input,output,seed],{stdio:'inherit'});
const native=JSON.parse(fs.readFileSync(output));tested+=native.weightCandidates;
const weights=[...new Map([projected,...native.finalists.map(f=>f.weights)].map(w=>[w.join(','),w])).values()];
baselines.push({id:base.id,settings:base.settings,...evaluate(rows,base.settings)});
for(const w of weights){
 assert(balance.valid(w));const results=run(rows,w,{predictions:true,family:base.settings});tried+=results.length;exact++;
 for(const x of results)if(x.all.evaluated>=minimum&&x.all.hits*20>=x.all.evaluated*3&&Math.abs(x.settings.min-base.settings.min)<=3&&Math.abs(x.settings.max-base.settings.max)<=3)board.push({...x,baseId:base.id,weightReallocation:weightMove(w,base.settings.weights)});
}
board.sort((a,b)=>b.metrics.product-a.metrics.product||b.all.evaluated-a.all.evaluated||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings)));
const distinct=[],seen=new Set();
for(const candidate of board){
 const key=crypto.createHash('sha256').update(Buffer.from(candidate.predictions.buffer)).digest('hex');
 if(seen.has(key))continue;seen.add(key);distinct.push({...candidate,predictionHash:key});
}
const selected=select(distinct),presets=[];
for(const candidate of selected){
 const check=evaluate(rows,candidate.settings);assert.deepEqual(check.all,candidate.all);
 const {predictions,chosen,minPairDistance,minDiversity,...saved}=candidate;
 presets.push({rank:1,name:'서울 균형 기준3 파생 1번',...saved,weightSummary:balance.summary(candidate.settings.weights),coverage:candidate.all.evaluated/rows.length});
}
assert.equal(presets.length,1);
const previous=JSON.parse(fs.readFileSync('previous-preset-reference.json'));
const comparison={previousName:previous.preset.name,previousSettings:previous.preset.settings,previousSummary:balance.summary(previous.preset.settings.weights),previousMetrics:evaluate(rows,previous.preset.settings).metrics,newMetrics:presets[0].metrics};
const report={schema:4,weightBalance:balance.RULES,comparison,selectionRules:RULES,bases:baselines,baseSource:parents.sourceCommit,bestEligibleProduct:board[0].metrics.product,scope:'seoul',version:t.VERSION,generatedAt:new Date().toISOString(),from:rows[0].date,to:rows.at(-1).date,sourceRaces:rows.length,minimumCoverageRatio:.4,minimumEvaluated:minimum,search:{nativeWeightCandidates:tested,exactWeightCandidates:exact,exactSettings:tried,anchors:['analysis'],ranks:[2,20],weightStep:1,weightTotal:100,deduplicate:'identical historical selected pairs',eligibleDistinct:distinct.length},presets,sourceSha256:Object.fromEntries(manifest.shards.map(s=>[s.url,crypto.createHash('sha256').update(fs.readFileSync(s.url)).digest('hex')])),note:'연승확률 분석 순위만 사용해 기준3 계열에서 프리셋 1개를 선별합니다. 축마와 두 번째 말의 순위 모두 분석 확률 기준이며 지급배당은 성과 계산에만 사용합니다. 같은 과거 자료로 탐색·평가한 사후 성적이며 미래 성적이나 독립 검증이 아닙니다.'};
fs.writeFileSync('top5-presets.json',JSON.stringify(report,null,2));fs.rmSync(tmp,{recursive:true,force:true});console.log(JSON.stringify({search:report.search,sourceRaces:report.sourceRaces,presets},null,2));
