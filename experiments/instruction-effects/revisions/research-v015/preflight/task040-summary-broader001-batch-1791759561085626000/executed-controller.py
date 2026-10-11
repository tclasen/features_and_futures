"""Seal prospective future full040 inputs/results and clean only the owned process group."""
import hashlib,json,os,signal,subprocess,time
from pathlib import Path
base=Path('experiments/instruction-effects/revisions/research-v015/preflight')
controller=base/'task040-summary-broader001-fixture.mjs'
prepared=base/'task040-summary-broader001-inputs.json'
suite=base/'task040-summary-suite'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
inputs=json.loads(prepared.read_text());assert inputs['controller_sha256']==sha(controller)
assert inputs['suite_files']=={str(p.relative_to(suite)):sha(p) for p in suite.rglob('*') if p.is_file()}
paired=Path('experiments/instruction-effects/revisions/research-v014/preflight/summary043-native-replay-002/independently-verified.json');assert json.loads(paired.read_text())['verified']
focused=Path('experiments/instruction-effects/revisions/research-v014/preflight/summary043-focused-fixture001-check-1791753702472/independently-verified.json');assert json.loads(focused.read_text())['verified']
previous=Path(inputs['predecessor_evidence'])/'independently-verified.json'
prior=json.loads(previous.read_text());assert prior['verified'] and prior['full140_variants']==5 and prior['process_local_assertion_probes']==10
for path,checksum in inputs['focused_independent_proofs'].items():assert sha(Path(path))==checksum and json.loads(Path(path).read_text())['verified']
from orchestrator.prepare import file_hashes
from orchestrator.summary_readiness import verify_summary_only_delta
source_suite=Path(inputs['source_suite']);assert file_hashes(source_suite)==inputs['source_suite_files'] and verify_summary_only_delta(source_suite,suite)==['return-order.spec.mjs']
source_controller=Path(inputs['source_controller']);assert sha(source_controller)==inputs['source_controller_sha256']
expected=source_controller.read_bytes().replace(b'research-v014',b'research-v015').replace(b'task040-full-prototype002-suite',b'task040-summary-suite').replace(b'task040-broader003-check-',b'task040-summary-broader001-check-')
assert controller.read_bytes()==expected
before=set(base.glob('task040-summary-broader001-check-*'));batch=base/('task040-summary-broader001-batch-'+str(time.time_ns()));batch.mkdir()
(batch/'executed-controller.py').write_bytes(Path(__file__).read_bytes())
write(batch/'inputs.json',{'controller_sha256':sha(controller),'prepared_sha256':sha(prepared),'suite_files':inputs['suite_files'],'paired_proof_sha256':sha(paired),'focused_proof_sha256':sha(focused),'predecessor_proof_sha256':sha(previous),'focused_independent_proofs':inputs['focused_independent_proofs'],'model_calls':0})
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
created=set(base.glob('task040-summary-broader001-check-*'))-before
assert len(created)<=1
if created:
 out=created.pop();assert sha(out/'executed-controller.mjs')==sha(controller)
 write(out/'input-closure.json',{'exit_code':code,'controller_sha256':sha(controller),'batch_inputs_sha256':sha(batch/'inputs.json'),'files':{str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file()},'model_calls':0,'scope':'PM future full040 synthetic fixture; lifecycle probes do not perform real restarts.'})
else:out=None
if code or error or out is None:
 write(batch/'failure.json',{'retained':True,'exit_code':code,'error':error,'evidence':str(out) if out else None,'input_closure_sha256':sha(out/'input-closure.json') if out else None,'model_calls':0});raise SystemExit(code or 1)
proof=json.loads((out/'verified.json').read_text());assert proof['verified'] and proof['model_calls']==0
write(batch/'verified.json',{'verified':True,'evidence':str(out),'input_closure_sha256':sha(out/'input-closure.json'),'model_calls':0})
print(json.dumps({'verified':True,'batch':str(batch),'evidence':str(out)}))
