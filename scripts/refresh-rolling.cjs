const fs=require('node:fs'),cp=require('node:child_process'),policy=require('../qpl-policy.js');
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
const manifest=JSON.parse(fs.readFileSync('qpl-history.json')),rows=manifest.shards.flatMap(s=>JSON.parse(fs.readFileSync(s.url)).rows).filter(r=>r.date<today&&r.settled),d=rows.at(-1)?.date||manifest.from,q=d.slice(0,4)+String(Math.floor((+d.slice(4,6)-1)/3)*3+1).padStart(2,'0')+'01';
const report=fs.existsSync('rolling-report.json')?JSON.parse(fs.readFileSync('rolling-report.json')):null;
if(report?.scope==='seoul'&&report?.version===require('../tuning-model.js').VERSION&&report?.policyVersion===policy.VERSION&&report.live?.forQuarter===q)console.log('Retain frozen quarterly settings:',q);
else{cp.execFileSync('g++',['-O3','-fopenmp','-std=c++17','scripts/search-v3.cpp','-o','/tmp/search-v3'],{stdio:'inherit'});cp.execFileSync(process.execPath,['scripts/rolling-search.cjs'],{stdio:'inherit'});}
