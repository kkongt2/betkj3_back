import importlib.util,copy
spec=importlib.util.spec_from_file_location('features','scripts/prepare-weighted-v3.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def race(date,rank=3,n=10,distance=1200):
    order=[rank]+[x for x in range(1,n+1) if x!=rank]
    return {'date':date,'venue':'seoul','race_no':1,'distance':distance,'grade':'국4등급','place_k':2 if n<=7 else 3,'place_winners':[i+1 for i,f in enumerate(order) if f<=(2 if n<=7 else 3)],'horses':[{'number':i+1,'name':str(i+1),'age':4,'sex':'수','rating':50,'burden':55,'jockey':'J','trainer':'T','horse_weight':460,'finish':f,'race_seconds':73+f} for i,f in enumerate(order)]}
h=m.History()
for i,rank in enumerate([10,2,3,1,4,5]):h.add_day([race('2022010'+str(i+1),rank,distance=1600 if i in (2,4) else 1200)])
f=h.features(race('20220201'))['1'];assert f['starts']==5;assert f['distanceStarts']==3
assert f['raw'][0]==3/5 and f['raw'][1]==1/5 and f['raw'][2]==2/3
assert abs(f['raw'][16]-sum((10-r)/9 for r in [2,3,1,4,5])/5)<1e-12
assert f['meanFinish']==3 and f['fieldSizes']==[10]*5
# The sixth-oldest race cannot influence the three rates or the new mean.
h2=m.History()
for i,rank in enumerate([1,2,3,1,4,5]):h2.add_day([race('2022010'+str(i+1),rank,distance=1600 if i in (2,4) else 1200)])
f2=h2.features(race('20220201'))['1'];assert [f['raw'][i] for i in (0,1,2,16)]==[f2['raw'][i] for i in (0,1,2,16)]
# No twelve-month cutoff: older previous starts still count, but never future races.
old=m.History();old.add_day([race('20220101',1)]);future=race('20240201');future['horses'][0]['age']=6
assert old.features(future)['1']['starts']==1 and old.features(future)['1']['raw'][0]==1
values=[]
for n in (7,10):
    hist=m.History();hist.add_day([race('20220101',3,n)]);values.append(hist.features(race('20220201',3,n))['1']['raw'][16])
assert abs(values[0]-2/3)<1e-12 and abs(values[1]-7/9)<1e-12 and values[1]>values[0]
assert h.features(race('20220201',distance=2000))['1']['raw'][2]==3/5
print('PASS exact last-five rates, distance subset, sixth-race exclusion, old-start inclusion and field-adjusted equal-weight mean rank')

empty=m.History().features(race('20220101'))['1']
assert len(empty['available'])==len(m.FEATURES) and not any(empty['available'][i] for i in (0,1,2,4,10,13,14,15,16))
assert empty['raw'][0] is not None and empty['available'][0] is False
assert all(f['available'][i] for i in (0,1,2,4,16))
far=h.features(race('20220201',distance=2000))['1'];assert far['available'][2] is False and far['raw'][2]==far['raw'][0]
assert old.features(future)['1']['available'][0] is True
print('PASS explicit availability flags distinguish genuine observations from populated defaults and distance fallback')
