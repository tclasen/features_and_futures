import copy,json,shutil,time
from pathlib import Path
from orchestrator.prepare import ROOT,git,write_json,file_hashes
from orchestrator.evidence import digest_bytes
from orchestrator.validation import Deployment,run_suite
run=ROOT/'runs/instruction-effects/pilot-009'
original=run/'tasks/task-001/attempts/b010/attempt-001/result.json'
submission=json.loads(original.read_text())
root=run/'preflight'/('blank-race-audit-'+str(time.time_ns()));root.mkdir()
manifest=copy.deepcopy(json.loads((run/'manifest.json').read_text()));manifest['run_id']=root.name
manifest['runtime']['deployment_lifecycle']='foreground-sbx-exec-v2'
manifest['paths']['deployments']=str(ROOT/'.local/blank-race-deployments'/root.name)
suite=ROOT/'projects/workboard/revisions/v007/acceptance'
shutil.copytree(suite,root/'definitions/project/acceptance');write_json(root/'manifest.json',manifest)
assert git(ROOT,'rev-parse',submission['commit']+'^{tree}')==submission['tree']
write_json(root/'provenance.json',{'source_result_sha256':digest_bytes(original.read_bytes()),'source_commit':submission['commit'],'source_tree':submission['tree'],'suite_hashes':file_hashes(suite),'purpose':'Immutable rejected-source recheck; no builder changes or original outcome edits','probe_sha256':digest_bytes(Path(__file__).read_bytes())})
shutil.copyfile(__file__,root/'probe.py')
output=root/'checks';output.mkdir()
deployment=Deployment.__new__(Deployment);deployment.created=False
try:
 Deployment.__init__(deployment,manifest,'b010','task-001','attempt-001',ROOT,submission['commit'],output,None)
 phases=[]
 ok,errors,counts=run_suite(ROOT,root,deployment,output,1,'acceptance',root.name)
 phases.append({'phase':'acceptance','passed':ok and not errors and counts.get('expected')==4 and not counts.get('skipped',0),'statistics':counts,'diagnostics':errors})
 if phases[-1]['passed']:
  deployment.restart()
  ok,errors,counts=run_suite(ROOT,root,deployment,output,1,'postrestart',root.name)
  phases.append({'phase':'postrestart','passed':ok and not errors and counts.get('expected')==1 and not counts.get('skipped',0),'statistics':counts,'diagnostics':errors})
 passed=len(phases)==2 and all(p['passed'] for p in phases)
 write_json(root/'result.json',{'immutable_original_commit':submission['commit'],'passed':passed,'phases':phases,'model_requests':0,'original_result_unchanged':digest_bytes(original.read_bytes())==json.loads((root/'provenance.json').read_text())['source_result_sha256']})
 print(json.dumps({'evidence':str(root),'passed':passed}))
 if not passed:raise RuntimeError('Immutable original submission did not pass corrected baseline synchronization')
finally:
 if deployment.created:deployment.stop()
