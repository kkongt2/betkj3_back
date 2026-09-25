"""Pre-race, day-batched features. Current-race results are never model inputs."""
import gzip,json,math,re,statistics,sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

VERSION='weighted-seoul-last5-v2'
FIT_TO='20230930'
FEATURES=['place','win','distance','rating','recent','jockey','trainer','burden','body','interval','speed','margin','opponents','speed_median','speed_best','speed_consistency','mean_finish5','finish_trend','speed_trend','speed_last','finish_consistency']
def day(s):return datetime.strptime(s,'%Y%m%d').toordinal()
def avg(xs,default=None):return sum(xs)/len(xs) if xs else default
def clip(x,a,b):return max(a,min(b,x))
def key(r,h):
    age=h.get('age');sex='F' if h.get('sex')=='암' else 'M' if h.get('sex') in ('수','거') else '?'
    return '|'.join([r['venue'],str(h['name']).strip(),str(int(r['date'][:4])-int(age)) if age else '?',sex])
def grade(s):
    m=re.search(r'(\d)등급',str(s or ''));return int(m[1]) if m else None
def clean_person(s):return re.sub(r'^\([^)]*\)','',str(s or '')).strip()
def weighted(xs,day_no,fn,half=120):
    pairs=[(fn(x),2**(-(day_no-x['day'])/half)) for x in xs];pairs=[(v,w) for v,w in pairs if v is not None]
    return (sum(v*w for v,w in pairs),sum(w for v,w in pairs))
def smooth(xs,d,fn,prior,strength):v,n=weighted(xs,d,fn);return (v+strength*prior)/(n+strength)
def trend(xs,field):
    # Preserve the original start positions when some records are missing.
    points=[(i,x[field]) for i,x in enumerate(xs) if x.get(field) is not None]
    if len(points)<2:return None
    mx=avg([i for i,v in points]);my=avg([v for i,v in points])
    slope=sum((i-mx)*(v-my) for i,v in points)/sum((i-mx)**2 for i,v in points)
    return slope*len(points)/(len(points)+3)
