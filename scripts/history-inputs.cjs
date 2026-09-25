const fs=require('node:fs'),zlib=require('node:zlib');
function inputs(){
 const rows=new Map(),add=race=>race.venue==='seoul'&&rows.set([race.date,race.venue,race.race_no].join(':'),{race,market:null});
 if(fs.existsSync('history'))for(const file of fs.readdirSync('history').filter(f=>/^\d{4}\.jsonl\.gz$/.test(f)).sort()){
  for(const line of zlib.gunzipSync(fs.readFileSync('history/'+file)).toString().trim().split('\n').filter(Boolean)){
   const x=JSON.parse(line);add(x.race);
  }
 }
 for(const file of fs.readdirSync('data/calendar').filter(f=>/^\d{8}\.json$/.test(f)).sort()){
  for(const race of JSON.parse(fs.readFileSync('data/calendar/'+file)).races)add(race);
 }
 if(fs.existsSync('history/weighted-v3.jsonl.gz'))for(const line of zlib.gunzipSync(fs.readFileSync('history/weighted-v3.jsonl.gz')).toString().trim().split('\n').filter(Boolean)){
  const x=JSON.parse(line),entry=rows.get([x.date,x.venue,x.race].join(':'));if(!entry)continue;
  entry.race.weighted_v3_version=x.version;entry.race.weighted_v3_history_through=x.historyThrough;
  for(const h of entry.race.horses){const f=x.horses[String(h.number)];if(f){h.weighted_v3_features=f.features;h.weighted_v3_support={...f};delete h.weighted_v3_support.features;}}
 }
 return [...rows.values()].sort((a,b)=>a.race.date.localeCompare(b.race.date)||a.race.venue.localeCompare(b.race.venue)||a.race.race_no-b.race.race_no);
}
module.exports=inputs;
