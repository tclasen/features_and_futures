"""PM native request capture: fake HTTP provider, no real inference or credentials."""
import base64,hashlib,json,shutil,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path.cwd()))
from orchestrator.prepare import checked,git,write_json
from orchestrator.private import initialize,export
from orchestrator.evidence import timestamp
root=Path('experiments/instruction-effects/revisions/research-v014/preflight/pi-prompt-transport001')
root.mkdir(exist_ok=False)
(root/'executed-controller.py').write_bytes(Path(__file__).read_bytes())
manifest=json.loads(Path('runs/instruction-effects/eval-014/manifest.json').read_text())
profiles=json.loads(Path('runs/instruction-effects/eval-014/definitions/instructions.json').read_text())['profiles']
name='ff-diag-eval014-pi-prompt-transport001'
shadow=Path('.local/pi-prompt-transport001-shadow')
write_json(root/'resource.json',{'sandbox':name,'status':'planned','utc':timestamp()})
ledgerpath=Path('.local/eval014-owned-resource-ledger.json')
ledger=json.loads(ledgerpath.read_text())
# Exact diagnostic resource is recorded separately from native run namespaces.
ledger.setdefault('pm_diagnostic_resources',[]).append({'sandbox':name,'status':'planned','evidence':str(root)})
write_json(ledgerpath,ledger)
packet=Path('runs/instruction-effects/eval-014/tasks/task-025/packet.md').read_text()
feedback=Path('runs/instruction-effects/eval-014/tasks/task-025/attempts/b004/attempt-001/feedback.json').read_text()
inputs={'profiles':profiles,'small':'  Native transport Ω 🙂\n\t preserve trailing whitespace \n ','large':packet+'\n\nFeedback on your previous submission:\n'+feedback}
write_json(root/'inputs.json',inputs)
native=r'''
import base64,hashlib,http.server,json,os,pathlib,subprocess,sys,threading,urllib.parse
inputs=json.load(sys.stdin);requests=[]
class Handler(http.server.BaseHTTPRequestHandler):
 def do_POST(self):
  raw=self.rfile.read(int(self.headers['Content-Length']));requests.append({'path':self.path,'body':json.loads(raw),'raw_sha256':hashlib.sha256(raw).hexdigest()})
  self.send_response(400);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":{"message":"PM fake capture; no inference","type":"invalid_request_error"}}')
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
claim={'https://api.openai.com/auth':{'chatgpt_account_id':'pm-fake-capture'}}
key='e30.'+base64.urlsafe_b64encode(json.dumps(claim).encode()).decode().rstrip('=')+'.pmcanary'
config=pathlib.Path('/home/agent/.ff-context-pm-canary');config.mkdir()
(config/'models.json').write_text(json.dumps({'providers':{'pilot':{'api':'openai-codex-responses','baseUrl':f'http://127.0.0.1:{server.server_port}','apiKey':'$FF_GATEWAY_KEY','models':[{'id':'gpt-6-luna','name':'gpt-6-luna','reasoning':True,'input':['text'],'contextWindow':272000,'maxTokens':16384,'cost':{'input':0,'output':0,'cacheRead':0,'cacheWrite':0},'compat':{'supportsReasoningEffort':True,'supportsUsageInStreaming':True}}]}}}))
(config/'settings.json').write_text(json.dumps({'transport':'sse','packages':[],'skills':[],'quietStartup':True,'defaultThinkingLevel':'medium','retry':{'enabled':False}}))
env={**os.environ,'PI_CODING_AGENT_DIR':str(config),'FF_GATEWAY_KEY':key,'PI_OFFLINE':'1','PI_TELEMETRY':'0'}
flags=['--provider','pilot','--model','gpt-6-luna','--thinking','medium','--print','--mode','json','--offline','--no-extensions','--no-mcp','--no-skills','--no-prompt-templates','--no-session']
results=[]
for profile,treatment in inputs['profiles'].items():
 (config/'treatment.txt').write_text(treatment)
 args=flags+(['--append-system-prompt',str(config/'treatment.txt')] if treatment else [])
 for size in ['small','large']:
  prompt=inputs[size];(config/'prompt.txt').write_text(prompt)
  for transport in (['argv','file'] if size=='small' else ['file']):
   pre=len(requests)
   if transport=='argv':cmd=['pi',*args,prompt]
   else:
    shim='import {readFileSync} from "node:fs";process.argv.push(readFileSync('+json.dumps(str(config/'prompt.txt'))+',"utf8"));'
    cmd=['node','--import','data:text/javascript,'+urllib.parse.quote(shim,safe=''),'/usr/local/share/npm-global/bin/pi',*args]
   p=subprocess.run(cmd,input='',text=True,capture_output=True,env=env,cwd='/home/agent/work',timeout=120)
   results.append({'profile':profile,'size':size,'transport':transport,'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),'prompt_bytes':len(prompt.encode()),'exit_code':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'requests':requests[pre:]})
server.shutdown()
print(json.dumps({'versions':{x:subprocess.check_output([x,'--version'],text=True).strip() for x in ['pi','node']},'results':results,'real_provider_requests':0}))
'''
(root/'native-controller.py').write_text(native)
created=False
try:
 checked(['git','clone','--quiet','--no-local',str(Path(manifest['paths']['builders'])/'starter'),str(shadow)])
 git(shadow,'remote','remove','origin')
 checked(['sbx','create','--name',name,'--cpus','4','--memory','4g','--skills','off','--pull','never','-t',manifest['runtime']['image'],'shell']);created=True
 write_json(root/'resource.json',{'sandbox':name,'status':'created','utc':timestamp()})
 initialize(name,shadow)
 setup="import pathlib,sys;pathlib.Path('/home/agent/pm-native-capture.py').write_text(sys.stdin.read())"
 checked(['sbx','exec','-i',name,'python3','-c',setup],stdin=native)
 p=subprocess.run(['sbx','exec','-i',name,'python3','/home/agent/pm-native-capture.py'],input=json.dumps(inputs),text=True,capture_output=True,timeout=1200)
 (root/'capture.stdout.json').write_text(p.stdout);(root/'capture.stderr.log').write_text(p.stderr)
 if p.returncode:raise RuntimeError('Native capture controller failed; see preserved stderr')
 capture=json.loads(p.stdout)
 assert capture['versions']['pi']=='1.1.0'
 checks=[]
 for profile in profiles:
  rows=[x for x in capture['results'] if x['profile']==profile]
  for row in rows:assert len(row['requests'])==1,(profile,row['size'],row['transport'],row['stderr'])
  original=next(x for x in rows if x['size']=='small' and x['transport']=='argv')['requests'][0]['body']
  replacement=next(x for x in rows if x['size']=='small' and x['transport']=='file')['requests'][0]['body']
  # Correlation identifiers are inspected separately; native model context must match exactly.
  changed=[k for k in original if original.get(k)!=replacement.get(k)]
  assert not set(changed)-{'prompt_cache_key'},changed
  for row in rows:
   body=row['requests'][0]['body']
   texts=[c.get('text') for msg in body['input'] for c in msg.get('content',[]) if c.get('type')=='input_text']
   assert inputs[row['size']] in texts,(profile,row['size'],'prompt mismatch')
  checks.append({'profile':profile,'equal_native_context':True,'only_differing_body_fields':changed,'large_prompt_bytes':len(inputs['large'].encode())})
 write_json(root/'verified.json',{'verified':True,'checks':checks,'real_provider_requests':0,'capture_sha256':hashlib.sha256(p.stdout.encode()).hexdigest()})
except BaseException as error:
 write_json(root/'failure.json',{'error':type(error).__name__,'message':str(error),'utc':timestamp(),'real_provider_requests':0})
 raise
finally:
 if created:
  export(name,shadow,root)
  checked(['git','bundle','verify',str(root/'native-history.bundle')])
  checked(['sbx','stop',name]);checked(['sbx','rm','--force',name])
  inventory=json.loads(checked(['sbx','ls','--json']))
  assert name not in {x['name'] for x in inventory['sandboxes']}
  write_json(root/'resource.json',{'sandbox':name,'status':'removed','utc':timestamp(),'archive_verified':True,'inventory_absence_verified':True})
  shutil.rmtree(shadow)
 ledger=json.loads(ledgerpath.read_text())
 for x in ledger['pm_diagnostic_resources']:
  if x['sandbox']==name:x.update(json.loads((root/'resource.json').read_text()))
 write_json(ledgerpath,ledger)
