"""Recheck every immutable accepted pilot checkpoint, with separate PM app sandboxes."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import time
from .configurations import required_checkpoints
from .evidence import digest_bytes,digest_json,read_jsonl,timestamp
from .prepare import ROOT,file_hashes,write_json


def verify_corpus(manifest,accepted,results):
    required=required_checkpoints(manifest)
    keys=[(r['builder_id'],r['task_id']) for r in results]
    problems=[]
    if len(keys)!=len(set(keys)) or set(keys)!=required:problems.append('Missing, duplicate or unexpected immutable checkpoint')
    for entry in results:
        original=accepted.get((entry['builder_id'],entry['task_id']))
        if original is None or entry.get('source_commit')!=original['commit'] or entry.get('source_tree')!=original['tree']:
            problems.append(entry['builder_id']+'/'+entry['task_id']+': original source identity mismatch')
        if not entry.get('passed'):problems.append(entry['builder_id']+'/'+entry['task_id']+': stronger acceptance failed')
    return problems


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--run',default='pilot-008');parser.add_argument('--workers',type=int,default=12);args=parser.parse_args()
    run=ROOT/'runs/instruction-effects'/args.run
    state=json.loads((run/'state.json').read_text());assert state['status']=='completed'
    manifest=json.loads((run/'manifest.json').read_text());assert digest_json(manifest)==(run/'manifest.sha256').read_text().strip()
    events=read_jsonl(run/'events.jsonl');accepted={(e['builder_id'],e['task_id']):e for e in events if e['kind']=='task_accepted'}
    assert set(accepted)==required_checkpoints(manifest)
    if not 1<=args.workers<=len(manifest['runtime']['builder_configurations']):raise ValueError('Invalid worker count')
    output=run/'preflight/acceptance-v005'/('corpus-'+str(time.time_ns()));output.mkdir(parents=True)
    expected_suite=file_hashes(ROOT/'projects'/manifest['project_id']/'revisions/v005/acceptance')
    def check(builder):
        bid=builder['builder_id'];log=output/(bid+'.stdout.log');err=output/(bid+'.stderr.log')
        with log.open('w') as stdout,err.open('w') as stderr:
            result=subprocess.run(['python3','-B','-m','orchestrator.recheck_acceptance','--run',args.run,'--suite-revision','v005','--builder',bid],cwd=ROOT,stdout=stdout,stderr=stderr)
        paths=[line.removeprefix('Diagnostic evidence: ') for line in log.read_text().splitlines() if line.startswith('Diagnostic evidence: ')]
        if len(paths)!=1:return {'builder_id':bid,'exit_code':result.returncode,'results':[],'error':'No unique diagnostic output; inspect preserved logs'}
        folder=Path(paths[0]);report=json.loads((folder/'results.json').read_text())
        assert report['suite_hashes']==expected_suite
        return {'builder_id':bid,'exit_code':result.returncode,'diagnostic_path':str(folder.relative_to(ROOT)),'report_sha256':digest_bytes((folder/'results.json').read_bytes()),'results':report['results']}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        reports=list(pool.map(check,manifest['runtime']['builder_configurations']))
    results=[r for report in reports for r in report['results']]
    problems=verify_corpus(manifest,accepted,results)
    problems.extend(report['builder_id']+': diagnostic process failed' for report in reports if report['exit_code'])
    report={'schema_version':1,'utc':timestamp(),'purpose':'diagnostic stronger acceptance; original outcomes unchanged','source_manifest_sha256':digest_json(manifest),'source_events_sha256':digest_bytes((run/'events.jsonl').read_bytes()),'execution_module_sha256':digest_bytes(Path(__file__).read_bytes()),'suite_revision':'v005','suite_hashes':expected_suite,'workers':args.workers,'expected_checkpoints':len(required_checkpoints(manifest)),'checked_checkpoints':len(results),'complete_checkpoint_corpus':not problems,'problems':problems,'per_builder':reports,'results':results}
    write_json(output/'results.json',report)
    print(json.dumps({k:report[k] for k in ('expected_checkpoints','checked_checkpoints','complete_checkpoint_corpus','problems')}));print(output)
    if problems:raise SystemExit(1)


if __name__=='__main__':main()
