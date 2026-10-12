import datetime,hashlib,json,shutil,uuid
from pathlib import Path
root=Path.cwd();run=root/'runs/instruction-effects/eval-016';out=run/'preflight/task021-feedback-delivery001';assert not out.exists()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
packet=(run/'tasks/task-021/packet.md').read_text();checks=[]
for attempt in (7,13,19):
 prior=run/f'tasks/task-021/attempts/b004/attempt-{attempt-1:03}/feedback.json'
 feedback=prior.read_text();parsed=json.loads(feedback)
 assert parsed['status']=='rejected' and any('2028-02-29' in str(x['errors']) for x in parsed['observations'])
 folder=run/f'tasks/task-021/attempts/b004/attempt-{attempt:03}/requests'
 requests=[]
 for f in sorted(folder.glob('*.request.json')):
  payload=json.loads(f.read_text());texts=[]
  for item in payload['input']:
   if not isinstance(item,dict):continue
   content=item.get('content',[])
   if isinstance(content,str):texts.append(content)
   elif isinstance(content,list):texts.extend(x.get('text','') for x in content if isinstance(x,dict))
  delivered=[x for x in texts if 'Feedback on your previous submission:' in x]
  assert len(delivered)==1 and feedback in delivered[0] and packet in delivered[0], f
  assert '2028-02-29' in delivered[0] and 'restor' in delivered[0].lower()
  requests.append({'path':str(f.relative_to(root)),'sha256':sha(f),'delivered_text_sha256':hashlib.sha256(delivered[0].encode()).hexdigest(),'delivered_text_chars':len(delivered[0]),'exact_prior_feedback_present':True,'exact_frozen_packet_present':True})
 assert requests
 checks.append({'attempt':attempt,'prior_feedback_path':str(prior.relative_to(root)),'prior_feedback_sha256':sha(prior),'prior_feedback_chars':len(feedback),'requests':requests})
out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
proof={'verified':True,'checks':checks,'controller_sha256':sha(Path(__file__)),'packet_sha256':hashlib.sha256(packet.encode()).hexdigest(),'native_model_calls':0,'scope':'Retained outgoing native request bodies for b004 task021 attempts007,013,019 contain the exact frozen packet and exact preceding rejection feedback, including expected date and empty observation. Recovery wording is present. This proves delivery only, not model attention, application cause or effective repair; no native code or feedback change.'}
(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n')
record={'schema_version':1,'record_id':str(uuid.uuid4()),'lesson_id':'L069','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'author':'pm','status':'verified','scope':'eval016 task021 post-recovery feedback delivery','observation':'Every retained outgoing request in post-recovery attempts007,013,019 contains the previous rejection feedback verbatim, the frozen task packet, date expectation and recovery wording. The repeated date failure is not explained by missing feedback in these request bodies.','root_cause':'Application failure cause and model attention remain unestablished.','prevention':'Retain exact request inputs and failure evidence; keep repairs with the assigned builder under frozen controls.','verification':proof['scope'],'comparison_policy':'PM read-only evidence verification; no builder code, feedback, task, profile, harness, accounting or treatment change.','evidence':[str((out/'verified.json').relative_to(root))]}
with (root/'lessons/records.jsonl').open('a') as f:f.write(json.dumps(record,sort_keys=True)+'\n')
with (run/'decisions/lessons-applied.md').open('a') as f:f.write('\nL069 task021 post-recovery feedback delivery verified: all retained requests in attempts007,013,019 contain the exact packet and preceding rejection feedback with expected date and recovery wording. Model attention and causal application mechanism remain unestablished. Evidence: preflight/task021-feedback-delivery001/verified.json. No comparison change.\n')
print(json.dumps({'verified':True,'attempts':len(checks),'requests':sum(len(x['requests']) for x in checks),'evidence':str(out.relative_to(root))}))
