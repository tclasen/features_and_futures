import hashlib,json,shutil,datetime,uuid
from pathlib import Path
r=Path('runs/instruction-effects/eval-016');base=r/'preflight/task021-feedback-delivery001/verified.json';d=json.loads(base.read_text());checks=[];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for group in d['checks']:
 instruction=r/f"tasks/task-021/attempts/b004/attempt-{group['attempt']-1:03}/recovery-instruction.json";rec=json.loads(instruction.read_text());assert rec['builder_id']=='b004' and rec['task_id']=='task-021' and rec['action']=='restore-last-accepted-checkpoint'
 exact='Recorded PM recovery action:\n'+rec['message']
 for item in group['requests']:
  p=Path(item['path']);assert sha(p)==item['sha256'];payload=json.loads(p.read_text());texts=[]
  for x in payload['input']:
   if not isinstance(x,dict):continue
   c=x.get('content',[])
   if isinstance(c,str):texts.append(c)
   elif isinstance(c,list):texts.extend(v.get('text','') for v in c if isinstance(v,dict))
  assert any(exact in text for text in texts),p
 checks.append({'attempt':group['attempt'],'recovery_instruction_path':str(instruction),'recovery_instruction_sha256':sha(instruction),'exact_recorded_message_present_in_all_requests':True,'request_count':len(group['requests'])})
out=r/'preflight/task021-feedback-delivery002';assert not out.exists();out.mkdir();shutil.copy2(__file__,out/'executed-controller.py');proof={'verified':True,'input_proof_sha256':sha(base),'controller_sha256':sha(Path(__file__)),'checks':checks,'native_model_calls':0,'scope':'Strengthens delivery001 recovery-word presence check by asserting the exact recorded recovery message and header in all36 retained request bodies. Packet and rejection feedback byte-level delivery remains established by001. No model-attention or causal implementation claim.'};(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n')
record={'schema_version':1,'record_id':str(uuid.uuid4()),'lesson_id':'L069','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'author':'pm','status':'verified','scope':'eval016 post-recovery feedback delivery exact-message strengthening','observation':'The exact recorded own-checkpoint recovery message and header are present in all36 retained native request bodies for attempts007,013,019, strengthening the earlier recovery-word check.','verification':proof['scope'],'root_cause':'This establishes delivery, while model attention and application causes remain unestablished.','prevention':'Bind recovery delivery to the exact retained instruction text, rather than an isolated word.','comparison_policy':'Read-only PM evidence strengthening; frozen native behavior and earlier observations unchanged.','evidence':[str(out/'verified.json'),str(base)]}
with Path('lessons/records.jsonl').open('a') as f:f.write(json.dumps(record,sort_keys=True)+'\n')
with (r/'decisions/lessons-applied.md').open('a') as f:f.write('\nL069 recovery delivery proof strengthened: delivery002 checks the exact recorded recovery header and message in all36 native request bodies, extending delivery001 packet/feedback byte verification. Model attention and application cause remain unestablished. No comparison change.\n')
print(json.dumps({'verified':True,'requests':sum(x['request_count'] for x in checks),'evidence':str(out)}))
