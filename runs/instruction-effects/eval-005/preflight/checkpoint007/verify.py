import json,hashlib,importlib.util
from pathlib import Path
from datetime import datetime,timezone
root=Path.cwd();run=root/'runs/instruction-effects/eval-005';out=run/'preflight/checkpoint007';assert not (out/'verified.json').exists()
spec=importlib.util.spec_from_file_location('originals',root/'scripts/verify-retained-originals.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for p in sorted((run/'builders').glob('*/checkpoints/*/index.json')):
 if not p.parent.name.startswith('task-') or int(p.parent.name.split('-')[1])>7:continue
 j=json.loads(p.read_text())
 for name,checksum in j['checksums'].items():assert sha(p.parent/name)==checksum
 module.restore(p.parent/'history.bundle',j['source_commit'],j['source_tree'])
 for ref in j['github_refs']:assert module.git('rev-parse',ref)==j['source_commit']
 records.append({'index':str(p.relative_to(root)),'index_sha256':sha(p),'head':j['source_commit'],'tree':j['source_tree'],'checksums':j['checksums']})
assert len(records)==96
manifest=json.loads((run/'manifest.json').read_text());profiles=json.loads((run/'definitions/instructions.json').read_text());builders={b['builder_id']:b for b in manifest['runtime']['builder_configurations']}
usage=[json.loads(x) for x in (run/'usage.jsonl').read_text().splitlines() if int(json.loads(x)['task_id'].split('-')[1])<=7];checked={}
def strings(x):
 if isinstance(x,str):return [x]
 if isinstance(x,list):return [s for y in x for s in strings(y)]
 if isinstance(x,dict):return [s for y in x.values() for s in strings(y)]
 return []
for u in usage:
 key=(u['builder_id'],u['task_id'],u['attempt_id'])
 if key in checked:continue
 p=run/'tasks'/u['task_id']/'attempts'/u['builder_id']/u['attempt_id']/'requests'/(u['request_id']+'.request.json');payload='\n'.join(strings(json.loads(p.read_text())))
 packet=(run/'tasks'/u['task_id']/'packet.md').read_text();profile=profiles['profiles'][builders[u['builder_id']]['profile']]
 assert packet in payload and (not profile or profile in payload) and profiles['contract'] in payload
 checked[key]={'identity':list(key),'request_id':u['request_id'],'request_sha256':sha(p),'packet_sha256':hashlib.sha256(packet.encode()).hexdigest(),'profile_sha256':hashlib.sha256(profile.encode()).hexdigest()}
assert len(checked)==96
proof={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'scope':'Closed first7 rounds only; immutable archival restorations and96 original task/profile/operational-contract deliveries. Does not claim native token counters are complete.','checkpoints':records,'delivery':list(checked.values()),'model_calls':0,'controller_sha256':sha(Path(__file__))}
(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'verified':True,'restored_histories':len(records),'attempt_deliveries':len(checked)}))