def active(r):return [h for h in r['horses'] if not h.get('withdrawn') and (not r.get('official_result',{}).get('starters') or h['number'] in r['official_result']['starters'])]
class History:
    def __init__(self):self.horses=defaultdict(list);self.people=defaultdict(list);self.times=defaultdict(list);self.through=''
    def features(self,r):
        if r.get('venue')!='seoul':raise ValueError('Seoul race required')
        d=day(r['date']);field=active(r);ratings=[float(h['rating']) for h in field if h.get('rating',0)>0];field_rating=avg(ratings);base=(2 if len(field)<=7 else 3)/max(3,len(field));result={}
        for h in r['horses']:
            hist=[x for x in self.horses[key(r,h)] if x['day']<d];yr=[x for x in hist if x['day']>=d-365];recent=hist[-5:];last=hist[-1] if hist else None
            place=avg([x['placed'] for x in recent],base)
            win=avg([x['win'] for x in recent],1/max(3,len(field)))
            near=[x for x in recent if abs(x['distance']-r['distance'])<=200]
            dist=avg([x['placed'] for x in near],place)
            rating=(float(h['rating'])-field_rating) if h.get('rating',0)>0 and field_rating is not None else None
            form=smooth(recent,d,lambda x:x['form'],.5,3)
            people=[];people_counts=[]
            for kind in ('jockey','trainer'):
                p=[x for x in self.people[(r['venue'],kind,clean_person(h.get(kind)))] if d-365<=x['day']<d]
                people.append(smooth(p,d,lambda x:x['residual'],0,30) if p else None)
                people_counts.append(len(p))
            comparable=last and h.get('burden') and last.get('burden') and grade(r.get('grade')) is not None and grade(r.get('grade'))==last.get('grade') and h.get('rating',0)>0 and abs(h['rating']-last['rating'])<=3
            burden=clip(last['burden']-h['burden'],-5,5) if comparable else None
            own_body=[x['body'] for x in hist[-10:] if x.get('body') and x['placed']]
            body=-abs(float(h['horse_weight'])-statistics.median(own_body))/statistics.median(own_body) if h.get('horse_weight') and len(own_body)>=3 else None
            gaps=[hist[i]['day']-hist[i-1]['day'] for i in range(1,len(hist)) if hist[i]['day']>hist[i-1]['day']]
            gap=d-last['day'] if last else None
            interval=-abs(math.log((gap+7)/(statistics.median(gaps[-10:])+7))) if gap is not None and len(gaps)>=3 else None
            speed=smooth(recent,d,lambda x:x.get('speed'),0,3) if any(x.get('speed') is not None for x in recent) else None
            margin=smooth(recent,d,lambda x:-x['margin'] if x.get('margin') is not None else None,0,3) if any(x.get('margin') is not None for x in recent) else None
            opp=[x['opponents'] for x in recent if x.get('opponents') is not None]
            opponent=(avg(opp)-field_rating)/20 if opp and field_rating is not None else None
            cg=grade(r.get('grade'));lg=last.get('grade') if last else None
            if opponent is not None and cg and lg:opponent+=(cg-lg)/3
            records=[x['speed'] for x in recent if x.get('speed') is not None]
            median=statistics.median(records) if records else None
            best=max(records)*len(records)/(len(records)+3) if records else None
            consistency=-statistics.pstdev(records) if len(records)>=3 else None
            forms=[x['form'] for x in recent]
            values=[place,win,dist,rating,form,*people,burden,body,interval,speed,margin,opponent,median,best,consistency,avg(forms,.5),trend(recent,'form'),trend(recent,'speed'),last.get('speed') if last else None,-statistics.pstdev(forms) if len(forms)>=3 else None]
            available=[v is not None for v in values]
            for i in (0,1,4,16):available[i]=bool(recent)
            available[2]=bool(near)
            margin_count=sum(x.get('margin') is not None for x in recent)
            counts=[len(recent),len(recent),len(near),len(ratings) if rating is not None else 0,len(recent),*people_counts,int(bool(comparable)),len(own_body),len(gaps[-10:]),len(records),margin_count,len(opp),len(records),len(records),len(records),len(recent),len(forms),len(records),int(values[19] is not None),len(forms)]
            details={
                'version':'last5-detail-v1','counts':counts,
                'recent':[{'date':datetime.fromordinal(x['day']).strftime('%Y%m%d'),'finish':x['finish'],'fieldSize':x['fieldSize'],'form':x['form'],'speed':x.get('speed'),'distance':x['distance'],'grade':x.get('grade')} for x in recent],
                'finishTrend':values[17],'speedTrend':values[18],'lastSpeed':values[19],
                'finishStd':statistics.pstdev(forms) if len(forms)>=3 else None,
                'speedStd':statistics.pstdev(records) if len(records)>=3 else None,
                'distanceChange':r['distance']-last['distance'] if last else None,
                'previousGrade':lg,'currentGrade':cg,'restDays':gap,
                'usualRestDays':statistics.median(gaps[-10:]) if len(gaps)>=3 else None}
            result[str(h['number'])]={'available':available,'raw':values,'starts':len(recent),'distanceStarts':len(near),'meanFinish':avg([x['finish'] for x in recent]),'meanFinishScore':avg(forms),'fieldSizes':[x['fieldSize'] for x in recent],'recordStarts':len(records),'marginStarts':margin_count,'through':datetime.fromordinal(last['day']).strftime('%Y%m%d') if last else None,'detail':details}
        return result
    def add_day(self,rs):
        rs=[r for r in rs if r.get('venue')=='seoul']
        # Compute all baselines before updating any horse/person/track pool that day.
        pending=[];time_updates=[]
        for r in rs:
            if r.get('venue')!='seoul' or not r.get('horses'):continue
            d=day(r['date']);n=len(r['horses']);winners=set(r.get('place_winners') or [h['number'] for h in sorted(r['horses'],key=lambda h:h['finish'])[:r.get('place_k',3)]])
            rated=[float(h['rating']) for h in r['horses'] if h.get('rating',0)>0]
            times=[h['race_seconds'] for h in r['horses'] if h.get('race_seconds') and h.get('finish',99)<=n]
            winner_time=min(times) if times else None
            track=str(r.get('track_condition') or '?');race_grade=grade(r.get('grade'));exact=(r['venue'],r['distance'],race_grade,track);fallback=(r['venue'],r['distance'],race_grade,'*')
            pool=self.times[exact] if len(self.times[exact])>=20 else self.times[fallback]
            ref=statistics.median(pool[-200:]) if len(pool)>=20 and race_grade is not None else None
            base=r.get('place_k',3)/n
            for h in r['horses']:
                hist=[x for x in self.horses[key(r,h)] if d-365<=x['day']<d]
                expected=smooth(hist,d,lambda x:x['placed'],base,8)
                seconds=h.get('race_seconds');valid=seconds and 10<seconds<600 and h['finish']<=n
                other=[float(x['rating']) for x in r['horses'] if x['number']!=h['number'] and x.get('rating',0)>0]
                entry=dict(day=d,finish=h['finish'],fieldSize=n,placed=int(h['number'] in winners),win=int(h['finish']==1),form=clip((n-h['finish'])/max(1,n-1),0,1),
                    distance=r['distance'],rating=float(h.get('rating') or 0),grade=grade(r.get('grade')),burden=h.get('burden'),body=h.get('horse_weight'),
                    speed=clip((ref-seconds)*1200/r['distance'],-20,20) if ref is not None and valid else None,
                    margin=clip((seconds-winner_time)*1200/r['distance'],0,30) if valid and winner_time else None,opponents=avg(other))
                pending.append((r,h,entry,entry['placed']-expected))
            if winner_time:
                time_updates.extend([(exact,winner_time),(fallback,winner_time)])
        for r,h,e,residual in pending:
            self.horses[key(r,h)].append(e)
            for kind in ('jockey','trainer'):self.people[(r['venue'],kind,clean_person(h.get(kind)))].append({'day':e['day'],'residual':residual})
        for k,t in time_updates:self.times[k].append(t)
        if rs:self.through=max(self.through,max(r['date'] for r in rs))

