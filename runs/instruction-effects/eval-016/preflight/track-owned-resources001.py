"""Track only this native run's sandbox inventory, preserving previous records."""
import json,subprocess,datetime
from pathlib import Path
run=Path('runs/instruction-effects/eval-016');out=Path('.local/eval016-native-owned-resource-ledger001.json')
raw=subprocess.check_output(['sbx','ls','--json'],text=True)
owned=[x for x in json.loads(raw)['sandboxes'] if x['name'].startswith('ff-eval-016-')]
d=json.loads(out.read_text()) if out.exists() else {'run_id':'eval-016','resources':{},'policy':'Archive and independently restore required source/history/data before stop and rm --force; retain active builders and deployments; never prune other-thread resources.'}
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
for x in owned:
 n=x['name'];r=d['resources'].setdefault(n,{'first_observed_utc':now});r.update(last_observed_utc=now,inventory=x,present=True)
for n,r in d['resources'].items():
 if n not in {x['name'] for x in owned}:r.update(present=False,last_absence_observed_utc=now)
d.update(last_inventory_utc=now,present_count=len(owned),resources_left_behind=[x['name'] for x in owned],retained_image='features-and-futures-builder:pilot-v002; needed by active native run')
out.write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({'tracked':len(d['resources']),'present':len(owned),'native_run':'eval-016'}))
