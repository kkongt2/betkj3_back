// Keep every verified source year; deliver bounded-size yearly files to mobile clients.
const fs=require('node:fs'),model=require('../model.js'),policy=require('../qpl-policy.js'),tuning=require('../tuning-model.js'),inputs=require('./history-inputs.cjs');
const rows=inputs().map(x=>tuning.pack(model.analyze(x.race,'accuracy'),x.market));
const generatedAt=JSON.parse(fs.readFileSync('data/latest.json')).updated_at||new Date().toISOString();
fs.rmSync('qpl-history-years',{recursive:true,force:true});
fs.mkdirSync('qpl-history-years',{recursive:true});
const shards=[];
for(const year of [...new Set(rows.map(r=>r.date.slice(0,4)))]){
 const selected=rows.filter(r=>r.date.startsWith(year)),url='qpl-history-years/'+year+'.json';
 fs.writeFileSync(url,JSON.stringify({schema:2,policyVersion:policy.VERSION,rows:selected}));
 shards.push({url,rows:selected.length,from:selected[0].date,to:selected.at(-1).date});
}
const doc={schema:3,scope:'seoul',policyVersion:policy.VERSION,generatedAt,from:rows[0]?.date,to:rows.at(-1)?.date,races:rows.length,shards};
fs.writeFileSync('qpl-history.json',JSON.stringify(doc));
console.log('Built all-history index:',doc.from,'to',doc.to,doc.races,'races;',shards.length,'yearly files');
