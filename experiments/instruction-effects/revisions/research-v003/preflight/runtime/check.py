"""PM-only image/isolation fixture; zero native inference and exact cleanup."""
import json,shutil,subprocess,tempfile,tarfile
from pathlib import Path
from orchestrator.prepare import ROOT,checked,git,write_json
from orchestrator.evidence import Ledger,digest_bytes,timestamp
from orchestrator.gateway import InferenceGateway
from orchestrator.private import initialize,export,WORK
from orchestrator.pilot import verify_isolation
from orchestrator.adapters import sandbox_policy,isolation_probe
from orchestrator.storage import require_space

output=Path(__file__).resolve().parent
manifest=json.loads((ROOT/'runs/instruction-effects/pilot-015/manifest.json').read_text())
name='ff-eval003-preflight-runtime'
shadow=ROOT/'.local/eval003-preflight-runtime-shadow'
write_json(output/'resource.json',{'sandbox':name,'status':'planned','created_utc':timestamp(),'native_model_calls':0})
require_space(manifest,ROOT)
checked(['git','clone','--no-local',str(Path(manifest['paths']['builders'])/'starter'),str(shadow)])
git(shadow,'remote','remove','origin')
ledger=Ledger(output,{'experiment_id':'instruction-effects','experiment_revision':'research-v003','run_id':'eval-003-preparation','phase':'runtime-preflight'})
gateway=InferenceGateway(ledger,manifest['pricing'])
created=False;archived=False
result={'sandbox':name,'native_model_calls':0,'passed':False}
try:
    checked(['sbx','create','--name',name,'--cpus','4','--memory','4g','--skills','off','--pull','never','-t',manifest['runtime']['image'],'shell'])
    created=True
    write_json(output/'resource.json',{'sandbox':name,'status':'created','created_utc':timestamp(),'native_model_calls':0})
    initialize(name,shadow)
    result['policy']=sandbox_policy(name,gateway.port)
    result['isolation']=isolation_probe(name,WORK,Path(manifest['paths']['builders'])/'b002',gateway.port)
    result['isolation_passed']=verify_isolation(result['isolation'])
    script="import subprocess,json;print(json.dumps({p:subprocess.check_output([p,'--version'],text=True).strip() for p in ['codex','pi','node','python3']}))"
    result['versions']=json.loads(checked(['sbx','exec',name,'python3','-c',script]))
    result['versions_passed']=result['versions']['codex']=='codex-cli '+manifest['runtime']['harness_versions']['codex'] and result['versions']['pi']==manifest['runtime']['harness_versions']['pi']
    result['passed']=result['isolation_passed'] and result['versions_passed']
finally:
    gateway.close()
    if created:
        native=export(name,shadow,output)
        checked(['git','bundle','verify',str(output/'native-history.bundle')])
        with tempfile.TemporaryDirectory(prefix='ff-v003-runtime-restore-') as temp:
            checked(['git','init','--bare',temp])
            checked(['git','-C',temp,'fetch',str(output/'native-history.bundle'),'+refs/*:refs/*'])
            restored=git(Path(temp),'rev-parse',native['head']+'^{tree}')
            if restored!=native['tree']:raise RuntimeError('Original native source history does not restore')
        with tarfile.open(output/'native-working-tree.tar.gz') as t:
            result['preserved_working_files']=[m.name for m in t.getmembers()]
        result['source_history_restored']=True
        result['archive_sha256']={p.name:digest_bytes(p.read_bytes()) for p in [output/'native-history.bundle',output/'native-working-tree.tar.gz',output/'native-git.json']}
        archived=True
        write_json(output/'verified.json',result)
        checked(['sbx','stop',name]);checked(['sbx','rm','--force',name])
        write_json(output/'resource.json',{'sandbox':name,'status':'removed','completed_utc':timestamp(),'verified_archive_sha256':result['archive_sha256'],'native_model_calls':0})
    if archived or not created:
        shutil.rmtree(shadow)
if not result['passed']:raise RuntimeError('Runtime/isolation fixture failed; evidence preserved')
print(json.dumps({'passed':result['passed'],'source_history_restored':result['source_history_restored'],'sandbox_removed':True,'versions':result['versions']}))
