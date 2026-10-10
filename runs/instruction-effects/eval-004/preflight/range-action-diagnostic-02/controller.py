import json, shutil, subprocess, sqlite3, copy
from pathlib import Path
from orchestrator.prepare import ROOT, write_json, file_hashes
from orchestrator.evidence import digest_bytes, timestamp
from orchestrator.validation import launch_deployment, run_suite

run=ROOT/'runs/instruction-effects/eval-004'
out=run/'preflight/range-action-diagnostic-02'
out.mkdir(parents=True,exist_ok=False)
shutil.copy2(Path(__file__),out/'controller.py')
index_path=run/'builders/b008/checkpoints/task-011-attempt-014/index.json'
index=json.loads(index_path.read_text())
for name,sha in index['checksums'].items():
    assert digest_bytes((index_path.parent/name).read_bytes())==sha
shadow=out/'original-source'
subprocess.run(['git','clone','--quiet',str(index_path.parent/'history.bundle'),str(shadow)],check=True,capture_output=True)
subprocess.run(['git','-C',str(shadow),'checkout','--detach',index['source_commit']],check=True,capture_output=True)
def git(*args):return subprocess.check_output(['git','-C',str(shadow),*args],text=True).strip()
assert git('rev-parse','HEAD^{tree}')==index['source_tree']
manifest=copy.deepcopy(json.loads((run/'manifest.json').read_text()))
manifest['run_id']='diag-eval004-range'
manifest['paths']['deployments']=str(out/'deployments')
prior_path=Path(json.loads((run/'state.json').read_text())['accepted']['b008']['archive_output'])/'accepted.sqlite'
assert prior_path.is_file()
results=[]
for variant in ('original','observable-range'):
    folder=out/variant;folder.mkdir()
    proof=folder/'diagnostic-run';suite=proof/'definitions/project/acceptance'
    shutil.copytree(run/'tasks/task-011/suite',suite)
    cfg=suite/'playwright.config.mjs'
    cfg.write_text(cfg.read_text().replace("  workers: 1,","  grep: /040 moving/,\n  workers: 1,").replace("trace: 'retain-on-failure'","trace: 'on'"))
    if variant=='observable-range':
        spec=suite/'move-task.spec.mjs';text=spec.read_text()
        needle="  await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});"
        text=text.replace(needle,"  await createTask(page,'Filtered outside range');await taskRow(page,'Filtered outside range').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Filtered transfer source','Filtered outside range','High');await setDate(page,'Filtered transfer source','Filtered outside range','2034-01-01');\n"+needle)
        needle="  await destination(page,'Filtered moving').selectOption"
        text=text.replace(needle,"  await expect(taskRow(page,'Filtered outside range')).toHaveCount(0);await expect(taskRow(page,'Filtered moving')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);\n"+needle)
        text=text.replace("'Filtered moving','0/2 completed'","'Filtered moving','0/3 completed'")
        spec.write_text(text)
    dep=None
    try:
        dep=launch_deployment(manifest,'b008','task-011',variant,shadow,index['source_commit'],folder,{'database':str(prior_path)})
        write_json(folder/'resource.json',{'sandbox':dep.name,'status':'active','model_calls':0})
        ok,diagnostics,stats=run_suite(ROOT,proof,dep,folder,11,'acceptance','task-011')
        result={'variant':variant,'success':ok,'diagnostics':diagnostics,'statistics':stats,'suite_files':file_hashes(suite)}
        results.append(result);write_json(out/'results.json',results)
        print(json.dumps(result),flush=True)
    finally:
        if dep:
            dep.stop();shutil.copy2(dep.database,folder/'retired.sqlite')
            with sqlite3.connect(f'file:{folder/"retired.sqlite"}?mode=ro',uri=True) as db:assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert git('rev-parse','HEAD^{tree}')==index['source_tree'] and not git('status','--porcelain')
            subprocess.run(['sbx','stop',dep.name],check=True,capture_output=True)
            subprocess.run(['sbx','rm','--force',dep.name],check=True,capture_output=True)
            write_json(folder/'resource.json',{'sandbox':dep.name,'status':'removed','model_calls':0,'original_git_restored':True,'sqlite_integrity':'ok','source_tree':index['source_tree'],'database_sha256':digest_bytes((folder/'retired.sqlite').read_bytes())})
write_json(out/'verified.json',{'utc':timestamp(),'model_calls':0,'original_source_commit':index['source_commit'],'original_source_tree':index['source_tree'],'results':results,'limitations':['PM diagnosis only; original rejection, usage and timing retained','Observable range variant changes PM action synchronization and fixture data; used suite untouched']})
