"""Close exact prospective paired-fault inputs only after all twenty finish."""
import json,hashlib
from pathlib import Path
from orchestrator.prepare import file_hashes,write_json
from orchestrator.evidence import timestamp
v=Path('experiments/instruction-effects/revisions/research-v014');paths=list((v/'preflight').glob('future-fault-check-*/verified.json'));assert len(paths)==1
p=paths[0];proof=json.loads(p.read_text());inputs=json.loads((v/'preflight/future-fault-inputs.json').read_text());assert proof['verified'] and proof['native_model_calls']==0
assert inputs['controller_sha256']==hashlib.sha256((p.parent/'executed-controller.mjs').read_bytes()).hexdigest()
assert inputs['suite_files']==file_hashes(v/'preflight/task030-executed-suite')==file_hashes(v/'decisions/next-round-preparation/cumulative-suite')
rows=proof['results'];assert len(rows)==20 and len({r['name'] for r in rows})==20
for control in inputs['controls']:
 pair=[r for r in rows if r['target_stage']==control['stage']];assert len(pair)==2
 correct=next(r for r in pair if r['defect']=='none');wrong=next(r for r in pair if r['defect']==control['defect'])
 assert correct['exit']==0 and correct['statistics']['expected']==1 and correct['statistics']['unexpected']==0
 assert wrong['exit']!=0 and wrong['statistics']['unexpected']==1
 for r in pair:assert r['statistics']['flaky']==r['statistics']['skipped']==0
out=p.parent/'input-closure.json';assert not out.exists()
write_json(out,{'verified':True,'utc':timestamp(),'native_model_calls':0,'controller_sha256':inputs['controller_sha256'],'suite_files':inputs['suite_files'],'variants':20,'controls':inputs['controls'],'scope':'One paired discriminating case per future21–30 requirement, single form renderer with real restore navigation. Full99 positives in all modes and actual native phases remain separately required.'});print('Closed20prospectivepairedfaultcontrols')
