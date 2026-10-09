"""Matched trusted services verify foreground sandbox deployment lifetime."""
import argparse
import copy
import json
import shutil
import time
from pathlib import Path
from .evidence import digest_bytes, timestamp
from .prepare import ROOT, git, write_json, checked
from .stability_probe import SOURCE
from .validation import Deployment


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True,type=Path);args=parser.parse_args()
    run=args.run.resolve();ident='lifecycle-'+str(time.time_ns());root=run/'preflight'/ident;root.mkdir(parents=True)
    source=root/'trusted-source';source.mkdir();(source/'server.js').write_text(SOURCE)
    write_json(source/'package.json',{'type':'module','scripts':{'start':'node server.js'}})
    git(source,'init','-b','main');git(source,'config','user.name','PM Fixture');git(source,'config','user.email','pm@experiment.invalid');git(source,'add','.');git(source,'commit','-m','Matched lifecycle fixture')
    commit=git(source,'rev-parse','HEAD');git(source,'bundle','create',str(root/'trusted-history.bundle'),'--all','HEAD')
    deployments=[]
    try:
        for mode in ('background-v1','foreground-sbx-exec-v2'):
            manifest=copy.deepcopy(json.loads((run/'manifest.json').read_text()));manifest['run_id']=ident
            manifest['runtime']['deployment_lifecycle']=mode;manifest['paths']['deployments']=str(ROOT/'.local/lifecycle-deployments'/ident)
            output=root/mode;output.mkdir()
            deployment=Deployment(manifest,'fg' if mode=='foreground-sbx-exec-v2' else 'bg','task-001','attempt-001',source,commit,output,None)
            deployments.append((mode,deployment))
        start=time.monotonic();samples=[]
        while True:
            elapsed=time.monotonic()-start
            for mode,deployment in deployments:
                try:deployment.probe_health();healthy=True;error=None
                except RuntimeError as exception:healthy=False;error=str(exception)
                samples.append({'elapsed_seconds':elapsed,'mode':mode,'healthy':healthy,'observed_error':error,'utc':timestamp()})
            write_json(root/'samples.json',samples)
            if elapsed>=45:break
            time.sleep(min(5,45-elapsed))
        inspections={mode:json.loads(checked(['sbx','inspect',deployment.name,'--json']))['state'] for mode,deployment in deployments}
        background=[s for s in samples if s['mode']=='background-v1'];foreground=[s for s in samples if s['mode']=='foreground-sbx-exec-v2']
        verified=any(not s['healthy'] for s in background) and all(s['healthy'] for s in foreground) and inspections['background-v1']=='stopped' and inspections['foreground-sbx-exec-v2']=='running'
        write_json(root/'result.json',{'verified':verified,'inspection_states':inspections,'source_sha256':digest_bytes(SOURCE.encode()),'probe_code_sha256':digest_bytes(Path(__file__).read_bytes()),'observed_seconds':samples[-1]['elapsed_seconds'],'model_requests':0,'purpose':'Matched PM-only services; no builder source or outcome changes'})
        print(json.dumps({'evidence':str(root),'verified':verified,'states':inspections}))
        if not verified:raise RuntimeError('Deployment lifecycle contrast not verified')
    except Exception as error:
        write_json(root/'failure.json',{'type':type(error).__name__,'observed':str(error)})
        raise
    finally:
        for mode,deployment in deployments:deployment.stop()
        shutil.rmtree(source/'.git')

if __name__=='__main__':main()
