"""Extract the original011 interaction without assuming the earlier mechanism recurs."""
import datetime,hashlib,json,zipfile
from pathlib import Path
r=Path('runs/instruction-effects/eval-016');folder=r/'tasks/task-021/attempts/b004/attempt-001';out=Path('.local/eval016-task021-date-trace001.json');assert not out.exists();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
result=json.loads((folder/'result.json').read_text());assert not result['accepted'] and any(x['test'].startswith('011') for x in result['diagnostics'])
traces=[p for p in (folder/'acceptance/artifacts').rglob('trace.zip') if '011' in p.parent.name];assert len(traces)==1;trace=traces[0]
with zipfile.ZipFile(trace) as z:
 actions=[json.loads(line) for n in z.namelist() if n.endswith('.trace') for line in z.read(n).decode().splitlines()]
 fills=[a for a in actions if a.get('class')=='Frame' and a.get('method')=='fill' and a.get('params',{}).get('value')=='2028-02-29'];fill=fills[0] if fills else None
 clicks=[a for a in actions if a.get('class')=='Frame' and a.get('method')=='click' and 'Save due date' in a.get('params',{}).get('selector','') and fill and a['startTime']>fill['startTime']];click=clicks[0] if clicks else None
 logs=[a for a in actions if click and a.get('callId')==click['callId'] and a.get('type')=='log'];patches=[]
 for n in z.namelist():
  if not n.endswith('.network'):continue
  for line in z.read(n).decode().splitlines():
   snapshot=json.loads(line)['snapshot'];q=snapshot['request'];data=q.get('postData',{});f=data.get('_file')
   if q['method']=='PATCH' and f and data.get('mimeType')=='application/json' and click and snapshot['_monotonicTime']>click['startTime']:
    body=json.loads(z.read(f))
    if 'dueDate' in body:patches.append({'body':body,'status':snapshot['response']['status'],'monotonic_time':snapshot['_monotonicTime']})
sequence=bool(fill and click and any('detached from the DOM' in a['message'] for a in logs) and patches and patches[0]['body']=={'dueDate':''} and patches[0]['status']==200)
proof={'verified':True,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'controller_sha256':sha(Path(__file__)),'trace':str(trace),'trace_sha256':sha(trace),'result_sha256':sha(folder/'result.json'),'feedback_sha256':sha(folder/'feedback.json'),'fill':fill,'click':click,'click_logs':logs,'date_patches':patches,'earlier_detached_save_empty_patch_sequence_observed':sequence,'native_model_calls':0,'scope':'Read-only extraction from original failed021 b004011 trace. Confirms recorded actions/network only; exact rendering trigger, observer-defect attribution and causal repair mechanism remain unestablished. No native source, feedback, test or measurement change.'}
out.write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'verified':True,'earlier_sequence_observed':sequence,'fill_count':len(fills),'date_patch_count':len(patches),'evidence':str(out)}))
