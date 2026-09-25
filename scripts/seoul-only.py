"""Keep only Seoul source records and public data before any feature calculation."""
import gzip,json,shutil
from pathlib import Path

def write(path,doc):path.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':')))
def card(r):
    for k in list(r):
        if k.startswith('weighted_'):r.pop(k)
    for h in r.get('horses',[]):
        for k in list(h):
            if k.startswith('weighted_'):h.pop(k)
    return r
def main():
    data=Path('data'); counts={}
    for p in (data/'calendar').glob('????????.json'):
        d=json.loads(p.read_text());d['races']=[card(r) for r in d.get('races',[]) if r.get('venue')=='seoul']
        if not d['races']:p.unlink();continue
        d['venue']='seoul';d['scope']='seoul';counts[p.stem]=len(d['races']);write(p,d)
    p=data/'latest.json';d=json.loads(p.read_text());d['races']=[card(r) for r in d.get('races',[]) if r.get('venue')=='seoul']
    latest={}
    for r in d['races']:latest[r['date']]=latest.get(r['date'],0)+1
    dates=set(counts)|set(latest)
    dates.update(x['date'] for x in d.get('calendar',[]) if 'seoul' in x.get('venues',[]))
    d['calendar']=[{'date':date,'venues':['seoul'],'races':counts.get(date,latest.get(date,0))} for date in sorted(dates)]
    d['scope']='seoul';d['status']='서울 경주 전용';write(p,d)
    for p in (data/'market-odds').glob('*.json'):
        d=json.loads(p.read_text());d['races']={k:v for k,v in d.get('races',{}).items() if k.startswith('seoul:')}
        if not d['races']:p.unlink();continue
        d['scope']='seoul';write(p,d)
    # Retire nationwide models/reports and ancillary archives from the public bundle.
    for p in data.iterdir():
        if p.name not in ('latest.json','calendar','market-odds'):
            if p.is_dir():shutil.rmtree(p)
            else:p.unlink()
    for p in Path('history').glob('*.gz'):
        if p.name.startswith('weighted-') and p.name!='weighted-source.jsonl.gz':p.unlink();continue
        rows=[json.loads(line) for line in gzip.decompress(p.read_bytes()).splitlines()]
        rows=[r for r in rows if r.get('race',r).get('venue')=='seoul']
        for r in rows:
            if isinstance(r.get('race'),dict):card(r['race'])
        p.write_bytes(gzip.compress(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows).encode(),mtime=0))
    for p in Path('history').glob('*-coverage.json'):
        archive=p.with_name(p.name.replace('-coverage.json','.jsonl.gz'))
        if archive.exists():
            rows=[json.loads(line) for line in gzip.decompress(archive.read_bytes()).splitlines()]
            write(p,{'schema':1,'scope':'seoul','year':p.name[:4],'races':len(rows),'from':min((r['race']['date'] for r in rows),default=None),'to':max((r['race']['date'] for r in rows),default=None)})
    print('Seoul only:',len(counts),'calendar days;',len(dates),'available dates')
if __name__=='__main__':main()
