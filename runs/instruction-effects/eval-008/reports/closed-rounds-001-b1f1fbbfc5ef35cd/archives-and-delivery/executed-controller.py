import hashlib,json,shutil,subprocess,tempfile
from pathlib import Path
from datetime import datetime,timezone
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);parser.add_argument('--through',type=int,required=True);args=parser.parse_args();through=args.through
root=Path.cwd();run=root/'runs/instruction-effects'/args.run
prefix=next((run/'reports').glob(f'closed-rounds-{through:03d}-*'))
out=prefix/'archives-and-delivery'
assert not out.exists()
out.mkdir()
shutil.copy2(__file__,out/'executed-controller.py')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:[json.loads(x) for x in p.read_text().splitlines()]
events=read(prefix/'events.jsonl');usage=read(prefix/'usage.jsonl')
manifest=json.loads((run/'manifest.json').read_text())
instructions=json.loads((run/'definitions/instructions.json').read_text())
configs={b['builder_id']:b for b in manifest['runtime']['builder_configurations']}
def git(*args):return subprocess.run(['git',*map(str,args)],check=True,capture_output=True,text=True).stdout.strip()
histories=[]
for indexfile in sorted((run/'builders').glob('*/checkpoints/*/index.json')):
 if not indexfile.parent.name.startswith('task-'):continue
 stage=int(indexfile.parent.name.split('-')[1])
 if stage>through:continue
 index=json.loads(indexfile.read_text())
 for name,digest in index['checksums'].items():assert sha(indexfile.parent/name)==digest
 with tempfile.TemporaryDirectory(prefix='ff-eval006-history-') as folder:
  git('init','--bare',folder)
  git('-C',folder,'fetch',indexfile.parent/'history.bundle','+refs/*:refs/*')
  assert git('-C',folder,'rev-parse',index['source_commit']+'^{tree}')==index['source_tree']
  git('-C',folder,'fsck','--full','--no-reflogs')
 for ref in index['github_refs']:assert git('rev-parse',ref)==index['source_commit']
 histories.append({'index':str(indexfile.relative_to(root)),'index_sha256':sha(indexfile),'commit':index['source_commit'],'tree':index['source_tree']})
def strings(v):
 if isinstance(v,str):return [v]
 if isinstance(v,list):return [s for a in v for s in strings(a)]
 if isinstance(v,dict):return [s for a in v.values() for s in strings(a)]
 return []
delivery=[];seen=set()
for record in usage:
 identity=(record['builder_id'],record['task_id'],record['attempt_id'])
 raw=run/'tasks'/record['task_id']/'attempts'/record['builder_id']/record['attempt_id']/'requests'
 for suffix,key in [('request.json','request_sha256'),('response.raw','response_sha256')]:assert sha(raw/(record['request_id']+'.'+suffix))==record[key]
 if identity in seen:continue
 seen.add(identity)
 first=next(e for e in events if e['kind']=='inference_request_started' and tuple(e[k] for k in ('builder_id','task_id','attempt_id'))==identity)
 request=raw/(first['request_id']+'.request.json')
 text='\n'.join(strings(json.loads(request.read_text())))
 packet=run/'tasks'/record['task_id']/'packet.md'
 profile=instructions['profiles'][configs[record['builder_id']]['profile']]
 assert packet.read_text() in text
 assert not profile or profile in text
 delivery.append({'builder_id':identity[0],'task_id':identity[1],'attempt_id':identity[2],'first_request_id':first['request_id'],'request_sha256':sha(request),'packet_sha256':sha(packet),'profile':configs[identity[0]]['profile']})
accepted=[e for e in events if e['kind']=='task_accepted']
assert len(accepted)==12*through
for e in accepted:
 assert any(h['commit']==e['commit'] and h['tree']==e['tree'] for h in histories)
result={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'closed_prefix':through,'accepted_checkpoints':12*through,'archives_restored':len(histories),'delivered_attempts':len(delivery),'requests_checked':len(usage),'inputs':{n:sha(prefix/n) for n in ['events.jsonl','usage.jsonl']},'histories':histories,'delivery':delivery,'limitations':['Closed declared prefix only; missing counters remain unknown. Original incident working trees are checked by the separate incident restoration audit. No native restart execution or instruction-effect claim.']}
(out/'verified.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['verified','archives_restored','delivered_attempts','requests_checked']}))
