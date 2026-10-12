"""Record repeated observable failure without inferring an implementation cause."""
import datetime
import hashlib
import json
import shutil
import uuid
from pathlib import Path

run = Path('runs/instruction-effects/eval-016')
out = run / 'preflight/task015-due-recurrence001'
assert not out.exists()
events = list(map(json.loads, (run / 'events.jsonl').read_text().splitlines()))
selected = [e for e in events if e['kind'] == 'attempt_rejected'
            and e.get('task_id') == 'task-015' and e.get('builder_id') == 'b004'
            and e['attempt_id'] in ('attempt-001', 'attempt-002')]
assert len(selected) == 2
checks = []
for event in selected:
    assert event['decision'] == 'correction_in_place'
    assert len(event['diagnostics']) == 1
    case = event['diagnostics'][0]
    assert case['test'] == '011 seed process-restart persistence checks'
    assert any('2028-02-29' in text and 'Received: ""' in text for text in case['errors'])
    folder = run / 'tasks/task-015/attempts/b004' / event['attempt_id']
    checks.append({'attempt_id': event['attempt_id'], 'source_commit': event['post_commit'],
                   'files': {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in (folder / 'feedback.json', folder / 'result.json',
                                       folder / 'native-git.json')}})
assert len({c['source_commit'] for c in checks}) == 2
out.mkdir()
shutil.copy2(__file__, out / 'executed-controller.py')
(out / 'observed-events.json').write_text(json.dumps(selected, indent=2) + '\n')
proof = {'observed': True, 'checks': checks, 'native_model_calls': 0,
         'scope': 'Two distinct rejected sources share one observable acceptance assertion. No implementation cause or recovery verified.'}
(out / 'observed.json').write_text(json.dumps(proof, indent=2) + '\n')
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L069',
          'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm',
          'status': 'observed', 'scope': 'eval016 task015 b004 original and first repair',
          'observation': 'Two distinct source commits fail frozen011 seed-process-restart setup because the expected2028-02-29 due date reads empty. Eleven other builders have completed task015 deployment checks; the common round remains held for a measured own-builder repair.',
          'root_cause': 'The repeated visible date mismatch is confirmed. Underlying mechanism is unexamined; failure occurs in restart seeding, so it does not by itself establish an actual-restart defect.',
          'prevention': 'Retain original attempts and generic reproducible assertion feedback. Keep the declared correction-in-place and five-identical-failures recovery rules; do not supply tailored fixes or relax the cumulative persistence contract.',
          'verification': proof['scope'],
          'comparison_policy': 'No criteria, packet, profile, harness, recovery or measurement changes; no PM source repair or causal treatment finding.',
          'evidence': [str(out / 'observed.json'), str(out / 'observed-events.json')]}
with Path('lessons/records.jsonl').open('a') as journal:
    journal.write(json.dumps(record, sort_keys=True) + '\n')
with (run / 'decisions/lessons-applied.md').open('a') as decisions:
    decisions.write('\nL069 task015 observed: two b004 sources fail the same011 due-date seed assertion. Retain measured originals and generic feedback; hold the common round under unchanged correction/five-identical-failure rules. Failure at seeding does not establish an actual-restart defect, and recovery remains unverified.\n')
print(json.dumps({'recorded': True, 'evidence': str(out), 'record_id': record['record_id']}))
