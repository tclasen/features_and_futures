"""End-to-end normal/cancel verification of the new trusted PM runner."""
import hashlib
import json
import os
import shutil
import signal
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

base = Path('experiments/instruction-effects/revisions/research-v016/preflight')
output = base / 'pm-sealed-fixture-runner001-verification'
suite = base / 'pm-sealed-fixture-runner001-suite'
assert not output.exists() and not suite.exists()
output.mkdir()
suite.mkdir()
(suite / 'sentinel.txt').write_text('Trusted PM process fixture only; no browser or model tests.\n')
shutil.copy2(__file__, output / 'executed-controller.py')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
runner = base / 'pm-sealed-fixture-runner001.py'
helper = base / 'pm-owned-group-quiescence001.py'
before = {str(p): sha(p) for p in [runner, helper]}
checks = []
active = None
try:
    for style in ['normal', 'cancel']:
        namespace = 'pm-quiescence-runner-' + style + '001'
        controller = base / (namespace + '-fixture.mjs')
        inputs = base / (namespace + '-inputs.json')
        assert not controller.exists() and not inputs.exists()
        source = "import {mkdir,writeFile,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';\n"
        source += 'const folder=' + json.dumps(str(base / (namespace + '-check-'))) + "+Date.now();await mkdir(folder);await writeFile(folder+'/executed-controller.mjs',await readFile(import.meta.filename));\n"
        if style == 'normal':
            source += "await writeFile(folder+'/verified.json',JSON.stringify({verified:true,model_calls:0,scope:'PM runner control only'}));\n"
        else:
            worker = base / 'pm-owned-group-quiescence001-verification/worker.py'
            assert worker.exists()
            source += 'spawn("python3",[' + json.dumps(str(worker)) + ',folder],{stdio:"inherit"});setInterval(()=>{},100);\n'
        controller.write_text(source)
        inputs.write_text(json.dumps({'controller_sha256': sha(controller),
            'suite_files': {'sentinel.txt': sha(suite / 'sentinel.txt')}, 'model_calls': 0}, indent=2) + '\n')
        args = ['python3', '-B', '-m', 'experiments.instruction-effects.revisions.research-v016.preflight.pm-sealed-fixture-runner001',
                '--namespace', namespace, '--controller', str(controller), '--inputs', str(inputs), '--suite', str(suite)]
        active = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if style == 'cancel':
            deadline = time.monotonic() + 10
            while not list(base.glob(namespace + '-check-*/worker-ready')) and time.monotonic() < deadline:
                assert active.poll() is None
                time.sleep(.02)
            assert list(base.glob(namespace + '-check-*/worker-ready'))
            os.kill(active.pid, signal.SIGINT)
        stdout, stderr = active.communicate(timeout=20)
        code = active.returncode
        active = None
        (output / (style + '-stdout.log')).write_text(stdout)
        (output / (style + '-stderr.log')).write_text(stderr)
        folders = list(base.glob(namespace + '-check-*'))
        batches = list(base.glob(namespace + '-batch-*'))
        assert len(folders) == len(batches) == 1
        folder, batch = folders[0], batches[0]
        closure = json.loads((folder / 'input-closure.json').read_text())
        retired = json.loads((batch / 'retirement.json').read_text())
        assert retired['process_group_absence_verified']
        assert all(sha(folder / name) == value for name, value in closure['files'].items())
        assert closure['retirement_sha256'] == sha(batch / 'retirement.json')
        if style == 'normal':
            assert code == closure['exit_code'] == 0
            assert json.loads((batch / 'verified.json').read_text())['verified']
        else:
            assert code != 0 and closure['exit_code'] != 0
            assert (folder / 'cleanup-finished').exists() and not (folder / 'transient.bin').exists()
            assert 'transient.bin' not in closure['files']
            assert json.loads((batch / 'failure.json').read_text())['error']['type'] == 'KeyboardInterrupt'
        checks.append({'style': style, 'exit_code': code, 'closure_consistent': True,
                       'process_group_absent': True, 'folder': str(folder), 'batch': str(batch)})
    assert all(sha(Path(name)) == value for name, value in before.items())
    (output / 'verified.json').write_text(json.dumps({'verified': True,
        'utc': datetime.now(timezone.utc).isoformat(), 'native_model_calls': 0,
        'sandbox_resources_created': 0, 'owned_process_groups_left': 0,
        'source_sha256': before, 'controller_sha256': sha(Path(__file__)), 'checks': checks,
        'scope': 'Actual normal and cancellation paths of new trusted PM runner only. No builder, browser behavior, native lifecycle or recovery of old missing trace bytes claimed.'}, indent=2) + '\n')
    print(json.dumps({'verified': True, 'checks': 2, 'owned_process_groups_left': 0}))
finally:
    if active is not None:
        # Stop the owned wrapper through its cleanup path, never an unrelated PID.
        os.kill(active.pid, signal.SIGINT)
        active.communicate(timeout=20)
