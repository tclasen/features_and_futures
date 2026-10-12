"""Preserve observed whitespace failures without prescribing builder repairs."""
import datetime
import hashlib
import json
import shutil
import uuid
from pathlib import Path

run = Path('runs/instruction-effects/eval-016')
out = run / 'preflight/task014-whitespace001'
assert not out.exists()
events = [json.loads(line) for line in (run / 'events.jsonl').read_text().splitlines()]
failed = [e for e in events if e['kind'] == 'attempt_rejected'
          and e.get('task_id') == 'task-014' and e['attempt_id'] == 'attempt-001'
          and e['builder_id'] in ('b004', 'b011')]
assert {e['builder_id'] for e in failed} == {'b004', 'b011'}
checks = []
for event in failed:
    assert event['decision'] == 'correction_in_place'
    cases = {d['test'] for d in event['diagnostics']}
    assert any(t.startswith('050 ') for t in cases)
    assert any(t.startswith('051 ') for t in cases)
    folder = run / 'tasks/task-014/attempts' / event['builder_id'] / 'attempt-001'
    checks.append({'builder_id': event['builder_id'], 'tests': sorted(cases),
                   'source_commit': event['post_commit'],
                   'files': {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in (folder / 'feedback.json', folder / 'result.json',
                                       folder / 'native-git.json')}})
out.mkdir()
(out / 'observed-events.json').write_text(json.dumps(failed, indent=2) + '\n')
shutil.copy2(__file__, out / 'executed-controller.py')
proof = {'observed': True, 'checks': checks, 'native_model_calls': 0,
         'scope': 'Original behavior failures only. Implementation cause and recovery remain unverified.'}
(out / 'observed.json').write_text(json.dumps(proof, indent=2) + '\n')
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L055',
          'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm',
          'status': 'observed', 'scope': 'eval016 task014 b004/b011 whitespace search',
          'observation': 'Two original submissions fail both frozen050 task whitespace matching and051 project whitespace matching. b004 also fails existing046/047 search intersections. Their source and factual feedback remain archived; native correction-in-place repairs are measured separately.',
          'root_cause': 'Failed public behavior confirmed; implementation mechanism and shared cause unexamined. Earlier L055 whitespace failures are separate historical observations, not pooled treatment evidence.',
          'prevention': 'Keep frozen whitespace and intersection checks, generic factual feedback, original source/history and exposure. Builders implement their own repairs; hold the common round until all deployment checks pass.',
          'verification': proof['scope'],
          'comparison_policy': 'No acceptance, instruction, recovery, workload or measurement change; no causal finding or PM implementation repair.',
          'evidence': [str(out / 'observed.json'), str(out / 'observed-events.json')]}
with Path('lessons/records.jsonl').open('a') as journal:
    journal.write(json.dumps(record, sort_keys=True) + '\n')
with (run / 'decisions/lessons-applied.md').open('a') as decisions:
    decisions.write('\nL055 task014 observation: b004/b011 original submissions fail frozen task/project whitespace matching, with b004 search-intersection regressions also retained. Preserve original evidence and native measured repairs under unchanged correction-in-place policy; implementation causes and recovery remain unverified. PM source changes: zero.\n')
print(json.dumps({'recorded': True, 'evidence': str(out), 'record_id': record['record_id']}))
