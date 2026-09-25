const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const b=require('../scripts/weight-balance.cjs'),t=require('../tuning-model.js'),{run}=require('../scripts/evaluate-seoul.cjs');
const bases=JSON.parse(fs.readFileSync('preset-bases.json')).bases;
for(const base of bases){const w=b.project([...base.settings.weights,0]);assert(b.valid(w));assert.equal(w.reduce((a,b)=>a+b,0),100);assert(w.every((x,i)=>x>=(i<17?3:0)&&x<=20));const invalid=w.slice();invalid[0]=2;assert(!b.valid(invalid));assert(!b.valid([...base.settings.weights,0]));}
const w=b.project(t.defaults());const field=Array.from({length:8},(_,i)=>[i+1,.3,1,[],null,null,Array.from({length:t.FEATURES.length},(_,j)=>(i+j)%7/6)]),pairs=[];for(let a=1;a<=8;a++)for(let c=a+1;c<=8;c++)pairs.push([a,c,.1]);
const row={venue:'seoul',date:'20250101',race:1,k:3,horses:field,pairs,quotes:field.map(h=>({numbers:[h[0]],odds:1+h[0]/10})),settled:true,payouts:[{numbers:[1,2],odds:3}],starters:field.map(h=>h[0])};
const rows=[row,{...row,date:'20250102',settled:false},{...row,date:'20250103',quotes:[]}];
const full=run(rows,w,{predictions:true});for(const base of bases){const family=base.settings,limited=run(rows,w,{predictions:true,family});assert(limited.length<full.length);for(const r of limited){const exact=full.find(x=>JSON.stringify(x.settings)===JSON.stringify(r.settings));assert.deepEqual(r,exact);}}
if(fs.existsSync('/tmp/search-top5')){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'balance-test-')),input=path.join(tmp,'input'),seed=path.join(tmp,'seed'),output=path.join(tmp,'output');
 fs.writeFileSync(input,'1 1\n20250101 8 3\n'+field.map(h=>[h[0],1+h[0]/10,.3,...h[6]].join(' ')).join('\n')+'\n'+Array(64).fill('0.1 3').join(' '));
 fs.writeFileSync(seed,[1,2,6,...w,b.RULES.minimum,b.RULES.maximum,b.RULES.groups.length,...b.RULES.groups.flatMap(g=>[g.min,g.max,g.indices.length,...g.indices])].join(' '));
 cp.execFileSync('/tmp/search-top5',[input,output,seed],{stdio:'pipe'});const r=JSON.parse(fs.readFileSync(output));assert(r.finalists.length);assert(r.finalists.every(x=>b.valid(x.weights)));fs.rmSync(tmp,{recursive:true});
}
console.log('PASS balance projections, native/JS limits and family-only exact evaluation equivalence including missing data');
