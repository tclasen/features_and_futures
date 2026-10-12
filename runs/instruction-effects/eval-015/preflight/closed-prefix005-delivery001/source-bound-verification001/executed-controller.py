"""Independently bind the retained inline delivery observation to source and inputs."""
import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
r=Path('runs/instruction-effects/eval-015');base=r/'preflight/closed-prefix005-delivery001';original=base/'verified.json';proof=json.loads(original.read_text());assert proof['verified'] and proof['original_deliveries']==64
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert sha(base/'observed-events.jsonl')==proof['events_snapshot_sha256'] and sha(r/'manifest.json')==proof['manifest_sha256']
m=json.loads((r/'manifest.json').read_text());profiles=json.loads((r/'definitions/instructions.json').read_text())['profiles'];configs={b['builder_id']:b for b in m['runtime']['builder_configurations']};events=[json.loads(x) for x in (base/'observed-events.jsonl').read_text().splitlines()]
def strings(x):
 if isinstance(x,str):return [x]
 if isinstance(x,list):return [s for v in x for s in strings(v)]
 if isinstance(x,dict):return [s for v in x.values() for s in strings(v)]
 return []
keys=set()
for row in proof['checks']:
 bid=row['builder_id'];task=row['task_id'];attempt=row['attempt_id'];key=(bid,task,attempt);assert key not in keys;keys.add(key);assert bid in configs and task in ['task-%03d'%s for s in range(1,6)]
 req=r/'tasks'/task/'attempts'/bid/attempt/'requests'/(row['first_request_id']+'.request.json');packet=r/'tasks'/task/'packet.md';assert sha(req)==row['request_sha256'] and sha(packet)==row['packet_sha256'];profile=profiles[configs[bid]['profile']];assert hashlib.sha256(profile.encode()).hexdigest()==row['profile_sha256'];text='\n'.join(strings(json.loads(req.read_text())));assert packet.read_text() in text and (not profile or profile in text)
 starts=[e for e in events if e['kind']=='inference_request_started' and (e['builder_id'],e['task_id'],e['attempt_id'])==key];assert starts and starts[0]['request_id']==row['first_request_id'];assert starts[0]['provider']=='subscription' and starts[0]['model']==configs[bid]['model']
expected={(b,'task-%03d'%s,a.name) for b in configs for s in range(1,6) for a in (r/'tasks'/('task-%03d'%s)/'attempts'/b).glob('attempt-*')};assert keys==expected and len(keys)==64
out=base/'source-bound-verification001';assert not out.exists();out.mkdir();(out/'executed-controller.py').write_bytes(Path(__file__).read_bytes());(out/'verified.json').write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'original_proof_sha256':sha(original),'events_snapshot_sha256':sha(base/'observed-events.jsonl'),'manifest_sha256':sha(r/'manifest.json'),'instructions_sha256':sha(r/'definitions/instructions.json'),'verifier_sha256':sha(Path(__file__)),'original_deliveries':64,'scope':'Independent source-bound verification of all retained first-native packet/profile rows. Original inline proof unchanged; its initial source was in PM tool transcript, not independently sealed. This executed follow-up controller is sealed here.'},indent=2)+'\n');print(json.dumps({'verified':True,'original_deliveries':64,'evidence':str(out/'verified.json')}))
