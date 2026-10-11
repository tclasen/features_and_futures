"""Seal closed first variant only while the rest of the broader fixture is live."""
import hashlib,importlib.util,json
from pathlib import Path
from datetime import datetime,timezone
base=Path('experiments/instruction-effects/revisions/research-v014/preflight')
evidence=base/'task040-broader002-check-1791749139462'
batch=base/'task040-broader002-batch-1791749139421936000'
output=base/'task040-broader002-async-full-verification';output.mkdir(exist_ok=False)
(output/'executed-controller.py').write_bytes(Path(__file__).read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
closure=json.loads((evidence/'input-closure.json').read_text());assert closure['exit_code']==1
assert all(sha(evidence/name)==checksum for name,checksum in closure['files'].items())
inputs=json.loads((batch/'inputs.json').read_text());prepared=base/'task040-broader002-inputs.json';assert sha(prepared)==inputs['prepared_sha256']
assert sha(evidence/'executed-controller.mjs')==inputs['controller_sha256']
suite=base/'task040-full-prototype002-suite';assert inputs['suite_files']=={str(p.relative_to(suite)):sha(p) for p in suite.rglob('*') if p.is_file()}
for path,checksum in inputs['focused_independent_proofs'].items():assert sha(Path(path))==checksum and json.loads(Path(path).read_text())['verified']
spec=importlib.util.spec_from_file_location('broader','scripts/verify-broader-fixtures.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
reference=base/'task040-full-prototype002-check-1791739214033';rp=reference/'positive-form/results.json';assert sha(rp)==json.loads((reference/'input-closure.json').read_text())['files']['positive-form/results.json']
titles=sorted(s['title'] for s in module.specs(json.loads(rp.read_text())['suites']));assert len(titles)==len(set(titles))==140
names=['positive-async-reload-reset']
progress=json.loads((evidence/'progress.json').read_text());rows=[r for r in progress if r['name'] in names];assert len(rows)==1
(output/'observed-closed-progress.json').write_text(json.dumps(rows,indent=2)+'\n')
checks=[]
for name in names:
 row=next(r for r in rows if r['name']==name);folder=evidence/name;path=folder/'results.json';report=json.loads(path.read_text());listed=list(module.specs(report['suites']));stats=report['stats']
 assert row['exit']==0 and stats==row['statistics'] and not report['errors'] and stats['unexpected']==stats['skipped']==stats['flaky']==0
 assert all(t['status']=='expected' and all(r['status']=='passed' and not r.get('errors') for r in t['results']) for s in listed for t in s['tests'])
 if row['phase']=='acceptance':
  assert stats['expected']==len(listed)==140 and sorted(s['title'] for s in listed)==titles and row['resetObservations']==20
 else:assert stats['expected']==len(listed)==1 and 'no real restart' in row['scope']
 checks.append({'name':name,'phase':row['phase'],'statistics':stats,'files':{str(p.relative_to(folder)):sha(p) for p in folder.rglob('*') if p.is_file()}})
proof={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'controller_sha256':inputs['controller_sha256'],'batch_inputs_sha256':sha(batch/'inputs.json'),'closed_progress_sha256':sha(output/'observed-closed-progress.json'),'reference140_result_sha256':sha(rp),'verifier_sha256':sha(Path(__file__)),'checks':checks,'reload_reset_observations':20,'scope':'Closed async/reload-reset full140 variant only. Following process-local postrestart probe failed and remains retained; broader readiness and real native lifecycle not established.'}
(output/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'verified':True,'closed_cases':140,'reload_resets':20,'evidence':str(output/'verified.json')}))
