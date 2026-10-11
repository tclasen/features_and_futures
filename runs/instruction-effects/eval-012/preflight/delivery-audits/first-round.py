"""Read-only first-round checks from existing readiness report invariants."""
import hashlib,json
from pathlib import Path
from orchestrator.prepare import file_hashes,write_json
from orchestrator.evidence import digest_json,timestamp
from orchestrator.pilot import verify_isolation
run=Path('runs/instruction-effects/eval-012')
manifest=json.loads((run/'manifest.json').read_text());assert digest_json(manifest)==(run/'manifest.sha256').read_text().strip()
assert file_hashes(run/'definitions')==manifest['provenance']['definition_hashes']
raw=(run/'usage.jsonl').read_bytes();usage=[json.loads(s) for s in raw.splitlines()]
configs={x['builder_id']:x for x in manifest['runtime']['builder_configurations']}
profiles=json.loads((run/'definitions/instructions.json').read_text())['profiles']
def strings(v):
 if isinstance(v,str):return [v]
 if isinstance(v,list):return [s for x in v for s in strings(x)]
 if isinstance(v,dict):return [s for x in v.values() for s in strings(x)]
 return []
first={}
for row in sorted(usage,key=lambda x:x['started_monotonic_ns']):
 if row['task_id']=='task-001':first.setdefault((row['builder_id'],row['attempt_id']),row)
assert {b for b,a in first}==set(configs)
rows=[]
for (builder,attempt),entry in sorted(first.items()):
 path=run/'tasks/task-001/attempts'/builder/attempt/'requests'/(entry['request_id']+'.request.json')
 body=path.read_bytes();assert hashlib.sha256(body).hexdigest()==entry['request_sha256']
 text='\n'.join(strings(json.loads(body)));packet=(run/'tasks/task-001/packet.md').read_text();profile=profiles[configs[builder]['profile']]
 assert packet in text and (not profile or profile in text)
 assert 'PM agent for a longitudinal coding-agent experiment' not in text
 isolation_path=run/'builders'/builder/'isolation-task-001.json';isolation=json.loads(isolation_path.read_text());assert verify_isolation(isolation['probe'])
 rows.append({'builder_id':builder,'attempt_id':attempt,'request_id':entry['request_id'],'request_sha256':entry['request_sha256'],'packet_sha256':hashlib.sha256(packet.encode()).hexdigest(),'assigned_profile':configs[builder]['profile'],'assigned_profile_sha256':hashlib.sha256(profile.encode()).hexdigest(),'common_packet_delivered':True,'assigned_profile_delivered':True,'pm_role_instruction_absent':True,'actual_isolation_probe_passed':True,'isolation_file_sha256':hashlib.sha256(isolation_path.read_bytes()).hexdigest()})
write_json(Path(__file__).parent/'first-round-verified.json',{'verified':True,'utc':timestamp(),'read_only_extra_native_calls':0,'usage_snapshot_sha256':hashlib.sha256(raw).hexdigest(),'controller_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'configurations':len(configs),'attempt_deliveries':len(rows),'deliveries':rows,'scope':'First serialized native request packet/profile and actual startup isolation checks; no instruction-effect comparison or complete-run readiness.'})
print(json.dumps({'verified':True,'configurations':len(configs),'attempt_deliveries':len(rows),'read_only_extra_native_calls':0}))
