const assert=require('node:assert/strict'),{pairDistance,weightDistance}=require('../scripts/preset-diversity.cjs'),p=require('../strategy-presets.js');
assert.equal(pairDistance([0,1,2,3],[0,1,4,3]),1/3);assert.equal(pairDistance([0,1],[1,0]),1);assert.equal(pairDistance([0,0],[0,0]),0);
assert.equal(weightDistance([100,0],[0,100]),1);assert.equal(weightDistance([50,50],[55,45]),.05);
const store={data:{},getItem(k){return this.data[k]||null},setItem(k,v){this.data[k]=v}},settings={modelMode:'custom',weights:Array(16).fill(1),min:2,max:4};
p.saveMany(store,[{name:'old',settings}]);p.saveMany(store,Array.from({length:10},(_,i)=>({name:'preset '+i,settings})));assert.equal(p.read(store).length,11);
const before=JSON.stringify(store.data);assert.throws(()=>p.saveMany(store,[{name:'invalid',settings:{...settings,weights:[0]}}]));assert.equal(JSON.stringify(store.data),before);
console.log('PASS prediction distance, weight distance and atomic bulk preset save');

const base={...settings,weights:[...Array(16).fill(1),0]};
const oldNames=['서울 10% 분산 3번','서울 10% 분산 4번','서울 10% 분산 9번','서울 10% 분산 1번','서울 과거 최고 1위','서울 균형 기준3 파생 2번'];
p.saveMany(store,oldNames.map(name=>({name,settings:base})));
const batch=[{name:'서울 균형 기준3 파생 1번',settings:base}],customCount=p.read(store).filter(x=>!oldNames.includes(x.name)).length;
p.replaceGenerated(store,batch,'r1');assert.equal(p.read(store).length,customCount+1);assert(!p.read(store).some(x=>oldNames.includes(x.name)));
assert.equal(p.replaceGenerated(store,batch,'r1'),false);p.save(store,'custom second',base);assert.equal(p.replaceGenerated(store,batch,'r1'),false);assert(p.read(store).some(x=>x.name==='custom second'));
console.log('PASS old generated presets collapse to preset 1 while custom presets survive');

const bal=require('../scripts/weight-balance.cjs'),config={name:'서울 균형 기준3 파생 1번',settings:{anchorRank:1,modelMode:'custom',min:2,max:6,weights:bal.project(Array(17).fill(1))}};
const memory={data:null,getItem(){return this.data},setItem(k,v){this.data=v}},api=require('../strategy-presets.js');
api.replaceGenerated(memory,[config],'one');api.replaceGenerated(memory,[config],'two');assert.equal(api.read(memory).length,1);assert(!('anchorMode' in api.read(memory)[0].settings));
console.log('PASS single analysis-only recommendation revisions replace instead of accumulating');
