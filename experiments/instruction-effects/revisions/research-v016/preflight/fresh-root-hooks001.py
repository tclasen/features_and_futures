"""Apply the retained uniform operational hook control before any native dispatch."""
import json, subprocess, hashlib
from pathlib import Path
from datetime import datetime,timezone
r=Path('runs/instruction-effects/eval-016');m=json.loads((r/'manifest.json').read_text());assert not (r/'events.jsonl').exists()
root=Path(m['paths']['builders']);rows=[]
for name in ['starter',*[b['builder_id'] for b in m['runtime']['builder_configurations']]]:
 p=root/name
 assert subprocess.check_output(['git','-C',str(p),'rev-parse','HEAD'],text=True).strip()==m['provenance']['starter_commit']
 old=subprocess.run(['git','-C',str(p),'config','--get','core.hooksPath'],text=True,capture_output=True)
 assert old.returncode in (0,1)
 subprocess.run(['git','-C',str(p),'config','core.hooksPath','/dev/null'],check=True)
 assert subprocess.check_output(['git','-C',str(p),'config','core.hooksPath'],text=True).strip()=='/dev/null'
 rows.append({'identity':name,'original_hooks_path':old.stdout.strip() if old.returncode==0 else None,'hooks_path':'/dev/null'})
o=r/'preflight/preparation/uniform-hook-control.json';assert not o.exists();o.write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'controller_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'roots':rows,'native_model_calls':0,'scope':'Uniform inherited operational control, outside builder instruction treatments; no source change.'},indent=2)+'\n')
print('Verified uniform disabled hooks for all13 fresh roots')
