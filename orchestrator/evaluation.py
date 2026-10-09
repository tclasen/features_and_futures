"""Explicit research entry point; shares the pilot's verified measured execution core."""
import argparse
import json
import sys
from pathlib import Path
from . import pilot
from .prepare import ROOT, InfrastructureError
from .evidence import digest_bytes, read_jsonl
from .task_stream import verify_replay, stream_input_hash
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
    if manifest['execution'].get('task_stream_revision')!='append-only-rounds-v1':
        raise InfrastructureError('Research requires a frozen append-only task stream')
    if manifest['purpose']=='research-confirmation':
        source=ROOT/manifest['research']['replay_source']
        if source.resolve()==run.resolve():raise InfrastructureError('Confirmation must use a fresh independent run')
        verify_replay(source,run)
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
