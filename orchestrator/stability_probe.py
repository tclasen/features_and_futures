"""Real isolated PM fixture for incident detection and process-restart recovery."""
import argparse
import copy
import json
import time
import shutil
import urllib.request
from pathlib import Path
from .evidence import Ledger, digest_bytes, read_jsonl
from .prepare import ROOT, checked, git, write_json
from .stability import monitor_promotion
from .validation import Deployment

SOURCE='''import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.env.DB_PATH);
db.exec("CREATE TABLE IF NOT EXISTS sentinel (value TEXT PRIMARY KEY); INSERT OR IGNORE INTO sentinel VALUES ('persisted');");
const fault = path.join(path.dirname(process.env.DB_PATH), 'fault');
fs.rmSync(fault, {force:true});
http.createServer((req,res) => {
  res.setHeader('Content-Type','application/json');
  if(req.url==='/health') return res.end(JSON.stringify({status:'ok'}));
  if(req.url==='/sentinel') return res.end(JSON.stringify({value:fs.existsSync(fault)?'missing':db.prepare('SELECT value FROM sentinel').get().value}));
  res.statusCode=404;res.end('{}');
}).listen(Number(process.env.PORT),'0.0.0.0');
'''


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--run',required=True,type=Path)
    args=parser.parse_args()
    args.run=args.run.resolve()
    ident='stability-'+str(time.time_ns())
    root=args.run/'preflight'/ident
    root.mkdir(parents=True)
    source=root/'trusted-source';source.mkdir()
    (source/'server.js').write_text(SOURCE)
    write_json(source/'package.json',{'type':'module','scripts':{'start':'node server.js'}})
    git(source,'init','-b','main');git(source,'config','user.name','PM Fixture');git(source,'config','user.email','pm@experiment.invalid')
    git(source,'add','.');git(source,'commit','-m','Trusted induced-incident fixture')
    commit=git(source,'rev-parse','HEAD')
    git(source,'bundle','create',str(root/'trusted-history.bundle'),'--all','HEAD')
    manifest=copy.deepcopy(json.loads((args.run/'manifest.json').read_text()))
    manifest['run_id']=ident
    manifest['paths']['deployments']=str(ROOT/'.local/stability-deployments'/ident)
    ledger=Ledger(root,{'run_id':ident,'purpose':'PM-induced infrastructure fixture; no builder outcome'})
    attrs={'builder_id':'trusted-fixture','task_id':'fixture-001','attempt_id':'fixture-001','commit':commit}
    deployment=Deployment.__new__(Deployment);deployment.name=None
    try:
        Deployment.__init__(deployment,manifest,'fixture','task-001','attempt-001',source,commit,root,None)
        def check():
            deployment.probe_health()
            with urllib.request.urlopen(deployment.base+'/sentinel',timeout=2) as response:
                observed=json.load(response)
            ledger.event('stability_behavior_observed',observed=observed,**attrs)
            if observed!={'value':'persisted'}:raise RuntimeError('Observed sentinel missing while health endpoint remained ok')
        check()
        ledger.event('fixture_fault_injected',mechanism='PM-controlled fault file; no builder source',**attrs)
        checked(['sbx','exec',deployment.name,'touch','/home/agent/app/.runtime/fault'])
        monitor_promotion(ledger,attrs,check,deployment.restart,2,.5)
        records=read_jsonl(root/'events.jsonl')
        incidents=[r for r in records if r['kind']=='incident_detected']
        recoveries=[r for r in records if r['kind']=='incident_recovered']
        verified=len(incidents)==len(recoveries)==1 and recoveries[0]['incident_id']==incidents[0]['event_id']
        write_json(root/'result.json',{'verified':verified,'source_commit':commit,'source_sha256':digest_bytes(SOURCE.encode()),
                                     'probe_code_sha256':digest_bytes(Path(__file__).read_bytes()),
                                     'incident_id':incidents[0]['event_id'] if incidents else None,
                                     'recovery_seconds':(recoveries[0]['monotonic_ns']-incidents[0]['monotonic_ns'])/1e9 if verified else None,
                                     'model_requests':0,'limitation':'Deliberate PM-only incident verifies detection/recovery; not empirical builder stability.'})
        print(json.dumps({'evidence':str(root),'verified':verified}))
        if not verified:raise RuntimeError('Fixture incident evidence incomplete')
    except Exception as error:
        write_json(root/'failure.json',{'type':type(error).__name__,'observed':str(error)})
        raise
    finally:
        if getattr(deployment,'created',False):deployment.stop()
        shutil.rmtree(source/'.git')

if __name__=='__main__':main()
