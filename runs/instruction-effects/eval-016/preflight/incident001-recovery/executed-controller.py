"""Verify same-task recovery without replacing original unknown exposure."""
import json,hashlib,shutil
from pathlib import Path
r=Path('runs/instruction-effects/eval-016');a=r/'tasks/task-002/attempts/b007/attempt-002';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();result=json.loads((a/'result.json').read_text());original=r/'tasks/task-002/attempts/b007/attempt-001/infrastructure-incident.json'
assert result['accepted'] and result['native_usage_complete'] and result['requests']==5
for x in result['acceptance_statistics']:assert x['unexpected']==x['skipped']==x['flaky']==0
assert {x['phase'] for x in result['acceptance_statistics']}=={'upgrade','acceptance','postrestart'}
events_data=(r/'events.jsonl').read_bytes();events=[json.loads(x) for x in events_data.splitlines()];selected=[x for x in events if x.get('builder_id')=='b007' and x.get('task_id')=='task-002' and x.get('attempt_id')=='attempt-002'];assert any(x['kind']=='post_deployment_checks_passed' for x in selected)
barrier=next(x for x in events if x['kind']=='round_completed' and x['task_id']=='task-002');assert all(x['monotonic_ns']<barrier['monotonic_ns'] for x in selected if x['kind']=='post_deployment_checks_passed')
first=next(x for x in selected if x['kind']=='inference_request_started');request=a/'requests'/(first['request_id']+'.request.json')
def strings(x):
 if isinstance(x,str):return [x]
 if isinstance(x,list):return [s for v in x for s in strings(v)]
 if isinstance(x,dict):return [s for v in x.values() for s in strings(v)]
 return []
text='\n'.join(strings(json.loads(request.read_text())));assert (r/'tasks/task-002/packet.md').read_text() in text
usage=[json.loads(x) for x in (r/'usage.jsonl').read_text().splitlines()];original_id='834d72e2-af31-425f-b97b-e06f34183aec';old=next(x for x in usage if x['request_id']==original_id);assert old['counts'] is old['cost'] is None
receipts=[x for x in usage if x['builder_id']=='b007' and x['task_id']=='task-002' and x['attempt_id']=='attempt-002'];assert len(receipts)==5 and all(x['counts'] is not None for x in receipts)
for x in receipts:
 assert sha(a/'requests'/(x['request_id']+'.request.json'))==x['request_sha256'] and sha(a/'requests'/(x['request_id']+'.response.raw'))==x['response_sha256']
o=r/'preflight/incident001-recovery';assert not o.exists();o.mkdir();shutil.copy2(__file__,o/'executed-controller.py');(o/'observed-events.jsonl').write_bytes(events_data)
(o/'verified.json').write_text(json.dumps({'verified':True,'same_public_packet_delivered':True,'recovery_accepted':True,'post_deployment_checks_passed_before_shared_barrier':True,'recovery_native_receipts':5,'original_missing_counter_preserved':True,'commit':result['commit'],'tree':result['tree'],'files':{str(p):sha(p) for p in [a/'result.json',original,request,o/'observed-events.jsonl']},'controller_sha256':sha(Path(__file__)),'scope':'Same-task measured recovery and original missing receipt retained. Fresh-context policy is frozen native runner behavior; this check does not reconstruct hidden inference.'},indent=2)+'\n');print('Verified measured task002 recovery and preserved original unknown usage')
