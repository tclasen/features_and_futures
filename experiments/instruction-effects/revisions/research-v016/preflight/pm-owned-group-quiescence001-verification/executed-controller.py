"""Actual zero-inference regression for late descendant artifact cleanup."""
import hashlib
import importlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

base = Path('experiments/instruction-effects/revisions/research-v016/preflight')
helper_path = base / 'pm-owned-group-quiescence001.py'
helper = importlib.import_module('experiments.instruction-effects.revisions.research-v016.preflight.pm-owned-group-quiescence001')
output = base / 'pm-owned-group-quiescence001-verification'
assert not output.exists()
output.mkdir()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
shutil.copy2(__file__, output / 'executed-controller.py')
shutil.copy2(helper_path, output / 'executed-helper.py')
# The coordinator exits immediately on TERM; its descendant finishes cleanup
# later. This mirrors the observed inventory/cleanup ordering defect only.
worker_source = '''import signal,sys,time
from pathlib import Path
folder=Path(sys.argv[1])
def finish(signum,frame):
 time.sleep(1)
 (folder/'transient.bin').unlink()
 (folder/'cleanup-finished').write_text('done')
 raise SystemExit(0)
signal.signal(signal.SIGTERM,finish)
(folder/'transient.bin').write_bytes(b'PM-only incomplete artifact bytes')
(folder/'worker-ready').write_text('ready')
while True:time.sleep(.05)
'''
parent_source = '''import subprocess,sys,time
from pathlib import Path
folder=Path(sys.argv[1]);subprocess.Popen([sys.executable,str(folder.parent/'worker.py'),str(folder)])
while not (folder/'worker-ready').exists():time.sleep(.01)
(folder/'parent-ready').write_text('ready')
while True:time.sleep(.05)
'''
(output / 'worker.py').write_text(worker_source)
(output / 'parent.py').write_text(parent_source)
observations = []
active = []
try:
    for style in ['coordinator-only', 'owned-group-quiescent']:
        folder = output / style
        folder.mkdir()
        with (folder / 'terminal.log').open('w') as log:
            child = subprocess.Popen([sys.executable, str(output / 'parent.py'), str(folder)],
                                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            active.append(child)
            deadline = time.monotonic() + 10
            while not (folder / 'parent-ready').exists() and time.monotonic() < deadline:
                assert child.poll() is None
                time.sleep(.02)
            assert (folder / 'parent-ready').exists()
            if style == 'coordinator-only':
                os.killpg(child.pid, signal.SIGTERM)
                child.wait(timeout=10)
                assert helper.group_exists(child.pid)
                inventory = {'transient.bin': sha(folder / 'transient.bin')}
                deadline = time.monotonic() + 10
                while helper.group_exists(child.pid) and time.monotonic() < deadline:
                    time.sleep(.05)
                assert not helper.group_exists(child.pid)
                assert (folder / 'cleanup-finished').exists()
                assert not (folder / 'transient.bin').exists()
                observations.append({'style': style, 'original_inventory': inventory,
                    'inventory_became_incomplete': True, 'owned_process_group_absent': True})
            else:
                retired = helper.retire_owned_group(child)
                assert retired['process_group_absence_verified']
                assert (folder / 'cleanup-finished').exists()
                assert not (folder / 'transient.bin').exists()
                inventory = {str(p.relative_to(folder)): sha(p) for p in folder.rglob('*') if p.is_file()}
                time.sleep(.1)
                assert all(sha(folder / name) == value for name, value in inventory.items())
                observations.append({'style': style, 'retired': retired,
                    'sealed_after_cleanup': True, 'inventory_stable': True})
            active.remove(child)
    result = {'verified': True, 'utc': datetime.now(timezone.utc).isoformat(),
              'native_model_calls': 0, 'sandbox_resources_created': 0,
              'controller_sha256': sha(Path(__file__)), 'helper_sha256': sha(helper_path),
              'checks': observations, 'owned_process_groups_left': 0,
              'scope': 'Actual trusted PM toy process groups reproduce late cleanup and verify quiescent inventory ordering. Old unavailable transient trace bytes remain unavailable. Active full fixture sources unchanged; future PM runner adoption separate.'}
    (output / 'verified.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'verified': True, 'checks': 2, 'owned_process_groups_left': 0}))
except BaseException as error:
    (output / 'failure.json').write_text(json.dumps({'retained': True, 'type': type(error).__name__,
        'message': str(error), 'native_model_calls': 0}, indent=2) + '\n')
    raise
finally:
    for child in active:
        helper.retire_owned_group(child)
