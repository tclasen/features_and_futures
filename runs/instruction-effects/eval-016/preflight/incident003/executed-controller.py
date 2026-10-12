"""Bind the third retained provider incident to original raw evidence and history."""
import json,hashlib,subprocess,tempfile,shutil
from pathlib import Path
r=Path('runs/instruction-effects/eval-016');a=r/'tasks/task-011/attempts/b006/attempt-001';i=json.loads((a/'infrastructure-incident.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert not i['builder_assessment_performed'] and not i['native_accounting_complete']
assert i['terminal_request_coverage']['complete_run_request_coverage'] and not i['terminal_request_coverage']['problems']
for rid,h in i['raw_hashes'].items():
 assert sha(a/'requests'/(rid+'.request.json'))==h['request'] and sha(a/'requests'/(rid+'.response.raw'))==h['response']
for name,h in i['native_export_sha256'].items():assert sha(a/name)==h
rid='002e70d2-50fc-4d1a-b5dd-69e9b8da4a54';assert i['unknown_native_request_ids']==[rid]
raw=(a/'requests'/(rid+'.response.raw')).read_bytes();assert b'upstream connect error' in raw and b'Connection refused' in raw
u=[json.loads(x) for x in (r/'usage.jsonl').read_text().splitlines()];x=next(x for x in u if x['request_id']==rid);assert x['counts'] is x['cost'] is None and x['response_sha256']==sha(a/'requests'/(rid+'.response.raw'))
n=json.loads((a/'native-git.json').read_text())
with tempfile.TemporaryDirectory(prefix='eval016-incident-original-',dir='/private/tmp') as tmp:
 p=Path(tmp)/'repo';subprocess.run(['git','clone','--quiet','--no-checkout',str((a/'native-history.bundle').resolve()),str(p)],check=True,capture_output=True)
 subprocess.run(['git','-C',str(p),'fsck','--full'],check=True,capture_output=True)
 assert subprocess.check_output(['git','-C',str(p),'rev-parse',n['head']+'^{tree}'],text=True).strip()==n['tree']
o=r/'preflight/incident003';assert not o.exists();o.mkdir();shutil.copy2(__file__,o/'executed-controller.py')
(o/'verified.json').write_text(json.dumps({'verified':True,'builder_id':'b006','task_id':'task-011','attempt_id':'attempt-001','request_id':rid,'raw_requests_verified':len(i['raw_hashes']),'literal_transport_failure':'upstream connection refused; no counters received','broader_provider_cause':'unknown','original_native_history_restored':True,'cost_point_estimate':None,'upper_bound_usd':None,'evidence':{str(p):sha(p) for p in [a/'infrastructure-incident.json',a/'native-history.bundle',a/'native-working-tree.tar.gz',a/'native-git.json',a/'requests'/(rid+'.request.json'),a/'requests'/(rid+'.response.raw')]},'controller_sha256':sha(Path(__file__)),'scope':'Original provider incident and raw evidence only; recovery outcome pending. No zero-token inference or builder defect inferred.'},indent=2)+'\n');print('Verified original transport incident, original raw request pairs and restorable native history')
