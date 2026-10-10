#!/usr/bin/env python3
"""Restore closed provider-incident originals without accessing live builders."""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from orchestrator.evidence import digest_json, read_jsonl, timestamp
from orchestrator.retained_incidents import terminal_attempt_evidence


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True,
                          text=True).stdout.strip()


def restore(bundle, head, tree, working=None, dirty=None):
    with tempfile.TemporaryDirectory(prefix='ff-original-restore-') as folder:
        git('clone', '--quiet', str(bundle.resolve()), folder)
        git('-C', folder, 'checkout', '--detach', head)
        if git('-C', folder, 'rev-parse', 'HEAD^{tree}') != tree:
            raise ValueError('Original tree does not restore')
        git('-C', folder, 'fsck', '--full', '--no-reflogs')
        if working is not None:
            for child in Path(folder).iterdir():
                if child.name != '.git':
                    if child.is_dir() and not child.is_symlink():
                        shutil.rmtree(child)
                    else:
                        child.unlink()
            with tarfile.open(working) as archive:
                archive.extractall(folder, filter='data')
            if git('-C', folder, 'status', '--porcelain', '--untracked-files=normal') != dirty:
                raise ValueError('Original working files/status do not restore')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    run = root / 'runs/instruction-effects' / args.run
    manifest = json.loads((run / 'manifest.json').read_text())
    events = read_jsonl(run / 'events.jsonl')
    usage = read_jsonl(run / 'usage.jsonl')
    verified = []
    for path in sorted((run / 'tasks').glob('task-*/attempts/b*/attempt-*/infrastructure-incident.json')):
        folder = path.parent
        identity = dict(task_id=folder.parents[2].name,
                        builder_id=folder.parent.name, attempt_id=folder.name)
        # A live recovery receipt may appear before its attempt-finished event.
        # Audit only closed originals, without claiming all live requests close.
        if not any(e['kind'] == 'attempt_finished' and
                   all(e.get(k) == v for k, v in identity.items()) for e in events):
            continue
        incident = json.loads(path.read_text())
        selected = [u for u in usage if all(u.get(k) == v for k, v in identity.items())]
        receipt = terminal_attempt_evidence(run, selected, events, identity, manifest['pricing'])
        for key, value in receipt.items():
            if incident.get(key) != value:
                raise ValueError('Incident receipt changed: ' + str(path) + ': ' + key)
        checkpoint = run / 'builders' / identity['builder_id'] / 'checkpoints' / (
            identity['task_id'] + '-' + identity['attempt_id'])
        index = json.loads((checkpoint / 'index.json').read_text())
        if index['checksums'] != incident['archive_checksums']:
            raise ValueError('Original committed archive binding changed')
        for base, hashes in [(folder, incident['native_export_sha256']),
                             (checkpoint, incident['archive_checksums'])]:
            for name, sha in hashes.items():
                if hashlib.sha256((base / name).read_bytes()).hexdigest() != sha:
                    raise ValueError('Original archive hash changed: ' + name)
        native = json.loads((folder / 'native-git.json').read_text())
        if native['head'] != incident['submission'] or native['tree'] != index['source_tree']:
            raise ValueError('Native/committed original identity mismatch')
        restore(checkpoint / 'history.bundle', index['source_commit'], index['source_tree'])
        restore(folder / 'native-history.bundle', native['head'], native['tree'],
                folder / 'native-working-tree.tar.gz', native['dirty'])
        verified.append(dict(**identity, source_commit=native['head'], source_tree=native['tree'],
                             restored_original_history=True, restored_native_history=True,
                             restored_native_working_tree=True, restored_native_dirty_status=True,
                             archive_checksums=incident['archive_checksums'],
                             native_export_sha256=incident['native_export_sha256'],
                             unknown_native_request_ids=receipt['unknown_native_request_ids']))
    result = dict(utc=timestamp(), verified=True, incidents=verified,
                  scope='Closed original incidents only; no missing counters inferred',
                  verifier_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    output = run / 'preflight/incident-audits'
    output.mkdir(parents=True, exist_ok=True)
    path = output / ('verified-' + digest_json(result)[:16] + '.json')
    path.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(verified=True, incidents=len(verified), evidence=str(path))))


if __name__ == '__main__':
    main()
