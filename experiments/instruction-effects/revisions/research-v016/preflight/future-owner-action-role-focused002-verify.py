"""Independently check closed owner-control positives and genuine defect variants."""
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

base = Path('experiments/instruction-effects/revisions/research-v016/preflight')
stem = 'future-owner-action-role-focused002'
folders = list(base.glob(stem + '-check-*'))
batches = list(base.glob(stem + '-batch-*'))
assert len(folders) == len(batches) == 1
folder, batch = folders[0], batches[0]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
closure = read(folder / 'input-closure.json')
assert closure['exit_code'] == closure['model_calls'] == 0
assert all(sha(folder / name) == value for name, value in closure['files'].items())
batch_proof = read(batch / 'verified.json')
assert batch_proof['verified'] and batch_proof['model_calls'] == 0
assert batch_proof['evidence'] == str(folder)
assert batch_proof['input_closure_sha256'] == sha(folder / 'input-closure.json')
inputs = read(base / (stem + '-inputs.json'))
controller = base / (stem + '-fixture.mjs')
assert inputs['controller_sha256'] == sha(controller) == sha(folder / 'executed-controller.mjs')
batch_inputs = read(batch / 'inputs.json')
assert batch_inputs['controller_sha256'] == sha(controller)
assert batch_inputs['prepared_sha256'] == sha(base / (stem + '-inputs.json'))
assert closure['batch_inputs_sha256'] == sha(batch / 'inputs.json')
suite = base / 'task040-action-role-suite'
assert inputs['suite_files'] == batch_inputs['suite_files'] == {
    str(p.relative_to(suite)): sha(p) for p in suite.rglob('*') if p.is_file()}
faults = ['owner-action-missing', 'owner-action-duplicate', 'archive39-archive-noop',
          'archive39-all-owners', 'default-action-missing', 'default-action-duplicate',
          'default40-noop', 'default40-all-owners']
names = {'positive-' + role for role in ['button', 'link']}
names |= {'fault-' + role + '-' + fault for role in ['button', 'link'] for fault in faults}
rows = read(folder / 'progress.json')
assert len(rows) == 18 and {row['name'] for row in rows} == names
producer = read(folder / 'verified.json')
assert producer['verified'] and producer['model_calls'] == 0 and producer['results'] == rows
checks = []
for row in rows:
    report = folder / row['name'] / 'results.json'
    stats = read(report)['stats']
    positive = row['name'].startswith('positive-')
    assert stats == row['statistics'] and row['phase'] == 'acceptance'
    assert stats['skipped'] == stats['flaky'] == 0
    assert (row['exit'] == 0) == positive
    assert stats['expected'] == (8 if positive else 0)
    assert stats['unexpected'] == (0 if positive else 1)
    checks.append({'name': row['name'], 'positive': positive, 'report_sha256': sha(report)})
proof = {'verified': True, 'utc': datetime.now(timezone.utc).isoformat(),
         'native_model_calls': 0, 'positive_cases': 16, 'genuine_fault_variants': 16,
         'total_discriminating_cases': 32, 'checks': checks,
         'verifier_sha256': sha(Path(__file__)), 'controller_sha256': sha(controller),
         'files': {str(p): sha(p) for directory in [folder, batch] for p in directory.rglob('*') if p.is_file()},
         'scope': 'Future039/040 form-navigation owner controls only. Original empty-selection failure001 retained; broader render and actual native lifecycle gates remain separate.'}
output = base / (stem + '-independent')
assert not output.exists()
output.mkdir()
shutil.copy2(__file__, output / 'executed-verifier.py')
(output / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({'verified': True, 'positive_cases': 16, 'genuine_fault_variants': 16}))
