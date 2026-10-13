"""Restore closed rejected originals without changing active builders."""
import hashlib,importlib.util,json,shutil
from pathlib import Path
root=Path.cwd();run=root/'runs/instruction-effects/eval-016'
out=run/'preflight/task022-rejected-originals001';assert not out.exists()
spec=importlib.util.spec_from_file_location('originals',root/'scripts/verify-retained-originals.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
es=[json.loads(x) for x in (run/'events.jsonl').read_text().splitlines()];checks=[]
identities=[('b010',1),('b005',9),('b006',1)]
for builder,i in identities:
 a=f'attempt-{i:03d}';folder=run/f'tasks/task-022/attempts/{builder}'/a;cp=run/f'builders/{builder}/checkpoints'/f'task-022-{a}'
 ev=[e for e in es if e.get('builder_id')==builder and e.get('task_id')=='task-022' and e.get('attempt_id')==a and e['kind']=='attempt_rejected'];assert len(ev)==1
 e=ev[0];assert any(z['kind']=='attempt_finished' and z.get('builder_id')==builder and z.get('task_id')=='task-022' and z.get('attempt_id')==a for z in es);result=json.loads((folder/'result.json').read_text());assert not result['accepted'];idx=json.loads((cp/'index.json').read_text());n=json.loads((folder/'native-git.json').read_text())
 assert idx['source_commit']==n['head']==e['post_commit'];assert idx['source_tree']==n['tree']==e['post_tree']
 assert idx['checksums']==e['archive_checksums'];assert all(sha(cp/f)==h for f,h in idx['checksums'].items())
 m.restore(cp/'history.bundle',n['head'],n['tree']);m.restore(folder/'native-history.bundle',n['head'],n['tree'],folder/'native-working-tree.tar.gz',n['dirty'])
 checks.append({'builder':builder,'task':'task-022','attempt':a,'result_sha256':sha(folder/'result.json'),'head':n['head'],'tree':n['tree'],'rejected_event_id':e['event_id'],'diagnostics':[{'test':x['test'],'phase':x['phase'],'status':x['status']} for x in e['diagnostics']],'index_sha256':sha(cp/'index.json'),'archive_checksums':idx['checksums'],'native_files':{f:sha(folder/f) for f in ['native-git.json','native-history.bundle','native-working-tree.tar.gz']}})
out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
p={'verified':True,'checks':checks,'controller_sha256':sha(Path(__file__)),'restore_verifier_sha256':sha(root/'scripts/verify-retained-originals.py'),'native_model_calls':0,'scope':'Closed task022 rejected originals b010001, b005009 and b006001 only. Later retries and outcomes excluded. Publication and native Git histories, tree identities, original working files and dirty status independently restored. No active builder access or behavioral recovery claim.'}
(out/'verified.json').write_text(json.dumps(p,indent=2)+'\n');print(json.dumps({'verified':True,'restored_originals':len(checks),'evidence':str(out.relative_to(root))}))
