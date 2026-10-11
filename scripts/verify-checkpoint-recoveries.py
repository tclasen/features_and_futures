#!/usr/bin/env python3
"""Independently restore closed own-checkpoint recovery archives."""
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    args = parser.parse_args()
    assert re.fullmatch(r'eval-[0-9]{3}(?:-repeat-[0-9]{3})?', args.run)
    run = ROOT / 'runs/instruction-effects' / args.run
    events = [json.loads(line) for line in (run / 'events.jsonl').read_text().splitlines()]
    spec = importlib.util.spec_from_file_location('originals', ROOT / 'scripts/verify-retained-originals.py')
    originals = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(originals)
    verified = []
    for event in events:
        if event['kind'] != 'repository_recovery_finished':
            continue
        bid, task, attempt = (event[k] for k in ('builder_id', 'task_id', 'attempt_id'))
        folder = run / 'tasks' / task / 'attempts' / bid / attempt
        receipt_path = folder / 'repository-recovery.json'
        receipt = json.loads(receipt_path.read_text())
        assert all(event[k] == v for k, v in receipt.items())
        started = next(e for e in events if e['event_id'] == receipt['recovery_started_event_id'])
        assert started['kind'] == 'repository_recovery_started'
        accepted = [e for e in events if e['kind'] == 'task_accepted'
                    and e['builder_id'] == bid and e['monotonic_ns'] < started['monotonic_ns']]
        assert accepted, 'Starter recovery requires a separate starter proof'
        prior = max(accepted, key=lambda e: e['monotonic_ns'])
        assert int(prior['task_id'].split('-')[-1]) < int(task.split('-')[-1])
        prior_path = run / 'builders' / bid / 'checkpoints' / (prior['task_id'] + '-' + prior['attempt_id']) / 'index.json'
        prior_index = json.loads(prior_path.read_text())
        assert receipt['post_commit'] == prior['commit'] == prior_index['source_commit']
        assert receipt['post_tree'] == prior['tree'] == prior_index['source_tree']
        checkpoint = run / 'builders' / bid / 'checkpoints' / (task + '-' + attempt + '-before-restore')
        index_path = checkpoint / 'index.json'
        index = json.loads(index_path.read_text())
        assert index['run_id'] == args.run and index['builder_id'] == bid
        assert index['source_commit'] == receipt['pre_commit']
        assert index['source_tree'] == receipt['pre_tree']
        assert index['checksums'] == receipt['archive_checksums']
        for name, checksum in index['checksums'].items():
            assert sha(checkpoint / name) == checksum
        originals.restore(checkpoint / 'history.bundle', index['source_commit'], index['source_tree'])
        native_folder = folder / 'recovery-before-restore'
        native = json.loads((native_folder / 'native-git.json').read_text())
        assert native['head'] == receipt['pre_commit'] and native['tree'] == receipt['pre_tree']
        assert sha(native_folder / 'native-working-tree.tar.gz') == receipt['native_working_tree_sha256']
        assert sha(native_folder / 'native-history.bundle') == receipt['archive_checksums']['history.bundle']
        originals.restore(native_folder / 'native-history.bundle', native['head'], native['tree'],
                          native_folder / 'native-working-tree.tar.gz', native['dirty'])
        verified.append(dict(builder_id=bid, task_id=task, attempt_id=attempt,
                             recovery_event=event, accepted_event=prior,
                             receipt_sha256=sha(receipt_path), index_sha256=sha(index_path),
                             accepted_index_sha256=sha(prior_path),
                             native_files={name: sha(native_folder / name) for name in
                                           ('native-git.json', 'native-history.bundle', 'native-working-tree.tar.gz')}))
    assert verified, 'No closed recovery to verify'
    proof = dict(verified=True, run_id=args.run, recoveries=verified, model_calls=0,
                 controller_sha256=sha(Path(__file__)),
                 restore_controller_sha256=sha(ROOT / 'scripts/verify-retained-originals.py'),
                 scope='Closed own-checkpoint recoveries only; active native execution untouched, no missing counters inferred.')
    key = hashlib.sha256(json.dumps(proof, sort_keys=True).encode()).hexdigest()[:16]
    output = run / 'preflight/checkpoint-recovery-audits' / ('verified-' + key)
    assert not output.exists(), 'Never overwrite an earlier proof'
    output.mkdir(parents=True)
    shutil.copy2(__file__, output / 'executed-controller.py')
    (output / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(dict(verified=True, recoveries=len(verified), evidence=str(output.relative_to(ROOT)))))


if __name__ == '__main__':
    main()
