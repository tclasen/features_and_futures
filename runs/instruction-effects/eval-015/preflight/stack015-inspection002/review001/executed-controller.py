"""Review immutable static inventory flags; do not execute builder code."""
import hashlib,json,subprocess,re
from pathlib import Path
from datetime import datetime,timezone
root=Path('runs/instruction-effects/eval-015/preflight');one=root/'stack015-inspection001/inspection.json';two=root/'stack015-inspection002/inspection.json';d=json.loads(two.read_text());rows=[]
for row in d['rows']:
 locations=[]
 for name in row['unexpected_imports']:
  assert name in {'node:child_process','node:net','node:vm'}
  found=[]
  for file in row['source_files']:
   source=subprocess.check_output(['git','show',row['commit']+':'+file],text=True)
   for line_no,line in enumerate(source.splitlines(),1):
    if name in line:
     assert file.startswith('test/')
     found.append({'file':file,'line':line_no,'import':name,'statement':line.strip()})
  assert found;locations.extend(found)
 assert row['inspection_issues']==(['unexpected literal imports require review'] if row['unexpected_imports'] else [])
 assert not row['future_delete_label_mentions'] and not row['external_browser_asset_mentions']
 rows.append({'builder_id':row['builder_id'],'commit':row['commit'],'tree':row['tree'],'reviewed_builtin_test_imports':locations,'unresolved_static_flags':[]})
original=json.loads(one.read_text());assert len(original['rows'])==len(d['rows'])==12
out=root/'stack015-inspection002/review001';out.mkdir()
(out/'executed-controller.py').write_bytes(Path(__file__).read_bytes())
result={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'initial_inventory_sha256':hashlib.sha256(one.read_bytes()).hexdigest(),'corrected_inventory_sha256':hashlib.sha256(two.read_bytes()).hexdigest(),'verifier_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'native_model_calls':0,'rows':rows,'observation':'Initial broad from-token matching captured UI label strings. Corrected statement imports plus dynamic literal imports remove those false positives. Remaining flagged child_process/net/vm are built-in Node test imports, all located in test files; original flags preserved. Corrected controller smoke guard covers compact static imports and Due from UI text.','scope':'Immutable accepted task015 package/launch/literal-import inventory; no external declared dependency or external browser asset flag observed. Runtime behavior, computed imports, and undispatched behavior require separate evidence; no implementation fixes or builder feedback generated.'}
(out/'verified.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'verified':True,'builders':len(rows),'evidence':str(out/'verified.json')}))
