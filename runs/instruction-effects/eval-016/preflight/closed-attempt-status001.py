"""PM-only gate: identify exact closed attempt evidence before dependent work."""
import argparse, json
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--builder', default='b004')
parser.add_argument('--task', default='task-021')
args = parser.parse_args()
run = Path('runs/instruction-effects/eval-016')
events = [json.loads(line) for line in (run / 'events.jsonl').read_text().splitlines()]
scoped = [e for e in events if e.get('builder_id') == args.builder and e.get('task_id') == args.task]
started = [e for e in scoped if e['kind'] == 'attempt_started']
terminal = [e for e in scoped if e['kind'] in ('attempt_rejected', 'task_accepted', 'infrastructure_attempt_retained')]
closed = []
for event in terminal:
    attempt = event['attempt_id']
    folder = run / 'tasks' / args.task / 'attempts' / args.builder / attempt
    index = run / 'builders' / args.builder / 'checkpoints' / f'{args.task}-{attempt}' / 'index.json'
    result = folder / 'result.json'
    ready = result.is_file() and index.is_file()
    if ready:
        data = json.loads(result.read_text())
        archive = json.loads(index.read_text())
        ready = data.get('commit') == archive.get('source_commit') == event.get('post_commit', event.get('commit')) and data.get('tree') == archive.get('source_tree') == event.get('post_tree', event.get('tree'))
    closed.append({'attempt': attempt, 'kind': event['kind'], 'event_id': event['event_id'], 'evidence_ready': ready})
latest = started[-1]['attempt_id'] if started else None
print(json.dumps({'builder': args.builder, 'task': args.task, 'latest_started_attempt': latest,
                  'latest_terminal_attempt': closed[-1] if closed else None,
                  'latest_started_has_terminal_event': any(x['attempt'] == latest for x in closed),
                  'ready_closed_attempts': [x['attempt'] for x in closed if x['evidence_ready']],
                  'scope': 'PM evidence gate only. Readiness requires an exact terminal event, result and matching source index; aggregate counts and file absence never prove a builder outcome.'}))
