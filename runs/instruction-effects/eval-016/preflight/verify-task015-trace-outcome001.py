"""Bind one observed UI race and subsequent measured acceptance to original evidence."""
import datetime, hashlib, json, shutil, tarfile, uuid, zipfile
from pathlib import Path
r = Path('runs/instruction-effects/eval-016')
out = r / 'preflight/task015-trace-outcome001'
assert not out.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
trace = next((r / 'tasks/task-015/attempts/b004/attempt-007').rglob('trace.zip'))
with zipfile.ZipFile(trace) as z:
    actions = [json.loads(line) for n in z.namelist() if n.endswith('.trace') for line in z.read(n).decode().splitlines()]
    fill = next(a for a in actions if a.get('class') == 'Frame' and a.get('method') == 'fill' and a.get('params', {}).get('value') == '2028-02-29')
    click = next(a for a in actions if a.get('class') == 'Frame' and a.get('method') == 'click' and 'Save due date' in a.get('params', {}).get('selector', '') and a['startTime'] > fill['startTime'])
    logs = [a for a in actions if a.get('callId') == click['callId'] and a.get('type') == 'log']
    assert any('detached from the DOM' in a['message'] for a in logs)
    networks = [json.loads(line)['snapshot'] for n in z.namelist() if n.endswith('.network') for line in z.read(n).decode().splitlines()]
    saved = []
    for n in networks:
        request = n['request']; data = request.get('postData', {}); f = data.get('_file')
        body = json.loads(z.read(f)) if f and data.get('mimeType') == 'application/json' else None
        if request['method'] == 'PATCH' and isinstance(body, dict) and 'dueDate' in body and n['_monotonicTime'] > click['startTime']:
            saved.append({'monotonic_time': n['_monotonicTime'], 'body': body, 'status': n['response']['status']})
    assert saved and saved[0]['body'] == {'dueDate': ''} and saved[0]['status'] == 200
frontend = {}
for name in ('public/app.js', 'public/index.html', 'public/styles.css'):
    hashes = []
    for attempt in (7, 8):
        archive = r / f'builders/b004/checkpoints/task-015-attempt-{attempt:03d}/committed-source.tar'
        with tarfile.open(archive) as t: hashes.append(hashlib.sha256(t.extractfile(name).read()).hexdigest())
    assert hashes[0] == hashes[1]
    frontend[name] = hashes[0]
events = list(map(json.loads, (r / 'events.jsonl').read_text().splitlines()))
accepted = [e for e in events if e.get('task_id') == 'task-015' and e.get('builder_id') == 'b004' and e.get('attempt_id') == 'attempt-008' and e['kind'] in ('task_accepted', 'post_deployment_checks_passed')]
assert {e['kind'] for e in accepted} == {'task_accepted', 'post_deployment_checks_passed'}
assert any(e['kind'] == 'round_completed' and e.get('task_id') == 'task-015' for e in events)
result = r / 'tasks/task-015/attempts/b004/attempt-008/result.json'
assert json.loads(result.read_text())['accepted']
out.mkdir(); shutil.copy2(__file__, out / 'executed-controller.py')
proof = {'verified': True, 'trace_sha256': sha(trace), 'fill': fill, 'click': click, 'click_logs': logs, 'date_patch': saved[0],
         'identical_frontend_sha256_007_008': frontend, 'accepted_events': accepted, 'accepted_result_sha256': sha(result),
         'native_model_calls': 0, 'scope': 'One original rejected trace records typed date, detached/retried save button and empty date PATCH. Attempt008 passed the unchanged suite/deployment checks with byte-identical frontend. Acceptance is verified; a causal implementation repair or observer defect is not established.'}
(out / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
lesson = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L069', 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm', 'status': 'verified',
          'scope': 'eval016 task015 b004 rejected007 trace and accepted008',
          'observation': 'Rejected007 trace shows date fill followed by Save due date detachment/retry and a successful empty-date PATCH. Accepted008 passes unchanged cumulative acceptance, own upgrade, actual restart and deployment checks. Its app.js/index.html/styles.css are byte-identical to007, so acceptance does not demonstrate a frontend race repair.',
          'root_cause': 'The trace confirms a timing-sensitive edit/save interaction for007. Exact rendering trigger and causal effect of the008 backend schema-introspection change are unestablished. Earlier identical assertions are not independently diagnosed by this one trace.',
          'prevention': 'Preserve all seven rejected attempts and measured accepted008. Keep verified acceptance separate from causal recovery claims; revisit timing-sensitive behavior in later checkpoints and independent replications. No tailored fixes or frozen-suite changes.',
          'verification': proof['scope'], 'comparison_policy': 'No scientific finding, observer revision, protocol change, instruction change or PM source repair.',
          'evidence': [str(out / 'verified.json'), str(trace), str(result)]}
with Path('lessons/records.jsonl').open('a') as journal: journal.write(json.dumps(lesson, sort_keys=True) + '\n')
with (r / 'decisions/lessons-applied.md').open('a') as decisions: decisions.write('\nL069 task015 completion: b004attempt008 accepted and common015 deployed. Trace007 confirms date fill, Save button detachment/retry and empty date PATCH; accepted008 frontend is byte-identical. Measured acceptance is verified, causal race repair and observer-defect attribution are not established. Preserve all seven rejections and future independent timing-sensitive observations.\n')
print(json.dumps({'verified': True, 'evidence': str(out), 'accepted_attempt': 8, 'causal_repair_established': False}))