def read_seed():
    p=Path('_seed/training/history-v7.jsonl.gz')
    if not p.exists():raise RuntimeError('Official record archive is required')
    source=[json.loads(x) for x in gzip.decompress(p.read_bytes()).splitlines()]
    extra=Path('history/weighted-source.jsonl.gz')
    if extra.exists():source += [json.loads(x) for x in gzip.decompress(extra.read_bytes()).splitlines()]
    return { (r['date'],r['venue'],r['race_no']):r for r in source if r.get('venue')=='seoul'}
def read_targets():
    out={}
    for p in sorted(Path('history').glob('[0-9][0-9][0-9][0-9].jsonl.gz')):
        for line in gzip.decompress(p.read_bytes()).splitlines():
            r=json.loads(line)['race'];out[(r['date'],r['venue'],r['race_no'])]=r
    for p in sorted(Path('data/calendar').glob('????????.json')):
        for r in json.loads(p.read_text())['races']:out[(r['date'],r['venue'],r['race_no'])]=r
    for r in json.loads(Path('data/latest.json').read_text()).get('races',[]):
        out.setdefault((r['date'],r['venue'],r['race_no']),r)
    return {k:r for k,r in out.items() if r.get('venue')=='seoul'}
def main():
    source=read_seed();targets=read_targets()
    # Recover only tail dates absent from the maintained seed. No invented outcome data.
    sys.path.insert(0,'_seed/scripts/model-research')
    from collect_v7 import parse_report
    from collect import get
    meets={'seoul':1};errors=[];extra=[]
    for venue,meet in meets.items():
        last=max((k[0] for k in source if k[1]==venue),default='')
        dates=sorted({r['date'] for r in targets.values() if r['venue']==venue and r['date']>last and r.get('official_result',{}).get('status')=='confirmed'})
        for date in dates:
            url=f'https://race.kra.co.kr/dbdata/fileDownLoad.do?fn=chollian/{venue}/jungbo/rcresult/{date}dacom11.rpt&meet={meet}'
            try:
                rows,issues=parse_report(get(url),meet,date)
                if not rows:raise ValueError('No validated race records')
                extra.extend(rows)
                for r in rows:source[(r['date'],r['venue'],r['race_no'])]=r
            except Exception as e:errors.append({'date':date,'venue':venue,'error':str(e)})
    previous=Path('history/weighted-source.jsonl.gz')
    if previous.exists():extra += [json.loads(x) for x in gzip.decompress(previous.read_bytes()).splitlines()]
    uniq={(r['date'],r['venue'],r['race_no']):r for r in extra if r.get('venue')=='seoul'}
    previous.write_bytes(gzip.compress(''.join(json.dumps(uniq[k],ensure_ascii=False,separators=(',',':'))+'\n' for k in sorted(uniq)).encode(),mtime=0))
    by_source=defaultdict(list);by_target=defaultdict(list)
    for r in source.values():by_source[r['date']].append(r)
    for k,r in targets.items():by_target[r['date']].append((k,r))
    history=History();snapshots={};raw_train=[[] for _ in FEATURES];coverage=[0]*len(FEATURES);observed_coverage=[0]*len(FEATURES);horse_count=0
    for date in sorted(set(by_source)|set(by_target)):
        for k,r in by_target[date]:
            features=history.features(r);snapshots[k]={'date':r['date'],'venue':r['venue'],'race':r['race_no'],'version':VERSION,'historyThrough':history.through or None,'horses':features}
            for x in features.values():
                horse_count+=1
                for i,has_data in enumerate(x['available']):observed_coverage[i]+=int(has_data)
                for i,v in enumerate(x['raw']):
                    if v is not None:
                        coverage[i]+=1
                        if date<=FIT_TO:raw_train[i].append(v)
        history.add_day(by_source[date])
    scaler={'scope':'seoul','version':VERSION,'fitThrough':FIT_TO,'features':FEATURES,'mean':[avg(x,0) for x in raw_train],'std':[max(statistics.pstdev(x),1e-4) if len(x)>1 else 1 for x in raw_train]}
    for snap in snapshots.values():
        for x in snap['horses'].values():
            x['features']=[round(.5+clip((v-scaler['mean'][i])/scaler['std'][i],-3,3)/6,10) if v is not None else .5 for i,v in enumerate(x.pop('raw'))]
    Path('history/weighted-v3.jsonl.gz').write_bytes(gzip.compress(''.join(json.dumps(snapshots[k],ensure_ascii=False,separators=(',',':'))+'\n' for k in sorted(snapshots)).encode(),mtime=0))
    def enrich(r):
        snap=snapshots.get((r['date'],r['venue'],r['race_no']))
        if snap:
            r['weighted_v3_version']=VERSION;r['weighted_v3_history_through']=snap['historyThrough']
            for h in r['horses']:
                f=snap['horses'].get(str(h['number']))
                if f:h['weighted_v3_features']=f['features'];h['weighted_v3_support']={k:v for k,v in f.items() if k!='features'}
    for p in [*Path('data/calendar').glob('????????.json'),Path('data/latest.json')]:
        doc=json.loads(p.read_text())
        for r in doc.get('races',[]):enrich(r)
        p.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':')))
    Path('data/weighted-v3-scaler.json').write_text(json.dumps(scaler,separators=(',',':')))
    report={'schema':1,'scope':'seoul','version':VERSION,'sourceRaces':len(source),'targetRaces':len(snapshots),'horseStarts':horse_count,'historyThrough':history.through,
            'fitThrough':FIT_TO,'coverage':dict(zip(FEATURES,coverage)),'observedCoverage':dict(zip(FEATURES,observed_coverage)),'fallbackCoverage':dict(zip(FEATURES,[horse_count-x for x in observed_coverage])),'coverageDefinition':'coverage includes populated defaults; observedCoverage requires feature-specific prior observations and eligibility conditions','tailDownloadErrors':errors,
            'marginDefinition':'Previous race time minus winner time, seconds normalized to 1200m; not lengths',
            'speedDefinition':'Previous race time vs preceding-date median winning time for venue/distance/grade/track, fallback venue/distance/grade (minimum 20 earlier records); unknown grade is neutral',
            'recentDefinition':'Latest five previous Seoul starts; equal-weight place/win rates; distance rate uses their subset within 200m; no older starts are included','meanFinishDefinition':'Arithmetic mean of (fieldSize-finish)/(fieldSize-1) over the same previous five starts; nonfinish is clipped to zero',
            'currentResultInputs':False,'sameDayResultsInputs':False}
    Path('data/weighted-v3-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
