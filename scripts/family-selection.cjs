const assert=require('node:assert/strict');
const balance=require('./weight-balance.cjs');
const RULES={count:1,baseIds:[3],perBase:1,minimumHitRate:.15,minimumCoverageRatio:.40,weightBalance:balance.RULES,maxRankChange:3,objective:'product-first'};
const weightMove=(a,b)=>a.reduce((s,x,i)=>s+Math.abs(x-b[i]),0)/2;
function select(candidates){
 const board=candidates.filter(c=>c.baseId===3&&balance.valid(c.settings.weights)&&c.all.hits*20>=c.all.evaluated*3&&c.all.evaluated>=Math.ceil(c.all.total*.4));
 board.sort((a,b)=>b.metrics.product-a.metrics.product||b.all.evaluated-a.all.evaluated||JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings)));
 assert(board.length,'Need one qualifying descendant of base 3');
 return [{...board[0],nearestPairDifference:1}];
}
module.exports={RULES,weightMove,select};
