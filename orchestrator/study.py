"""Bind discovery inspections and confirmation decisions to actual archived run reports."""
import argparse
import json
from decimal import Decimal
from pathlib import Path
from .prepare import ROOT, write_json, InfrastructureError
from .evidence import digest_bytes, digest_json, read_jsonl, append_json, timestamp
from .confirmation import FAMILY, trajectory_contrasts, record_look, confirmed_stop
from .audit_request_coverage import reconcile
from .task_stream import verify_replay, stream_input_hash

def evidence(run):
    manifest=json.loads((run/'manifest.json').read_text())
    if digest_json(manifest)!=(run/'manifest.sha256').read_text().strip():raise InfrastructureError('Manifest changed')
    pointer=json.loads((run/'reports/latest.json').read_text());path=run/'reports'/pointer['report'];report=json.loads(path.read_text())
    if digest_bytes(path.read_bytes())!=pointer['sha256'] or report['problems']:
        raise InfrastructureError('Complete independently checked source/timing/acceptance report required')
    events=read_jsonl(run/'events.jsonl');usage=read_jsonl(run/'usage.jsonl')
    coverage=reconcile(events,usage,True)
    if not coverage['complete_run_request_coverage']:raise InfrastructureError('Incomplete request coverage cannot support a finding')
    for filename,key in (('events.jsonl','events_sha256'),('usage.jsonl','usage_sha256')):
        if digest_bytes((run/filename).read_bytes())!=report['inputs'][key]:raise InfrastructureError('Evidence changed after report')
    if report['manifest_sha256']!=digest_json(manifest):raise InfrastructureError('Report refers to another manifest')
    return manifest,report,{'report_sha256':pointer['sha256'],**report['inputs']}

def descriptive(values):
    result={}
    for key,value in values.items():
        low,high=(Decimal('-0.10'),Decimal('0.10')) if key.endswith('|first_rejection') else (Decimal('0.8'),Decimal('1.2'))
        number=Decimal(value);result[key]='improvement' if number<low else 'regression' if number>high else 'practical_equivalence'
    return result

def inspect(run):
    manifest,report,binding=evidence(run)
    if manifest['purpose']!='research-discovery':raise InfrastructureError('Inspect the main discovery trajectory')
    end=len({r['task_id'] for r in report['tasks']})
    if end<20 or end%10:raise InfrastructureError('Candidate inspection is after20tasks and every10 thereafter')
    ids=[f'task-{i:03d}' for i in range(end-9,end+1)]
    values=trajectory_contrasts(manifest['runtime']['builder_configurations'],report['tasks'],ids)
    record={'kind':'candidate_inspection','utc':timestamp(),'checkpoint':end,'task_ids':ids,'values':values,'classifications':descriptive(values),'input_binding':binding,'task_stream_input_sha256':stream_input_hash(run)}
    journal=run/'analysis/inspections.jsonl';previous=read_jsonl(journal) if journal.exists() else []
    if any(r['checkpoint']==end for r in previous):raise InfrastructureError('Checkpoint inspection already recorded')
    append_json(journal,record)
    prior=next((r for r in previous if r['checkpoint']==end-10),None)
    if prior and prior['classifications']==record['classifications']:
        candidate={'purpose':'descriptive candidate; requires independent confirmation','previous_window':prior,'selected_window':record,'task_stream_input_sha256':stream_input_hash(run),'plan_sha256':manifest['research']['analysis_plan']['sha256']}
        path=run/'analysis'/('candidate-'+digest_json(candidate)[:16]+'.json');write_json(path,candidate)
        # Mutable pointer; the candidate itself and every inspection remain immutable.
        write_json(run/'analysis/candidate.json',candidate)
        return {'candidate':str(path),'sha256':digest_bytes(path.read_bytes())}
    return {'candidate':None,'checkpoint':end}

def confirm(discovery, run_ids, batch):
    original,_,_=evidence(discovery)
    candidate_path=discovery/'analysis/candidate.json';candidate=json.loads(candidate_path.read_text())
    if candidate['task_stream_input_sha256']!=stream_input_hash(discovery):raise InfrastructureError('Replay candidate frozen prefix before further discovery changes')
    replicates=[];locations=set()
    for run_id in run_ids:
        run=ROOT/'runs/instruction-effects'/run_id;manifest,report,binding=evidence(run)
        if manifest['purpose']!='research-confirmation' or run.resolve()==discovery.resolve():raise InfrastructureError('Independent research confirmation required')
        if manifest['research']['analysis_plan']!=original['research']['analysis_plan']:raise InfrastructureError('Analysis plan differs')
        verify_replay(discovery,run)
        for key in ('image_digest','harness_versions','model_mappings','harness_context','storage_policy'):
            if manifest['runtime'].get(key)!=original['runtime'].get(key):raise InfrastructureError('Confirmation runtime differs: '+key)
        if manifest['pricing']!=original['pricing'] or manifest['provenance']['starter_tree']!=original['provenance']['starter_tree']:raise InfrastructureError('Pricing or starter differs')
        location=Path(manifest['paths']['builders']).resolve()
        if location in locations or location==Path(original['paths']['builders']).resolve():raise InfrastructureError('Repositories are reused')
        locations.add(location)
        replicates.append({'run_id':run_id,'manifest_sha256':digest_json(manifest),'input_binding':binding,'contrasts':trajectory_contrasts(manifest['runtime']['builder_configurations'],report['tasks'],candidate['selected_window']['task_ids'])})
    journal=discovery/'analysis/confirmation-looks.jsonl'
    record_look(journal,batch,replicates,digest_bytes(candidate_path.read_bytes()),original['research']['analysis_plan']['sha256'])
    return confirmed_stop(read_jsonl(journal))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);parser.add_argument('--inspect',action='store_true');parser.add_argument('--batch');parser.add_argument('--repeat',action='append',default=[]);args=parser.parse_args()
    run=ROOT/'runs/instruction-effects'/args.run
    if args.inspect:print(inspect(run))
    elif args.batch and args.repeat:print(confirm(run,args.repeat,args.batch))
    else:parser.error('Use --inspect or --batch NAME with --repeat RUN for each independent trajectory')

if __name__=='__main__':main()
