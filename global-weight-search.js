'use strict';
// Integer, constrained DE/rand/1/bin with periodic random immigrants.
// The caller supplies fitness; this module never reads race outcomes itself.
const GlobalWeightSearch=(()=>{
 const T=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const B=typeof module!=='undefined'?require('./weight-balance.js'):WeightBalance;
 function method(value){if(value===undefined)return 'local';if(!['local','de'].includes(value))throw Error('탐색 방식을 확인해 주세요.');return value;}
 function normalize(input){
  const w=input.map(x=>Math.max(0,Math.min(100,Number.isFinite(x)?x:0))),sum=w.reduce((a,b)=>a+b,0);
  if(!sum)w.fill(1);
  const total=sum||w.length,raw=w.map(x=>100*x/total),out=raw.map(Math.floor);
  for(const i of raw.map((_,i)=>i).sort((a,b)=>(raw[b]-out[b])-(raw[a]-out[a])||a-b).slice(0,100-out.reduce((a,b)=>a+b,0)))out[i]++;
  return out;
 }
 function create({seeds=[],balanced=false,random=Math.random,size=12}={}){
  if(!Number.isInteger(size)||size<4)throw Error('DE population must contain at least four candidates');
  const project=v=>{const w=normalize(v);return balanced?(B.valid(w)?w:B.project(w)):w;};
  const initial=seeds.filter(T.validWeights).slice(0,4).map(w=>project(T.settings({weights:w}).weights));
  const population=[],seen=new Set();let cursor=0,trials=0,immigrants=0,pending=null;
  const fresh=()=>project(Array.from({length:T.FEATURES.length},()=>(-Math.log(Math.max(1e-12,1-random())))**(random()<.5?1:3)));
  function ask(){
   if(pending)throw Error('DE feedback missing');
   let slot=population.length<size?population.length:cursor++%size;
   for(let attempt=0;attempt<64;attempt++){
    let weights,kind;
    if(initial.length){weights=initial.shift();kind='seed';}
    else if(population.length<size||attempt>8||trials>0&&trials%(size*4)===0){weights=fresh();kind='restart';}
    else{
     const ids=population.map((_,i)=>i).filter(i=>i!==slot);
     for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
     const [a,b,c]=ids,F=.5+random()*.5,forced=Math.floor(random()*T.FEATURES.length),target=population[slot].weights;
     weights=project(target.map((x,j)=>j===forced||random()<.7?population[a].weights[j]+F*(population[b].weights[j]-population[c].weights[j]):x));kind='evolve';
    }
    const key=weights.join(',');if(seen.has(key))continue;seen.add(key);
    if(kind==='restart'&&population.length===size){slot=population.reduce((worst,p,i)=>p.fitness<population[worst].fitness?i:worst,0);immigrants++;}
    pending={weights,slot,kind};return weights.slice();
   }
   return null;
  }
  function tell(fitness){
   if(!pending)throw Error('DE candidate missing');
   const p={weights:pending.weights.slice(),fitness:Number.isFinite(fitness)?fitness:-Infinity},old=population[pending.slot];
   if(!old||p.fitness>=old.fitness||pending.kind==='restart')population[pending.slot]=p;
   if(pending.kind==='evolve'||pending.kind==='restart'&&old)trials++;
   pending=null;
  }
  const stats=()=>({population:population.length,populationSize:size,generations:Math.floor(trials/size),restarts:immigrants});
  return {ask,tell,stats};
 }
 function rng(seed){let n=seed>>>0;return ()=>((n=(Math.imul(1664525,n)+1013904223)>>>0)/4294967296);}
 return {create,method,normalize,rng};
})();
if(typeof module!=='undefined')module.exports=GlobalWeightSearch;
