"""Reconcile dispatched inference requests with usage and terminal events."""
import argparse
import json
from collections import Counter
from pathlib import Path
from .evidence import digest_bytes, digest_json
from .prepare import ROOT, file_hashes, write_json


def reconcile(events, records, terminal):
    starts = [event for event in events if event['kind'] == 'inference_request_started']
    finishes = [event for event in events if event['kind'] == 'inference_request_finished']
    groups = {'dispatch': starts, 'usage': records, 'finish': finishes}
    problems = []
    for name, items in groups.items():
        for rid, count in Counter(item['request_id'] for item in items).items():
            if count != 1:
                problems.append(f'{rid}: duplicate {name} records')
    dispatch = {item['request_id']: item for item in starts}
    usage = {item['request_id']: item for item in records}
    finish = {item['request_id']: item for item in finishes}
    for rid in sorted(set(usage) | set(finish)):
        if rid not in dispatch:
            problems.append(rid+': no dispatch event')
        if rid in finish and rid not in usage:
            problems.append(rid+': terminal event without usage record')
    for rid in sorted(set(dispatch) & set(usage)):
        before, row = dispatch[rid], usage[rid]
        for key in ('experiment_id','experiment_revision','project_id','project_revision','run_id','builder_id','task_id','attempt_id','model','provider','clock_id'):
            if before.get(key) != row.get(key):
                problems.append(rid+': dispatch/usage attribution mismatch: '+key)
        if before['monotonic_ns'] != row['started_monotonic_ns'] or row['ended_monotonic_ns'] < row['started_monotonic_ns']:
            problems.append(rid+': invalid native-request timing boundary')
        if rid in finish:
            after = finish[rid]
            if after['monotonic_ns'] < row['ended_monotonic_ns'] or after.get('clock_id') != row.get('clock_id'):
                problems.append(rid+': invalid terminal timing boundary')
            for key in ('builder_id','task_id','attempt_id','model','provider'):
                if after.get(key) != row.get(key):
                    problems.append(rid+': terminal attribution mismatch: '+key)
    awaiting_receipt = sorted(set(dispatch)-set(usage))
    awaiting_finish = sorted(set(dispatch)-set(finish))
    if terminal:
        problems.extend(rid+': terminal run missing usage' for rid in awaiting_receipt)
        problems.extend(rid+': terminal run missing finish event' for rid in awaiting_finish)
    return {'dispatched_requests': len(starts), 'usage_records': len(records), 'finished_events': len(finishes),
            'awaiting_usage_request_ids': awaiting_receipt, 'awaiting_finish_request_ids': awaiting_finish,
            'problems': problems, 'complete_run_request_coverage': terminal and not problems and bool(starts) and not awaiting_receipt and not awaiting_finish}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', default='pilot-005')
    args = parser.parse_args()
    run = ROOT/'runs/instruction-effects'/args.run
    # Retry only a concurrently appended snapshot; never restart the pilot.
    for _ in range(10):
        event_bytes = (run/'events.jsonl').read_bytes()
        usage_bytes = (run/'usage.jsonl').read_bytes()
        state_bytes = (run/'state.json').read_bytes()
        if event_bytes == (run/'events.jsonl').read_bytes() and usage_bytes == (run/'usage.jsonl').read_bytes() and state_bytes == (run/'state.json').read_bytes():
            break
    else:
        raise RuntimeError('Unable to read a stable evidence snapshot; retry this audit')
    events = [json.loads(line) for line in event_bytes.splitlines() if line]
    records = [json.loads(line) for line in usage_bytes.splitlines() if line]
    state = json.loads(state_bytes)
    manifest_bytes = (run/'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    report = reconcile(events, records, state['status'] in ('completed', 'superseded', 'aborted'))
    report.update({'schema_version': 1, 'state': state['status'], 'audit_module_sha256': digest_bytes(Path(__file__).read_bytes()),
                   'inputs': {'events_sha256': digest_bytes(event_bytes), 'usage_sha256': digest_bytes(usage_bytes), 'state_sha256': digest_bytes(state_bytes), 'manifest_file_sha256': digest_bytes(manifest_bytes)},
                   'limitations': ['Request linkage complements native-receipt validation; it cannot reconstruct hidden usage.', 'Pending request IDs in a live run are unresolved, not zero-cost calls.']})
    if digest_json(manifest) != (run/'manifest.sha256').read_text().strip():
        report['problems'].append('Frozen manifest hash mismatch')
    if file_hashes(run/'definitions') != manifest['provenance']['definition_hashes']:
        report['problems'].append('Frozen definition hash mismatch')
    if manifest['execution'].get('task_stream_revision')=='append-only-rounds-v1':
        from .task_stream import task_stream,stream_input_hash
        manifest['tasks']=task_stream(run,manifest)
        report['inputs']['task_stream_input_sha256']=stream_input_hash(run)
    for task in manifest['tasks']:
        if digest_bytes((run/'tasks'/task['task_id']/'packet.md').read_bytes()) != task['packet_sha256']:
            report['problems'].append('Frozen packet hash mismatch: '+task['task_id'])
    report['complete_run_request_coverage'] = report['complete_run_request_coverage'] and not report['problems']
    output = run/'reports'/('request-coverage-'+digest_json(report)[:16]+'.json')
    write_json(output, report)
    print(json.dumps({k: report[k] for k in ('state','dispatched_requests','usage_records','finished_events','complete_run_request_coverage','problems')}))
    print(str(output))
    if report['problems']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
