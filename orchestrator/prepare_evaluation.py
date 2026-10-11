"""Prepare fresh discovery or exact-replay research roots without dispatching builders."""
from .retained_incidents import BOUNDED_REVISIONS
import argparse
import copy
import json
import re
import shutil
from pathlib import Path
from .prepare import ROOT, checked, git, write_json, file_hashes, InfrastructureError
from .evidence import digest_bytes, digest_json, timestamp, read_jsonl, append_json
from .task_stream import task_stream, verify_replay
from .preflight import price_snapshot
from .storage import require_space

PLAN=Path('experiments/instruction-effects/revisions/research-v001/analysis-plan.json')
BUILDERS_ROOT=Path('/Users/Shared/projects/features-and-futures-builders')

def research_inputs(original, revision=None, replay=False):
    selected=original['experiment_revision'] if replay else (revision or 'research-v001')
    if revision is not None and revision!=selected:raise InfrastructureError('Exact replay cannot change the research revision')
    if selected not in ('research-v001',*BOUNDED_REVISIONS):raise InfrastructureError('Unsupported research revision')
    plan=Path('experiments/instruction-effects/revisions')/selected/'analysis-plan.json'
    definition=json.loads((ROOT/plan).read_text())
    if definition.get('revision_id')!=selected or definition.get('status')!='frozen-before-main-dispatch':
        raise InfrastructureError('Freeze the selected research plan before preparing a run')
    research={'analysis_plan':{'path':str(plan),'sha256':digest_bytes((ROOT/plan).read_bytes())}}
    execution=copy.deepcopy(original['execution'])
    if selected in BOUNDED_REVISIONS:
        from .retained_incidents import POLICY, OBSERVATION_LIFECYCLE, validate_policy
        from .bounded_confirmation import METHOD
        research['analysis_method']=METHOD
        execution['provider_incident_policy']=POLICY
        if selected in ('research-v007', 'research-v008', 'research-v009', 'research-v010', 'research-v011'):
            execution['inference_observation_lifecycle']=OBSERVATION_LIFECYCLE
        try:validate_policy({'experiment_revision':selected,'execution':execution,'research':research},definition)
        except ValueError as error:raise InfrastructureError(str(error)) from error
    if replay and (original['research']['analysis_plan']!=research['analysis_plan'] or original['execution']!=execution or original['research'].get('analysis_method')!=research.get('analysis_method')):
        raise InfrastructureError('Replay changes its frozen research rules')
    return selected,research,execution

def register_confirmation(source, run, batch):
    """Bind each prepared v002 repetition before any native dispatch."""
    from .bounded_confirmation import assigned_runs
    if not batch or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',batch):raise InfrastructureError('A named confirmation batch is required')
    manifest=json.loads((run/'manifest.json').read_text())
    candidate=source/'analysis/candidate.json'
    candidate_hash=digest_bytes(candidate.read_bytes())
    record={'kind':'confirmation_run_assigned','utc':timestamp(),'run_id':manifest['run_id'],'batch':batch,
            'candidate_sha256':candidate_hash,'plan_sha256':manifest['research']['analysis_plan']['sha256'],
            'manifest_sha256':digest_json(manifest)}
    registry=source/'analysis/confirmation-cohorts.jsonl'
    records=read_jsonl(registry) if registry.exists() else []
    assigned_runs(records+[record],batch,candidate_hash,record['plan_sha256'])
    append_json(registry,record)

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

