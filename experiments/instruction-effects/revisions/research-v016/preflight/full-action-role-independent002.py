"""Verify closed cumulative role fixtures, never substituting synthetic restart probes."""
import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--stage', type=int, choices=[30, 40], required=True)
parser.add_argument('--folder', type=Path, required=True)
parser.add_argument('--batch', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
base = Path('experiments/instruction-effects/revisions/research-v016/preflight')
stem = 'task030-action-role-full003' if args.stage == 30 else 'task040-action-role-broader003'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
assert args.folder.parent == args.batch.parent == args.output.parent == base
assert args.folder.name.startswith(stem + '-check-')
assert args.batch.name.startswith(stem + '-batch-')
assert not args.output.exists()
closure = read(args.folder / 'input-closure.json')
assert closure['exit_code'] == closure['model_calls'] == 0
assert all(sha(args.folder / name) == value for name, value in closure['files'].items())
batch_proof = read(args.batch / 'verified.json')
assert batch_proof['verified'] and batch_proof['model_calls' if args.stage == 30 else 'native_model_calls'] == 0
if args.stage == 40:
    retirement = read(args.batch / 'retirement.json')
    assert batch_proof['process_group_absence_verified']
    assert closure['retirement_sha256'] == sha(args.batch / 'retirement.json')
assert batch_proof['evidence'] == str(args.folder)
assert batch_proof['input_closure_sha256'] == sha(args.folder / 'input-closure.json')
inputs = read(base / (stem + '-inputs.json'))
controller = base / (stem + '-fixture.mjs')
assert inputs['controller_sha256'] == sha(controller) == sha(args.folder / 'executed-controller.mjs')
batch_inputs = read(args.batch / 'inputs.json')
assert batch_inputs['controller_sha256'] == sha(controller)
assert batch_inputs['prepared_sha256'] == sha(base / (stem + '-inputs.json'))
assert closure['batch_inputs_sha256'] == sha(args.batch / 'inputs.json')
suite = base / ('task030-action-role-suite' if args.stage == 30 else 'task040-action-role-suite003')
assert inputs['suite_files'] == batch_inputs['suite_files'] == {
    str(p.relative_to(suite)): sha(p) for p in suite.rglob('*') if p.is_file()
}
variants = ['form-reload-reset', 'async-reload-reset', 'fetch-reload-reset',
            'form-restore-retain-archived', 'form-reload-reset-restore-active']
if args.stage == 30:
    variants = ['async', 'form', 'fetch'] + variants
names = {'positive-' + role + '-' + variant for role in ['button', 'link'] for variant in variants}
phases = ['postrestart', 'observation-' + str(args.stage)]
expected_names = names | {name + '-' + phase for name in names for phase in phases}
rows = read(args.folder / 'progress.json')
producer = read(args.folder / 'verified.json')
assert producer['verified'] and producer['model_calls'] == 0 and producer['results'] == rows
assert len(rows) == len(expected_names) and {row['name'] for row in rows} == expected_names
checks = []
for row in rows:
    report = args.folder / row['name'] / 'results.json'
    stats = read(report)['stats']
    cumulative = row['name'] in names
    assert row['exit'] == 0 and row['statistics'] == stats
    assert stats['unexpected'] == stats['skipped'] == stats['flaky'] == 0
    assert stats['expected'] == ((99 if args.stage == 30 else 140) if cumulative else 1)
    assert row['phase'] == ('acceptance' if cumulative else next(p for p in phases if row['name'].endswith('-' + p)))
    if args.stage == 40 and cumulative:
        if 'reload-reset' in row['name']:
            assert row['resetObservations'] > 0
        if '-restore-' in row['name']:
            assert row['asyncRestoreObservations'] > 0
    checks.append({'name': row['name'], 'cases': stats['expected'], 'report_sha256': sha(report)})
proof = {'verified': True, 'utc': datetime.now(timezone.utc).isoformat(),
         'native_model_calls': 0, 'stage': args.stage, 'cumulative_variants': len(names),
         'cumulative_cases': len(names) * (99 if args.stage == 30 else 140),
         'process_local_probe_cases': len(names) * 2, 'checks': checks,
         'controller_sha256': sha(controller), 'verifier_sha256': sha(Path(__file__)),
         'files': {str(p): sha(p) for folder in [args.folder, args.batch] for p in folder.rglob('*') if p.is_file()},
         'scope': 'Closed synthetic role/render fixtures only. Process-local probes are not actual restarts; native original upgrade/restart and directed fault evidence remain separate.'}
args.output.mkdir()
shutil.copy2(__file__, args.output / 'executed-verifier.py')
(args.output / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({key: proof[key] for key in ['verified', 'stage', 'cumulative_cases', 'process_local_probe_cases']}))
