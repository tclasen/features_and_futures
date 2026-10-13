"""Serialize PM ledger writers and retain the exact retirement input ledger."""
import datetime
import fcntl
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

run = Path('runs/instruction-effects/eval-016')
ledger = Path('.local/eval016-native-owned-resource-ledger001.json')
sha = lambda data: hashlib.sha256(data).hexdigest()
with Path('.local/eval016-ledger-reconciliation.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    before = ledger.read_bytes()
    tracker = run / 'preflight/track-owned-resources003.py'
    verifier = run / 'preflight/verify-retired-resources001.py'
    tracking = json.loads(subprocess.check_output(['python3', '-B', str(tracker)], text=True))
    retirement_input = ledger.read_bytes()
    retirement = json.loads(subprocess.check_output(['python3', '-B', str(verifier)], text=True))
    proof_path = Path(retirement['evidence'])
    retired = json.loads(proof_path.read_text())
    assert retired['verified'] and retired['ledger_input_sha256'] == sha(retirement_input)
    input_resources = json.loads(retirement_input)['resources']
    assert all(c['sandbox'] in input_resources and not input_resources[c['sandbox']]['present'] for c in retired['checks'])
    after = ledger.read_bytes()
    after_resources = json.loads(after)['resources']
    assert all(after_resources[c['sandbox']]['retirement_verified'] for c in retired['checks'])
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    out = run / 'preflight' / ('resource-reconciliation-serial004-' + stamp)
    out.mkdir()
    for filename, data in [('ledger-before.json', before), ('ledger-retirement-input.json', retirement_input), ('ledger-after.json', after)]:
        (out / filename).write_bytes(data)
    shutil.copy2(__file__, out / 'executed-controller.py')
    proof = {'verified': True, 'utc': stamp, 'tracking': tracking, 'retirement': retirement,
             'retirement_proof_sha256': sha(proof_path.read_bytes()),
             'controller_sha256': sha(Path(__file__).read_bytes()),
             'tracker_sha256': sha(tracker.read_bytes()), 'retirement_verifier_sha256': sha(verifier.read_bytes()),
             'files': {p.name: sha(p.read_bytes()) for p in out.iterdir()},
             'native_model_calls': 0,
             'scope': 'PM writers executed sequentially under an advisory lock. Exact retirement input ledger retained and hash-bound; all restored resources have inventory absence in that input. No sandbox creation/deletion, native execution or comparison change. Use this wrapper for subsequent combined reconciliations; the lock protects cooperating callers.'}
    (out / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps({'verified': True, 'tracked': tracking['tracked'], 'present': tracking['present'],
                      'retired_resources': retirement['retired_resources'], 'evidence': str(out / 'verified.json'),
                      'tracking_evidence': tracking['evidence'], 'retirement_evidence': retirement['evidence']}))
