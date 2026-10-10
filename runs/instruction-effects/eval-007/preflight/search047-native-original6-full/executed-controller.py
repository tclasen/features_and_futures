import json,shutil,subprocess,copy,sqlite3
from pathlib import Path
from orchestrator.prepare import ROOT,write_json,file_hashes
from orchestrator.evidence import digest_bytes,timestamp
from orchestrator.validation import launch_deployment,run_suite
r=ROOT/'runs/instruction-effects/eval-007';out=r/'preflight/search047-native-original6-full';assert not out.exists();out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
ip=r/'builders/b011/checkpoints/task-013-attempt-006/index.json';idx=json.loads(ip.read_text());manifest=json.loads((r/'manifest.json').read_text());state=json.loads((r/'state.json').read_text());assert state['accepted']['b011']['stage']==12
for name,sha in idx['checksums'].items():assert digest_bytes((ip.parent/name).read_bytes())==sha
shadow=ROOT/'.local/eval007-native047-full-source6';subprocess.run(['git','clone','--quiet',str(ip.parent/'history.bundle'),str(shadow)],check=True,capture_output=True);subprocess.run(['git','-C',str(shadow),'checkout','--detach',idx['source_commit']],check=True,capture_output=True)
git=lambda *a:subprocess.check_output(['git','-C',str(shadow),*a],text=True).strip();assert git('rev-parse','HEAD^{tree}')==idx['source_tree'];assert not git('status','--porcelain')
suite=out/'corrected/definitions/project/acceptance';shutil.copytree(r/'preflight/search047-native-original6/corrected/definitions/project/acceptance',suite)
cfg=suite/'playwright.config.mjs';cfg.write_text(cfg.read_text().replace('  grep: /047 /,\n',''))
manifest=copy.deepcopy(manifest);manifest['run_id']='diag-eval007-b011047full';manifest['paths']['deployments']=str(ROOT/'.local/eval007-native047-full-deployments');prior={'database':str(Path(state['accepted']['b011']['archive_output'])/'accepted.sqlite')};assert Path(prior['database']).is_file()
deployment=None;results=[]
try:
 deployment=launch_deployment(manifest,'b011','task-013','attempt-006',shadow,idx['source_commit'],out,prior);write_json(out/'resource.json',{'sandbox':deployment.name,'status':'active','model_calls':0})
 for stage,phase in [(12,'upgrade'),(13,'acceptance'),(13,'postrestart')]:
  if phase=='postrestart':deployment.restart()
  ok,diagnostics,stats=run_suite(ROOT,out/'corrected',deployment,out/'corrected',stage,phase,f'task-{stage:03d}');results.append({'stage':stage,'phase':phase,'success':ok,'diagnostics':diagnostics,'statistics':stats});write_json(out/'results.json',results);assert ok,(phase,diagnostics)
 write_json(out/'verified.json',{'verified':True,'utc':timestamp(),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'original_source_unchanged':True,'model_calls':0,'results':results,'actual_process_restart':True,'scope':'Exact unchanged native original006 cumulative correctedTask013 suite, priorcheckpoint upgrade and actual process restart. No retrospective promotion or original outcome rewrite.'});print(json.dumps({'verified':True,'results':results}))

finally:
 if deployment:
  deployment.stop();shutil.copy2(deployment.database,out/'retired.sqlite')
  with sqlite3.connect(f'file:{(out/"retired.sqlite").resolve()}?mode=ro',uri=True) as c:assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
  assert git('rev-parse','HEAD')==idx['source_commit'] and git('rev-parse','HEAD^{tree}')==idx['source_tree']
  subprocess.run(['sbx','stop',deployment.name],check=True,capture_output=True);subprocess.run(['sbx','rm','--force',deployment.name],check=True,capture_output=True);write_json(out/'resource.json',{'sandbox':deployment.name,'status':'removed','utc':timestamp(),'original_git_restored':True,'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'submission_sha256':digest_bytes((out/'submission.tar').read_bytes()),'retired_sqlite_sha256':digest_bytes((out/'retired.sqlite').read_bytes()),'sqlite_integrity':'ok'});shutil.rmtree(shadow)
