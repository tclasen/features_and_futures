"""Reusable trusted PM fixture runner with owned-group quiescent sealing.

Use through python -B -m and a new namespace. Existing executed fixture
controllers remain unchanged. Independently verify its closure before staging.
"""
import argparse
import hashlib
import importlib
import json
import re
import shutil
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--namespace', required=True)
parser.add_argument('--controller', type=Path, required=True)
parser.add_argument('--inputs', type=Path, required=True)
parser.add_argument('--suite', type=Path, required=True)
args = parser.parse_args()
base = Path('experiments/instruction-effects/revisions/research-v016/preflight')
assert re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*', args.namespace)
assert args.controller.parent == args.inputs.parent == args.suite.parent == base
assert args.controller.suffix == '.mjs'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
inputs = json.loads(args.inputs.read_text())
assert inputs['controller_sha256'] == sha(args.controller)
suite_files = {str(p.relative_to(args.suite)): sha(p) for p in args.suite.rglob('*') if p.is_file()}
assert inputs['suite_files'] == suite_files
helper = importlib.import_module('experiments.instruction-effects.revisions.research-v016.preflight.pm-owned-group-quiescence001')
helper_path = base / 'pm-owned-group-quiescence001.py'
before = set(base.glob(args.namespace + '-check-*'))
batch = base / (args.namespace + '-batch-' + str(time.time_ns()))
batch.mkdir()
shutil.copy2(__file__, batch / 'executed-controller.py')
shutil.copy2(helper_path, batch / 'executed-quiescence-helper.py')
write(batch / 'inputs.json', {'controller_sha256': sha(args.controller),
    'prepared_sha256': sha(args.inputs), 'suite_files': suite_files,
    'quiescence_helper_sha256': sha(helper_path), 'native_model_calls': 0})
error = None
with (batch / 'stdout.log').open('wb') as stdout, (batch / 'stderr.log').open('wb') as stderr:
    child = subprocess.Popen(['node', str(args.controller)], stdout=stdout,
                             stderr=stderr, start_new_session=True)
    write(batch / 'process.json', {'owned_process_group': child.pid, 'pid': child.pid})
    try:
        code = child.wait()
    except BaseException as exc:
        error = {'type': type(exc).__name__, 'message': str(exc)}
    # Coordinator exit alone does not prove its group stopped touching traces.
    # This control covers its owned group; detached descendants need separate
    # ownership tracking and are never inferred absent from this check.
    retirement = helper.retire_owned_group(child)
    code = retirement['exit_code']
write(batch / 'retirement.json', retirement)
assert sha(helper_path) == sha(batch / 'executed-quiescence-helper.py')
assert sha(args.controller) == inputs['controller_sha256']
created = set(base.glob(args.namespace + '-check-*')) - before
assert len(created) <= 1
folder = created.pop() if created else None
if folder:
    assert sha(folder / 'executed-controller.mjs') == sha(args.controller)
    write(folder / 'input-closure.json', {'exit_code': code, 'model_calls': 0,
        'controller_sha256': sha(args.controller), 'batch_inputs_sha256': sha(batch / 'inputs.json'),
        'retirement_sha256': sha(batch / 'retirement.json'),
        'files': {str(p.relative_to(folder)): sha(p) for p in folder.rglob('*') if p.is_file()},
        'scope': 'Trusted PM fixture inventory after owned-group quiescence; no native builder execution.'})
if error or code or folder is None:
    write(batch / 'failure.json', {'retained': True, 'exit_code': code, 'error': error,
        'evidence': str(folder) if folder else None, 'native_model_calls': 0})
    raise SystemExit(code or 1)
proof = json.loads((folder / 'verified.json').read_text())
assert proof['verified'] and proof['model_calls'] == 0
write(batch / 'verified.json', {'verified': True, 'evidence': str(folder),
    'input_closure_sha256': sha(folder / 'input-closure.json'),
    'process_group_absence_verified': True, 'native_model_calls': 0})
print(json.dumps({'verified': True, 'evidence': str(folder), 'batch': str(batch)}))
