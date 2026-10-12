import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
from orchestrator.pilot import verify_isolation
r=Path('runs/instruction-effects/eval-016');m=json.loads((r/'manifest.json').read_text());definitions=json.loads((r/'definitions/instructions.json').read_text());packet=(r/'tasks/task-001/packet.md').read_text();events_bytes=(r/'events.jsonl').read_bytes();events=[json.loads(x) for x in events_bytes.splitlines()];out=r/'preflight/first-dispatch001';assert not out.exists()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def strings(x):
 if isinstance(x,str):return [x]
 if isinstance(x,list):return [s for v in x for s in strings(v)]
 if isinstance(x,dict):return [s for v in x.values() for s in strings(v)]
 return []
checks=[]
for b in m['runtime']['builder_configurations']:
 bid=b['builder_id'];starts=[e for e in events if e['kind']=='inference_request_started' and e['builder_id']==bid and e['task_id']=='task-001' and e['attempt_id']=='attempt-001'];assert starts
 first=starts[0];p=r/'tasks/task-001/attempts'/bid/'attempt-001/requests'/(first['request_id']+'.request.json');text='\n'.join(strings(json.loads(p.read_text())));assert packet in text;profile=definitions['profiles'][b['profile']];assert not profile or profile in text
 isolation=r/'builders'/bid/'isolation-task-001.json';assert verify_isolation(json.loads(isolation.read_text())['probe']);assert first['provider']=='subscription' and first['model']==b['model']
 checks.append({'builder_id':bid,'request_id':first['request_id'],'request_sha256':sha(p),'packet_sha256':sha(r/'tasks/task-001/packet.md'),'profile':b['profile'],'profile_sha256':hashlib.sha256(profile.encode()).hexdigest(),'isolation_sha256':sha(isolation),'provider':first['provider'],'model':first['model']})
assert len(checks)==12
out.mkdir();(out/'executed-controller.py').write_bytes(Path(__file__).read_bytes());(out/'observed-events.jsonl').write_bytes(events_bytes);(out/'verified.json').write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'manifest_sha256':sha(r/'manifest.json'),'event_snapshot_sha256':sha(out/'observed-events.jsonl'),'verifier_sha256':sha(Path(__file__)),'checks':checks,'scope':'All12 first native task001 requests contain exact common packet and assigned profile and follow successful per-builder isolation; no completed round, full-run accounting or acceptance is established.'},indent=2)+'\n');print(json.dumps({'verified':True,'first_native_deliveries':12,'evidence':str(out/'verified.json')}))
