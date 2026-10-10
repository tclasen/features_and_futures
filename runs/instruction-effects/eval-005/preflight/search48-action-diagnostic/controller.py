import json,shutil,subprocess,sqlite3,copy
from pathlib import Path
from orchestrator.prepare import ROOT,write_json,file_hashes
from orchestrator.evidence import digest_bytes,timestamp
from orchestrator.validation import launch_deployment,run_suite
run=ROOT/'runs/instruction-effects/eval-005';out=run/'preflight/search48-action-diagnostic';out.mkdir(parents=True,exist_ok=False);shutil.copy2(Path(__file__),out/'controller.py')
manifest=copy.deepcopy(json.loads((run/'manifest.json').read_text()));manifest['run_id']='diag-eval005-search48';manifest['paths']['deployments']=str(out/'deployments');results=[]
for builder in ['b002','b004']:
 index_path=run/f'builders/{builder}/checkpoints/task-013-attempt-001/index.json';index=json.loads(index_path.read_text())
 for name,sha in index['checksums'].items():assert digest_bytes((index_path.parent/name).read_bytes())==sha
 shadow=ROOT/'.local'/f'eval005-search48-source-{builder}';assert not shadow.exists();subprocess.run(['git','clone','--quiet',str(index_path.parent/'history.bundle'),str(shadow)],check=True,capture_output=True);subprocess.run(['git','-C',str(shadow),'checkout','--detach',index['source_commit']],check=True,capture_output=True)
 def git(*args):return subprocess.check_output(['git','-C',str(shadow),*args],text=True).strip()
 assert git('rev-parse','HEAD^{tree}')==index['source_tree'];prior=run/f'tasks/task-012/attempts/{builder}/attempt-001/accepted.sqlite';assert prior.is_file()
 try:
  for variant in ['original','prospective']:
   folder=out/builder/variant;folder.mkdir(parents=True);proof=folder/'diagnostic-run';suite=proof/'definitions/project/acceptance';shutil.copytree(run/'tasks/task-013/suite',suite)
   config=suite/'playwright.config.mjs';text=config.read_text();assert 'workers: 1,' in text;config.write_text(text.replace('workers: 1,','grep: /048 /,\n  workers: 1,'))
   if variant=='prospective':
    path=suite/'search.spec.mjs';text=path.read_text();old="await createTask(page,'Matching second');await taskSearch(page,'matching');";new=old+"await expect(taskRow(page,'Matching second')).toBeVisible();await expect(taskRow(page,'Other title')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);";assert old in text;text=text.replace(old,new)
    old="await expect(taskRow(observer,'Renamed outside query')).toBeVisible();return taskRow(observer,'Renamed outside query').count();";new="await expect(taskRow(observer,'Other title')).toBeVisible();return taskRow(observer,'Renamed outside query').count();";assert old in text;path.write_text(text.replace(old,new))
   dep=None
   try:
    dep=launch_deployment(manifest,builder,'task-013',variant,shadow,index['source_commit'],folder,{'database':str(prior)});write_json(folder/'resource.json',{'sandbox':dep.name,'status':'active','model_calls':0})
    ok,diagnostics,stats=run_suite(ROOT,proof,dep,folder,13,'acceptance','task-013');assert stats['expected']+stats['unexpected']==1
    result={'builder_id':builder,'variant':variant,'success':ok,'statistics':stats,'diagnostics':diagnostics,'original_source_commit':index['source_commit'],'original_source_tree':index['source_tree'],'original_archive':str(index_path.relative_to(ROOT)),'suite_files':file_hashes(suite),'prior_database_sha256':digest_bytes(prior.read_bytes())};results.append(result);write_json(out/'results.json',results);print(json.dumps({k:result[k] for k in ['builder_id','variant','success','statistics']}),flush=True)
   finally:
    if dep:
     dep.stop();shutil.copy2(dep.database,folder/'retired.sqlite')
     with sqlite3.connect(f'file:{folder/"retired.sqlite"}?mode=ro',uri=True) as db:assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
     assert git('rev-parse','HEAD^{tree}')==index['source_tree'] and not git('status','--porcelain');subprocess.run(['git','-C',str(shadow),'fsck','--full','--no-reflogs'],check=True,capture_output=True)
     subprocess.run(['sbx','stop',dep.name],check=True,capture_output=True);subprocess.run(['sbx','rm','--force',dep.name],check=True,capture_output=True);write_json(folder/'resource.json',{'sandbox':dep.name,'status':'removed','model_calls':0,'original_git_restored':True,'sqlite_integrity':'ok','source_tree':index['source_tree'],'database_sha256':digest_bytes((folder/'retired.sqlite').read_bytes())})
 finally:shutil.rmtree(shadow)
write_json(out/'verified.json',{'utc':timestamp(),'model_calls':0,'results':results,'paired_original_fail_prospective_pass':all(not next(r for r in results if r['builder_id']==b and r['variant']=='original')['success'] and next(r for r in results if r['builder_id']==b and r['variant']=='prospective')['success'] for b in ['b002','b004']),'limitations':'PM diagnostic only, unchanged archived sources; original native exposure and rejection retained. No used acceptance suite or builder implementation modified.'})
