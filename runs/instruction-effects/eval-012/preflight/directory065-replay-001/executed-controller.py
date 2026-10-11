"""PM-only immutable-source diagnostic; never builder feedback or acceptance."""
import copy, json, shutil, sqlite3, subprocess, tempfile
from pathlib import Path
from orchestrator.prepare import ROOT, write_json
from orchestrator.evidence import digest_bytes, timestamp
from orchestrator.validation import launch_deployment, run_suite

r=ROOT/'runs/instruction-effects/eval-012'
out=r/'preflight/directory065-replay-001'
assert not out.exists()
assert json.loads((r/'state.json').read_text())['status']=='infrastructure_attention'
out.mkdir()
shutil.copy2(__file__,out/'executed-controller.py')
ip=r/'builders/b002/checkpoints/task-019-attempt-001/index.json'
idx=json.loads(ip.read_text())
for name,sha in idx['checksums'].items():
    assert digest_bytes((ip.parent/name).read_bytes())==sha
shadow=ROOT/'.local/eval012-directory065-source001'
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
        shutil.copytree(r/'tasks/task-019/suite',suite)
        cfg=suite/'playwright.config.mjs'
        text=cfg.read_text()
        assert text.count("  testDir: '.',")==1
        cfg.write_text(text.replace("  testDir: '.',","  testDir: '.',\n  grep: /065 /,"))
    test=out/'public-contract/definitions/project/acceptance/directory.spec.mjs'
    text=test.read_text()
    old="await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2046-03-01');"
    assert text.count(old)==1
    test.write_text(text.replace(old,''))
    manifest=copy.deepcopy(json.loads((r/'manifest.json').read_text()))
    manifest['run_id']='diag-eval012-directory065001'
    manifest['paths']['deployments']=str(ROOT/'.local/eval012-directory065-deployments001')
    prior={'database':str(r/'tasks/task-018/attempts/b002/attempt-002/accepted.sqlite')}
    deployment=launch_deployment(manifest,'b002','task-019','attempt-001',shadow,idx['source_commit'],out,prior)
    write_json(out/'resource.json',{'sandbox':deployment.name,'status':'active','native_model_calls':0})
    for repeat in range(1,4):
        for variant in ('original','public-contract'):
            ok,diagnostics,stats=run_suite(ROOT,out/variant,deployment,out/f'{variant}-{repeat:03d}',19,'acceptance',f'diag065-{variant}-{repeat:03d}')
            results.append({'variant':variant,'repeat':repeat,'success':ok,'diagnostics':diagnostics,'statistics':stats})
            write_json(out/'results.json',results)
    assert git('rev-parse','HEAD')==idx['source_commit']
    assert git('rev-parse','HEAD^{tree}')==idx['source_tree']
    assert not git('status','--porcelain')
    write_json(out/'observation.json',{'utc':timestamp(),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'native_model_calls':0,'original_source_unchanged':True,'results':results,'scope':'Diagnostic only. Remove only invalid draft reset assertion; retain invalid-date alert, prior applied membership, preserved search/completion/priority, archived membership, opening defaults and row navigation. No frozen suite edits or native outcome reassignment.'})
    print(json.dumps({'completed':True,'results':[{k:v for k,v in x.items() if k!='diagnostics'} for x in results]}))
finally:
    if deployment:
        deployment.stop()
        shutil.copy2(deployment.database,out/'retired.sqlite')
        data_sha=digest_bytes((out/'retired.sqlite').read_bytes())
        with tempfile.TemporaryDirectory(prefix='eval012-diag065-data-',dir='/private/tmp') as folder:
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
