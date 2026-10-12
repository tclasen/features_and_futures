import json,hashlib,re,shutil
from pathlib import Path
from datetime import datetime,timezone
from orchestrator.prepare import file_hashes
root=Path('experiments/instruction-effects/revisions/research-v016');folder=root/'preflight/prefix-phase-listing001';proof=json.loads((folder/'verified.json').read_text());rows=proof['phase_listings'];assert proof['verified'] and proof['native_calls']==0 and len(rows)==89 and {r['target_stage'] for r in rows}==set(range(1,31));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for row in rows:
 stage=row['target_stage'];phase=row['phase'];tested=stage-1 if phase=='upgrade' else stage;assert row['tested_stage']==tested;stdout=(folder/f'{stage:03d}-{phase}.stdout.log').read_text();match=re.search(r'Total: (\d+) tests?',stdout);assert match and int(match[1])==row['expected']==row['listed'];suite=root/f'decisions/frozen-prefix-drafts/task-{tested:03d}/suite';assert row['suite_files']==file_hashes(suite)
x={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'phase_listings':89,'stages':30,'verifier_sha256':sha(Path(__file__)),'originals':{str(p.relative_to(folder)):sha(p) for p in folder.rglob('*') if p.is_file()},'limitations':'Collection/inventory only; does not prove browser behavior, deployment or actual process restart.'};shutil.copy2(__file__,folder/'executed-verifier.py');(folder/'independently-verified.json').write_text(json.dumps(x,indent=2)+'\n');print(json.dumps({'verified':True,'phase_listings':89}))
