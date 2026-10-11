"""Verify only the three closed form reload-reset runs while remaining variants continue."""
import hashlib,importlib.util,json
from pathlib import Path
from datetime import datetime,timezone
base=Path('experiments/instruction-effects/revisions/research-v015/preflight');evidence=base/'task030-summary-full001-check-1791754241740';batch=base/'task030-summary-full001-batch-1791754241707086000';output=base/'task030-summary-form-reset001-verification';output.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs=json.loads((batch/'inputs.json').read_text());prepared=base/'task030-summary-full001-inputs.json';assert sha(prepared)==inputs['prepared_sha256']
assert sha(evidence/'executed-controller.mjs')==inputs['controller_sha256']
from orchestrator.prepare import file_hashes
from orchestrator.summary_readiness import verify_summary_only_delta
suite=base/'task030-summary-suite';assert file_hashes(suite)==inputs['suite_files'] and verify_summary_only_delta(Path('runs/instruction-effects/eval-014/tasks/task-030/suite'),suite)==['return-order.spec.mjs']
spec=importlib.util.spec_from_file_location('full','scripts/verify-summary-full-fixtures.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
ref=Path('experiments/instruction-effects/revisions/research-v014/preflight/task030-full-check-1791723081556/positive-async/results.json');assert sha(ref)=='bb81906b2bf4c4a1e78079dcb953910d439e90ab74630bc773f2567e4bf3d854'
titles=sorted(s['title'] for s in module.specs(json.loads(ref.read_text())['suites']));assert len(titles)==len(set(titles))==99
names=['positive-form-reload-reset','positive-form-reload-reset-postrestart','positive-form-reload-reset-observation-30'];progress=json.loads((evidence/'progress.json').read_text());rows=[r for r in progress if r['name'] in names];assert len(rows)==3
checks=[]
for row in rows:
 folder=evidence/row['name'];report=json.loads((folder/'results.json').read_text());ss=list(module.specs(report['suites']));stats=report['stats'];count=99 if row['phase']=='acceptance' else 1
 assert row['exit']==0 and row['statistics']==stats and stats['expected']==len(ss)==count and stats['unexpected']==stats['skipped']==stats['flaky']==0 and not report['errors']
 assert all(t['status']=='expected' and all(r['status']=='passed' and not r.get('errors') for r in t['results']) for s in ss for t in s['tests'])
 if count==99:assert sorted(s['title'] for s in ss)==titles
 checks.append({'name':row['name'],'phase':row['phase'],'count':count,'files':file_hashes(folder)})
(output/'executed-controller.py').write_bytes(Path(__file__).read_bytes());(output/'observed-closed-progress.json').write_text(json.dumps(rows,indent=2)+'\n');(output/'verified.json').write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'closed_cases':101,'controller_sha256':inputs['controller_sha256'],'batch_inputs_sha256':sha(batch/'inputs.json'),'verifier_sha256':sha(Path(__file__)),'reference99_result_sha256':sha(ref),'checks':checks,'scope':'Form reload-reset full99 plus two process-local assertion probes only; Three full variants still pending; no independent reset count is emitted. Real native restart is proved separately by unchanged-source full83 replay.'},indent=2)+'\n')
print(json.dumps({'verified':True,'closed_cases':101,'evidence':str(output/'verified.json')}))
