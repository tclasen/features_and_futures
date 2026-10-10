"""Explicit research entry point; shares the pilot's verified measured execution core."""
from .retained_incidents import BOUNDED_REVISIONS
import argparse
import json
import sys
from pathlib import Path
from . import pilot
from .prepare import ROOT, InfrastructureError
from .evidence import digest_bytes, read_jsonl
from .task_stream import verify_replay, verify_discovery_recovery, stream_input_hash
from .confirmation import confirmed_stop

def validate_research_manifest(run):
    manifest=json.loads((run/'manifest.json').read_text())
    if manifest['purpose'] not in ('research-discovery','research-confirmation'):
        raise InfrastructureError('Research runner requires an explicitly prepared research manifest')
    plan=manifest['research']['analysis_plan']
    path=ROOT/plan['path']
    if not path.resolve().is_relative_to(ROOT.resolve()) or digest_bytes(path.read_bytes()) != plan['sha256']:
        raise InfrastructureError('Frozen research analysis plan changed')
    definition=json.loads(path.read_text())
    if definition['primary_family_size'] != 36 or definition['stopping']['required_independent_batches'] != 2:
        raise InfrastructureError('Unsupported research evidence method')
    from .retained_incidents import validate_policy
    try:
        validate_policy(manifest, definition)
    except ValueError as error:
        raise InfrastructureError(str(error)) from error
    if manifest['execution'].get('task_stream_revision')!='append-only-rounds-v1':
        raise InfrastructureError('Research requires a frozen append-only task stream')
    if manifest['purpose']=='research-confirmation' or 'recovery_source' in manifest['research']:
        source=ROOT/manifest['research']['replay_source' if manifest['purpose']=='research-confirmation' else 'recovery_source']
        if source.resolve()==run.resolve():raise InfrastructureError('Confirmation must use a fresh independent run')
        if manifest['purpose']=='research-confirmation':verify_replay(source,run)
        else:verify_discovery_recovery(source,run)
        original=json.loads((source/'manifest.json').read_text())
        for key in ('image_digest','harness_versions','model_mappings','harness_context','storage_policy'):
            if original['runtime'].get(key)!=manifest['runtime'].get(key):
                raise InfrastructureError('Confirmation changes runtime: '+key)
        if original['execution']!=manifest['execution'] or original['evidence_policy']!=manifest['evidence_policy']:
            raise InfrastructureError('Confirmation changes execution, recovery or observation policy')
        if original['provenance']['definition_hashes']!=manifest['provenance']['definition_hashes'] or original['provenance']['starter_tree']!=manifest['provenance']['starter_tree']:
            raise InfrastructureError('Confirmation changes starter, specification or instructions')
        if original['pricing']!=manifest['pricing']:
            raise InfrastructureError('Confirmation changes reference pricing')
        if original['paths']['builders']==manifest['paths']['builders']:
            raise InfrastructureError('Confirmation reuses builder repositories')
        if manifest.get('experiment_revision') in BOUNDED_REVISIONS and manifest['purpose']=='research-confirmation':
            from .bounded_confirmation import assigned_runs
            from .evidence import digest_json
            research=manifest['research']
            candidate=source/'analysis/candidate.json'
            if digest_bytes(candidate.read_bytes())!=research['candidate_sha256']:
                raise InfrastructureError('Registered confirmation candidate changed')
            registry=read_jsonl(source/'analysis/confirmation-cohorts.jsonl')
            try:
                selected=assigned_runs(registry,research['confirmation_batch'],research['candidate_sha256'],plan['sha256'])
            except ValueError as error:raise InfrastructureError(str(error)) from error
            registered=[r for r in registry if r['run_id']==manifest['run_id']]
            if manifest['run_id'] not in selected or len(registered)!=1 or registered[0]['manifest_sha256']!=digest_json(manifest):
                raise InfrastructureError('Register the exact confirmation manifest before native dispatch')
    return manifest

def completion_ready(run):
    manifest=validate_research_manifest(run)
    if manifest['purpose']=='research-confirmation':return True
    journal=run/'analysis/confirmation-looks.jsonl'
    if not journal.exists():return False
    result=confirmed_stop(read_jsonl(journal))
    if not result['confirmed']:return False
    if result['plan_sha256']!=manifest['research']['analysis_plan']['sha256']:
        raise InfrastructureError('Confirmation decision refers to another analysis plan')
    candidate=run/'analysis/candidate.json'
    if not candidate.exists() or digest_bytes(candidate.read_bytes())!=result['candidate_sha256']:
        raise InfrastructureError('Confirmation decision refers to another candidate')
    data=json.loads(candidate.read_text())
    if data['task_stream_input_sha256']!=stream_input_hash(run):
        raise InfrastructureError('Candidate prefix changed after confirmation')
    return True

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',required=True);args=parser.parse_args()
    if not __import__('re').fullmatch(r'eval-[0-9]{3}(?:-repeat-[0-9]{3})?',args.run):
        raise InfrastructureError('Use a unique eval run ID')
    run=ROOT/'runs/instruction-effects'/args.run
    validate_research_manifest(run)
    # The native core accepts research only through this explicit checked entry point.
    sys.argv=[sys.argv[0],'--run',args.run]
    pilot.main(allowed_purposes=('research-discovery','research-confirmation'),completion_check=completion_ready)

if __name__=='__main__':main()
