import json,pathlib,shutil,time,subprocess,copy
from orchestrator.prepare import ROOT,write_json,checked,file_hashes
from orchestrator.evidence import digest_json
from orchestrator.validation import launch_deployment,run_suite
r=ROOT/'runs/instruction-effects/pilot-012';m=json.loads((r/'manifest.json').read_text());source=r/'tasks/task-003/attempts/b004/attempt-008';commit=json.loads((source/'result.json').read_text())['commit'];probe=r/'preflight'/('archive-readiness-matched-'+str(time.time_ns()));probe.mkdir(parents=True);suite=probe/'definitions/project/acceptance';shutil.copytree(r/'definitions/project/acceptance',suite)
p=suite/'workboard.spec.mjs';text=p.read_text();old="    await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();\n";assert text.count(old)==1;text=text.replace(old,old+"    await expect(projectRow(page, 'Archive tasks')).toHaveCount(0);\n");p.write_text(text)
manifest=copy.deepcopy(m);manifest['run_id']='diagnosticarchive12';manifest['paths']['deployments']=str(probe/'deployment');manifest['execution'].pop('task_stream_revision');write_json(probe/'manifest.json',manifest);prior=json.loads((r/'state.json').read_text())['accepted']['b004'];write_json(probe/'provenance.json',{'purpose':'PM-owned acceptance sequencing diagnostic; original builder source unchanged','source_commit':commit,'source_tree':json.loads((source/'result.json').read_text())['tree'],'original_suite_hash':digest_json(file_hashes(r/'definitions/project/acceptance')),'diagnostic_suite_hash':digest_json(file_hashes(suite)),'added_assertion':'Wait until the archived project is absent from the active list before selecting Archived','native_model_requests':0});out=probe/'validation';out.mkdir();app=None
try:
 app=launch_deployment(manifest,'b004','task-003','diagnostic',ROOT,commit,out,prior)
 ok,errors,counts=run_suite(ROOT,probe,app,out,3,'acceptance','task-003')
 write_json(probe/'result.json',{'success':ok,'errors':errors,'counts':counts,'native_model_requests':0})
 print(probe,ok,counts,flush=True)
finally:
 if app:
  app.stop();checked(['sbx','rm','--force',app.name])
shutil.copy2('.local/archive-readiness-probe.py',probe/'procedure.py')
