const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),t=require('../tuning-model.js'),p=require('../strategy-presets.js'),policy=require('../qpl-policy.js'),{evaluate}=require('../scripts/rolling-search.cjs');
const balance=require('../scripts/weight-balance.cjs'),{RULES}=require('../scripts/family-selection.cjs');
const report=JSON.parse(fs.readFileSync('top5-presets.json')),manifest=JSON.parse(fs.readFileSync('qpl-history.json'));
assert.equal(report.scope,'seoul');assert.equal(report.version,t.VERSION);assert.equal(report.presets.length,1);for(const k of ['count','minimumCoverageRatio','minimumHitRate','maxRankChange','objective'])assert.deepEqual(report.selectionRules[k],RULES[k]);
if(report.presets[0].settings.weights.length===t.FEATURES.length)assert.deepEqual(report.selectionRules,RULES);
const rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date>=report.from&&r.date<=report.to);
assert.equal(rows.length,report.sourceRaces);assert(rows.every(r=>r.venue==='seoul'));assert.equal(report.minimumEvaluated,Math.ceil(rows.length*.4));
const preset=report.presets[0],base=report.bases.find(b=>b.id===3);
assert(base);assert.equal(preset.baseId,3);assert(!('anchorMode' in preset.settings));assert(!('anchorMode' in base.settings));
assert.deepEqual(p.config(preset.settings),{...preset.settings,...t.settings(preset.settings)});assert.equal(preset.settings.anchorRank??1,1);
assert([17,t.FEATURES.length].includes(preset.settings.weights.length));assert.equal(preset.settings.weights.reduce((a,b)=>a+b,0),100);
assert(Math.abs(preset.settings.min-base.settings.min)<=3);assert(Math.abs(preset.settings.max-base.settings.max)<=3);
assert(balance.valid(preset.settings.weights));assert.deepEqual(preset.weightSummary,balance.summary(preset.settings.weights));
assert(preset.all.hits*20>=preset.all.evaluated*3);assert(preset.all.evaluated>=report.minimumEvaluated);
// Cached presets carry the source hashes used at generation time. Their stored
// performance is replayable only against that exact source; the UI recalculates current stats.
const sameSource=Object.entries(report.sourceSha256||{}).length>0&&Object.entries(report.sourceSha256).every(([file,hash])=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')===hash);
if(sameSource){
const x=evaluate(rows,preset.settings);assert.deepEqual(x.all,preset.all);assert.equal(x.metrics.product,preset.metrics.product);
const vector=new Uint16Array(rows.length);
for(let i=0;i<rows.length;i++){const row=rows[i];if(!row.settled)continue;const result=policy.apply(t.apply(t.unpack(row),preset.settings),null,preset.settings);if(result.qplPolicy.status==='ready'){const ns=result.pairs[0].numbers.slice().sort((a,b)=>a-b);vector[i]=ns[0]*32+ns[1];}}
assert.equal(crypto.createHash('sha256').update(Buffer.from(vector.buffer)).digest('hex'),preset.predictionHash);
}
if(preset.settings.weights.length===t.FEATURES.length)assert.equal(preset.nearestPairDifference,1);
else assert(preset.nearestPairDifference>=0&&preset.nearestPairDifference<=1);
console.log('PASS saved/generated preset compatibility, weight constraints and replay when source hashes match');
