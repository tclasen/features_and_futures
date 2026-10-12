"""Record the observed post-restoration rejection without claiming recovery success."""
import datetime, hashlib, json, shutil, uuid
from pathlib import Path
r = Path('runs/instruction-effects/eval-016')
out = r / 'preflight/task015-recovery-outcome001'
assert not out.exists()
events = list(map(json.loads, (r / 'events.jsonl').read_text().splitlines()))
selected = [e for e in events if e['kind'] == 'attempt_rejected' and e.get('builder_id') == 'b004' and e.get('task_id') == 'task-015' and e.get('attempt_id') == 'attempt-006']
assert len(selected) == 1
e = selected[0]
assert len(e['diagnostics']) == 1 and e['diagnostics'][0]['test'] == '011 seed process-restart persistence checks'
folder = r / 'tasks/task-015/attempts/b004/attempt-006'
assert not json.loads((folder / 'result.json').read_text())['accepted']
out.mkdir()
shutil.copy2(__file__, out / 'executed-controller.py')
(out / 'observed-event.json').write_text(json.dumps(e, indent=2) + '\n')
proof = {'observed': True, 'submission': e['post_commit'], 'native_model_calls': 0,
         'files': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (folder / 'result.json', folder / 'feedback.json', folder / 'native-git.json')},
         'scope': 'Attempt006 after own-checkpoint restoration was rejected at the same due-date seed assertion. Prior archive/restoration verification remains valid; effective implementation recovery is not established.'}
(out / 'observed.json').write_text(json.dumps(proof, indent=2) + '\n')
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L069', 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm', 'status': 'observed',
          'scope': 'eval016 task015 b004 first post-restoration submission',
          'observation': 'Attempt006 was rejected at the same011 due-date seed assertion after a verified own-task014 checkpoint restoration. Archive restoration succeeded; it did not establish effective task015 implementation recovery.',
          'root_cause': 'Visible repeated assertion confirmed; underlying implementation cause unexamined.',
          'prevention': 'Keep control verification separate from behavioral recovery. Continue frozen factual-feedback measured own-builder repairs and shared barriers; retain all exposure.',
          'verification': proof['scope'], 'comparison_policy': 'No comparison, acceptance, policy, instructions or implementation changes by PM.',
          'evidence': [str(out / 'observed.json'), str(out / 'observed-event.json'), str(r / 'preflight/task015-checkpoint-recovery001/verified.json')]}
with Path('lessons/records.jsonl').open('a') as journal: journal.write(json.dumps(record, sort_keys=True) + '\n')
with (r / 'decisions/lessons-applied.md').open('a') as decisions: decisions.write('\nL069 post-restoration outcome: task015 b004attempt006 still fails the same011 due-date seed assertion. Archive/control verification is valid, but effective implementation recovery is not established. Continue unchanged measured repairs; no PM fix or new hint.\n')
print(json.dumps({'recorded': True, 'evidence': str(out)}))
