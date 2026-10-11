"""Verify completed owned-sandbox retirements without touching live resources."""
import hashlib
import json
import subprocess
from pathlib import Path
from orchestrator.evidence import digest_json, timestamp
from orchestrator.prepare import write_json

run = Path('runs/instruction-effects/eval-011')
inventory = subprocess.check_output(['sbx', 'list'], text=True)
names = {line.split()[0] for line in inventory.splitlines() if line.split()}
rows = []
for path in sorted(run.glob('tasks/task-*/attempts/*/attempt-*/resource-retirement.json')):
    raw = path.read_bytes()
    record = json.loads(raw)
    if record['status'] != 'removed':
        continue  # In-progress retirements remain owned by the coordinator.
    name = record['sandbox']
    assert name.startswith('ff-eval-011-') and name not in names, name
    checkpoint = Path(record['checkpoint'])
    assert checkpoint.resolve().is_relative_to(run.resolve())
    for filename, expected in record['archive_checksums'].items():
        assert hashlib.sha256((checkpoint/filename).read_bytes()).hexdigest() == expected
    for filename, expected in record['data_checksums'].items():
        assert hashlib.sha256((path.parent/filename).read_bytes()).hexdigest() == expected
    rows.append({'sandbox': name, 'retirement_record': str(path),
                 'record_sha256': hashlib.sha256(raw).hexdigest(),
                 'archived_history_and_data_checksums_verified': True,
                 'absent_from_runtime_inventory': True})
assert rows
record = {'utc': timestamp(), 'verified': True, 'retirements': rows,
          'owned_inventory': [line for line in inventory.splitlines()
                              if line.split() and line.split()[0].startswith('ff-eval-011-')],
          'scope': 'Completed removed records only; live source sandboxes and evaluation deployments retained. No runtime mutation or unrelated resource cleanup.',
          'controller_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
output = run/'preflight/resource-audits'/('verified-'+digest_json(record)[:16]+'.json')
write_json(output, record)
print(json.dumps({'verified_retirements': len(rows), 'owned_live_or_retained': len(record['owned_inventory']), 'output': str(output)}))
