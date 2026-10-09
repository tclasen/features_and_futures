import json,pathlib,shutil,time,subprocess,copy
from pathlib import Path
from orchestrator.prepare import ROOT,write_json,checked,file_hashes
from orchestrator.evidence import digest_json
from orchestrator.validation import launch_deployment,run_suite
r=ROOT/'runs/instruction-effects/pilot-013';m=json.loads((r/'manifest.json').read_text());source=r/'tasks/task-002/attempts/b001/attempt-002';commit=json.loads((source/'result.json').read_text())['commit'];probe=r/'preflight'/('completion-navigation-matched-'+str(time.time_ns()));probe.mkdir(parents=True);suite=probe/'definitions/project/acceptance';shutil.copytree(r/'definitions/project/acceptance',suite)
p=suite/'workboard.spec.mjs';text=p.read_text();old="    await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();\n";assert text.count(old)==1;text=text.replace(old,"    await Promise.all([page.waitForResponse(response => response.request().method() === 'POST'), page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck()]);\n");p.write_text(text)
manifest=copy.deepcopy(m);manifest['run_id']='diagnosticcompletion13';manifest['paths']['deployments']=str(probe/'deployment');manifest['execution'].pop('task_stream_revision');write_json(probe/'manifest.json',manifest);prior={'stage':1,'database':m['paths']['deployments']+'/b001/task-001/attempt-001/.runtime/app.sqlite','fixture_prefix':'task-001'};assert Path(prior['database']).is_file();write_json(probe/'provenance.json',{'purpose':'PM-owned acceptance sequencing diagnostic; original builder source unchanged','source_commit':commit,'source_tree':json.loads((source/'result.json').read_text())['tree'],'original_suite_hash':digest_json(file_hashes(r/'definitions/project/acceptance')),'diagnostic_suite_hash':digest_json(file_hashes(suite)),'added_assertion':'PM diagnostic waits for the observed native form POST response before reloading; architecture-specific probe only, not a proposed general suite contract','native_model_requests':0});out=probe/'validation';out.mkdir();app=None
try:
 app=launch_deployment(manifest,'b001','task-002','diagnostic',ROOT,commit,out,prior)
 ok,errors,counts=run_suite(ROOT,probe,app,out,2,'acceptance','task-002')
 Path(probe/'diagnostic-procedure.py').write_text(Path('.local/completion-navigation-matched.py').read_text());write_json(probe/'result.json',{'success':ok,'errors':errors,'counts':counts,'native_model_requests':0})
 print(probe,ok,counts,flush=True)
finally:
 if app:
  app.stop();checked(['sbx','rm','--force',app.name])
shutil.copy2('.local/archive-readiness-probe.py',probe/'procedure.py')
