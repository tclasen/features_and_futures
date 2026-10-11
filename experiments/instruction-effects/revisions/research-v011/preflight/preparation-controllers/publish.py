from pathlib import Path
import json,subprocess,hashlib
from orchestrator.evidence import timestamp
from orchestrator.prepare import write_json
run=Path('runs/instruction-effects/eval-011');assert not (run/'events.jsonl').exists();adoption=json.loads((run/'preflight/preparation/final-adoption.json').read_text());assert adoption['native_dispatch_ready'];scan_path=Path('.local/eval011-preparation-publication-scan.json');scan=json.loads(scan_path.read_text());assert scan['status']=='passed';target=scan['target_git_commit'];assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==target
subprocess.run(['git','push','--atomic','origin',target+':refs/heads/main'],check=True,capture_output=True,text=True)
remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0];assert remote==target
write_json(run/'reports/publication-preparation.json',{'utc':timestamp(),'verified':True,'publication_authorized':True,'main_commit':target,'remote_main_commit':remote,'scan_sha256':hashlib.sha256(scan_path.read_bytes()).hexdigest(),'scan_status':'passed','scope':'Exact committed frozen preparation and prior evidence, decoded archives and original histories; no new native dispatch yet.'});print(json.dumps({'published':target,'remote_verified':True}))
