"""PM-only terminal archive publication; preserves superseded-run status."""
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
parser.add_argument('action', choices=('scan', 'publish'))
args = parser.parse_args()
repo = Path.cwd()
run = repo/'runs/instruction-effects/eval-013'
output = run/'preflight/terminal-index-verification-002'
scan_path = repo/'.local'/'eval014-terminal-publication-scan.json'
clone = repo/'.local'/'eval014-terminal-publication-snapshot'
def git(*values, cwd=repo):
    return subprocess.check_output(['git', '-C', str(cwd), *values], text=True).strip()
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
if args.action == 'scan':
    assert json.loads((repo/'runs/instruction-effects/eval-014/preflight/preparation/final-adoption.json').read_text())['native_dispatch_ready']
    verified = json.loads((output/'verified.json').read_text())
    assert verified['verified'] and len(verified['archives']) == 83 and len(verified['refs']) == 166 and not clone.exists()
    for row in verified['archives']:
        assert sha(repo/row['index']) == row['index_sha256']
    assert json.loads((run/'state.json').read_text())['status'] == 'superseded'
    target = git('rev-parse', 'HEAD')
    # The native coordinator owns this live state file. Scan the exact committed
    # clone; refuse unrelated edits without pretending the live state is frozen.
    changes = git('diff', '--name-only', 'HEAD').splitlines()
    assert not changes, changes
    assert json.loads(git('show', target+':'+str((output/'verified.json').relative_to(repo)))) == verified
    try:
        subprocess.run(['git', 'clone', '--shared', '--single-branch', '--branch', 'main', '--quiet', str(repo), str(clone)], check=True)
        assert git('rev-parse', 'HEAD', cwd=clone) == target
        refs = dict(verified['refs'])
        for run_id in ('eval-009', 'eval-010', 'eval-011', 'eval-012'):
            paths = git('ls-tree', '-r', '--name-only', target, f'runs/instruction-effects/{run_id}/builders/').splitlines()
            for path in paths:
                if not path.endswith('/index.json'):
                    continue
                index = json.loads(git('show', target+':'+path))
                for ref in index['github_refs']:
                    assert git('rev-parse', ref) == index['source_commit']
                    refs[ref] = index['source_commit']
        assert len(refs) == 2338, len(refs)
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
    write_json(run/'reports'/'publication-terminal.json', {'utc': timestamp(), 'pm_commit': target, 'run_status': 'superseded', 'common_accepted_rounds': 2, 'archives': len(verified['archives']), 'published_refs': len(refs), 'refs': refs, 'remote_verified': True, 'scan_sha256': sha(scan_path), 'scan_status': 'passed'})
    print(json.dumps({'published': target, 'verified_refs': len(refs)}))
