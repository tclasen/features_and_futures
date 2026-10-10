"""Prepare fresh discovery or exact-replay research roots without dispatching builders."""
import argparse
import copy
import json
import re
import shutil
from pathlib import Path
from .prepare import ROOT, checked, git, write_json, file_hashes, InfrastructureError
from .evidence import digest_bytes, digest_json, timestamp, read_jsonl
from .task_stream import task_stream, verify_replay
from .preflight import price_snapshot
from .storage import require_space

PLAN=Path('experiments/instruction-effects/revisions/research-v001/analysis-plan.json')

def verify_recovery_source(source):
    """Permit a fresh exact discovery replay only after a drained accounting incident."""
    from .evaluation import validate_research_manifest
    manifest=validate_research_manifest(source)
    if manifest['purpose']!='research-discovery':raise InfrastructureError('Recovery requires a research discovery source')
    if digest_json(manifest)!=(source/'manifest.sha256').read_text().strip():raise InfrastructureError('Recovery source manifest changed')
    if file_hashes(source/'definitions')!=manifest['provenance']['definition_hashes']:raise InfrastructureError('Recovery source definitions changed')
    state=json.loads((source/'state.json').read_text())
    if state['status']!='infrastructure_attention':raise InfrastructureError('Recovery source must be interrupted by infrastructure')
    events=read_jsonl(source/'events.jsonl');usage=read_jsonl(source/'usage.jsonl')
    started={e['request_id'] for e in events if e['kind']=='inference_request_started'}
    finished={e['request_id'] for e in events if e['kind']=='inference_request_finished'}
    if started!=finished or started!={u['request_id'] for u in usage}:raise InfrastructureError('Drain original requests before recovery preparation')
    attempts=lambda kind:{(e['builder_id'],e['task_id'],e['attempt_id']) for e in events if e['kind']==kind}
    if attempts('attempt_started')!=attempts('attempt_finished'):raise InfrastructureError('Drain original attempts before recovery preparation')
    if not any(e['kind']=='runner_interrupted' for e in events):raise InfrastructureError('Original runner interruption evidence required')
    gaps=[u for u in usage if u['counts'] is None]
    if not gaps:raise InfrastructureError('Accounting-gap recovery requires original unknown native usage')
    for u in gaps:
        raw=source/'tasks'/u['task_id']/'attempts'/u['builder_id']/u['attempt_id']/'requests'/(u['request_id']+'.response.raw')
        if digest_bytes(raw.read_bytes())!=u['response_sha256']:raise InfrastructureError('Original accounting-gap response changed')
    task_stream(source,manifest)
    return {'original_requests':len(usage),'unknown_native_receipts':len(gaps),'request_ids':[u['request_id'] for u in gaps]}

