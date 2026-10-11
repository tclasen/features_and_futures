
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
