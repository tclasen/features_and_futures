"""Clarify retrospective tracking versus newly live resources and bind restoration."""
import datetime, hashlib, json, uuid
from pathlib import Path
r = Path('runs/instruction-effects/eval-016')
tracking = r / 'preflight/resource-reconciliation-20261012T184923545816Z/verified.json'
restoration = r / 'preflight/retired-resources-20261012T184949658101Z/verified.json'
t = json.loads(tracking.read_text()); v = json.loads(restoration.read_text())
retrospective = [x for x in t['discovered'] if not x['currently_present']]
new_live = [x for x in t['discovered'] if x['currently_present']]
assert len(retrospective) == len(new_live) == 11 and len(v['checks']) == 187
assert {x['sandbox'] for x in retrospective} <= {x['sandbox'] for x in v['checks']}
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L060', 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm', 'status': 'verified',
          'scope': 'eval016 resource ledger reconciliation002 and independent retirement restoration',
          'observation': 'The22new ledger entries comprise11already-retired sandboxes missed between inventory polls and11newly live sandboxes since the previous poll. All11retrospective entries are now covered by187independently rehashed archive/database restoration checks. Original173subset proof is retained.',
          'root_cause': 'Inventory-only sampling missed11short-lived historical resources. The other11entries are ordinary new live discoveries, not missed retirements; initial adoption caption22historical entries must not be interpreted as22missed retirements.',
          'prevention': 'Use tracker002 creation/retirement record reconciliation on each refresh; preserve original ledger snapshots and separate historical reconciliation from newly live inventory. Keep archive restoration independently verified.',
          'verification': {'retrospective_retired_entries': 11, 'newly_live_entries': 11, 'restored_retired_resources': 187, 'inputs_sha256': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (tracking, restoration)}},
          'comparison_policy': 'PM operational tracking correction only; no native exposure or frozen comparison changes.', 'evidence': [str(tracking), str(restoration)]}
with Path('lessons/records.jsonl').open('a') as journal: journal.write(json.dumps(record, sort_keys=True) + '\n')
with (r / 'decisions/lessons-applied.md').open('a') as decisions: decisions.write('\nL060 clarification and restoration verification:22new ledger names comprise11retired resources missed between polls and11ordinary newly live resources. All11retrospective names now covered by187independent archive/SQLite restorations. Prior173subset proof preserved; tracker002 reconciliation remains adopted.\n')
print(json.dumps({'recorded': True, 'missed_retired_resources': 11, 'newly_live_resources': 11, 'restored_retired_resources': 187}))
