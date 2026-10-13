"""Verify same-task recovery without replacing original unknown exposure."""
import json,hashlib,shutil
from pathlib import Path
r=Path('runs/instruction-effects/eval-016');a=r/'tasks/task-021/attempts/b004/attempt-096';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();result=json.loads((a/'result.json').read_text());original=r/'tasks/task-021/attempts/b004/attempt-095/infrastructure-incident.json'
assert result['accepted'] and result['native_usage_complete'] and result['requests']==6
for x in result['acceptance_statistics']:assert x['unexpected']==x['skipped']==x['flaky']==0
assert {x['phase'] for x in result['acceptance_statistics']}=={'upgrade','acceptance','postrestart'}
events_data=(r/'events.jsonl').read_bytes();events=[json.loads(x) for x in events_data.splitlines()];selected=[x for x in events if x.get('builder_id')=='b004' and x.get('task_id')=='task-021' and x.get('attempt_id')=='attempt-096'];assert any(x['kind']=='post_deployment_checks_passed' for x in selected)
barriers=[x for x in events if x['kind']=='round_completed' and x['task_id']=='task-021'];assert len(barriers)<=1
if barriers:assert all(x['monotonic_ns']<barriers[0]['monotonic_ns'] for x in selected if x['kind']=='post_deployment_checks_passed')
first=next(x for x in selected if x['kind']=='inference_request_started');request=a/'requests'/(first['request_id']+'.request.json')
def strings(x):
 if isinstance(x,str):return [x]
 if isinstance(x,list):return [s for v in x for s in strings(v)]
 if isinstance(x,dict):return [s for v in x.values() for s in strings(v)]
 return []
text='\n'.join(strings(json.loads(request.read_text())));assert (r/'tasks/task-021/packet.md').read_text() in text
usage=[json.loads(x) for x in (r/'usage.jsonl').read_text().splitlines()];original_id='938b886e-8066-4522-828e-eb5ed9c9b496';old=next(x for x in usage if x['request_id']==original_id);assert old['counts'] is old['cost'] is None
receipts=[x for x in usage if x['builder_id']=='b004' and x['task_id']=='task-021' and x['attempt_id']=='attempt-096'];assert len(receipts)==6 and all(x['counts'] is not None for x in receipts)
for x in receipts:
 assert sha(a/'requests'/(x['request_id']+'.request.json'))==x['request_sha256'] and sha(a/'requests'/(x['request_id']+'.response.raw'))==x['response_sha256']
spec=__import__('importlib.util',fromlist=['util']);module_spec=spec.spec_from_file_location('originals',Path('scripts/verify-retained-originals.py'));m=spec.module_from_spec(module_spec);module_spec.loader.exec_module(m);native=json.loads((a/'native-git.json').read_text());checkpoint=r/'builders/b004/checkpoints/task-021-attempt-096';index=json.loads((checkpoint/'index.json').read_text());assert (native['head'],native['tree'])==(index['source_commit'],index['source_tree'])==(result['commit'],result['tree']);assert all(sha(checkpoint/name)==h for name,h in index['checksums'].items());m.restore(checkpoint/'history.bundle',native['head'],native['tree']);m.restore(a/'native-history.bundle',native['head'],native['tree'],a/'native-working-tree.tar.gz',native['dirty']);prior=json.loads((r/'tasks/task-021/attempts/b004/attempt-094/result.json').read_text());assert not prior['accepted'] and (prior['commit'],prior['tree'])==(result['commit'],result['tree']);o=r/'preflight/incident004-recovery';assert not o.exists();o.mkdir();shutil.copy2(__file__,o/'executed-controller.py');(o/'observed-events.jsonl').write_bytes(events_data)
(o/'verified.json').write_text(json.dumps({'verified':True,'same_public_packet_delivered':True,'recovery_accepted':True,'post_deployment_checks_passed':True,'shared_barrier_observed':bool(barriers),'post_deployment_checks_passed_before_shared_barrier':True if barriers else None,'recovery_native_receipts':6,'original_missing_counter_preserved':True,'same_recorded_commit_tree_as_rejected094':True,'original_native_and_publication_histories_restored':True,'causal_source_fix_inferred':False,'commit':result['commit'],'tree':result['tree'],'files':{str(p):sha(p) for p in [a/'result.json',original,request,o/'observed-events.jsonl']},'controller_sha256':sha(Path(__file__)),'scope':'Same-task measured recovery and original missing receipt retained. Fresh-context policy is frozen native runner behavior; this check does not reconstruct hidden inference.'},indent=2)+'\n');print('Verified measured task021 b004 recovery and preserved original unknown usage')