def prepare(run_id, source_id, confirmation=False, recovery=False):
    if confirmation and recovery:raise ValueError('Recovery and confirmation are distinct run purposes')
    if not re.fullmatch(r'eval-[0-9]{3}(?:-repeat-[0-9]{3})?',run_id):raise ValueError('Invalid research run ID')
    if not re.fullmatch(r'(?:pilot-[0-9]{3}|eval-[0-9]{3}(?:-repeat-[0-9]{3})?)',source_id):raise ValueError('Invalid source run ID')
    source=ROOT/'runs/instruction-effects'/source_id
    original=json.loads((source/'manifest.json').read_text())
    if confirmation and original['purpose']!='research-discovery':raise InfrastructureError('Confirmation replays a frozen research discovery prefix')
    recovery_evidence=verify_recovery_source(source) if recovery else None
    state=json.loads((source/'state.json').read_text())
    if not recovery and state['status'] not in (('awaiting_frozen_round','completed') if confirmation else ('completed',)):
        raise InfrastructureError('Source must have a complete shared checkpoint')
    if not confirmation and not recovery:
        pointer=json.loads((source/'reports/latest.json').read_text());report_path=source/'reports'/pointer['report']
        report=json.loads(report_path.read_text())
        if digest_bytes(report_path.read_bytes())!=pointer['sha256'] or not report['readiness_passed']:
            raise InfrastructureError('Source pilot readiness not verified')
        for filename, field in (('events.jsonl','events_sha256'),('usage.jsonl','usage_sha256')):
            if digest_bytes((source/filename).read_bytes()) != report['inputs'][field]:
                raise InfrastructureError('Pilot evidence changed after readiness audit')
        for package, pinned in (('@openai/codex',original['runtime']['harness_versions']['codex']),('@earendil-works/pi-coding-agent',original['runtime']['harness_versions']['pi'])):
            if checked(['npm','view',package,'version']) != pinned:
                raise InfrastructureError('Latest stable harness changed; prepare a new verified image')
    require_space(original,ROOT)
    run=ROOT/'runs/instruction-effects'/run_id
    if run.exists():raise InfrastructureError('Research run already exists; never overwrite')
    run.mkdir(parents=True)
    shutil.copytree(source/'definitions',run/'definitions')
    shutil.copytree(source/'pricing',run/'pricing')
    tasks=task_stream(source,original)
    for task in tasks:
        target=run/'tasks'/task['task_id'];target.mkdir(parents=True)
        shutil.copy2(source/'tasks'/task['task_id']/'packet.md',target/'packet.md')
        if 'suite_files' in task:
            for name in ('round.json','requirements.md'):shutil.copy2(source/'tasks'/task['task_id']/name,target/name)
            shutil.copytree(source/'tasks'/task['task_id']/'suite',target/'suite')
    sibling=Path('/Users/Shared/projects/features-and-futures-builders')/run_id
    sibling.mkdir()
    seed=sibling/'starter'
    checked(['git','clone','--no-local',str(Path(original['paths']['builders'])/'starter'),str(seed)])
    git(seed,'remote','remove','origin');git(seed,'config','core.hooksPath','/dev/null')
    for builder in original['runtime']['builder_configurations']:
        repo=sibling/builder['builder_id'];checked(['git','clone','--no-local',str(seed),str(repo)])
        git(repo,'remote','remove','origin');git(repo,'config','user.name','Experiment Builder');git(repo,'config','user.email','builder@experiment.invalid')
    manifest=copy.deepcopy(original)
    manifest.update(run_id=run_id,experiment_revision='research-v001',purpose='research-confirmation' if confirmation else 'research-discovery',frozen_at=timestamp(),status='running')
    manifest['paths']={'builders':str(sibling),'deployments':'/Users/Shared/projects/features-and-futures-deployments/'+run_id}
    manifest['lineage']={'source_run':source_id,'variation':'Independent fresh exact discovery recovery; original accounting gap retained' if recovery else ('Independent fresh task/suite replay' if confirmation else 'Main discovery from verified hosted pilot controls; no pilot source reuse beyond identical starter')}
    manifest['provenance']['pm_commit']=git(ROOT,'rev-parse','HEAD')
    manifest['provenance']['starter_commit']=git(seed,'rev-parse','HEAD')
    if not confirmation and not recovery:
        manifest['pricing']=price_snapshot(run/'pricing',models={b['model'] for b in original['runtime']['builder_configurations']})
        write_json(run/'definitions/pricing-mappings.json',manifest['pricing'])
    manifest['provenance']['definition_hashes']=file_hashes(run/'definitions')
    manifest['research']={'analysis_plan':{'path':str(PLAN),'sha256':digest_bytes((ROOT/PLAN).read_bytes())}}
    if confirmation:manifest['research']['replay_source']='runs/instruction-effects/'+source_id
    if recovery:
        manifest['research']['recovery_source']='runs/instruction-effects/'+source_id
        manifest['research']['recovery_evidence']=recovery_evidence
    manifest['evidence_policy'].pop('minimum_frozen_tasks',None)
    manifest['evidence_policy'].update(purpose='longitudinal instruction comparison',stop='Independent confirmation of all36 primary decisions in two disjoint batches',main_run='explicit research entry point')
    write_json(run/'manifest.json',manifest);(run/'manifest.sha256').write_text(digest_json(manifest)+'\n')
    write_json(run/'state.json',{'status':'prepared','accepted':{},'last_error':None})
    verify_replay(source,run)
    return run

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);parser.add_argument('--source-run',required=True);parser.add_argument('--confirmation',action='store_true');parser.add_argument('--recovery',action='store_true');args=parser.parse_args()
    print(prepare(args.run,args.source_run,args.confirmation,args.recovery))

if __name__=='__main__':main()
