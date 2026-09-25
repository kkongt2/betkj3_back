const fs=require('node:fs'),assert=require('node:assert/strict'),t=require('../tuning-model.js'),policy=require('../qpl-policy.js'),p=require('../strategy-presets.js'),{covers,evaluate}=require('../scripts/rolling-search.cjs');
const r=JSON.parse(fs.readFileSync('rolling-report.json'));assert.equal(r.scope,'seoul');assert.equal(r.version,t.VERSION);assert.equal(r.policyVersion,policy.VERSION);assert(r.folds.length>=4);assert.equal(r.minimumCoverageRatio,.4);assert(!r.regional&&!r.common);
const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows);assert(rows.every(x=>x.venue==='seoul'));
let total=0;for(const f of r.folds){assert(r.search.scaleFitThrough<f.validationFrom);assert(f.trainThrough<f.validationFrom);assert(f.validationThrough<f.from);assert(f.through<f.to);assert(covers(f.selected));assert.deepEqual({...f.settings,...t.settings(f.settings)},p.config(f.settings));total+=f.selected.total;
 const x=evaluate(rows.filter(x=>x.date>=f.from&&x.date<=f.through),f.settings);assert.equal(x.all.hits,f.selected.hits);assert.equal(x.all.evaluated,f.selected.evaluated);assert(Math.abs(x.all.payoutTotal-f.selected.payoutTotal)<1e-8);
}
assert.equal(r.selected.all.total,total);assert(covers(r.live.retrospective.all));assert.equal(r.live.retrospective.all.total,r.sourceRaces);assert.equal(r.recordComparison.length,5);
for(const x of [r.selected,...r.recordComparison])assert(Math.abs(x.metrics.product-x.all.payoutTotal/x.all.evaluated)<1e-10);
console.log('PASS Seoul-only frozen quarterly replay, past-only selection, five record variants and >=40% source coverage in every quarter');
