import json,shutil,subprocess,copy,sqlite3
from pathlib import Path
from orchestrator.prepare import ROOT,write_json,file_hashes
from orchestrator.evidence import digest_bytes,timestamp
from orchestrator.validation import launch_deployment,run_suite
r=ROOT/'runs/instruction-effects/eval-010';out=r/'preflight/deletion057-native-original1-full01';assert not out.exists();out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
ip=r/'builders/b006/checkpoints/task-016-attempt-001/index.json';idx=json.loads(ip.read_text());manifest=json.loads((r/'manifest.json').read_text());state=json.loads((r/'state.json').read_text());assert Path(r/'tasks/task-015/attempts/b006/attempt-001/accepted.sqlite').is_file()
for name,sha in idx['checksums'].items():assert digest_bytes((ip.parent/name).read_bytes())==sha
shadow=ROOT/'.local/eval010-native057-source01';subprocess.run(['git','clone','--quiet',str(ip.parent/'history.bundle'),str(shadow)],check=True,capture_output=True);subprocess.run(['git','-C',str(shadow),'checkout','--detach',idx['source_commit']],check=True,capture_output=True)
git=lambda *a:subprocess.check_output(['git','-C',str(shadow),*a],text=True).strip();assert git('rev-parse','HEAD^{tree}')==idx['source_tree'];assert not git('status','--porcelain')
suite=out/'corrected/definitions/project/acceptance';shutil.copytree(r/'tasks/task-016/suite',suite)
original=out/'original/definitions/project/acceptance';shutil.copytree(r/'tasks/task-016/suite',original)
cfg=original/'playwright.config.mjs';cfg.write_text(cfg.read_text().replace("  testDir: '.',","  testDir: '.',\n  grep: /057 /,"))
f=suite/'deletion.spec.mjs';text=f.read_text();old="await page.reload();await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);";new="await page.reload();await page.goto('/');await openProject(page,owner);await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2039-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2039-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await page.getByRole('textbox',{name:'Task search',exact:true}).fill('HIT');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);";assert text.count(old)==1;f.write_text(text.replace(old,new))
manifest=copy.deepcopy(manifest);manifest['run_id']='diag-eval010-b006057-01';manifest['paths']['deployments']=str(ROOT/'.local/eval010-native057-deployments01');prior={'database':str(r/'tasks/task-015/attempts/b006/attempt-001/accepted.sqlite')}
deployment=None;results=[]
try:
 deployment=launch_deployment(manifest,'b006','task-016','attempt-001',shadow,idx['source_commit'],out,prior);write_json(out/'resource.json',{'sandbox':deployment.name,'status':'active','model_calls':0})
 ok,diagnostics,stats=run_suite(ROOT,out/'original',deployment,out/'original',16,'acceptance','observed-057-original');write_json(out/'original-result.json',{'success':ok,'diagnostics':diagnostics,'statistics':stats});assert not ok and stats['unexpected']==1,(ok,stats)
 for stage,phase in [(15,'upgrade'),(16,'acceptance'),(16,'postrestart')]:
  if phase=='postrestart':deployment.restart()
  ok,diagnostics,stats=run_suite(ROOT,out/'corrected',deployment,out/'corrected',stage,phase,f'task-{stage:03d}');results.append({'stage':stage,'phase':phase,'success':ok,'diagnostics':diagnostics,'statistics':stats});write_json(out/'results.json',results);assert ok,(phase,diagnostics)
 write_json(out/'verified.json',{'verified':True,'utc':timestamp(),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'original_source_unchanged':True,'model_calls':0,'results':results,'actual_process_restart':True,'scope':'Unchanged native original001 corrected cumulative Task016 suite, prior15 upgrade and actual process restart. Original outcome retained. Explicit fresh project opening and Deleted/priority/range/search selections after reload; same persisted fields and intersection requirements; no builder implementation changes.'});print(json.dumps({'verified':True,'results':results}))

finally:
 if deployment:
  deployment.stop();shutil.copy2(deployment.database,out/'retired.sqlite')
  with sqlite3.connect(f'file:{(out/"retired.sqlite").resolve()}?mode=ro',uri=True) as c:assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
  assert git('rev-parse','HEAD')==idx['source_commit'] and git('rev-parse','HEAD^{tree}')==idx['source_tree']
  subprocess.run(['sbx','stop',deployment.name],check=True,capture_output=True);subprocess.run(['sbx','rm','--force',deployment.name],check=True,capture_output=True);write_json(out/'resource.json',{'sandbox':deployment.name,'status':'removed','utc':timestamp(),'original_git_restored':True,'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'submission_sha256':digest_bytes((out/'submission.tar').read_bytes()),'retired_sqlite_sha256':digest_bytes((out/'retired.sqlite').read_bytes()),'sqlite_integrity':'ok'});shutil.rmtree(shadow)