def prepare(run_id, source_id, confirmation=False, recovery=False, revision=None, batch=None):
    if confirmation and recovery:raise ValueError('Recovery and confirmation are distinct run purposes')
    if not re.fullmatch(r'eval-[0-9]{3}(?:-repeat-[0-9]{3})?',run_id):raise ValueError('Invalid research run ID')
    if not re.fullmatch(r'(?:pilot-[0-9]{3}|eval-[0-9]{3}(?:-repeat-[0-9]{3})?)',source_id):raise ValueError('Invalid source run ID')
    source=ROOT/'runs/instruction-effects'/source_id
    original=json.loads((source/'manifest.json').read_text())
    if digest_json(original)!=(source/'manifest.sha256').read_text().strip():raise InfrastructureError('Source manifest changed')
    if file_hashes(source/'definitions')!=original['provenance']['definition_hashes']:raise InfrastructureError('Source definitions changed')
    selected,research,execution=research_inputs(original,revision,confirmation or recovery)
    if selected in BOUNDED_REVISIONS and confirmation:
        if not batch:raise InfrastructureError('Prospectively register a named confirmation batch')
        from .study import evidence
        evidence(source)
        candidate=json.loads((source/'analysis/candidate.json').read_text())
        from .task_stream import stream_input_hash
        if candidate['task_stream_input_sha256']!=stream_input_hash(source) or candidate['plan_sha256']!=research['analysis_plan']['sha256']:
            raise InfrastructureError('Confirmation candidate no longer matches its frozen prefix and plan')
        research['confirmation_batch']=batch
        research['candidate_sha256']=digest_bytes((source/'analysis/candidate.json').read_bytes())
    if confirmation and original['purpose']!='research-discovery':raise InfrastructureError('Confirmation replays a frozen research discovery prefix')
    recovery_evidence=verify_recovery_source(source) if recovery else None
    source_starter=Path(original['paths']['builders'])/'starter'
    if (git(source_starter,'rev-parse','HEAD')!=original['provenance']['starter_commit']
            or git(source_starter,'rev-parse','HEAD^{tree}')!=original['provenance']['starter_tree']
            or git(source_starter,'status','--porcelain')):
        raise InfrastructureError('Identical clean frozen starter required; never reuse developed builder source')
    latest={}
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
            latest[package]=checked(['npm','view',package,'version'])
            if latest[package] != pinned:
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
    sibling=BUILDERS_ROOT/run_id
    sibling.mkdir()
    seed=sibling/'starter'
    checked(['git','clone','--no-local',str(Path(original['paths']['builders'])/'starter'),str(seed)])
    git(seed,'remote','remove','origin');git(seed,'config','core.hooksPath','/dev/null')
    for builder in original['runtime']['builder_configurations']:
        repo=sibling/builder['builder_id'];checked(['git','clone','--no-local',str(seed),str(repo)])
        git(repo,'remote','remove','origin');git(repo,'config','user.name','Experiment Builder');git(repo,'config','user.email','builder@experiment.invalid')
    manifest=copy.deepcopy(original)
    manifest.update(run_id=run_id,experiment_revision=selected,purpose='research-confirmation' if confirmation else 'research-discovery',frozen_at=timestamp(),status='running',execution=execution)
    manifest['paths']={'builders':str(sibling),'deployments':'/Users/Shared/projects/features-and-futures-deployments/'+run_id}
    manifest['lineage']={'source_run':source_id,'variation':'Independent fresh exact discovery recovery; original accounting gap retained' if recovery else ('Independent fresh task/suite replay' if confirmation else 'Main discovery from verified hosted pilot controls; no pilot source reuse beyond identical starter')}
    manifest['provenance']['pm_commit']=git(ROOT,'rev-parse','HEAD')
    manifest['provenance']['starter_commit']=git(seed,'rev-parse','HEAD')
    if not confirmation and not recovery:
        manifest['pricing']=price_snapshot(run/'pricing',models={b['model'] for b in original['runtime']['builder_configurations']})
        write_json(run/'definitions/pricing-mappings.json',manifest['pricing'])
    manifest['provenance']['definition_hashes']=file_hashes(run/'definitions')
    manifest['research']=research
    if confirmation:manifest['research']['replay_source']='runs/instruction-effects/'+source_id
    if recovery:
        manifest['research']['recovery_source']='runs/instruction-effects/'+source_id
        manifest['research']['recovery_evidence']=recovery_evidence
    manifest['evidence_policy'].pop('minimum_frozen_tasks',None)
    manifest['evidence_policy'].update(purpose='longitudinal instruction comparison',stop='Independent confirmation of all36 primary decisions in two disjoint batches',main_run='explicit research entry point')
    write_json(run/'manifest.json',manifest);(run/'manifest.sha256').write_text(digest_json(manifest)+'\n')
    write_json(run/'state.json',{'status':'prepared','accepted':{},'last_error':None})
    verify_replay(source,run)
    write_json(run/'preflight/preparation/verified.json',{'utc':timestamp(),'source_run':source_id,'revision':selected,
        'plan_sha256':research['analysis_plan']['sha256'],'manifest_sha256':digest_json(manifest),
        'starter_commit':manifest['provenance']['starter_commit'],'starter_tree':git(seed,'rev-parse','HEAD^{tree}'),
        'latest_stable_npm':latest or None,'runtime_selection':'Exact frozen source runtime' if confirmation or recovery else 'Latest stable registry versions match the source immutable image',
        'replay':verify_replay(source,run),'fresh_builder_roots':str(sibling),'native_model_calls':0})
    if selected in BOUNDED_REVISIONS and confirmation:register_confirmation(source,run,batch)
    return run

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);parser.add_argument('--source-run',required=True);parser.add_argument('--confirmation',action='store_true');parser.add_argument('--recovery',action='store_true');parser.add_argument('--experiment-revision',choices=('research-v001',*BOUNDED_REVISIONS));parser.add_argument('--batch');args=parser.parse_args()
    print(prepare(args.run,args.source_run,args.confirmation,args.recovery,args.experiment_revision,args.batch))

if __name__=='__main__':main()
