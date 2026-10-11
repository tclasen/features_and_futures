"""PM-only closed-prefix archive audit and exact-commit publication."""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from orchestrator.evidence import timestamp
from orchestrator.prepare import write_json

parser = argparse.ArgumentParser()
parser.add_argument('action', choices=('prepare', 'scan', 'publish'))
parser.add_argument('--stage', type=int, required=True)
args = parser.parse_args()
repo = Path.cwd()
run = repo/'runs/instruction-effects/eval-011'
output = run/'preflight/checkpoint-publication'/f'prefix-{args.stage:03d}'
scan_path = repo/'.local'/f'eval011-prefix-{args.stage:03d}-publication-scan.json'
clone = repo/'.local'/f'eval011-prefix-{args.stage:03d}-publication-snapshot'
def git(*values, cwd=repo):
    return subprocess.check_output(['git', '-C', str(cwd), *values], text=True).strip()
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def indexes(base):
    return sorted(base.glob('builders/*/checkpoints/task-*-attempt-*/index.json'))
def selected(path):
    return int(path.parent.name.split('-')[1]) <= args.stage

if args.action == 'prepare':
    assert not output.exists(), 'Never overwrite a publication snapshot'
    for _ in range(10):
        events_raw = (run/'events.jsonl').read_bytes()
        usage_raw = (run/'usage.jsonl').read_bytes()
        if events_raw == (run/'events.jsonl').read_bytes() and usage_raw == (run/'usage.jsonl').read_bytes():
            break
    else:
        raise RuntimeError('Retry a stable evidence snapshot; do not restart the coordinator')
    events = [json.loads(line) for line in events_raw.splitlines()]
    for stage in range(1, args.stage+1):
        task = f'task-{stage:03d}'
        for kind in ('task_accepted', 'post_deployment_checks_passed'):
            rows = [e for e in events if e['kind'] == kind and e.get('task_id') == task]
            assert len(rows) == 12 and len({e['builder_id'] for e in rows}) == 12
        starts = {(e['builder_id'], e['attempt_id']) for e in events if e['kind'] == 'attempt_started' and e.get('task_id') == task}
        ends = {(e['builder_id'], e['attempt_id']) for e in events if e['kind'] == 'attempt_finished' and e.get('task_id') == task}
        assert starts == ends, 'A selected attempt is still live'
    rows = []
    refs = {}
    for path in indexes(run):
        if not selected(path):
            continue
        index = json.loads(path.read_text())
        for name, expected in index['checksums'].items():
            assert sha(path.parent/name) == expected
        with tempfile.TemporaryDirectory(prefix='eval011-publication-restore-') as folder:
            restored = Path(folder)/'original.git'
            git('init', '--bare', '--quiet', str(restored))
            git('fetch', '--quiet', '--no-tags', str(path.parent/'history.bundle'), 'HEAD:refs/heads/original', cwd=restored)
            assert git('rev-parse', 'refs/heads/original', cwd=restored) == index['source_commit']
            assert git('rev-parse', 'refs/heads/original^{tree}', cwd=restored) == index['source_tree']
            git('fsck', '--full', '--no-reflogs', cwd=restored)
            archived = subprocess.check_output(['git', '-C', str(restored), 'archive', '--format=tar', 'refs/heads/original'])
            assert hashlib.sha256(archived).hexdigest() == index['checksums']['committed-source.tar']
        for ref in index['github_refs']:
            assert git('rev-parse', ref) == index['source_commit']
            refs[ref] = index['source_commit']
        rows.append({'index': str(path.relative_to(repo)), 'source_commit': index['source_commit'], 'source_tree': index['source_tree'], 'restored': True})
    output.mkdir()
    (output/'events-snapshot.jsonl').write_bytes(events_raw)
    (output/'usage-snapshot.jsonl').write_bytes(usage_raw)
    write_json(output/'verified.json', {'utc': timestamp(), 'verified': True, 'closed_shared_stage': args.stage, 'archives': rows, 'refs': refs, 'events_sha256': sha(output/'events-snapshot.jsonl'), 'usage_sha256': sha(output/'usage-snapshot.jsonl'), 'scope': 'Original full snapshots at this instant may include later live tasks. Only selected closed rounds are archive/promotion verified; no comparative inspection or inferred counters.'})
    print(json.dumps({'verified': True, 'archives': len(rows), 'refs': len(refs)}))
elif args.action == 'scan':
    verified = json.loads((output/'verified.json').read_text())
    assert verified['verified'] and not clone.exists()
    target = git('rev-parse', 'HEAD')
    # The native coordinator owns this live state file. Scan the exact committed
    # clone; refuse unrelated edits without pretending the live state is frozen.
    changes = git('diff', '--name-only', 'HEAD').splitlines()
    assert set(changes) <= {'runs/instruction-effects/eval-011/state.json'}, changes
    assert json.loads(git('show', target+':'+str((output/'verified.json').relative_to(repo)))) == verified
    try:
        subprocess.run(['git', 'clone', '--shared', '--single-branch', '--branch', 'main', '--quiet', str(repo), str(clone)], check=True)
        assert git('rev-parse', 'HEAD', cwd=clone) == target
        refs = dict(verified['refs'])
        for run_id in ('eval-009', 'eval-010'):
            paths = git('ls-tree', '-r', '--name-only', target, f'runs/instruction-effects/{run_id}/builders/').splitlines()
            for path in paths:
                if not path.endswith('/index.json'):
                    continue
                index = json.loads(git('show', target+':'+path))
                for ref in index['github_refs']:
                    assert git('rev-parse', ref) == index['source_commit']
                    refs[ref] = index['source_commit']
        subprocess.run(['git', '-C', str(clone), 'update-ref', '--stdin'], input=''.join(f'update {r} {s}\n' for r, s in refs.items()), text=True, capture_output=True, check=True)
        with scan_path.open('w') as stream:
            subprocess.run(['python3', '-B', str(repo/'scripts/scan-publication.py'), '--repo', str(clone)], stdout=stream, check=True)
        scan = json.loads(scan_path.read_text())
        assert scan['status'] == 'passed' and scan['target_git_commit'] == target
        print(json.dumps({'verified': True, 'target': target, 'reachable_history_refs': len(refs)}))
    finally:
        if clone.exists():
            shutil.rmtree(clone)
else:
    verified = json.loads((output/'verified.json').read_text())
    scan = json.loads(scan_path.read_text())
    assert scan['status'] == 'passed' and not clone.exists()
    target = scan['target_git_commit']
    assert git('rev-parse', 'HEAD') == target
    refs = verified['refs']
    assert all(git('rev-parse', ref) == commit for ref, commit in refs.items())
    subprocess.run(['git', 'push', '--atomic', 'origin', target+':refs/heads/main', *[f'{commit}:{ref}' for ref, commit in refs.items()]], check=True, capture_output=True, text=True)
    remote = dict(line.split()[::-1] for line in git('ls-remote', 'origin', 'refs/heads/main', *refs).splitlines())
    assert remote['refs/heads/main'] == target and all(remote.get(ref) == commit for ref, commit in refs.items())
    write_json(run/'reports'/f'publication-prefix-{args.stage:03d}.json', {'utc': timestamp(), 'pm_commit': target, 'closed_shared_stage': args.stage, 'archives': len(verified['archives']), 'published_refs': len(refs), 'refs': refs, 'remote_verified': True, 'scan_sha256': sha(scan_path), 'scan_status': 'passed'})
    print(json.dumps({'published': target, 'verified_refs': len(refs)}))
