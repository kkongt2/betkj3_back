const assert=require('node:assert/strict'),{apply,summarize,normalizeRange}=require('../qpl-policy.js');
const horses=Array.from({length:6},(_,i)=>({number:i+1,name:'말'+(i+1)}));
const base={
 horses,
 places:horses.map((h,i)=>({numbers:[h.number],prob:.9-i*.1})),
 pairs:horses.flatMap((h,i)=>horses.slice(i+1).map(j=>({
  numbers:[h.number,j.number],names:[h.name,j.name],
  prob:h.number===1&&j.number===2?.99:h.number===1&&j.number===3?.25:h.number===1&&j.number===4?.3:.1
 }))),
 models:{place:'existing',pair:'existing'},selection:{pair:{qualified:true}},selectivePicks:{pair:{numbers:[1,2]}}
};

const result=apply(base,null);
assert.deepEqual(result.pairs[0].numbers,[1,4]);
assert.equal(result.qplPolicy.anchor.number,1);
assert.equal(result.qplPolicy.partner.rank,4);
assert.deepEqual(result.qplPolicy.candidates.map(c=>c.partner.number).sort(),[3,4]);
assert.equal(result.pairs.length,1);assert.equal(result.selection.pair.qualified,false);assert.equal(result.selectivePicks.pair,null);
assert.deepEqual(base.selectivePicks.pair.numbers,[1,2]);assert.equal(base.pairs.length,15);

// Market/final odds are ignored completely.
const junk={quotes:[{numbers:[6],odds:1.01},{numbers:[1],odds:999},{numbers:[1],odds:0}]};
assert.deepEqual(apply(base,junk).pairs[0].numbers,[1,4]);
assert.deepEqual(apply(base,{quotes:[]}).pairs[0].numbers,[1,4]);

assert.equal(apply({...base,horses:horses.slice(0,2)},null).pairs.length,0);
const tiedPlaces={...base,places:base.places.map(p=>({...p,prob:p.numbers[0]===2?.9:p.prob}))};
assert.equal(apply(tiedPlaces,null,{min:3,max:4}).qplPolicy.anchor.number,1);
const tiePair=apply({...base,pairs:base.pairs.map(p=>({...p,prob:.2}))},null,{min:3,max:4});
assert.equal(tiePair.qplPolicy.partner.number,3);
const excluded=apply({...base,official_result:{starters:[1,2,3,4,5]}},null,{min:3,max:4});assert.equal(excluded.qplPolicy.status,'ready');
const reverse=apply({...base,places:[...base.places].reverse(),pairs:[...base.pairs].reverse()},null,{min:3,max:4});assert.deepEqual(reverse.pairs[0].numbers,[1,4]);
console.log('PASS analysis-only anchor/partner ranks, no final-odds dependency, ties, exclusions and no input mutation');

assert.deepEqual(apply(base,null,{min:2,max:4}).pairs[0].numbers,[1,2]);
assert.deepEqual(apply(base,null,{min:3,max:6}).pairs[0].numbers,[1,4]);
assert.deepEqual(apply(base,null,{min:6,max:20}).pairs[0].numbers,[1,6]);
assert.equal(apply(base,null,{min:7,max:20}).pairs.length,0);
assert.deepEqual(apply(base,null,{min:2,max:2}).pairs[0].numbers,[1,2]);
assert.deepEqual(normalizeRange({min:6,max:3}),{min:3,max:6});
assert.deepEqual(normalizeRange({min:0,max:99}),{min:3,max:4});

const candidates=[{partner:{rank:2,number:2,prob:.8},pick:{prob:.9},hit:false},{partner:{rank:3,number:3,prob:.7},pick:{prob:.6},hit:true}];
const rows=[{date:'20250914',venue:'seoul',settled:true,candidates},{date:'20260913',venue:'busan',settled:true,candidates},{date:'20250913',venue:'jeju',settled:true,candidates},{date:'20260914',venue:'jeju',settled:false,candidates},{date:'20260915',venue:'seoul',settled:true,candidates}];
assert.deepEqual(summarize(rows,{min:3,max:4},'20250914','20260914').all,{total:1,evaluated:1,hits:1,excluded:0,paidHits:0,payoutTotal:0});
assert.equal(summarize(rows,{min:2,max:4},'20250914','20260914').all.hits,0);
assert.equal(summarize(rows,{min:4,max:6},'20250914','20260914').all.evaluated,0);

// Average payout is an outcome metric only: losses and unknown payouts never count as zero.
const payoutRows=[2.2,5.4,null].map(payout=>({date:'20260913',venue:'seoul',settled:true,candidates:[{partner:{rank:3,number:3,prob:.7},pick:{prob:.6},hit:true,payout},{partner:{rank:2,number:2,prob:.8},pick:{prob:.9},hit:false,payout:99}]}));
const avg=summarize(payoutRows,{min:3,max:4},'20250914','20260914');
assert.equal(avg.all.hits,3);assert.equal(avg.all.paidHits,2);assert.equal((avg.all.payoutTotal/avg.all.paidHits).toFixed(2),'3.80');
assert.equal(avg.seoul.payoutTotal,7.6000000000000005);assert.equal(avg.busan,undefined);
assert.equal(summarize(payoutRows,{min:2,max:4},'20250914','20260914').all.paidHits,0);
console.log('PASS payout is used only for historical performance');

const analysisBase={...base,places:base.places.map(p=>({...p,prob:p.numbers[0]===4?1:p.prob}))};
const analysis=apply(analysisBase,null,{min:3,max:4});
assert.equal(analysis.qplPolicy.anchor.number,4);
assert.equal(analysis.qplPolicy.partner.number,2);
assert.deepEqual(analysis.pairs[0].numbers,[2,4]);
assert.deepEqual(apply(analysisBase,null,{min:4,max:4}).pairs[0].numbers,[3,4]);
assert.equal(apply({...analysisBase,official_result:{starters:[1,2,3,5,6]}},null,{min:2,max:4}).qplPolicy.anchor.number,1);

for(const anchorRank of [1,2,3]){
 const a=apply(base,null,{min:2,max:6,anchorRank});
 assert.equal(a.qplPolicy.anchor.number,anchorRank);
 assert(a.qplPolicy.candidates.every(c=>c.partner.number!==anchorRank));
 const b=apply(analysisBase,null,{min:2,max:6,anchorRank});
 assert.equal(b.qplPolicy.anchor.number,[4,1,2][anchorRank-1]);
}
assert.equal(apply({...base,official_result:{starters:[2,3,4,5,6]}},null,{min:2,max:6,anchorRank:2}).qplPolicy.anchor.number,3);
assert.equal(apply(base,null,{min:2,max:2,anchorRank:2}).pairs.length,0);
assert.equal(apply({...base,official_result:{starters:[1,2]}},null,{min:2,max:3,anchorRank:3}).pairs.length,0);
assert.equal(apply(base,null,{anchorRank:99}).qplPolicy.anchor.number,1);
console.log('PASS analysis anchor ranks 1/2/3, withdrawals, no self-pair and insufficient starters');
