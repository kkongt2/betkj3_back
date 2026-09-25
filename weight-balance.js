'use strict';
const WeightBalance=(()=>{
const RULES={minimum:3,maximum:20,total:100,groups:[
 {id:'form',label:'최근 성적·착순',indices:[0,1,2,4,16,17,20],min:20,max:40},
 {id:'ability',label:'레이팅·상대 수준',indices:[3,12],min:6,max:25},
 {id:'people',label:'기수·조교사',indices:[5,6],min:6,max:20},
 {id:'condition',label:'중량·마체중·출전 간격',indices:[7,8,9],min:9,max:20},
 {id:'records',label:'기록·시간차',indices:[10,11,13,14,15,18,19],min:15,max:35}
]};
function summary(w){return {minimum:Math.min(...w),maximum:Math.max(...w),effectiveFeatures:10000/w.reduce((s,x)=>s+x*x,0),groups:RULES.groups.map(g=>({id:g.id,label:g.label,weight:g.indices.reduce((s,i)=>s+(w[i]??0),0),min:g.min,max:g.max}))};}
function valid(w){return Array.isArray(w)&&[17,21].includes(w.length)&&w.every((x,i)=>Number.isInteger(x)&&x>=(i<17?RULES.minimum:0)&&x<=RULES.maximum)&&w.reduce((a,b)=>a+b,0)===100&&summary(w).groups.every(g=>g.weight>=g.min&&g.weight<=g.max);}
function project(origin){
 const w=Array.from({length:21},(_,i)=>i<17?RULES.minimum:0),group=i=>RULES.groups.find(g=>g.indices.includes(i)),can=i=>w[i]<RULES.maximum&&group(i).indices.reduce((s,j)=>s+w[j],0)<group(i).max;
 const add=ids=>{const i=ids.filter(can).sort((a,b)=>((origin[b]??0)+5)/(w[b]-(b<17?RULES.minimum:0)+1)-((origin[a]??0)+5)/(w[a]-(a<17?RULES.minimum:0)+1)||a-b)[0];if(i===undefined)throw Error('Infeasible weight limits');w[i]++;};
 for(const g of RULES.groups)while(g.indices.reduce((s,i)=>s+(w[i]??0),0)<g.min)add(g.indices);
 while(w.reduce((a,b)=>a+b,0)<100)add(w.map((_,i)=>i));
 if(!valid(w))throw Error('Invalid projected seed');return w;
}
return {RULES,valid,summary,project};
})();
if(typeof module!=='undefined')module.exports=WeightBalance;
