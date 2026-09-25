"""Recover every available pre-calendar race from the existing official-report archive."""
import argparse,bisect,gzip,json,re,sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from itertools import combinations
from pathlib import Path
sys.path.insert(0,str(Path('_seed/scripts/model-research')))
from collect import get,VENUES
from history_payouts import dividends,parse_place_quotes

def main():
    p=argparse.ArgumentParser();p.add_argument('--year',required=True);args=p.parse_args();year=args.year
    target=Path('history')/(year+'.jsonl.gz');coverage=Path('history')/(year+'-coverage.json')
    if target.exists() and coverage.exists() and json.loads(coverage.read_text()).get('scope')=='seoul':
        print('Preserved completed year',year,json.loads(coverage.read_text()),flush=True);return
    rows=[json.loads(line) for line in gzip.decompress(Path('_seed/training/history-v7.jsonl.gz').read_bytes()).splitlines()]
    rows=[r for r in rows if r.get('venue')=='seoul']
    cutoff=min(p.stem for p in Path('data/calendar').glob('????????.json'))
    selected=[r for r in rows if r['date'].startswith(year) and r['date']<cutoff]
    grouped=defaultdict(list)
    for r in selected:grouped[(r['date'],r['venue'])].append(r)
    reports=[r for r in json.loads(Path('_seed/training/manifest.json').read_text())['reports'] if (r['date'],VENUES[r['meet']]) in grouped]
    print('Expanding',year,'reports',len(reports),'races',len(selected),'cutoff',cutoff,flush=True)
    horses=defaultdict(list);people=defaultdict(list)
    for r in sorted(rows,key=lambda r:r['date']):
        day=datetime.strptime(r['date'],'%Y%m%d').toordinal()
        for h in r['horses']:
            horses[r['venue'],h['name']].append((day,h['finish'],r['distance']))
            for kind in ('jockey','trainer'):people[r['venue'],kind,h[kind]].append((day,h['finish']))
    person_days={k:[x[0] for x in v] for k,v in people.items()}
    def card_for(r):
        day=datetime.strptime(r['date'],'%Y%m%d').toordinal()
        card={k:r[k] for k in ('date','venue','race_no','distance','grade')};card.update(start_time='',calendar_archive=True,historical_view=True)
        card['horses']=[{k:h[k] for k in ('number','name','age','sex','rating','burden','jockey','trainer','horse_weight','horse_weight_change') if k in h} for h in sorted(r['horses'],key=lambda h:h['number'])]
        for h in card['horses']:
            hist=[x for x in horses[r['venue'],h['name']] if x[0]<day];yr=[x for x in hist if x[0]>=day-365];dist=[x for x in hist if x[2]==r['distance']]
            h.update(starts_1y=len(yr),wins_1y=sum(x[1]==1 for x in yr),seconds_1y=sum(x[1]==2 for x in yr),thirds_1y=sum(x[1]==3 for x in yr),distance_starts=len(dist),distance_top3=sum(x[1]<=3 for x in dist),recent_finishes=[x[1] for x in hist[-5:][::-1]],interval_weeks=(day-hist[-1][0])/7 if hist else 0)
            for kind in ('jockey','trainer'):
                k=(r['venue'],kind,h[kind]);a,b=bisect.bisect_left(person_days[k],day-365),bisect.bisect_left(person_days[k],day)
                values=people[k][a:b];h[kind+'_stats_1y']={'place_rate':sum(x[1]<=3 for x in values)/len(values) if values else .3}
        return card
    output=[];issues=[];errors=[]
    def collect(report):
        cache=Path('training/raw')/str(report['meet'])/(report['date']+'.txt.gz');cache.parent.mkdir(parents=True,exist_ok=True)
        try:
            if not cache.exists():cache.write_bytes(gzip.compress(get(report['source']).encode('utf-8'),mtime=0))
            text=gzip.decompress(cache.read_bytes()).decode('utf-8');blocks={}
            for block in re.split(r'(?=제목\s*:\s*\d{2,4}년)',text):
                m=re.search(r'제목\s*:\s*(\d{2,4})년\s*(\d+)월\s*(\d+)일.*?제\s*(\d+)경주',block)
                if m:
                    y,mo,d,rn=map(int,m.groups());y+=2000 if y<100 else 0
                    if f'{y:04d}{mo:02d}{d:02d}'!=report['date']:raise ValueError('Report date mismatch')
                    blocks[rn]=block
            return report,blocks,None
        except Exception as e:return report,{},str(e)
    with ThreadPoolExecutor(max_workers=3) as pool:
        for i,(report,blocks,error) in enumerate(pool.map(collect,reports)):
            if error:errors.append({'date':report['date'],'meet':report['meet'],'error':error})
            for r in grouped[report['date'],VENUES[report['meet']]]:
                card=card_for(r);market={'quotes':[]};block=blocks.get(r['race_no'],'');ns=[h['number'] for h in card['horses']]
                result={'status':'unavailable','source':report['source'],'starters':ns};card['official_result']=result
                try:
                    if error:raise ValueError('Official report unavailable: '+error)
                    winners=[h['number'] for h in sorted(r['horses'],key=lambda h:h['finish'])[:3]]
                    result['pair']=dividends(block,'pair',[tuple(sorted(p)) for p in combinations(winners,2)])
                    result['place']=dividends(block,'place',[(n,) for n in r['place_winners']]);result['status']='confirmed'
                    quotes=parse_place_quotes(block)
                    if {q['numbers'][0] for q in quotes}!=set(ns):raise ValueError('Incomplete final place odds')
                    market={'quotes':quotes}
                except ValueError as e:issues.append({'date':r['date'],'venue':r['venue'],'race':r['race_no'],'reason':str(e)})
                output.append({'race':card,'market':market})
            if (i+1)%20==0:print(year,'reports',i+1,'/',len(reports),'races',len(output),'excluded',len(issues),flush=True)
    if errors:print('Unavailable reports:',json.dumps(errors,ensure_ascii=False),flush=True)
    if len(output)!=len(selected):raise RuntimeError('Incomplete historical expansion')
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(gzip.compress(''.join(json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n' for x in output).encode(),mtime=0))
    info={'schema':1,'scope':'seoul','year':year,'races':len(output),'reports':len(reports),'from':min((x['race']['date'] for x in output),default=None),'to':max((x['race']['date'] for x in output),default=None),'unavailable':issues,'download_errors':errors,'source':'kkongt2/timeline training/history-v7.jsonl.gz'}
    coverage.write_text(json.dumps(info,ensure_ascii=False,indent=2));print('Completed',year,len(output),'races',len(issues),'unavailable',flush=True)
if __name__=='__main__':main()
