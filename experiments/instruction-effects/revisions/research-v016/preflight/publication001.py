"""Publish a source-bound prepared run after scanning all canonical retained histories."""
import argparse
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from orchestrator.task_stream import stream_input_hash

parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['scan', 'publish'])
args = parser.parse_args()
repo = Path.cwd()
run = repo / 'runs/instruction-effects/eval-016'
prefix = repo / '.local/eval016-preparation-publication001'
snapshot = Path(str(prefix) + '-snapshot')
scan_path = Path(str(prefix) + '-scan.json')
binding = Path(str(prefix) + '-binding.json')
proof = run / 'preflight/preparation/independently-verified.json'
prior = repo / 'runs/instruction-effects/eval-015/reports/publication-terminal001.json'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def git(*argv, cwd=repo):
    return subprocess.check_output(['git', '-C', str(cwd), *argv], text=True).strip()


def heads():
    return dict((ref, commit) for commit, ref in
                (line.split() for line in git('ls-remote', '--heads', 'origin').splitlines()))


assert json.loads((run / 'state.json').read_text())['status'] == 'prepared'
assert not (run / 'events.jsonl').exists() and not (run / 'usage.jsonl').exists()
assert json.loads(proof.read_text())['verified']
assert json.loads(prior.read_text())['verified']
assert not git('diff', '--name-only', 'HEAD')
if args.action == 'scan':
    assert not snapshot.exists() and not scan_path.exists() and not binding.exists()
    target = git('rev-parse', 'HEAD')
    refs = {}
    for path in git('ls-tree', '-r', '--name-only', target, 'runs/instruction-effects').splitlines():
        parts = Path(path).parts
        if len(parts) != 8 or parts[:2] != ('runs', 'instruction-effects') or parts[3] != 'builders' or parts[5] != 'checkpoints' or parts[7] != 'index.json':
            continue
        item = json.loads(git('show', target + ':' + path))
        sources = dict(line.split(' ', 1) for line in item['source_refs'])
        for ref in item['github_refs']:
            assert ref.startswith('refs/heads/builders/instruction-effects/')
            commit = item['source_commit'] if ref.endswith('/head') else sources['refs/heads/' + ref.split('/branches/', 1)[1]]
            assert git('rev-parse', ref) == commit
            assert ref not in refs or refs[ref] == commit
            refs[ref] = commit
    assert len(refs) == json.loads(prior.read_text())['all_scanned_original_refs']
    for p in (proof, prior):
        assert git('show', target + ':' + str(p.relative_to(repo))) == p.read_text().strip()
    try:
        subprocess.run(['git', 'clone', '--shared', '--single-branch', '--branch', 'main', '--quiet', str(repo), str(snapshot)], check=True, capture_output=True)
        assert git('rev-parse', 'HEAD', cwd=snapshot) == target
        subprocess.run(['git', '-C', str(snapshot), 'update-ref', '--stdin'], input=''.join(f'update {ref} {commit}\n' for ref, commit in refs.items()), text=True, capture_output=True, check=True)
        with scan_path.open('w') as stream:
            subprocess.run(['python3', '-B', str(repo / 'scripts/scan-publication.py'), '--repo', str(snapshot)], stdout=stream, check=True)
        scan = json.loads(scan_path.read_text())
        assert scan['status'] == 'passed' and not scan['findings'] and scan['target_git_commit'] == target
        binding.write_text(json.dumps({'target': target, 'all_scanned_history_refs': refs, 'scan_sha256': sha(scan_path), 'controller_sha256': sha(Path(__file__)), 'manifest_sha256': sha(run / 'manifest.json'), 'preparation_proof_sha256': sha(proof), 'prefix_sha256': stream_input_hash(run), 'prior_publication_sha256': sha(prior), 'scope': 'Prepared fresh eval016 and all canonical retained original histories; no native dispatch or model outcomes.'}, indent=2) + '\n')
        print(json.dumps({'verified': True, 'target': target, 'scanned_original_refs': len(refs)}))
    finally:
        if snapshot.exists():
            shutil.rmtree(snapshot)
else:
    bound = json.loads(binding.read_text())
    target = bound['target']
    scan = json.loads(scan_path.read_text())
    assert not snapshot.exists() and git('rev-parse', 'HEAD') == target
    assert scan['status'] == 'passed' and not scan['findings'] and scan['target_git_commit'] == target
    assert sha(scan_path) == bound['scan_sha256'] and sha(Path(__file__)) == bound['controller_sha256']
    assert sha(run / 'manifest.json') == bound['manifest_sha256'] and sha(proof) == bound['preparation_proof_sha256']
    assert stream_input_hash(run) == bound['prefix_sha256'] and sha(prior) == bound['prior_publication_sha256']
    refs = bound['all_scanned_history_refs']
    assert all(git('rev-parse', ref) == commit for ref, commit in refs.items())
    before = heads()
    assert all(before.get(ref) == commit for ref, commit in refs.items())
    assert subprocess.run(['git', 'merge-base', '--is-ancestor', before['refs/heads/main'], target], capture_output=True).returncode == 0
    subprocess.run(['git', 'push', '--atomic', 'origin', target + ':refs/heads/main'], check=True, capture_output=True, text=True)
    after = heads()
    assert after['refs/heads/main'] == target
    assert all(ref == 'refs/heads/main' or after.get(ref) == commit for ref, commit in before.items())
    assert all(after.get(ref) == commit for ref, commit in refs.items())
    output = run / 'reports/preparation-publication001.json'
    assert not output.exists()
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps({'verified': True, 'utc': datetime.now(timezone.utc).isoformat(), 'target_git_commit': target, 'remote_main': after['refs/heads/main'], 'native_model_calls': 0, 'frozen_rounds': 20, 'all_scanned_history_refs': len(refs), 'prior_remote_heads_unchanged': len(before)-1, 'scan_sha256': sha(scan_path), 'manifest_sha256': bound['manifest_sha256'], 'prefix_sha256': bound['prefix_sha256'], 'controller_sha256': bound['controller_sha256'], 'scope': bound['scope']}, indent=2) + '\n')
    print(json.dumps({'published': target, 'remote_verified': True}))
