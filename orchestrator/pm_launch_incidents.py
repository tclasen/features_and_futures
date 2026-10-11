"""Verify explicit pre-inference PM launch failures without manufacturing receipts."""
import json
from .evidence import digest_bytes


def verify(run, events, usage, identity):
    same = lambda row: all(row.get(k) == v for k, v in identity.items())
    selected = [e for e in events if same(e)]
    assert not any(same(row) for row in usage), 'Launch incident cannot contain model calls'
    assert not any(e['kind'].startswith('inference_request_') or e['kind'] in
                   ('validation_started', 'attempt_rejected', 'task_accepted') for e in selected)
    markers = [e for e in selected if e['kind'] == 'pm_launch_attempt_retained']
    assert len(markers) == 1
    folder = run / 'tasks' / identity['task_id'] / 'attempts' / identity['builder_id'] / identity['attempt_id']
    path = folder / 'pm-launch-incident.json'
    assert digest_bytes(path.read_bytes()) == markers[0]['incident_sha256']
    incident = json.loads(path.read_text())
    assert incident['failure'] == 'native-prompt-argv-E2BIG' and incident['model_requests_observed'] == 0
    assert (folder / 'harness.stderr.log').read_bytes() == b'exec: Argument list too long\n'
    assert (folder / 'harness.stdout.jsonl').read_bytes() == b''
    for name, checksum in incident['original_file_sha256'].items():
        assert digest_bytes((folder / name).read_bytes()) == checksum
    singleton = lambda kind: next(e for e in selected if e['kind'] == kind)
    for kind in ('attempt_started', 'harness_returned', 'attempt_finished', 'submission_observed'):
        assert sum(e['kind'] == kind for e in selected) == 1
    assert singleton('harness_returned')['exit_code'] == singleton('attempt_finished')['exit_code'] == 1
    native = json.loads((folder / 'native-git.json').read_text())
    assert singleton('attempt_started')['pre_commit'] == singleton('submission_observed')['commit'] == native['head']
    assert native['tree'] == singleton('submission_observed')['tree'] and not native['dirty']
    checkpoint = run / 'builders' / identity['builder_id'] / 'checkpoints' / (identity['task_id'] + '-' + identity['attempt_id'])
    index = json.loads((checkpoint / 'index.json').read_text())
    assert index['source_commit'] == native['head'] and index['source_tree'] == native['tree']
    for name, checksum in index['checksums'].items():
        assert digest_bytes((checkpoint / name).read_bytes()) == checksum
    original = run / incident['feedback_source']
    assert digest_bytes(original.read_bytes()) == incident['feedback_sha256']
    assert (folder / 'feedback.json').read_bytes() == original.read_bytes()
    evidence = run.parents[2] / incident['transport_equivalence_evidence']
    assert digest_bytes(evidence.read_bytes()) == incident['transport_equivalence_sha256']
    assert json.loads(evidence.read_text())['verified'] is True
    return {'identity': identity, 'incident_sha256': markers[0]['incident_sha256'],
            'model_requests_observed': 0, 'model_delivery': 'not performed',
            'original_timing_retained': True, 'builder_assessment_performed': False}
