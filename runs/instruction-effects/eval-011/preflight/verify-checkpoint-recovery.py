"""Independently restore one rejected archive and verify its own recovery target."""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from orchestrator.evidence import digest_json, timestamp
from orchestrator.prepare import write_json

p = argparse.ArgumentParser()
p.add_argument('--task', type=int, required=True)
p.add_argument('--builder', required=True)
p.add_argument('--attempt', type=int, required=True)
a = p.parse_args()
assert a.builder in {f'b{i:03d}' for i in range(1, 13)} and a.task > 1 and a.attempt > 0
run = Path('runs/instruction-effects/eval-011')
task, attempt = f'task-{a.task:03d}', f'attempt-{a.attempt:03d}'
root = run/'tasks'/task/'attempts'/a.builder/attempt
record = json.loads((root/'repository-recovery.json').read_text())
checkpoint = run/'builders'/a.builder/'checkpoints'/f'{task}-{attempt}-before-restore'
for name, expected in record['archive_checksums'].items():
    assert hashlib.sha256((checkpoint/name).read_bytes()).hexdigest() == expected
assert hashlib.sha256((root/'recovery-before-restore/native-working-tree.tar.gz').read_bytes()).hexdigest() == record['native_working_tree_sha256']
metadata = json.loads((root/'recovery-before-restore/native-git.json').read_text())
assert metadata['head'] == record['pre_commit'] and metadata['tree'] == record['pre_tree']
with tempfile.TemporaryDirectory(prefix='eval011-recovery-verify-') as folder:
    restored = Path(folder)/'original.git'
    subprocess.run(['git', 'init', '--bare', '--quiet', str(restored)], check=True)
    subprocess.run(['git', '-C', str(restored), 'fetch', '--quiet', '--no-tags', str(checkpoint.resolve()/'history.bundle'), 'HEAD:refs/heads/original'], check=True)
    for ref, expected in [('refs/heads/original', record['pre_commit']), ('refs/heads/original^{tree}', record['pre_tree'])]:
        assert subprocess.check_output(['git', '-C', str(restored), 'rev-parse', ref], text=True).strip() == expected
    subprocess.run(['git', '-C', str(restored), 'fsck', '--full', '--no-reflogs'], check=True, capture_output=True)
events = [json.loads(line) for line in (run/'events.jsonl').read_text().splitlines()]
prior = [e for e in events if e['kind'] == 'task_accepted' and e.get('builder_id') == a.builder and int(e['task_id'].split('-')[1]) < a.task]
accepted = max(prior, key=lambda e: int(e['task_id'].split('-')[1]))
assert accepted['commit'] == record['post_commit'] and accepted['tree'] == record['post_tree']
result = {'utc': timestamp(), 'verified': True, 'task_id': task, 'builder_id': a.builder,
          'attempt_id': attempt, 'recovery': record, 'own_accepted_target': accepted,
          'rejected_history_restored': True, 'archive_and_native_working_tree_hashes_verified': True,
          'controller_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'scope': 'Recovery archive and own target only; later task acceptance not claimed.'}
output = run/'preflight/repair-observations'/f'recovery-verified-{digest_json(result)[:16]}.json'
write_json(output, result)
print(json.dumps({'verified': True, 'output': str(output)}))
