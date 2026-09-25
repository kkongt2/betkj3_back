'use strict';
const StrategyPresets=(()=>{
 const tuning=typeof module!=='undefined'?require('./tuning-model.js'):TuningModel;
 const policy=typeof module!=='undefined'?require('./qpl-policy.js'):Betkj3Policy;
 const KEY='betkj3-strategy-presets-v1';
 function config(value){
  if(!value||(value.anchorRank!==undefined&&![1,2,3].includes(+value.anchorRank))||!tuning.validWeights(value.weights)||!['existing','custom','legacy','v2'].includes(value.modelMode)||![value.min,value.max].every(n=>Number.isInteger(n)&&n>=2&&n<=20)||value.min>value.max)throw Error('설정 자료를 확인해 주세요.');
  return {...tuning.settings(value),...policy.normalizeRange(value)};
 }
 function read(storage){
  const raw=storage.getItem(KEY);if(!raw)return [];
  const doc=JSON.parse(raw);if(doc.schema!==1||!Array.isArray(doc.entries))throw Error('저장된 설정을 읽지 못했습니다.');
  return doc.entries.map(p=>{if(typeof p.name!=='string'||!p.name.trim()||p.name.length>60)throw Error('저장된 이름을 확인해 주세요.');return {name:p.name,settings:config(p.settings)};});
 }
 function persist(storage,entries,revision){
  const old=JSON.parse(storage.getItem(KEY)||'{}');storage.setItem(KEY,JSON.stringify({schema:1,entries,recommendationRevision:revision??old.recommendationRevision}));
 }
 function replaceGenerated(storage,presets,revision,force=false){
  const old=JSON.parse(storage.getItem(KEY)||'{}');if(!force&&old.recommendationRevision===revision)return false;
  const entries=read(storage).filter(p=>!/^서울 (?:과거 최고 \d+위|10% 분산 \d+번|(?:5경주|균형) 기준(?:3|4|9) 파생 \d+번)$/.test(p.name));
  const next=presets.map(p=>({name:String(p.name),settings:config(p.settings)}));
  if(next.some(p=>!p.name.trim()||p.name.length>60)||entries.length+next.length>50)throw Error('저장 공간 또는 설정 이름을 확인해 주세요. 최대 50개입니다.');
  persist(storage,[...entries,...next],revision);return true;
 }
 function save(storage,name,settings){
  name=String(name).trim();if(!name||name.length>60)throw Error('설정 이름을 1~60자로 입력하세요.');
  const entries=read(storage),preset={name,settings:config(settings)},index=entries.findIndex(p=>p.name===name);
  if(index>=0)entries[index]=preset;else{if(entries.length>=50)throw Error('최대 50개까지 저장할 수 있습니다.');entries.push(preset);}
  persist(storage,entries);return entries;
 }
 function saveMany(storage,presets){
  const entries=read(storage),next=new Map(entries.map(p=>[p.name,p]));
  for(const item of presets){const name=String(item.name).trim();if(!name||name.length>60)throw Error('설정 이름을 1~60자로 입력하세요.');next.set(name,{name,settings:config(item.settings)});}
  if(next.size>50)throw Error('최대 50개까지 저장할 수 있습니다. 기존 설정을 정리해 주세요.');
  const out=[...next.values()];persist(storage,out);return out;
 }
 function remove(storage,name){const entries=read(storage).filter(p=>p.name!==name);persist(storage,entries);return entries;}
 return {KEY,config,read,save,saveMany,remove,replaceGenerated};
})();
if(typeof module!=='undefined')module.exports=StrategyPresets;

