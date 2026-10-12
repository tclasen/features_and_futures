"""Clarify retrospective tracking versus newly live resources and bind restoration."""
import datetime, hashlib, json, uuid
from pathlib import Path
r = Path('runs/instruction-effects/eval-016')
tracking = r / 'preflight/resource-reconciliation-20261012T184923545816Z/verified.json'
restoration = r / 'preflight/retired-resources-20261012T184949658101Z/verified.json'
t = json.loads(tracking.read_text()); v = json.loads(restoration.read_text())
retrospective = [x for x in t['discovered'] if not x['currently_present']]
new_live = [x for x in t['discovered'] if x['currently_present']]
assert len(retrospective) == 12 and len(new_live) == 10 and len(v['checks']) == 187
assert {x['sandbox'] for x in retrospective} <= {x['sandbox'] for x in v['checks']}
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L060', 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm', 'status': 'verified',
          'scope': 'eval016 resource ledger reconciliation002 and independent retirement restoration',
          'observation': 'The22new ledger entries comprise12already-retired sandboxes missed between inventory polls and10newly live sandboxes since the previous poll. All12retrospective entries are now covered by187independently rehashed archive/database restoration checks. Original173subset proof is retained.',
          'root_cause': 'Inventory-only sampling missed12short-lived historical resources. The other10entries are ordinary new live discoveries, not missed retirements; initial adoption caption22historical entries must not be interpreted as22missed retirements.',
          'prevention': 'Use tracker002 creation/retirement record reconciliation on each refresh; preserve original ledger snapshots and separate historical reconciliation from newly live inventory. Keep archive restoration independently verified.',
          'caption_correction': 'Original001producer and user-facing11/11split failed an assertion before journaling. Actual preserved reconciliation binds12retired and10present; original failed controller retained in resource-reconciliation-count-correction001.', 'verification': {'retrospective_retired_entries': 12, 'newly_live_entries': 10, 'restored_retired_resources': 187, 'inputs_sha256': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (tracking, restoration)}},
          'comparison_policy': 'PM operational tracking correction only; no native exposure or frozen comparison changes.', 'evidence': [str(tracking), str(restoration)]}
with Path('lessons/records.jsonl').open('a') as journal: journal.write(json.dumps(record, sort_keys=True) + '\n')
with (r / 'decisions/lessons-applied.md').open('a') as decisions: decisions.write('\nL060 clarification and restoration verification:22new ledger names comprise12retired resources missed between polls and10ordinary newly live resources. All12retrospective names now covered by187independent archive/SQLite restorations. Prior173subset proof preserved; tracker002 reconciliation remains adopted.\n')
print(json.dumps({'recorded': True, 'missed_retired_resources': 12, 'newly_live_resources': 10, 'restored_retired_resources': 187}))
