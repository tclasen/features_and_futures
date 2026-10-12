"""Seal prospective future owner actions inputs/results and clean only the owned process group."""
import hashlib,json,os,signal,subprocess,time
from pathlib import Path
base=Path('experiments/instruction-effects/revisions/research-v016/preflight')
controller=base/'future-owner-action-role-focused002-fixture.mjs'
prepared=base/'future-owner-action-role-focused002-inputs.json'
suite=base/'task040-action-role-suite'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
inputs=json.loads(prepared.read_text());assert inputs['controller_sha256']==sha(controller)
assert inputs['suite_files']=={str(p.relative_to(suite)):sha(p) for p in suite.rglob('*') if p.is_file()}
paired=Path('runs/instruction-effects/eval-015/preflight/export017-native-full001/source-bound-verification001/verified.json');assert json.loads(paired.read_text())['verified']
focused=Path('runs/instruction-effects/eval-015/preflight/export017-native-replay001/input-closure.json');assert json.loads(focused.read_text())['verified']
before=set(base.glob('future-owner-action-role-focused002-check-*'));batch=base/('future-owner-action-role-focused002-batch-'+str(time.time_ns()));batch.mkdir()
(batch/'executed-controller.py').write_bytes(Path(__file__).read_bytes())
write(batch/'inputs.json',{'controller_sha256':sha(controller),'prepared_sha256':sha(prepared),'suite_files':inputs['suite_files'],'paired_proof_sha256':sha(paired),'focused_proof_sha256':sha(focused),'model_calls':0})
error=None
with (batch/'stdout.log').open('wb') as stdout,(batch/'stderr.log').open('wb') as stderr:
 child=subprocess.Popen(['node',str(controller)],stdout=stdout,stderr=stderr,start_new_session=True)
 write(batch/'process.json',{'pid':child.pid,'owned_process_group':child.pid,'model_calls':0})
 try:code=child.wait()
 except BaseException as exc:
  error={'type':type(exc).__name__,'message':str(exc)}
  if child.poll() is None:os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=10)
  except subprocess.TimeoutExpired:
   os.killpg(child.pid,signal.SIGKILL);code=child.wait()
created=set(base.glob('future-owner-action-role-focused002-check-*'))-before
assert len(created)<=1
if created:
 out=created.pop();assert sha(out/'executed-controller.mjs')==sha(controller)
 write(out/'input-closure.json',{'exit_code':code,'controller_sha256':sha(controller),'batch_inputs_sha256':sha(batch/'inputs.json'),'files':{str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file()},'model_calls':0,'scope':'PM focused future owner action synthetic fixture; lifecycle probes do not perform real restarts.'})
else:out=None
if code or error or out is None:
 write(batch/'failure.json',{'retained':True,'exit_code':code,'error':error,'evidence':str(out) if out else None,'input_closure_sha256':sha(out/'input-closure.json') if out else None,'model_calls':0});raise SystemExit(code or 1)
proof=json.loads((out/'verified.json').read_text());assert proof['verified'] and proof['model_calls']==0
write(batch/'verified.json',{'verified':True,'evidence':str(out),'input_closure_sha256':sha(out/'input-closure.json'),'model_calls':0})
print(json.dumps({'verified':True,'batch':str(batch),'evidence':str(out)}))
