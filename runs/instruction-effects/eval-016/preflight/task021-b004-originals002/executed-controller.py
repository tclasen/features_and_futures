"""Independently restore completed failed originals and own accepted prior checkpoint."""
import datetime,hashlib,importlib.util,json,shutil
from pathlib import Path
root=Path.cwd();r=root/'runs/instruction-effects/eval-016';out=r/'preflight/task021-b004-originals002';assert not out.exists();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('originals',root/'scripts/verify-retained-originals.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
events=list(map(json.loads,(r/'events.jsonl').read_text().splitlines()));prior=[e for e in events if e['kind']=='task_accepted' and e.get('task_id')=='task-020' and e.get('builder_id')=='b004'];assert len(prior)==1
checks=[]
for task,attempt,accepted in [('task-021',f'attempt-{i:03d}',False) for i in range(1,6)]+[('task-020',prior[0]['attempt_id'],True)]:
 folder=r/'tasks'/task/'attempts/b004'/attempt;result=json.loads((folder/'result.json').read_text());assert result['accepted']==accepted
 checkpoint=r/'builders/b004/checkpoints'/(task+'-'+attempt);index=json.loads((checkpoint/'index.json').read_text());assert index['run_id']=='eval-016' and index['builder_id']=='b004'
 assert all(sha(checkpoint/name)==checksum for name,checksum in index['checksums'].items())
 module.restore(checkpoint/'history.bundle',index['source_commit'],index['source_tree'])
 native=json.loads((folder/'native-git.json').read_text());assert (result['commit'],result['tree'])==(native['head'],native['tree'])==(index['source_commit'],index['source_tree'])
 module.restore(folder/'native-history.bundle',native['head'],native['tree'],folder/'native-working-tree.tar.gz',native['dirty'])
 checks.append({'task':task,'attempt':attempt,'accepted':accepted,'head':native['head'],'tree':native['tree'],'index_sha256':sha(checkpoint/'index.json'),'result_sha256':sha(folder/'result.json'),'native_files':{name:sha(folder/name) for name in ('native-history.bundle','native-working-tree.tar.gz','native-git.json')}})
out.mkdir();shutil.copy2(__file__,out/'executed-controller.py');(out/'verified.json').write_text(json.dumps({'verified':True,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'controller_sha256':sha(Path(__file__)),'restorer_sha256':sha(root/'scripts/verify-retained-originals.py'),'checks':checks,'native_model_calls':0,'scope':'Independent original history/working-tree restoration for completed021 b004 failures001–005 and own accepted020. Builder repository and native retry process untouched; no recovery performed or acceptance/treatment change. Outside the committed closed020 publication target.'},indent=2)+'\n');print(json.dumps({'verified':True,'originals_restored':len(checks),'evidence':str(out/'verified.json')}))
