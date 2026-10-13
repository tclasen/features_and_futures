"""Independently rehash retired archives and restore database backups after inventory absence."""
import json,hashlib,sqlite3,tempfile,shutil,datetime
from pathlib import Path
r=Path('runs/instruction-effects/eval-016');lp=Path('.local/eval016-native-owned-resource-ledger001.json');ledger=json.loads(lp.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();checks=[]
for p in r.glob('tasks/*/attempts/*/*/resource-retirement.json'):
 d=json.loads(p.read_text());name=d['sandbox'];assert name.startswith('ff-eval-016-app-')
 if d['status']!='removed' or name not in ledger['resources'] or ledger['resources'][name]['present']:continue
 checkpoint=Path(d['checkpoint']);assert checkpoint.resolve().is_relative_to(r.resolve())
 assert all(sha(checkpoint/f)==h for f,h in d['archive_checksums'].items())
 for f,h in d['data_checksums'].items():
  source=p.parent/f;assert sha(source)==h
  with tempfile.TemporaryDirectory(prefix='eval016-retired-db-',dir='/private/tmp') as tmp:
   restored=Path(tmp)/f;shutil.copy2(source,restored);assert sha(restored)==h
   with sqlite3.connect(f'file:{restored.resolve()}?mode=ro',uri=True) as db:assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 checks.append({'sandbox':name,'record':str(p),'record_sha256':sha(p),'checkpoint':str(checkpoint),'archive_checksums':d['archive_checksums'],'data_checksums':d['data_checksums'],'inventory_absence_verified':True})
assert checks
for c in checks:ledger['resources'][c['sandbox']].update(retirement_verified=True,retirement_evidence=c)
namespace='retired-resources-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');out=r/'preflight'/namespace;out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
(out/'verified.json').write_text(json.dumps({'verified':True,'checks':checks,'ledger_input_sha256':sha(lp),'controller_sha256':sha(Path(__file__)),'native_model_calls':0,'scope':'Retained retired archive hashes and independently restored SQLite backups with recorded inventory absence. Original round001 history restoration remains separate. Active resources retained; no native outcome change.'},indent=2)+'\n');lp.write_text(json.dumps(ledger,indent=2)+'\n');print(json.dumps({'verified':True,'retired_resources':len(checks),'evidence':str(out/'verified.json')}))
