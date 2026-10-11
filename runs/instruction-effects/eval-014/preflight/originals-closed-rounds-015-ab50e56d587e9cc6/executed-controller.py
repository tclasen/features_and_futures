#!/usr/bin/env python3
"""Restore originals and check delivery/isolation from an immutable closed audit."""
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from orchestrator.evidence import digest_json, timestamp
from orchestrator.pilot import verify_isolation
from orchestrator.prepare import file_hashes


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def strings(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, dict)):
        values = value.values() if isinstance(value, dict) else value
        return [text for item in values for text in strings(item)]
    return []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--audit', required=True, type=Path)
    args = parser.parse_args()
    assert re.fullmatch(r'eval-[0-9]{3}(?:-repeat-[0-9]{3})?', args.run)
    run = ROOT / 'runs/instruction-effects' / args.run
    audit = args.audit.resolve()
    assert audit.parent == (run / 'reports').resolve()
    receipt = json.loads((audit / 'verified.json').read_text())
    assert receipt['verified'] and receipt['run_id'] == args.run
    through = receipt['through']
    assert isinstance(through, int) and through > 0
    output = run / 'preflight' / ('originals-' + audit.name)
    assert not output.exists(), 'Never overwrite an earlier verification'
    events = [json.loads(line) for line in (audit / 'events.jsonl').read_text().splitlines()]
    usage = [json.loads(line) for line in (audit / 'usage.jsonl').read_text().splitlines()]
    identity = lambda row: (row['builder_id'], row['task_id'], row['attempt_id'])
    closed = {identity(row) for row in events if row['kind'] == 'attempt_finished'}
    started = {identity(row) for row in events if row['kind'] == 'attempt_started'}
    assert started == closed and closed
    manifest = json.loads((run / 'manifest.json').read_text())
    assert digest_json(manifest) == (run / 'manifest.sha256').read_text().strip()
    assert file_hashes(run / 'definitions') == manifest['provenance']['definition_hashes']
    builders = {row['builder_id']: row for row in manifest['runtime']['builder_configurations']}
    profiles = json.loads((run / 'definitions/instructions.json').read_text())
    for stage in range(1, through + 1):
        task = f'task-{stage:03d}'
        assert sum(row['kind'] == 'round_completed' and row.get('task_id') == task for row in events) == 1
        for kind in ('task_accepted', 'deployment_promoted', 'post_deployment_checks_passed'):
            rows = [row for row in events if row['kind'] == kind and row.get('task_id') == task]
            assert len(rows) == len(builders) and {row['builder_id'] for row in rows} == set(builders)
    spec = importlib.util.spec_from_file_location('originals', ROOT / 'scripts/verify-retained-originals.py')
    originals = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(originals)
    output.mkdir(parents=True)
    shutil.copy2(__file__, output / 'executed-controller.py')
    checkpoints, native, deliveries, isolation = [], [], {}, []
    for bid, task, attempt in sorted(closed):
        checkpoint = run / 'builders' / bid / 'checkpoints' / (task + '-' + attempt)
        index_path = checkpoint / 'index.json'
        index = json.loads(index_path.read_text())
        assert index['run_id'] == args.run and index['builder_id'] == bid
        for name, checksum in index['checksums'].items():
            assert sha(checkpoint / name) == checksum
        originals.restore(checkpoint / 'history.bundle', index['source_commit'], index['source_tree'])
        for ref in index['github_refs']:
            assert originals.git('rev-parse', ref) == index['source_commit']
        checkpoints.append({'index': str(index_path.relative_to(ROOT)), 'index_sha256': sha(index_path),
                            'head': index['source_commit'], 'tree': index['source_tree']})
        folder = run / 'tasks' / task / 'attempts' / bid / attempt
        state = json.loads((folder / 'native-git.json').read_text())
        assert state['head'] == index['source_commit'] and state['tree'] == index['source_tree']
        originals.restore(folder / 'native-history.bundle', state['head'], state['tree'],
                          folder / 'native-working-tree.tar.gz', state['dirty'])
        native.append({'identity': [bid, task, attempt], 'head': state['head'], 'tree': state['tree'],
                       'files': {name: sha(folder / name) for name in
                                 ('native-git.json', 'native-history.bundle', 'native-working-tree.tar.gz')}})
    for row in sorted(usage, key=lambda item: item['started_monotonic_ns']):
        key = identity(row)
        assert key in closed
        if key in deliveries:
            continue
        bid, task, attempt = key
        request = run / 'tasks' / task / 'attempts' / bid / attempt / 'requests' / (row['request_id'] + '.request.json')
        assert sha(request) == row['request_sha256']
        text = '\n'.join(strings(json.loads(request.read_text())))
        packet = (run / 'tasks' / task / 'packet.md').read_text()
        profile = profiles['profiles'][builders[bid]['profile']]
        assert packet in text and (not profile or profile in text) and profiles['contract'] in text
        assert 'PM agent for a longitudinal coding-agent experiment' not in text
        deliveries[key] = {'identity': list(key), 'request_id': row['request_id'], 'request_sha256': sha(request),
                           'packet_sha256': hashlib.sha256(packet.encode()).hexdigest(),
                           'profile_sha256': hashlib.sha256(profile.encode()).hexdigest()}
    assert set(deliveries) == closed
    for bid in sorted(builders):
        for stage in range(1, through + 1):
            path = run / 'builders' / bid / f'isolation-task-{stage:03d}.json'
            assert verify_isolation(json.loads(path.read_text())['probe'])
            isolation.append({'path': str(path.relative_to(ROOT)), 'sha256': sha(path)})
    proof = {'verified': True, 'utc': timestamp(), 'run_id': args.run, 'through': through,
             'model_calls': 0, 'controller_sha256': sha(Path(__file__)),
             'audit_files': {name: sha(audit / name) for name in ('verified.json', 'events.jsonl', 'usage.jsonl')},
             'manifest_sha256': sha(run / 'manifest.json'), 'checkpoints': checkpoints,
             'native_originals': native, 'deliveries': list(deliveries.values()), 'isolation': isolation,
             'scope': 'Closed prefix originals, first-request delivery and task-start isolation only. No missing counters inferred or comparative finding claimed.'}
    (output / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps({'verified': True, 'attempts': len(closed), 'isolation_probes': len(isolation), 'evidence': str(output)}))


if __name__ == '__main__':
    main()
