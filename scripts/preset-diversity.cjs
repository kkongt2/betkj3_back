'use strict';
const assert=require('node:assert/strict');
const RULES={count:10,minimumHitRate:.10,minimumCoverageRatio:.40,minimumProductRatio:.85,performanceWeight:.80,diversityWeight:.20,minimumPairDifference:.10,maxSameRange:2,maxSameBand:4};
function pairDistance(a,b){let union=0,different=0;for(let i=0;i<a.length;i++){if(a[i]||b[i]){union++;if(a[i]!==b[i])different++;}}return union?different/union:0;}
function weightDistance(a,b){return a.reduce((s,w,i)=>s+Math.abs(w-b[i]),0)/200;}
const rangeKey=c=>[c.settings.min,c.settings.max].join(':');
const bandKey=c=>(c.settings.min<=4?'2-4':c.settings.min<=7?'5-7':c.settings.min<=10?'8-10':'11-20');
function selectDiverse(candidates,rules=RULES){
 assert(candidates.length);const best=Math.max(...candidates.map(c=>c.metrics.product));
 const pool=candidates.filter(c=>c.all.hits*10>=c.all.evaluated&&c.all.evaluated>=Math.ceil(c.all.total*rules.minimumCoverageRatio)&&c.metrics.product>=best*rules.minimumProductRatio).map(c=>({...c,minPairDistance:1,minDiversity:1}));
 const selected=[],ranges=new Map(),bands=new Map();
 while(selected.length<rules.count){
  const eligible=pool.filter(c=>!c.chosen&&c.minPairDistance+1e-12>=rules.minimumPairDifference&&(ranges.get(rangeKey(c))||0)<rules.maxSameRange&&(bands.get(bandKey(c))||0)<rules.maxSameBand);
  for(const c of eligible)c.selectionScore=rules.performanceWeight*c.metrics.product/best+rules.diversityWeight*(selected.length?c.minDiversity:0);
  eligible.sort((a,b)=>b.selectionScore-a.selectionScore||b.metrics.product-a.metrics.product||b.all.evaluated-a.all.evaluated||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings)));
  assert(eligible.length,'Insufficient diverse candidates above the quality floor');const c=eligible[0];c.chosen=true;c.selectionOrder=selected.length+1;selected.push(c);ranges.set(rangeKey(c),(ranges.get(rangeKey(c))||0)+1);bands.set(bandKey(c),(bands.get(bandKey(c))||0)+1);
  for(const other of pool){if(other.chosen)continue;const d=pairDistance(other.predictions,c.predictions),w=weightDistance(other.settings.weights,c.settings.weights);other.minPairDistance=Math.min(other.minPairDistance,d);other.minDiversity=Math.min(other.minDiversity,.8*d+.2*w);}
 }
 selected.sort((a,b)=>b.metrics.product-a.metrics.product||a.selectionOrder-b.selectionOrder);
 return selected.map(c=>({...c,nearestPairDifference:Math.min(...selected.filter(x=>x!==c).map(x=>pairDistance(c.predictions,x.predictions)))}));
}
module.exports={RULES,pairDistance,weightDistance,rangeKey,bandKey,selectDiverse};
