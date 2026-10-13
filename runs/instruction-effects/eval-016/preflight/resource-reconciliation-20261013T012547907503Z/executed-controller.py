"""Reconcile actual creation/retirement records as well as the live owned inventory."""
import datetime, hashlib, json, shutil, subprocess, uuid
from pathlib import Path
run = Path('runs/instruction-effects/eval-016')
lp = Path('.local/eval016-native-owned-resource-ledger001.json')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
original = lp.read_bytes()
d = json.loads(original)
now = datetime.datetime.now(datetime.timezone.utc)
owned = [x for x in json.loads(subprocess.check_output(['sbx','ls','--json'], text=True))['sandboxes'] if x['name'].startswith('ff-eval-016-')]
present = {x['name'] for x in owned}
discovered = []
records = list(run.glob('tasks/*/attempts/*/*/deployment-process.json')) + list(run.glob('tasks/*/attempts/*/*/resource-retirement.json'))
for p in records:
    data = json.loads(p.read_text()); name = data['sandbox']
    assert name.startswith('ff-eval-016-app-')
    new = name not in d['resources']
    item = d['resources'].setdefault(name, {'first_recorded_utc': now.isoformat(), 'discovery': 'retained_native_resource_record'})
    item.setdefault('native_resource_records', {})[str(p)] = sha(p)
    if p.name == 'resource-retirement.json':
        item.update(recorded_retirement_status=data['status'], recorded_retirement_utc=data.get('completed_utc'))
    if new: discovered.append({'sandbox': name, 'record': str(p), 'record_sha256': sha(p), 'currently_present': name in present})
for x in owned:
    item = d['resources'].setdefault(x['name'], {'first_observed_utc': now.isoformat()})
    item.update(last_observed_utc=now.isoformat(), inventory=x, present=True)
for name,item in d['resources'].items():
    if name not in present: item.update(present=False, last_absence_observed_utc=now.isoformat())
d.update(last_inventory_utc=now.isoformat(), present_count=len(owned), resources_left_behind=sorted(present),
         tracking_revision='inventory-plus-native-records-v3-caption-clarification', retained_image='features-and-futures-builder:pilot-v002; needed by active native run')
out = run / 'preflight' / ('resource-reconciliation-' + now.strftime('%Y%m%dT%H%M%S%fZ'))
out.mkdir(); (out / 'previous-ledger.json').write_bytes(original)
(out / 'owned-inventory.json').write_text(json.dumps(owned, indent=2) + '\n')
shutil.copy2(__file__, out / 'executed-controller.py')
proof = {'verified': True, 'utc': now.isoformat(), 'discovered': discovered, 'tracked_resources': len(d['resources']), 'present_resources': len(present),
         'resource_record_count': len(records), 'previous_ledger_sha256': sha(out / 'previous-ledger.json'), 'owned_inventory_sha256': sha(out / 'owned-inventory.json'),
         'controller_sha256': sha(Path(__file__)), 'native_model_calls': 0,
         'scope': 'Owned inventory plus retained native deployment and retirement records. First registration may cover currently present or previously removed resources; presence is recorded separately. No resource deletion or native behavior change; archive restoration is verified separately.'}
(out / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
lp.write_text(json.dumps(d, indent=2) + '\n')
if discovered:
    record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L060', 'utc': now.isoformat(), 'author': 'pm', 'status': 'adopted',
              'scope': 'eval016 PM sandbox ownership reconciliation',
              'observation': f'Reconciliation registered {len(discovered)} additional actual native resource names: {sum(x["currently_present"] for x in discovered)} present and {sum(not x["currently_present"] for x in discovered)} absent at the recorded inventory. Original ledger retained; first registration does not by itself establish a missed historical poll.',
              'root_cause': 'Resources may be first registered from current inventory or retained creation/retirement records. Inventory alone can miss short-lived resources; classification is recorded separately.',
              'prevention': 'Use tracking003 to include actual native deployment and retirement records on every refresh, with registration/presence counts reported separately. Independently restore newly covered retired archives; never infer resource creation from planned names or prune other threads.',
              'verification': proof['scope'], 'comparison_policy': 'PM operational ledger only; original inventory subset verifications remain valid. No treatment, task, acceptance, measurement or native execution change.',
              'evidence': [str(out / 'verified.json'), str(out / 'previous-ledger.json')]}
    with Path('lessons/records.jsonl').open('a') as journal: journal.write(json.dumps(record, sort_keys=True) + '\n')
    with (run / 'decisions/lessons-applied.md').open('a') as decisions: decisions.write(f'\nL060 resource ledger reconciliation: registered {len(discovered)} additional names ({sum(x['currently_present'] for x in discovered)} present and {sum(not x['currently_present'] for x in discovered)} absent at recorded inventory); original ledger retained and tracker003 adopts actual deployment/retirement records plus complete current owned inventory. Prior173 retirement restorations remain subset proofs; newly covered archives require independent verification. No comparison change.\n')
print(json.dumps({'tracked': len(d['resources']), 'present': len(present), 'newly_registered_names': len(discovered), 'newly_registered_present': sum(x['currently_present'] for x in discovered), 'newly_registered_absent': sum(not x['currently_present'] for x in discovered), 'evidence': str(out)}))
