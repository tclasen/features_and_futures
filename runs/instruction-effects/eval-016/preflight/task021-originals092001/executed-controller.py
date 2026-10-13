"""Restore closed rejected originals without changing active builders."""
import hashlib,importlib.util,json,shutil
from pathlib import Path
root=Path.cwd();run=root/'runs/instruction-effects/eval-016'
out=run/'preflight/task021-originals092001';assert not out.exists()
spec=importlib.util.spec_from_file_location('originals',root/'scripts/verify-retained-originals.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
es=[json.loads(x) for x in (run/'events.jsonl').read_text().splitlines()];checks=[]
for i in range(92,93):
 a=f'attempt-{i:03d}';folder=run/'tasks/task-021/attempts/b004'/a;cp=run/'builders/b004/checkpoints'/f'task-021-{a}'
 ev=[e for e in es if e.get('builder_id')=='b004' and e.get('task_id')=='task-021' and e.get('attempt_id')==a and e['kind']=='attempt_rejected'];assert len(ev)==1
 e=ev[0];idx=json.loads((cp/'index.json').read_text());n=json.loads((folder/'native-git.json').read_text())
 assert idx['source_commit']==n['head']==e['post_commit'];assert idx['source_tree']==n['tree']==e['post_tree']
 assert idx['checksums']==e['archive_checksums'];assert all(sha(cp/f)==h for f,h in idx['checksums'].items())
 m.restore(cp/'history.bundle',n['head'],n['tree']);m.restore(folder/'native-history.bundle',n['head'],n['tree'],folder/'native-working-tree.tar.gz',n['dirty'])
 checks.append({'attempt':a,'head':n['head'],'tree':n['tree'],'rejected_event_id':e['event_id'],'diagnostics':[{'test':x['test'],'phase':x['phase'],'status':x['status']} for x in e['diagnostics']],'index_sha256':sha(cp/'index.json'),'archive_checksums':idx['checksums'],'native_files':{f:sha(folder/f) for f in ['native-git.json','native-history.bundle','native-working-tree.tar.gz']}})
out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
p={'verified':True,'checks':checks,'controller_sha256':sha(Path(__file__)),'restore_verifier_sha256':sha(root/'scripts/verify-retained-originals.py'),'native_model_calls':0,'scope':'Closed rejected task021 b004 attempt092 only. Publication and native Git histories, tree identities, original working files and dirty status independently restored. No active builder access or behavioral recovery claim.'}
(out/'verified.json').write_text(json.dumps(p,indent=2)+'\n');print(json.dumps({'verified':True,'restored_originals':len(checks),'evidence':str(out.relative_to(root))}))
