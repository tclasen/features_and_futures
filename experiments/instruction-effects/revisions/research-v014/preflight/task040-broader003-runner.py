"""Run the prepared PM fixture and seal exact inputs/results on success or failure."""
import hashlib,json,subprocess,time
from pathlib import Path
BASE=Path('experiments/instruction-effects/revisions/research-v014/preflight')
controller=BASE/'task040-broader003-fixture.mjs'
prepared=BASE/'task040-broader003-inputs.json'
suite=BASE/'task040-full-prototype002-suite'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
inputs=json.loads(prepared.read_text())
race=BASE/'task040-directory-mode-race002-check-1791752576553'
race_proof=json.loads((race/'verified.json').read_text());assert race_proof['verified'] and len(race_proof['results'])==6
for row in race_proof['results']:
 assert (bool(row['failedAssertion']),row['selectedMode'],len(row['visibleTitles']))==((True,'Phrase',1) if row['variant']=='old' else (False,'Starts with',0))

print(json.dumps({'prepared_keys':list(inputs)}),flush=True)
assert inputs['controller']['sha256']==sha(controller)
assert inputs['suite_files']=={str(p.relative_to(suite)):sha(p) for p in sorted(suite.rglob('*')) if p.is_file()}
# The entire serial focused batch must be closed and independently verified.
batch=BASE/'future031039-focused-batch-1791743915226876000'
batch_proof=json.loads((batch/'verified.json').read_text());assert batch_proof['verified']
for item in batch_proof['results']:
 proof=Path(item['evidence'])/'independently-verified.json'
 assert json.loads(proof.read_text())['verified']
before=set(BASE.glob('task040-broader003-check-*'))
receipt=BASE/('task040-broader003-batch-'+str(time.time_ns()));receipt.mkdir()
(receipt/'executed-controller.py').write_bytes(Path(__file__).read_bytes())
write(receipt/'inputs.json',{'controller_sha256':sha(controller),'prepared_sha256':sha(prepared),'focused_batch_sha256':sha(batch/'verified.json'),'focused_independent_proofs':{str(Path(r['evidence'])/'independently-verified.json'):sha(Path(r['evidence'])/'independently-verified.json') for r in batch_proof['results']},'suite_files':inputs['suite_files'],'native_model_calls':0})
with (receipt/'stdout.log').open('wb') as out,(receipt/'stderr.log').open('wb') as err:
 proc=subprocess.run(['node',str(controller)],stdout=out,stderr=err)
created=set(BASE.glob('task040-broader003-check-*'))-before
assert len(created)==1,sorted(str(p) for p in created)
evidence=created.pop();assert sha(evidence/'executed-controller.mjs')==sha(controller)
closure={'exit_code':proc.returncode,'controller_sha256':sha(controller),'batch_inputs_sha256':sha(receipt/'inputs.json'),'files':{str(p.relative_to(evidence)):sha(p) for p in sorted(evidence.rglob('*')) if p.is_file()},'native_model_calls':0,'scope':'PM synthetic fixture only; process-local probes do not establish actual native upgrade/restart.'}
write(evidence/'input-closure.json',closure)
if proc.returncode:
 write(receipt/'failure.json',{'retained':True,'exit_code':proc.returncode,'evidence':str(evidence),'input_closure_sha256':sha(evidence/'input-closure.json')})
 raise SystemExit(proc.returncode)
proof=json.loads((evidence/'verified.json').read_text());assert proof['verified'] and proof['model_calls']==0
write(receipt/'verified.json',{'verified':True,'evidence':str(evidence),'input_closure_sha256':sha(evidence/'input-closure.json'),'native_model_calls':0,'scope':closure['scope']})
print(json.dumps({'verified':True,'evidence':str(evidence),'batch':str(receipt)}))
