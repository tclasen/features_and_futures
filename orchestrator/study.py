"""Bind discovery inspections and confirmation decisions to actual archived run reports."""
from .retained_incidents import BOUNDED_REVISIONS
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
    partial=manifest.get('experiment_revision') in BOUNDED_REVISIONS
    if partial:
        from .evaluation import validate_research_manifest
        validate_research_manifest(run)
    if digest_json(manifest)!=(run/'manifest.sha256').read_text().strip():raise InfrastructureError('Manifest changed')
    pointer=json.loads((run/'reports/latest.json').read_text());path=run/'reports'/pointer['report'];report=json.loads(path.read_text())
    valid_report=(report.get('analysis_ready') and not report.get('analysis_problems')) if partial else not report['problems']
    if digest_bytes(path.read_bytes())!=pointer['sha256'] or not valid_report:
        raise InfrastructureError('Complete independently checked source/timing/acceptance report required')
    events=read_jsonl(run/'events.jsonl');usage=read_jsonl(run/'usage.jsonl')
    coverage=reconcile(events,usage,True)
    if not coverage['complete_run_request_coverage']:raise InfrastructureError('Incomplete request coverage cannot support a finding')
    for filename,key in (('events.jsonl','events_sha256'),('usage.jsonl','usage_sha256')):
        if digest_bytes((run/filename).read_bytes())!=report['inputs'][key]:raise InfrastructureError('Evidence changed after report')
    if report['manifest_sha256']!=digest_json(manifest):raise InfrastructureError('Report refers to another manifest')
    if partial:
        from .prepare import file_hashes
        if file_hashes(run/'definitions')!=manifest['provenance']['definition_hashes']:
            raise InfrastructureError('Frozen definitions changed after report')
        if digest_bytes((run/'state.json').read_bytes())!=report['inputs']['state_sha256']:
            raise InfrastructureError('State changed after report')
        if stream_input_hash(run)!=report['task_stream_input_sha256']:
            raise InfrastructureError('Task stream changed after report')
        for name,sha in report['checked_artifact_sha256'].items():
            artifact=(run/name).resolve()
            if not artifact.is_relative_to(run.resolve()) or not artifact.is_file() or digest_bytes(artifact.read_bytes())!=sha:
                raise InfrastructureError('Checked original artifact changed after report: '+name)
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
    partial=manifest.get('experiment_revision') in BOUNDED_REVISIONS
    contrast_function=trajectory_contrasts; classify_function=descriptive
    if partial:
        from .bounded_confirmation import trajectory_contrasts as contrast_function, descriptive as classify_function
    values=contrast_function(manifest['runtime']['builder_configurations'],report['tasks'],ids)
    record={'kind':'candidate_inspection','utc':timestamp(),'checkpoint':end,'task_ids':ids,'values':values,'classifications':classify_function(values),'input_binding':binding,'task_stream_input_sha256':stream_input_hash(run)}
    journal=run/'analysis/inspections.jsonl';previous=read_jsonl(journal) if journal.exists() else []
    if any(r['checkpoint']==end for r in previous):raise InfrastructureError('Checkpoint inspection already recorded')
    append_json(journal,record)
    prior=next((r for r in previous if r['checkpoint']==end-10),None)
    agreement=bool(prior and prior['classifications']==record['classifications'])
    if partial and prior:
        from .bounded_confirmation import candidate_agreement
        agreement=candidate_agreement(prior['classifications'],record['classifications'])
    if agreement:
        candidate={'purpose':'descriptive candidate; requires independent confirmation','previous_window':prior,'selected_window':record,'task_stream_input_sha256':stream_input_hash(run),'plan_sha256':manifest['research']['analysis_plan']['sha256']}
        path=run/'analysis'/('candidate-'+digest_json(candidate)[:16]+'.json');write_json(path,candidate)
        # Mutable pointer; the candidate itself and every inspection remain immutable.
        write_json(run/'analysis/candidate.json',candidate)
        return {'candidate':str(path),'sha256':digest_bytes(path.read_bytes())}
    return {'candidate':None,'checkpoint':end}

def confirm(discovery, run_ids, batch):
    original,_,_=evidence(discovery)
    contrast_function=trajectory_contrasts
    if original.get('experiment_revision') in BOUNDED_REVISIONS:
        from .bounded_confirmation import trajectory_contrasts as contrast_function
    candidate_path=discovery/'analysis/candidate.json';candidate=json.loads(candidate_path.read_text())
    if candidate['task_stream_input_sha256']!=stream_input_hash(discovery):raise InfrastructureError('Replay candidate frozen prefix before further discovery changes')
    def load_replicates():
        replicates=[];locations=set()
        if original.get('experiment_revision') in BOUNDED_REVISIONS:
            from .bounded_confirmation import assigned_runs
            registry=discovery/'analysis/confirmation-cohorts.jsonl'
            planned=assigned_runs(read_jsonl(registry),batch,digest_bytes(candidate_path.read_bytes()),original['research']['analysis_plan']['sha256'])
            if len(run_ids)!=len(set(run_ids)) or set(planned)!=set(run_ids):
                raise InfrastructureError('Every prospectively assigned confirmation run must remain in its batch')
        for run_id in run_ids:
            run=ROOT/'runs/instruction-effects'/run_id;manifest,report,binding=evidence(run)
            if manifest['purpose']!='research-confirmation' or run.resolve()==discovery.resolve():raise InfrastructureError('Independent research confirmation required')
            if manifest['research']['analysis_plan']!=original['research']['analysis_plan']:raise InfrastructureError('Analysis plan differs')
            verify_replay(discovery,run)
            for key in ('image_digest','harness_versions','model_mappings','harness_context','storage_policy'):
                if manifest['runtime'].get(key)!=original['runtime'].get(key):raise InfrastructureError('Confirmation runtime differs: '+key)
            if manifest['execution']!=original['execution'] or manifest['evidence_policy']!=original['evidence_policy'] or manifest['provenance']['definition_hashes']!=original['provenance']['definition_hashes']:
                raise InfrastructureError('Replay changes execution, recovery, observations or instruction/specification bytes')
            if manifest['pricing']!=original['pricing'] or manifest['provenance']['starter_tree']!=original['provenance']['starter_tree']:raise InfrastructureError('Pricing or starter differs')
            location=Path(manifest['paths']['builders']).resolve()
            if location in locations or location==Path(original['paths']['builders']).resolve():raise InfrastructureError('Repositories are reused')
            locations.add(location)
            replicates.append({'run_id':run_id,'manifest_sha256':digest_json(manifest),'input_binding':binding,'contrasts':contrast_function(manifest['runtime']['builder_configurations'],report['tasks'],candidate['selected_window']['task_ids'])})
        return replicates
    journal=discovery/'analysis/confirmation-looks.jsonl'
    record_look(journal,batch,[{'run_id':run_id} for run_id in run_ids],digest_bytes(candidate_path.read_bytes()),original['research']['analysis_plan']['sha256'],evidence_loader=load_replicates,analysis_method=original['research'].get('analysis_method','complete-native-point-v1'))
    return confirmed_stop(read_jsonl(journal))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);parser.add_argument('--inspect',action='store_true');parser.add_argument('--batch');parser.add_argument('--repeat',action='append',default=[]);args=parser.parse_args()
    run=ROOT/'runs/instruction-effects'/args.run
    if args.inspect:print(inspect(run))
    elif args.batch and args.repeat:print(confirm(run,args.repeat,args.batch))
    else:parser.error('Use --inspect or --batch NAME with --repeat RUN for each independent trajectory')

if __name__=='__main__':main()
