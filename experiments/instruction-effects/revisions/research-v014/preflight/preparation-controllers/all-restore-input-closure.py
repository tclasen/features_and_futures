"""Verify completed baseline inputs; refuse live or previously closed outputs."""
import json,hashlib
from pathlib import Path
from orchestrator.prepare import file_hashes,write_json
from orchestrator.evidence import timestamp
v=Path('experiments/instruction-effects/revisions/research-v014');paths=list((v/'preflight').glob('all-restore-full-check-*/verified.json'));assert len(paths)==1
p=paths[0];proof=json.loads(p.read_text());inputs=json.loads((v/'preflight/all-restore-full-inputs.json').read_text());assert proof['verified'] and proof['model_calls']==0
assert inputs['controller_sha256']==hashlib.sha256((p.parent/'executed-controller.mjs').read_bytes()).hexdigest()
assert inputs['suite_files']==file_hashes(v/'preflight/all-restore-candidate/task-020/suite')
rows=proof['results'];assert len(rows)==inputs['total_variants']==24 and len({r['name'] for r in rows})==24
assert sum(r['phase']=='acceptance' for r in rows)==8
for r in rows:
 s=r['statistics'];assert r['exit']==0 and not any(s[k] for k in ('unexpected','flaky','skipped'));assert s['expected']==(68 if r['phase']=='acceptance' else 1)
assert any(r['name']=='positive-form-restore-retain-archived' for r in rows)
assert any(r['name']=='positive-form-reload-reset-restore-active' for r in rows)
target=p.parent/'input-closure.json';assert not target.exists()
write_json(target,{'verified':True,'utc':timestamp(),'native_model_calls':0,'controller_sha256':inputs['controller_sha256'],'suite_files':inputs['suite_files'],'variants':24,'full_variants':8,'synthetic_lifecycle_probes':16,'prepared_inputs_match_executed_controller_and_immutable_candidate_suite':True,'scope':'Eight full68 synthetic variants including actual fetch-then-navigation restores; lifecycle probes remain synthetic. Native original restart verified separately.'});print('Closed24baselinevariants')
