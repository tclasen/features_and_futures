import json,shutil,subprocess,copy,sqlite3
from pathlib import Path
from orchestrator.prepare import ROOT,write_json,file_hashes
from orchestrator.evidence import digest_bytes,timestamp
from orchestrator.validation import launch_deployment,run_suite
r=ROOT/'runs/instruction-effects/eval-007';out=r/'preflight/search047-native-original6';assert not out.exists();out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
ip=r/'builders/b011/checkpoints/task-013-attempt-006/index.json';idx=json.loads(ip.read_text());manifest=json.loads((r/'manifest.json').read_text());state=json.loads((r/'state.json').read_text());assert state['accepted']['b011']['stage']==12
for name,sha in idx['checksums'].items():assert digest_bytes((ip.parent/name).read_bytes())==sha
shadow=ROOT/'.local/eval007-native047-source6';subprocess.run(['git','clone','--quiet',str(ip.parent/'history.bundle'),str(shadow)],check=True,capture_output=True);subprocess.run(['git','-C',str(shadow),'checkout','--detach',idx['source_commit']],check=True,capture_output=True)
git=lambda *a:subprocess.check_output(['git','-C',str(shadow),*a],text=True).strip();assert git('rev-parse','HEAD^{tree}')==idx['source_tree'];assert not git('status','--porcelain')
for variant in ['original','corrected']:
 suite=out/variant/'definitions/project/acceptance';shutil.copytree(r/'tasks/task-013/suite',suite)
 cfg=suite/'playwright.config.mjs';cfg.write_text(cfg.read_text().replace("testDir: '.',","testDir: '.',\n  grep: /047 /,"))
 if variant=='corrected':
  p=suite/'search.spec.mjs';s=p.read_text();needle="for(const title of ['Mixed first','Other high','MIXED completed','Mixed undated','mixed last'])await createTask(page,title);";assert needle in s;s=s.replace(needle,needle+"await createTask(page,'Other normal guard');",1)
  needle="await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from'";assert needle in s
  s=s.replace(needle,"await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await expect(taskRow(page,'Mixed undated')).toBeVisible();await expect(taskRow(page,'Other normal guard')).toBeVisible();await expect(taskRow(page,'MIXED completed')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(5);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Other high')).toBeVisible();await expect(taskRow(page,'Mixed undated')).toBeVisible();await expect(taskRow(page,'Other normal guard')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);await page.getByRole('textbox',{name:'Due from'",1)
  needle="await page.getByRole('button',{name:'Apply due range',exact:true}).click();await taskSearch(page,' MIXED ');";assert needle in s;s=s.replace(needle,"await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,'Other high')).toBeVisible();await expect(taskRow(page,'Mixed first')).toBeVisible();await expect(taskRow(page,'mixed last')).toBeVisible();await expect(taskRow(page,'Mixed undated')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await taskSearch(page,' MIXED ');",1)
  s=s.replace("getByTestId('project-summary')).toHaveText('1/5 completed')","getByTestId('project-summary')).toHaveText('1/6 completed')",1);p.write_text(s)
manifest=copy.deepcopy(manifest);manifest['run_id']='diag-eval007-b011047';manifest['paths']['deployments']=str(ROOT/'.local/eval007-native047-deployments');prior={'database':str(Path(state['accepted']['b011']['archive_output'])/'accepted.sqlite')};assert Path(prior['database']).is_file()
deployment=None;results=[]
try:
 deployment=launch_deployment(manifest,'b011','task-013','attempt-006',shadow,idx['source_commit'],out,prior);write_json(out/'resource.json',{'sandbox':deployment.name,'status':'active','model_calls':0})
 for variant,expected in [('original',False),('corrected',True)]:
  ok,diagnostics,stats=run_suite(ROOT,out/variant,deployment,out/variant,13,'acceptance','diag-'+variant);results.append({'variant':variant,'success':ok,'diagnostics':diagnostics,'statistics':stats});write_json(out/'results.json',results);assert ok==expected,(variant,ok,diagnostics)
 write_json(out/'verified.json',{'verified':True,'utc':timestamp(),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'original_source_unchanged':True,'model_calls':0,'results':results,'scope':'Exact native original submission: original047reproduces rejection; prospective observer correction passes. No acceptance promotion or original outcome rewritten.'});print(json.dumps({'verified':True,'original_failed_corrected_passed':True}))
finally:
 if deployment:
  deployment.stop();shutil.copy2(deployment.database,out/'retired.sqlite')
  with sqlite3.connect(f'file:{(out/"retired.sqlite").resolve()}?mode=ro',uri=True) as c:assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
  assert git('rev-parse','HEAD')==idx['source_commit'] and git('rev-parse','HEAD^{tree}')==idx['source_tree']
  subprocess.run(['sbx','stop',deployment.name],check=True,capture_output=True);subprocess.run(['sbx','rm','--force',deployment.name],check=True,capture_output=True);write_json(out/'resource.json',{'sandbox':deployment.name,'status':'removed','utc':timestamp(),'original_git_restored':True,'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'submission_sha256':digest_bytes((out/'submission.tar').read_bytes()),'retired_sqlite_sha256':digest_bytes((out/'retired.sqlite').read_bytes()),'sqlite_integrity':'ok'});shutil.rmtree(shadow)
