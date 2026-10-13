"""Verify a retained nonterminal native response independently of builder outcomes."""
import datetime, hashlib, importlib.util, json, shutil, uuid
from pathlib import Path

root = Path.cwd()
run = root / 'runs/instruction-effects/eval-016'
folder = run / 'tasks/task-021/attempts/b004/attempt-095'
out = run / 'preflight/incident004'
assert not out.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
incident = json.loads((folder / 'infrastructure-incident.json').read_text())
rid = '938b886e-8066-4522-828e-eb5ed9c9b496'
assert incident['unknown_native_request_ids'] == [rid]
assert not incident['builder_assessment_performed'] and not incident['native_accounting_complete']
coverage = incident['terminal_request_coverage']
assert coverage['complete_run_request_coverage'] and not coverage['problems']
assert coverage['dispatched_requests'] == coverage['usage_records'] == coverage['finished_events'] == 7
for request, hashes in incident['raw_hashes'].items():
    assert sha(folder / 'requests' / (request + '.request.json')) == hashes['request']
    assert sha(folder / 'requests' / (request + '.response.raw')) == hashes['response']
for name, digest in incident['native_export_sha256'].items():
    assert sha(folder / name) == digest
usage = list(map(json.loads, (run / 'usage.jsonl').read_text().splitlines()))
receipts = [u for u in usage if u['request_id'] in incident['request_ids']]
assert len(receipts) == 7 and len({u['request_id'] for u in receipts}) == 7
missing = next(u for u in receipts if u['request_id'] == rid)
assert missing['counts'] is missing['cost'] is missing['usage'] is None
assert missing['status'] == 200 and missing['outcome'] == 'missing-terminal-usage'
raw = folder / 'requests' / (rid + '.response.raw')
assert missing['response_sha256'] == sha(raw)
types = [line[7:] for line in raw.read_text().splitlines() if line.startswith('event: ')]
assert types == ['response.created', 'response.in_progress', 'response.output_item.added']
events = list(map(json.loads, (run / 'events.jsonl').read_text().splitlines()))
retained = [e for e in events if e.get('builder_id') == 'b004' and e.get('task_id') == 'task-021' and e.get('attempt_id') == 'attempt-095' and e['kind'] == 'infrastructure_attempt_retained']
starts = [e for e in events if e.get('builder_id') == 'b004' and e.get('task_id') == 'task-021' and e.get('attempt_id') == 'attempt-096' and e['kind'] == 'attempt_started']
assert len(retained) == len(starts) == 1
assert retained[0]['unknown_native_request_ids'] == [rid]
native = json.loads((folder / 'native-git.json').read_text())
checkpoint = run / 'builders/b004/checkpoints/task-021-attempt-095'
index = json.loads((checkpoint / 'index.json').read_text())
assert index['source_commit'] == native['head'] == incident['submission'] == starts[0]['pre_commit']
assert index['source_tree'] == native['tree']
assert retained[0]['packet_sha256'] == starts[0]['packet_sha256']
assert all(sha(checkpoint / name) == digest for name, digest in index['checksums'].items())
spec = importlib.util.spec_from_file_location('originals', root / 'scripts/verify-retained-originals.py')
originals = importlib.util.module_from_spec(spec)
spec.loader.exec_module(originals)
originals.restore(checkpoint / 'history.bundle', native['head'], native['tree'])
originals.restore(folder / 'native-history.bundle', native['head'], native['tree'], folder / 'native-working-tree.tar.gz', native['dirty'])
out.mkdir()
shutil.copy2(__file__, out / 'executed-controller.py')
(out / 'observed-events.jsonl').write_text('\n'.join(json.dumps(e, sort_keys=True) for e in [retained[0], starts[0]]) + '\n')
proof = {'verified': True, 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'builder_id': 'b004', 'task_id': 'task-021', 'attempt_id': 'attempt-095', 'request_id': rid, 'raw_request_pairs_verified': 7, 'observed_native_event_types': types, 'http_status': 200, 'native_usage_outcome': missing['outcome'], 'raw_response_bytes': raw.stat().st_size, 'raw_response_sha256': sha(raw), 'original_native_and_publication_histories_restored': True, 'same_packet_retry_started': 'attempt-096', 'retry_outcome': 'pending', 'broader_cause': 'unknown', 'cost_point_estimate': None, 'upper_bound_usd': None, 'native_model_calls': 0, 'controller_sha256': sha(Path(__file__)), 'evidence': {str(p.relative_to(root)): sha(p) for p in [folder / 'infrastructure-incident.json', folder / 'native-history.bundle', folder / 'native-working-tree.tar.gz', folder / 'native-git.json', checkpoint / 'index.json', raw]}, 'scope': 'Native response has initial events but no terminal event or counters. HTTP 200 does not establish complete accounting. Same-task fresh-context retry has started; no builder defect, transport root cause or behavioral recovery inferred. Closed020 publication still has three unknowns; subsequent run accounting includes this fourth unknown.'}
(out / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L026', 'utc': proof['utc'], 'author': 'pm', 'status': 'observed', 'scope': 'eval016 task021 b004 attempt095', 'observation': 'Fourth missing native receipt: HTTP200 raw response contains response.created, response.in_progress and response.output_item.added but no terminal event/counters. Seven original raw pairs verified; native and publication histories independently restored. Same-packet attempt096 starts from retained commit.', 'root_cause': 'Nonterminal native response and missing counters confirmed; deeper stream/provider/transport cause unknown. This differs from earlier literal connection-refused responses.', 'prevention': 'Retain raw failures and unknown intervals under the frozen incident policy. Verify terminal usage independently of HTTP status and keep fresh-context recovery separate from original missing accounting.', 'verification': {'proof': str((out / 'verified.json').relative_to(root)), 'sha256': sha(out / 'verified.json'), 'retry_outcome': 'pending'}, 'comparison_policy': 'Observation and existing frozen recovery only. No criteria, accounting rules, models, instructions, feedback or stopping changes. Three unknowns remain correct for closed020; later accounting has four.', 'evidence': [str((out / 'verified.json').relative_to(root)), str((folder / 'infrastructure-incident.json').relative_to(root))]}
with (root / 'lessons/records.jsonl').open('a') as journal:
    journal.write(json.dumps(record, sort_keys=True) + '\n')
with (run / 'decisions/lessons-applied.md').open('a') as decisions:
    decisions.write('\nL026 incident004: HTTP200 returned only nonterminal native events; one receipt has no counters. Seven original raw pairs and native/publication histories verified, same-packet attempt096 started; its outcome remains pending. Deeper cause unknown; original missing usage stays unknown. Closed020 has three unknowns and later run accounting includes this fourth. Evidence: preflight/incident004/verified.json. No comparison change.\n')
print(json.dumps({'verified': True, 'raw_request_pairs': 7, 'missing_native_receipts': 1, 'same_packet_retry_started': 'attempt-096', 'retry_outcome': 'pending'}))
