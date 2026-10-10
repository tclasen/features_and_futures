#!/usr/bin/env python3
"""Audit a completed prefix without racing a live run's later requests."""
import argparse
import contextlib
import hashlib
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from orchestrator import audit_native_receipts, audit_request_coverage
from orchestrator.evidence import digest_json, timestamp


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--through', type=int, required=True)
    args = parser.parse_args()
    assert args.through > 0
    run = ROOT / 'runs/instruction-effects' / args.run
    manifest = json.loads((run / 'manifest.json').read_text())
    events = [json.loads(line) for line in (run / 'events.jsonl').read_text().splitlines()]
    usage = [json.loads(line) for line in (run / 'usage.jsonl').read_text().splitlines()]
    selected = lambda item: int(item.get('task_id', 'task-000').split('-')[-1]) <= args.through
    events = [item for item in events if selected(item)]
    usage = [item for item in usage if selected(item)]
    builders = {b['builder_id'] for b in manifest['runtime']['builder_configurations']}
    for stage in range(1, args.through + 1):
        task = f'task-{stage:03d}'
        assert len([e for e in events if e['kind'] == 'round_completed' and e.get('task_id') == task]) == 1
        for kind in ('task_accepted', 'deployment_promoted', 'post_deployment_checks_passed'):
            entries = [e for e in events if e['kind'] == kind and e.get('task_id') == task]
            assert len(entries) == len(builders) and {e['builder_id'] for e in entries} == builders
    snapshot = {'events': events, 'usage': usage, 'through': args.through}
    output = run / 'reports' / f'closed-rounds-{args.through:03d}-{digest_json(snapshot)[:16]}'
    assert not output.exists(), 'Snapshot already exists; never overwrite original evidence'
    output.mkdir(parents=True)
    for name, records in [('events.jsonl', events), ('usage.jsonl', usage)]:
        (output / name).write_text(''.join(json.dumps(r, sort_keys=True) + '\n' for r in records))
    shutil.copy2(__file__, output / 'executed-controller.py')
    with tempfile.TemporaryDirectory(prefix='ff-closed-round-audit-') as folder:
        scoped_root = Path(folder)
        scoped = scoped_root / 'runs/instruction-effects' / args.run
        scoped.mkdir(parents=True)
        for name in ('manifest.json', 'manifest.sha256'):
            shutil.copy2(run / name, scoped / name)
        (scoped / 'state.json').write_text(json.dumps({'status': 'running'}))
        for name in ('definitions', 'tasks'):
            (scoped / name).symlink_to(run / name, target_is_directory=True)
        for name in ('events.jsonl', 'usage.jsonl'):
            shutil.copy2(output / name, scoped / name)
        (scoped / 'reports').mkdir()
        for module in (audit_native_receipts, audit_request_coverage):
            old_root, old_argv = module.ROOT, sys.argv
            try:
                module.ROOT = scoped_root
                sys.argv = ['audit', '--run', args.run]
                with contextlib.redirect_stdout(io.StringIO()):
                    try:
                        module.main()
                    except SystemExit as error:
                        assert module is audit_native_receipts and error.code == 1
            finally:
                module.ROOT, sys.argv = old_root, old_argv
        for p in (scoped / 'reports').glob('*.json'):
            shutil.copy2(p, output / p.name)
    native = json.loads(next(output.glob('native-audit-*.json')).read_text())
    coverage = json.loads(next(output.glob('request-coverage-*.json')).read_text())
    assert not native['problems'] and not coverage['problems']
    assert native['recorded_finished_requests'] == len(usage)
    assert coverage['dispatched_requests'] == coverage['usage_records'] == coverage['finished_events'] == len(usage)
    receipt = {'verified': True, 'utc': timestamp(), 'run_id': args.run, 'through': args.through,
               'accepted_checkpoints': args.through * len(builders), 'requests': len(usage),
               'known_receipts': native['verified_native_receipts'], 'unknown_receipts': native['unknown_receipts'],
               'known_uncached_reference_lower_bound_usd': native['known_uncached_reference_lower_bound_usd'],
               'known_cache_aware_lower_bound_usd': native['known_cache_aware_lower_bound_usd'],
               'upper_bound_usd': None if native['unknown_receipts'] else native['known_uncached_reference_lower_bound_usd'],
               'controller_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               'scope': 'Closed prefix only. Later live calls excluded. Unknown counters remain unknown; no complete-run or comparative finding claimed.'}
    (output / 'verified.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({**receipt, 'evidence': str(output)}))


if __name__ == '__main__':
    main()
