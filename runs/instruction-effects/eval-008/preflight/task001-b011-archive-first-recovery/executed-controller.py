from pathlib import Path
import hashlib,json,subprocess,tempfile,shutil
from datetime import datetime,timezone
root=Path.cwd();run=root/'runs/instruction-effects/eval-008';out=run/'preflight/task001-b011-archive-first-recovery';assert not out.exists();out.mkdir();shutil.copy2(__file__,out/'executed-controller.py');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def git(*args):return subprocess.run(['git',*map(str,args)],check=True,capture_output=True,text=True).stdout.strip()
rows=[]
for p in sorted((run/'builders/b011/checkpoints').glob('task-001-*/index.json')):
 d=json.loads(p.read_text())
 for name,digest in d['checksums'].items():assert sha(p.parent/name)==digest
 with tempfile.TemporaryDirectory(prefix='ff-eval008-original-task001-') as tmp:
  git('init','--bare',tmp);git('-C',tmp,'fetch',p.parent/'history.bundle','+refs/*:refs/*');git('-C',tmp,'fsck','--full','--no-reflogs');assert git('-C',tmp,'rev-parse',d['source_commit']+'^{tree}')==d['source_tree']
 rows.append({'index':str(p.relative_to(root)),'index_sha256':sha(p),'commit':d['source_commit'],'tree':d['source_tree']})
assert len(rows)>=6
es=[json.loads(x) for x in (run/'events.jsonl').read_text().splitlines()];recovery=next(e for e in es if e.get('builder_id')=='b011' and e.get('task_id')=='task-001' and e['kind']=='repository_recovery_finished');manifest=json.loads((run/'manifest.json').read_text());assert (manifest['provenance']['starter_commit'],manifest['provenance']['starter_tree'])==(recovery['post_commit'],recovery['post_tree']);assert any(r['commit']==recovery['pre_commit'] and r['tree']==recovery['pre_tree'] for r in rows)
result={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'archives':rows,'recovery':recovery,'own_starter_commit':manifest['provenance']['starter_commit'],'scope':'All original histories including provider snapshots and before-restore are independently restored. Frozen five-identical-failure threshold restores ownstarter because nocheckpoint accepted. Native subsequent recovery outcomes pending.'};(out/'verified.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'verified':True,'archives_restored':len(rows)}))
