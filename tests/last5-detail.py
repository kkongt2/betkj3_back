"""Information lost by a mean: ordering, dispersion, last observation and support."""
import importlib.util,copy,math
spec=importlib.util.spec_from_file_location('features','scripts/prepare-weighted-v3.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r={'date':'20220301','venue':'seoul','race_no':1,'distance':1400,'grade':'국3등급','horses':[{'number':i,'name':str(i),'age':4,'sex':'수','rating':50,'burden':55,'horse_weight':460} for i in range(1,11)]}
def history(forms,speeds=None):
 h=m.History();speeds=forms if speeds is None else speeds
 for i,(form,speed) in enumerate(zip(forms,speeds)):
  h.horses[m.key(r,r['horses'][0])].append(dict(day=m.day('20220101')+i*7,finish=10-9*form,fieldSize=10,placed=int(form>=7/9),win=int(form==1),form=form,distance=1200,grade=4,rating=50,burden=55,body=460,speed=speed,margin=1,opponents=50))
 return h
up=history([0,.25,.5,.75,1]);down=history([1,.75,.5,.25,0]);a=up.features(r)['1'];b=down.features(r)['1']
assert a['raw'][16]==b['raw'][16]==.5
assert a['raw'][17]>0>b['raw'][17] and a['raw'][18]>0>b['raw'][18]
assert a['raw'][19]==1 and b['raw'][19]==0
flat=history([.5]*5).features(r)['1'];assert flat['raw'][16]==a['raw'][16] and flat['raw'][20]>a['raw'][20]
assert flat['available'][17] and flat['raw'][17]==0  # observed neutrality, not missing
empty=m.History().features(r)['1'];assert all(empty['raw'][i] is None and not empty['available'][i] for i in range(17,21))
assert empty['detail']['counts'][17:]==[0,0,0,0]
one=history([.5]).features(r)['1'];assert one['raw'][17] is None and one['raw'][20] is None
assert math.isclose(m.trend([{'speed':0},{'speed':None},{'speed':2}],'speed'),.4)
missing=history([0,.25,.5,.75,1],[1,2,3,4,None]).features(r)['1'];assert missing['raw'][19] is None and not missing['available'][19] and missing['detail']['counts'][19]==0
# Same-day and current results, payouts and future records cannot supply these features.
changed=copy.deepcopy(r);changed['horses'][0].update(finish=1,race_seconds=60);changed['official_result']={'pair':{'payouts':[{'numbers':[1,2],'odds':999}]}}
assert up.features(changed)==up.features(r)
for date in [r['date'],'20220401']:
 e=copy.deepcopy(up.horses[m.key(r,r['horses'][0])][-1]);e.update(day=m.day(date),form=0,speed=-20);up.horses[m.key(r,r['horses'][0])].append(e)
assert up.features(r)['1']==a
# The sixth-oldest start is excluded from every new score.
h=history([0,0,.25,.5,.75,1]);before=h.features(r)['1']['raw'][17:];h.horses[m.key(r,r['horses'][0])][0].update(form=1,speed=999)
assert h.features(r)['1']['raw'][17:]==before
assert a['detail']['counts'][17:]==[5,5,1,5]
assert a['detail']['distanceChange']==200 and a['detail']['previousGrade']==4 and a['detail']['currentGrade']==3
assert a['detail']['usualRestDays']==7 and a['detail']['restDays']==31
assert all(x['date']<r['date'] for x in a['detail']['recent'])
assert len(a['raw'])==len(a['available'])==len(a['detail']['counts'])==21
print('PASS equal-mean opposite trends, dispersion, latest-only record, missing-position slope, sample support, conditions and strict past-only isolation')
