"""Retain observed recurrence while the committed publication target stays fixed."""
import hashlib, json, datetime, zipfile
from pathlib import Path
r = Path('runs/instruction-effects/eval-016')
folder = r / 'tasks/task-017/attempts/b004/attempt-001'
out = Path('.local/eval016-task017-date-recurrence001.json')
assert not out.exists()
feedback = json.loads((folder / 'feedback.json').read_text())
assert len(feedback['observations']) == 1
assert feedback['observations'][0]['test'] == '011 seed process-restart persistence checks'
trace = next(folder.rglob('trace.zip'))
with zipfile.ZipFile(trace) as z:
    actions = [json.loads(line) for n in z.namelist() if n.endswith('.trace') for line in z.read(n).decode().splitlines()]
    fill = next(a for a in actions if a.get('class') == 'Frame' and a.get('method') == 'fill' and a.get('params', {}).get('value') == '2028-02-29')
    click = next(a for a in actions if a.get('class') == 'Frame' and a.get('method') == 'click' and 'Save due date' in a.get('params', {}).get('selector', '') and a['startTime'] > fill['startTime'])
    logs = [a for a in actions if a.get('callId') == click['callId'] and a.get('type') == 'log']
    assert any('detached from the DOM' in a['message'] for a in logs)
    saved = []
    for n in z.namelist():
        if not n.endswith('.network'): continue
        for line in z.read(n).decode().splitlines():
            s = json.loads(line)['snapshot']; q = s['request']; d = q.get('postData', {}); f = d.get('_file')
            if q['method'] == 'PATCH' and f and d.get('mimeType') == 'application/json' and s['_monotonicTime'] > click['startTime']:
                body = json.loads(z.read(f))
                if 'dueDate' in body: saved.append({'body': body, 'status': s['response']['status']})
    assert saved[0] == {'body': {'dueDate': ''}, 'status': 200}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
proof = {'verified': True, 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'run_id': 'eval-016', 'task_id': 'task-017', 'builder_id': 'b004', 'attempt_id': 'attempt-001',
         'controller_sha256': sha(Path(__file__)), 'trace_sha256': sha(trace), 'feedback_sha256': sha(folder / 'feedback.json'),
         'result_sha256': sha(folder / 'result.json'), 'fill': fill, 'click': click, 'click_logs': logs, 'date_patch': saved[0],
         'native_model_calls': 0, 'scope': 'Observed recurrence of date fill, Save button detachment/retry and empty date PATCH. No exact rendering trigger, observer-defect attribution or subsequent repair outcome established. No native feedback or frozen test change.'}
out.write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({'verified': True, 'evidence': str(out)}))
