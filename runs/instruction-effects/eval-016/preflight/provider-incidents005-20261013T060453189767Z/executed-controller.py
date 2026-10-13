"""Snapshot and independently verify completed infrastructure incidents only."""
import argparse, datetime, hashlib, importlib.util, json, shutil, uuid
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--after', type=int, required=True)
args = parser.parse_args()
root = Path.cwd()
run = root / 'runs/instruction-effects/eval-016'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
events = list(map(json.loads, (run / 'events.jsonl').read_text().splitlines()))
all_incidents = [e for e in events if e['kind'] == 'infrastructure_attempt_retained']
assert 4 <= args.after < len(all_incidents)
selected = all_incidents[args.after:]
usage = list(map(json.loads, (run / 'usage.jsonl').read_text().splitlines()))
spec = importlib.util.spec_from_file_location('originals', root / 'scripts/verify-retained-originals.py')
originals = importlib.util.module_from_spec(spec)
spec.loader.exec_module(originals)
checks = []
for sequence, event in enumerate(selected, start=args.after + 1):
    builder, task, attempt = [event[k] for k in ('builder_id', 'task_id', 'attempt_id')]
    folder = run / 'tasks' / task / 'attempts' / builder / attempt
    incident_path = folder / 'infrastructure-incident.json'
    incident = json.loads(incident_path.read_text())
    assert not incident['builder_assessment_performed'] and not incident['native_accounting_complete']
    coverage = incident['terminal_request_coverage']
    assert coverage['complete_run_request_coverage'] and not coverage['problems']
    assert coverage['dispatched_requests'] == coverage['usage_records'] == coverage['finished_events'] == len(incident['request_ids'])
    assert event['request_ids'] == incident['request_ids']
    assert event['unknown_native_request_ids'] == incident['unknown_native_request_ids']
    receipts = [u for u in usage if u['request_id'] in incident['request_ids']]
    assert len(receipts) == len(incident['request_ids']) == len({u['request_id'] for u in receipts})
    assert all((u['builder_id'], u['task_id'], u['attempt_id']) == (builder, task, attempt) for u in receipts)
    assert {u['request_id'] for u in receipts if u['counts'] is None} == set(incident['unknown_native_request_ids'])
    for receipt in receipts:
        rid = receipt['request_id']
        assert sha(folder / 'requests' / (rid + '.request.json')) == receipt['request_sha256'] == incident['raw_hashes'][rid]['request']
        assert sha(folder / 'requests' / (rid + '.response.raw')) == receipt['response_sha256'] == incident['raw_hashes'][rid]['response']
    unknown = []
    for rid in incident['unknown_native_request_ids']:
        receipt = next(u for u in receipts if u['request_id'] == rid)
        assert receipt['counts'] is receipt['cost'] is None
        raw_path = folder / 'requests' / (rid + '.response.raw')
        raw = raw_path.read_bytes()
        types, errors = [], []
        for line in raw.decode('utf-8', errors='replace').splitlines():
            if line.startswith('event: '):
                types.append(line[7:])
            if line.startswith('data: '):
                try:
                    data = json.loads(line[6:])
                except ValueError:
                    continue
                if data.get('type') == 'response.failed':
                    response = data.get('response', {})
                    errors.append({'error': response.get('error'), 'usage': response.get('usage')})
        unknown.append({'request_id': rid, 'http_status': receipt['status'], 'native_usage_outcome': receipt['outcome'], 'raw_bytes': len(raw), 'response_sha256': sha(raw_path), 'native_event_types': types, 'native_failure_records': errors, 'literal_upstream_connect_error': b'upstream connect error' in raw, 'literal_connection_refused': b'Connection refused' in raw})
    native = json.loads((folder / 'native-git.json').read_text())
    checkpoint = run / 'builders' / builder / 'checkpoints' / (task + '-' + attempt)
    index = json.loads((checkpoint / 'index.json').read_text())
    assert (native['head'], native['tree']) == (index['source_commit'], index['source_tree'])
    assert incident['submission'] == native['head']
    assert index['checksums'] == incident['archive_checksums']
    assert all(sha(checkpoint / name) == digest for name, digest in index['checksums'].items())
    assert event['native_export_sha256'] == incident['native_export_sha256']
    assert all(sha(folder / name) == digest for name, digest in incident['native_export_sha256'].items())
    originals.restore(checkpoint / 'history.bundle', native['head'], native['tree'])
    originals.restore(folder / 'native-history.bundle', native['head'], native['tree'], folder / 'native-working-tree.tar.gz', native['dirty'])
    checks.append({'incident_sequence': sequence, 'event_id': event['event_id'], 'builder_id': builder, 'task_id': task, 'attempt_id': attempt, 'request_pairs': len(receipts), 'unknown_requests': unknown, 'head': native['head'], 'tree': native['tree'], 'native_and_publication_originals_restored': True, 'index_sha256': sha(checkpoint / 'index.json'), 'incident_sha256': sha(incident_path), 'archive_checksums': index['checksums'], 'native_export_sha256': incident['native_export_sha256'], 'broader_provider_cause': 'unknown', 'builder_defect_inferred': False})
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
out = run / ('preflight/provider-incidents005-' + stamp)
assert not out.exists()
out.mkdir()
shutil.copy2(__file__, out / 'executed-controller.py')
(out / 'observed-events.jsonl').write_text('\n'.join(json.dumps(e, sort_keys=True) for e in selected) + '\n')
proof = {'verified': True, 'after_incident_sequence': args.after, 'through_incident_sequence': len(all_incidents), 'checks': checks, 'controller_sha256': sha(Path(__file__)), 'restore_verifier_sha256': sha(root / 'scripts/verify-retained-originals.py'), 'native_model_calls': 0, 'scope': 'Completed retained infrastructure incidents at this event snapshot only. Native raw pairs and both original histories independently verified. Missing usage stays unknown; provider failure messages describe the response, not a deeper causal diagnosis. Recovery attempts and live work are excluded.'}
(out / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L026', 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm', 'status': 'observed', 'scope': 'eval016 retained provider incidents ' + str(args.after + 1) + ' through ' + str(len(all_incidents)), 'observation': 'Verified completed native incident records, every raw request pair and both original source histories. Native failed-stream messages and event types retained in proof; unknown usage remains unknown.', 'root_cause': 'Missing counters and recorded native failure messages confirmed. Deeper provider/transport cause unknown; no builder assessment or zero-token inference.', 'prevention': 'Use frozen retained-terminal-incidents-v1 recovery and accounting intervals. Verify each completed incident independently before publication; retain original and retry evidence separately.', 'verification': {'proof': str((out / 'verified.json').relative_to(root)), 'sha256': sha(out / 'verified.json')}, 'comparison_policy': 'PM evidence verification only; no model calls, native instrumentation, failure policy, instruction, acceptance, pricing or stopping change.', 'evidence': [str((out / 'verified.json').relative_to(root))]}
with (root / 'lessons/records.jsonl').open('a') as journal:
    journal.write(json.dumps(record, sort_keys=True) + '\n')
with (run / 'decisions/lessons-applied.md').open('a') as decisions:
    decisions.write('\nL026 retained provider incidents verified through sequence ' + str(len(all_incidents)) + ': completed raw request pairs and native/publication histories independently restored; missing counters remain unknown and deeper causes unestablished. Recovery outcomes remain separate. Evidence: ' + str((out / 'verified.json').relative_to(run)) + '. PM verification only; no comparison change.\n')
print(json.dumps({'verified': True, 'new_incidents_verified': len(checks), 'through_incident_sequence': len(all_incidents), 'new_unknown_receipts': sum(len(c['unknown_requests']) for c in checks), 'evidence': str(out.relative_to(root))}))
