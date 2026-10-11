"""Seal closed first variant only while the rest of the broader fixture is live."""
import hashlib,importlib.util,json
from pathlib import Path
from datetime import datetime,timezone
base=Path('experiments/instruction-effects/revisions/research-v014/preflight')
evidence=base/'task040-broader003-check-1791752905341'
batch=base/'task040-broader003-batch-1791752905304070000'
output=base/'task040-broader003-restore-retain-verified001';output.mkdir(exist_ok=False)
(output/'executed-controller.py').write_bytes(Path(__file__).read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs=json.loads((batch/'inputs.json').read_text());prepared=base/'task040-broader003-inputs.json';assert sha(prepared)==inputs['prepared_sha256']
assert sha(evidence/'executed-controller.mjs')==inputs['controller_sha256']
suite=base/'task040-full-prototype002-suite';assert inputs['suite_files']=={str(p.relative_to(suite)):sha(p) for p in suite.rglob('*') if p.is_file()}
for path,checksum in inputs['focused_independent_proofs'].items():assert sha(Path(path))==checksum and json.loads(Path(path).read_text())['verified']
spec=importlib.util.spec_from_file_location('broader','scripts/verify-broader-fixtures.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
reference=base/'task040-full-prototype002-check-1791739214033';rp=reference/'positive-form/results.json';assert sha(rp)==json.loads((reference/'input-closure.json').read_text())['files']['positive-form/results.json']
titles=sorted(s['title'] for s in module.specs(json.loads(rp.read_text())['suites']));assert len(titles)==len(set(titles))==140
names=['positive-form-restore-retain-archived','positive-form-restore-retain-archived-postrestart','positive-form-restore-retain-archived-observation-40']
progress=json.loads((evidence/'progress.json').read_text());rows=[r for r in progress if r['name'] in names];assert len(rows)==3
(output/'observed-closed-progress.json').write_text(json.dumps(rows,indent=2)+'\n')
checks=[]
for name in names:
 row=next(r for r in rows if r['name']==name);folder=evidence/name;path=folder/'results.json';report=json.loads(path.read_text());listed=list(module.specs(report['suites']));stats=report['stats']
 assert row['exit']==0 and stats==row['statistics'] and not report['errors'] and stats['unexpected']==stats['skipped']==stats['flaky']==0
 assert all(t['status']=='expected' and all(r['status']=='passed' and not r.get('errors') for r in t['results']) for s in listed for t in s['tests'])
 if row['phase']=='acceptance':
  assert stats['expected']==len(listed)==140 and sorted(s['title'] for s in listed)==titles and row['asyncRestoreObservations']==15 and row['resetObservations']==0
 else:assert stats['expected']==len(listed)==1 and 'no real restart' in row['scope']
 checks.append({'name':name,'phase':row['phase'],'statistics':stats,'files':{str(p.relative_to(folder)):sha(p) for p in folder.rglob('*') if p.is_file()}})
proof={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'controller_sha256':inputs['controller_sha256'],'batch_inputs_sha256':sha(batch/'inputs.json'),'closed_progress_sha256':sha(output/'observed-closed-progress.json'),'reference140_result_sha256':sha(rp),'verifier_sha256':sha(Path(__file__)),'checks':checks,'async_restore_observations':15,'scope':'Closed form/retain-archived restore140 variant and two process-local assertion probes only; remaining one reload-reset/restore-active full variant and real native upgrade/restart not established.'}
(output/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'verified':True,'closed_cases':142,'async_restores':15,'evidence':str(output/'verified.json')}))
