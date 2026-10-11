"""PM-only immutable-source restore/navigation diagnostic; never builder feedback or acceptance."""
import copy, json, shutil, sqlite3, subprocess, tempfile
from pathlib import Path
from orchestrator.prepare import ROOT, write_json
from orchestrator.evidence import digest_bytes, timestamp
from orchestrator.validation import launch_deployment, run_suite

r=ROOT/'runs/instruction-effects/eval-013'
v=ROOT/'experiments/instruction-effects/revisions/research-v014'
out=v/'preflight/all-restore-native-replay-003'
assert not out.exists()
assert json.loads((r/'state.json').read_text())['status']=='superseded'
out.mkdir()
shutil.copy2(__file__,out/'executed-controller.py')
ip=r/'builders/b010/checkpoints/task-003-attempt-014/index.json'
idx=json.loads(ip.read_text())
for name,sha in idx['checksums'].items():
    assert digest_bytes((ip.parent/name).read_bytes())==sha
shadow=ROOT/'.local/eval014-restore-exact-source003'
assert not shadow.exists()
deployment=None
results=[]
try:
    subprocess.run(['git','clone','--quiet',str(ip.parent/'history.bundle'),str(shadow)],check=True,capture_output=True)
    subprocess.run(['git','-C',str(shadow),'checkout','--detach',idx['source_commit']],check=True,capture_output=True)
    def git(*args):
        return subprocess.check_output(['git','-C',str(shadow),*args],text=True).strip()
    assert git('rev-parse','HEAD^{tree}')==idx['source_tree']
    assert not git('status','--porcelain')
    subprocess.run(['git','-C',str(shadow),'fsck','--full','--no-reflogs'],check=True,capture_output=True)
    assert digest_bytes(subprocess.check_output(['git','-C',str(shadow),'archive','--format=tar','HEAD']))==idx['checksums']['committed-source.tar']
    for variant in ('original','public-contract'):
        suite=out/variant/'definitions/project/acceptance'
        shutil.copytree((r/'definitions/project/acceptance') if variant=='original' else (v/'preflight/all-restore-candidate/task-003/suite'),suite)
        cfg=suite/'playwright.config.mjs'
        text=cfg.read_text()
        assert text.count("  testDir: '.',")==1
        if variant=='original': cfg.write_text(text.replace("  testDir: '.',","  testDir: '.',\n  grep: /008 |009 /,"))
    manifest=copy.deepcopy(json.loads((r/'manifest.json').read_text()))
    manifest['run_id']='diag-eval014-restore-exact003'
    manifest['paths']['deployments']=str(ROOT/'.local/eval014-restore-exact-deployments003')
    prior={'database':str(r/'tasks/task-002/attempts/b010/attempt-002/accepted.sqlite')}
    deployment=launch_deployment(manifest,'b010','task-003','attempt-001',shadow,idx['source_commit'],out,prior)
    write_json(out/'resource.json',{'sandbox':deployment.name,'status':'active','native_model_calls':0})
    for variant,stage,phase in [('original',3,'acceptance'),('public-contract',2,'upgrade'),('public-contract',3,'acceptance'),('public-contract',3,'postrestart')]:
        if phase=='postrestart': deployment.restart()
        ok,diagnostics,stats=run_suite(ROOT,out/variant,deployment,out/f'{variant}-{stage:03d}-{phase}',stage,phase,('diagrestore-final003' if variant=='original' else f'task-{stage:03d}'))
        results.append({'variant':variant,'stage':stage,'phase':phase,'success':ok,'diagnostics':diagnostics,'statistics':stats})
        write_json(out/'results.json',results)
    assert git('rev-parse','HEAD')==idx['source_commit']
    assert git('rev-parse','HEAD^{tree}')==idx['source_tree']
    assert not git('status','--porcelain')
    write_json(out/'observation.json',{'utc':timestamp(),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'native_model_calls':0,'original_source_unchanged':True,'results':results,'scope':'Diagnostic only. Wait for Restore project to leave the restored row before selecting the next filter. Retain every original archive/restoration/task/persistence check; allow either post-restore view. No frozen suite edits or native outcome reassignment.'})
    print(json.dumps({'completed':True,'results':[{k:v for k,v in x.items() if k!='diagnostics'} for x in results]}))
finally:
    if deployment:
        deployment.stop()
        shutil.copy2(deployment.database,out/'retired.sqlite')
        data_sha=digest_bytes((out/'retired.sqlite').read_bytes())
        with tempfile.TemporaryDirectory(prefix='eval014-diagrestore-data-',dir='/private/tmp') as folder:
            restored=Path(folder)/'restored.sqlite'
            shutil.copy2(out/'retired.sqlite',restored)
            assert digest_bytes(restored.read_bytes())==data_sha
            with sqlite3.connect(f'file:{restored}?mode=ro',uri=True) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert git('rev-parse','HEAD')==idx['source_commit']
        assert git('rev-parse','HEAD^{tree}')==idx['source_tree']
        assert not git('status','--porcelain')
        subprocess.run(['sbx','stop',deployment.name],check=True,capture_output=True)
        subprocess.run(['sbx','rm','--force',deployment.name],check=True,capture_output=True)
        inventory=json.loads(subprocess.check_output(['sbx','ls','--json'],text=True))
        assert deployment.name not in {x['name'] for x in inventory['sandboxes']}
        write_json(out/'resource.json',{'sandbox':deployment.name,'status':'removed','utc':timestamp(),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'original_git_restored':True,'submission_sha256':digest_bytes((out/'submission.tar').read_bytes()),'retired_sqlite_sha256':data_sha,'sqlite_independently_restored':True,'inventory_absence_verified':True})
    if shadow.exists():
        shutil.rmtree(shadow)

assert len(results)==4 and not results[0]['success']
assert results[0]['statistics']['unexpected']==2
assert all(x['success'] and not any(x['statistics'][k] for k in ('unexpected','flaky','skipped')) for x in results[1:])
assert results[2]['statistics']['expected']==11
assert results[1]['statistics']['expected']==results[3]['statistics']['expected']==1
from orchestrator.prepare import file_hashes
assert file_hashes(out/'public-contract/definitions/project/acceptance')==file_hashes(v/'preflight/all-restore-candidate/task-003/suite')
assert json.loads((out/'resource.json').read_text())['status']=='removed'
write_json(out/'verified.json',{'verified':True,'utc':timestamp(),'native_model_calls':0,'source_unchanged':True,'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'full_cumulative_3_cases':11,'own_prior2_upgrade_passed':True,'actual_restart_passed':True,'exact_candidate_suite_files':file_hashes(v/'preflight/all-restore-candidate/task-003/suite'),'original_frozen008009_failures':2,'source_run':'eval-013','scope':'Exact prospective candidate bytes at stage3, same immutable native source and ownprior2 data; not a builder attempt or retroactive acceptance. Guarded later cases are not executed at stage3.'})
print('Verified exact candidate native replay and independently restored resource retirement')
