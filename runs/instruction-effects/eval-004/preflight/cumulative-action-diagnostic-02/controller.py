import json, shutil, subprocess, sqlite3, copy
from pathlib import Path
from orchestrator.prepare import ROOT, write_json, file_hashes
from orchestrator.evidence import digest_bytes, timestamp
from orchestrator.validation import launch_deployment, run_suite

run=ROOT/'runs/instruction-effects/eval-004'
out=run/'preflight/cumulative-action-diagnostic-02'
out.mkdir(parents=True,exist_ok=False)
shutil.copy2(Path(__file__),out/'controller.py')
manifest=copy.deepcopy(json.loads((run/'manifest.json').read_text()))
manifest['run_id']='diag-eval004-full02'
manifest['paths']['deployments']=str(out/'deployments')
results=[]
for builder,attempt in [('b008','014'),('b004','012')]:
    index_path=run/f'builders/{builder}/checkpoints/task-011-attempt-{attempt}/index.json'
    index=json.loads(index_path.read_text())
    for name,sha in index['checksums'].items():assert digest_bytes((index_path.parent/name).read_bytes())==sha
    shadow=out/f'original-source-{builder}'
    subprocess.run(['git','clone','--quiet',str(index_path.parent/'history.bundle'),str(shadow)],check=True,capture_output=True)
    subprocess.run(['git','-C',str(shadow),'checkout','--detach',index['source_commit']],check=True,capture_output=True)
    def git(*args):return subprocess.check_output(['git','-C',str(shadow),*args],text=True).strip()
    assert git('rev-parse','HEAD^{tree}')==index['source_tree']
    prior_path=Path(json.loads((run/'state.json').read_text())['accepted'][builder]['archive_output'])/'accepted.sqlite'
    assert prior_path.is_file()
    folder=out/builder;folder.mkdir()
    proof=folder/'diagnostic-run';suite=proof/'definitions/project/acceptance'
    shutil.copytree(ROOT/'experiments/instruction-effects/revisions/research-v005/decisions/task-018-draft/suite',suite)
    dep=None
    phases=[]
    try:
        dep=launch_deployment(manifest,builder,'task-011','prospective',shadow,index['source_commit'],folder,{'database':str(prior_path)})
        write_json(folder/'resource.json',{'sandbox':dep.name,'status':'active','model_calls':0})
        for phase,stage,prefix in [('upgrade',10,'task-010'),('acceptance',11,'task-011'),('postrestart',11,'task-011')]:
            if phase=='postrestart':dep.restart()
            ok,diagnostics,stats=run_suite(ROOT,proof,dep,folder,stage,phase,prefix)
            result={'builder_id':builder,'phase':phase,'success':ok,'diagnostics':diagnostics,'statistics':stats}
            phases.append(result);results.append(result);write_json(out/'results.json',results)
            print(json.dumps({'builder_id':builder,'phase':phase,'success':ok,'statistics':stats}),flush=True)
        write_json(folder/'verified.json',{'utc':timestamp(),'model_calls':0,'original_source_commit':index['source_commit'],'original_source_tree':index['source_tree'],'all_phases_passed':all(r['success'] for r in phases),'suite_files':file_hashes(suite),'phases':phases,'original_archive':str(index_path.relative_to(ROOT)),'limitations':['PM diagnosis only; not a new builder submission; all original rejections and exposure preserved']})
    finally:
        if dep:
            dep.stop();shutil.copy2(dep.database,folder/'retired.sqlite')
            with sqlite3.connect(f'file:{folder/"retired.sqlite"}?mode=ro',uri=True) as db:assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert git('rev-parse','HEAD^{tree}')==index['source_tree'] and not git('status','--porcelain')
            subprocess.run(['sbx','stop',dep.name],check=True,capture_output=True)
            subprocess.run(['sbx','rm','--force',dep.name],check=True,capture_output=True)
            write_json(folder/'resource.json',{'sandbox':dep.name,'status':'removed','model_calls':0,'original_git_restored':True,'sqlite_integrity':'ok','source_tree':index['source_tree'],'database_sha256':digest_bytes((folder/'retired.sqlite').read_bytes())})
