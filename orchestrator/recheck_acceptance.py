"""Check immutable accepted submissions against a separately prepared suite.

Diagnostic evidence only: never dispatch builders or alter frozen run outcomes.
"""
import argparse
import copy
import json
import shutil
import time
from pathlib import Path
from .evidence import digest_bytes, digest_json, read_jsonl, timestamp
from .prepare import ROOT, file_hashes, git, write_json
from .validation import Deployment, run_suite


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', default='pilot-005')
    parser.add_argument('--suite-revision', default='v005', choices=['v005'])
    parser.add_argument('--builder', action='append')
    parser.add_argument('--stage', type=int, choices=[1, 2, 3], action='append')
    args = parser.parse_args()
    run = ROOT/'runs/instruction-effects'/args.run
    original = json.loads((run/'manifest.json').read_text())
    assert digest_json(original) == (run/'manifest.sha256').read_text().strip()
    event_bytes = (run/'events.jsonl').read_bytes()
    events = [json.loads(line) for line in event_bytes.splitlines() if line]
    accepted = {(e['builder_id'], e['task_id']): e for e in events if e['kind'] == 'task_accepted'}
    suite = ROOT/'projects'/original['project_id']/'revisions'/args.suite_revision/'acceptance'
    suite_hashes = file_hashes(suite)
    probe_id = f'recheck-{time.time_ns()}'
    output = run/'preflight'/('acceptance-'+args.suite_revision)/probe_id
    snapshot = output/'definitions/project/acceptance'
    snapshot.parent.mkdir(parents=True)
    shutil.copytree(suite, snapshot)
    manifest = copy.deepcopy(original)
    manifest['run_id'] = probe_id
    manifest['paths']['deployments'] = str(Path(original['paths']['deployments']).parent/probe_id)
    write_json(output/'provenance.json', {
        'purpose': 'independent diagnostic validation; original outcomes unchanged',
        'source_manifest_sha256': digest_json(original), 'source_events_sha256': digest_bytes(event_bytes),
        'suite_revision': args.suite_revision, 'suite_hashes': suite_hashes,
        'execution_code_commit': git(ROOT, 'rev-parse', 'HEAD'),
        'execution_module_sha256': digest_bytes(Path(__file__).read_bytes()), 'utc': timestamp(),
    })
    results = []
    for task in original['tasks']:
        stage = task['stage']
        if args.stage and stage not in args.stage:
            continue
        for builder in original['runtime']['builder_configurations']:
            bid = builder['builder_id']
            key = (bid, task['task_id'])
            if key not in accepted or (args.builder and bid not in args.builder):
                continue
            submission = accepted[key]
            target = output/bid/task['task_id']
            target.mkdir(parents=True)
            prior = None
            if stage > 1:
                prior_task = next(t for t in original['tasks'] if t['stage'] == stage-1)
                prior_event = accepted[(bid, prior_task['task_id'])]
                prior_database = Path(original['paths']['deployments'])/bid/prior_task['task_id']/prior_event['attempt_id']/'.runtime/app.sqlite'
                if not prior_database.is_file():
                    raise RuntimeError('Missing original accepted database snapshot: '+str(prior_database))
                prior = {'database': str(prior_database), 'stage': stage-1, 'fixture_prefix': prior_task['task_id']}
            entry = {'builder_id': bid, 'task_id': task['task_id'], 'stage': stage,
                     'source_commit': submission['commit'], 'source_tree': submission['tree'],
                     'phases': [], 'passed': False}
            assert git(ROOT, 'rev-parse', submission['commit']+'^{tree}') == submission['tree']
            deployment = Deployment.__new__(Deployment)
            deployment.name = None
            try:
                Deployment.__init__(deployment, manifest, bid, task['task_id'], 'probe-001', ROOT, submission['commit'], target, prior)
                phases = []
                if prior:
                    phases.append((stage-1, 'upgrade', prior['fixture_prefix'], 1))
                phases.append((stage, 'acceptance', probe_id+'-'+task['task_id'], {1: 4, 2: 8, 3: 11}[stage]))
                for phase_stage, phase, prefix, expected in phases:
                    ok, errors, counts = run_suite(ROOT, output, deployment, target, phase_stage, phase, prefix)
                    passed = ok and not errors and counts.get('expected') == expected and counts.get('unexpected', 0) == 0 and counts.get('skipped', 0) == 0
                    entry['phases'].append({'phase': phase, 'passed': passed, 'statistics': counts, 'diagnostics': errors})
                    if not passed:
                        break
                if all(p['passed'] for p in entry['phases']):
                    deployment.restart()
                    ok, errors, counts = run_suite(ROOT, output, deployment, target, stage, 'postrestart', probe_id+'-'+task['task_id'])
                    entry['phases'].append({'phase': 'postrestart', 'passed': ok and not errors and counts.get('expected') == 1 and counts.get('unexpected', 0) == 0 and counts.get('skipped', 0) == 0, 'statistics': counts, 'diagnostics': errors})
                entry['passed'] = len(entry['phases']) == (3 if prior else 2) and all(p['passed'] for p in entry['phases'])
            except RuntimeError as error:
                entry['error'] = str(error)
            finally:
                if deployment.name:
                    deployment.stop()
            write_json(target/'diagnostic-result.json', entry)
            results.append(entry)
            write_json(output/'results.json', {'suite_revision': args.suite_revision, 'suite_hashes': suite_hashes, 'results': results, 'complete_54_checkpoint_corpus': len(results) == 54, 'all_checked_passed': all(r['passed'] for r in results)})
            print(json.dumps({'builder': bid, 'stage': stage, 'passed': entry['passed'], 'checked': len(results)}), flush=True)
    assert file_hashes(snapshot) == suite_hashes
    print('Diagnostic evidence: '+str(output), flush=True)
    if not results or not all(r['passed'] for r in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
