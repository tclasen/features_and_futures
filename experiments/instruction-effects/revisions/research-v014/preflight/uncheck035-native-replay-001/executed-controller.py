"""PM-only immutable-source restore/navigation diagnostic; never builder feedback or acceptance."""
import copy, json, shutil, sqlite3, subprocess, tempfile
from pathlib import Path
from orchestrator.prepare import ROOT, write_json
from orchestrator.evidence import digest_bytes, timestamp
from orchestrator.validation import launch_deployment, run_suite

r=ROOT/'runs/instruction-effects/eval-014'
v=ROOT/'experiments/instruction-effects/revisions/research-v014'
out=v/'preflight/uncheck035-native-replay-001'
assert not out.exists()
assert json.loads((r/'state.json').read_text())['status']=='running'
out.mkdir()
shutil.copy2(__file__,out/'executed-controller.py')
ip=r/'builders/b003/checkpoints/task-017-attempt-001/index.json'
idx=json.loads(ip.read_text())
for name,sha in idx['checksums'].items():
    assert digest_bytes((ip.parent/name).read_bytes())==sha
shadow=ROOT/'.local/eval014-uncheck035-source001'
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
    for variant in ('original','diagnostic-click'):
        suite=out/variant/'definitions/project/acceptance'
        shutil.copytree(r/'tasks/task-017/suite',suite)
        cfg=suite/'playwright.config.mjs';text=cfg.read_text()
        assert text.count("  testDir: '.',")==1
        cfg.write_text(text.replace("  testDir: '.',","  testDir: '.',\n  grep: /035 /,"))
        if variant=='diagnostic-click':
            case=suite/'due-range.spec.mjs';text=case.read_text()
            old="await page.getByRole('checkbox',{name:'Complete Range completed',exact:true}).uncheck();"
            new="await expect(page.getByRole('checkbox',{name:'Complete Range completed',exact:true})).toBeChecked();await page.getByRole('checkbox',{name:'Complete Range completed',exact:true}).click();"
            assert text.count(old)==1
            case.write_text(text.replace(old,new))
    from orchestrator.prepare import file_hashes
    write_json(out/'inputs.json',{'utc':timestamp(),'source_index_sha256':digest_bytes(ip.read_bytes()),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'controller_sha256':digest_bytes(Path(__file__).read_bytes()),'original_frozen_suite_files':file_hashes(r/'tasks/task-017/suite'),'executed_variants':{variant:file_hashes(out/variant/'definitions/project/acceptance') for variant in ('original','diagnostic-click')},'native_model_calls':0,'scope':'PM-only original035 versus checked-click035 with identical persistence/behavior assertions. No source or frozen suite changes.'})
    manifest=copy.deepcopy(json.loads((r/'manifest.json').read_text()))
    manifest['run_id']='diag-eval014-uncheck035-001'
    manifest['paths']['deployments']=str(ROOT/'.local/eval014-uncheck035-deployments001')
    prior=None
    deployment=launch_deployment(manifest,'b003','task-017','attempt-001',shadow,idx['source_commit'],out,prior)
    write_json(out/'resource.json',{'sandbox':deployment.name,'status':'active','native_model_calls':0})
    for repeat in range(1,4):
        for variant in ('original','diagnostic-click'):
            stage=17;phase='acceptance'
            ok,diagnostics,stats=run_suite(ROOT,out/variant,deployment,out/f'{variant}-{repeat:03d}',stage,phase,f'diaguncheck035-{variant}-{repeat:03d}')
            results.append({'variant':variant,'repeat':repeat,'stage':stage,'phase':phase,'success':ok,'diagnostics':diagnostics,'statistics':stats})
            write_json(out/'results.json',results)
    assert git('rev-parse','HEAD')==idx['source_commit']
    assert git('rev-parse','HEAD^{tree}')==idx['source_tree']
    assert not git('status','--porcelain')
    write_json(out/'observation.json',{'utc':timestamp(),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'native_model_calls':0,'original_source_unchanged':True,'results':results,'scope':'Diagnostic only: identical frozen035 versus checked click with unchanged persistent completion and filter assertions; no frozen suite edits or native outcome reassignment.'})
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

assert len(results)==6
assert all(x['statistics']['expected']==1 for x in results)
assert json.loads((out/'resource.json').read_text())['status']=='removed'
inputs=json.loads((out/'inputs.json').read_text())
assert inputs['controller_sha256']==digest_bytes((out/'executed-controller.py').read_bytes())
assert all(inputs['executed_variants'][variant]==file_hashes(out/variant/'definitions/project/acceptance') for variant in ('original','diagnostic-click'))
write_json(out/'input-closure.json',{'verified':True,'utc':timestamp(),'source_unchanged':True,'resource_removed':True,'native_model_calls':0,'inputs_sha256':digest_bytes((out/'inputs.json').read_bytes()),'original_successes':sum(x['success'] for x in results if x['variant']=='original'),'diagnostic_click_successes':sum(x['success'] for x in results if x['variant']=='diagnostic-click'),'scope':'Six directed immutable-source runs only; outcome classification requires inspection. No cumulative or upgrade/restart readiness claim.'})
