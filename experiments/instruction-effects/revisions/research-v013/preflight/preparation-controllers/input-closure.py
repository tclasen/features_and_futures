"""Close completed PM fixtures against prepared immutable inputs; never touch live output."""
import argparse,hashlib,json
from pathlib import Path
from orchestrator.prepare import file_hashes,write_json
from orchestrator.evidence import timestamp
parser=argparse.ArgumentParser();parser.add_argument('kind',choices=['baseline','directory065']);args=parser.parse_args()
v=Path('experiments/instruction-effects/revisions/research-v013');base=args.kind=='baseline'
prefix='task020-full01' if base else 'directory065'
paths=list((v/'preflight').glob(prefix+'-check-*/verified.json'));assert len(paths)==1
p=paths[0];proof=json.loads(p.read_text());assert proof['verified'] and proof['model_calls']==0
inputs=json.loads((v/'preflight'/f'{prefix}-inputs.json').read_text())
assert hashlib.sha256((p.parent/'executed-controller.mjs').read_bytes()).hexdigest()==inputs['controller_sha256']
assert inputs['suite_files']==file_hashes(v/'preflight/task020-executed-suite')==file_hashes(v/'decisions/frozen-prefix-drafts/task-020/suite')
rows=proof['results'];assert len(rows)==18
assert len({r['name'] for r in rows})==len(rows)
for row in rows:
 s=row['statistics'];assert s['flaky']==0 and s['skipped']==0
 positive=base or row['name'].startswith('positive-')
 assert (row['exit']==0)==positive
 assert s['unexpected']==(0 if positive else 1)
 assert s['expected']==((68 if row['phase']=='acceptance' else 1) if base else (1 if positive else 0))
if not base:assert sum(r['exit']==0 for r in rows)==6
target=p.parent/'input-closure.json'
if target.exists():target=p.parent/'input-closure-strict.json'
assert not target.exists(), 'Keep completed closure observations immutable'
write_json(target,{'verified':True,'utc':timestamp(),'native_model_calls':0,'controller_sha256':inputs['controller_sha256'],'suite_files':inputs['suite_files'],'variants':len(rows),'prepared_inputs_match_executed_controller_and_draft_suite':True,'scope':'Completed synthetic fixture input closure only; native builder evaluation/restart separately required.'})
print(json.dumps({'verified':True,'kind':args.kind,'variants':len(rows)}))
