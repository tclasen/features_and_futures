"""Prepare fresh discovery or exact-replay research roots without dispatching builders."""
import argparse
import copy
import json
import re
import shutil
from pathlib import Path
from .prepare import ROOT, checked, git, write_json, file_hashes, InfrastructureError
from .evidence import digest_bytes, digest_json, timestamp
from .task_stream import task_stream, verify_replay
from .preflight import price_snapshot
from .storage import require_space

PLAN=Path('experiments/instruction-effects/revisions/research-v001/analysis-plan.json')

def prepare(run_id, source_id, confirmation=False):
    if not re.fullmatch(r'eval-[0-9]{3}(?:-repeat-[0-9]{3})?',run_id):raise ValueError('Invalid research run ID')
    if not re.fullmatch(r'(?:pilot-[0-9]{3}|eval-[0-9]{3}(?:-repeat-[0-9]{3})?)',source_id):raise ValueError('Invalid source run ID')
    source=ROOT/'runs/instruction-effects'/source_id
    original=json.loads((source/'manifest.json').read_text())
    if confirmation and original['purpose']!='research-discovery':raise InfrastructureError('Confirmation replays a frozen research discovery prefix')
    state=json.loads((source/'state.json').read_text())
    if state['status'] not in (('awaiting_frozen_round','completed') if confirmation else ('completed',)):
        raise InfrastructureError('Source must have a complete shared checkpoint')
    if not confirmation:
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
    manifest['lineage']={'source_run':source_id,'variation':'Independent fresh task/suite replay' if confirmation else 'Main discovery from verified hosted pilot controls; no pilot source reuse beyond identical starter'}
    manifest['provenance']['pm_commit']=git(ROOT,'rev-parse','HEAD')
    manifest['provenance']['starter_commit']=git(seed,'rev-parse','HEAD')
    if not confirmation:
        manifest['pricing']=price_snapshot(run/'pricing',models={b['model'] for b in original['runtime']['builder_configurations']})
        write_json(run/'definitions/pricing-mappings.json',manifest['pricing'])
    manifest['provenance']['definition_hashes']=file_hashes(run/'definitions')
    manifest['research']={'analysis_plan':{'path':str(PLAN),'sha256':digest_bytes((ROOT/PLAN).read_bytes())}}
    if confirmation:manifest['research']['replay_source']='runs/instruction-effects/'+source_id
    manifest['evidence_policy'].pop('minimum_frozen_tasks',None)
    manifest['evidence_policy'].update(purpose='longitudinal instruction comparison',stop='Independent confirmation of all36 primary decisions in two disjoint batches',main_run='explicit research entry point')
    write_json(run/'manifest.json',manifest);(run/'manifest.sha256').write_text(digest_json(manifest)+'\n')
    write_json(run/'state.json',{'status':'prepared','accepted':{},'last_error':None})
    verify_replay(source,run)
    return run

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);parser.add_argument('--source-run',required=True);parser.add_argument('--confirmation',action='store_true');args=parser.parse_args()
    print(prepare(args.run,args.source_run,args.confirmation))

if __name__=='__main__':main()
