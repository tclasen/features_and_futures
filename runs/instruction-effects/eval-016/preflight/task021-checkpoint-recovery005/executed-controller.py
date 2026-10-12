"""Independently restore archive-first recovery evidence without touching builders."""
import datetime
import hashlib
import importlib.util
import json
import shutil
import sys
import uuid
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root))
from orchestrator.diagnostics import notification_fingerprint

run = root / 'runs/instruction-effects/eval-016'
out = run / 'preflight/task021-checkpoint-recovery005'
assert not out.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((run / 'manifest.json').read_text())
assert manifest['execution']['repair_policy'] == 'checkpoint-after-five-identical-v1'
events = list(map(json.loads, (run / 'events.jsonl').read_text().splitlines()))
selected = [e for e in events if e.get('builder_id') == 'b004' and e.get('task_id') == 'task-021']
all_failed = [e for e in selected if e['kind'] == 'attempt_rejected'][:30]
failed = all_failed[25:]
assert [e['attempt_id'] for e in failed] == [f'attempt-{i:03d}' for i in range(26, 31)]
assert len({notification_fingerprint(e['diagnostics']) for e in failed}) == 1
finished = [e for e in selected if e['kind'] == 'repository_recovery_finished' and e['attempt_id'] == 'attempt-030']
assert len(finished) == 1
transition = finished[0]
next_attempt = next(e for e in selected if e['kind'] == 'attempt_started' and e['attempt_id'] == 'attempt-031')
assert next_attempt['pre_commit'] == transition['post_commit']
spec = importlib.util.spec_from_file_location('originals', root / 'scripts/verify-retained-originals.py')
originals = importlib.util.module_from_spec(spec)
spec.loader.exec_module(originals)
restored = []
for stage, attempt in [(21, f'attempt-{i:03d}') for i in range(1, 31)] + [(20, 'attempt-001')]:
    task = f'task-{stage:03d}'
    checkpoint = run / 'builders/b004/checkpoints' / (task + '-' + attempt)
    index = json.loads((checkpoint / 'index.json').read_text())
    assert all(sha(checkpoint / name) == h for name, h in index['checksums'].items())
    originals.restore(checkpoint / 'history.bundle', index['source_commit'], index['source_tree'])
    folder = run / 'tasks' / task / 'attempts/b004' / attempt
    native = json.loads((folder / 'native-git.json').read_text())
    assert (native['head'], native['tree']) == (index['source_commit'], index['source_tree'])
    originals.restore(folder / 'native-history.bundle', native['head'], native['tree'],
                      folder / 'native-working-tree.tar.gz', native['dirty'])
    if stage == 20:
        assert json.loads((folder / 'result.json').read_text())['accepted']
        assert transition['post_commit'] == native['head'] and transition['post_tree'] == native['tree']
    else:
        event = next(e for e in all_failed if e['attempt_id'] == attempt)
        assert event['post_commit'] == native['head']
    restored.append({'task': task, 'attempt': attempt, 'head': native['head'], 'tree': native['tree'],
                     'index_sha256': sha(checkpoint / 'index.json'),
                     'native_files': {name: sha(folder / name) for name in
                                      ('native-history.bundle', 'native-working-tree.tar.gz', 'native-git.json')}})
folder = run / 'tasks/task-021/attempts/b004/attempt-030'
before = folder / 'recovery-before-restore'
native = json.loads((before / 'native-git.json').read_text())
checkpoint = run / 'builders/b004/checkpoints/task-021-attempt-030-before-restore'
index = json.loads((checkpoint / 'index.json').read_text())
record = json.loads((folder / 'repository-recovery.json').read_text())
assert record['archive_checksums'] == index['checksums'] == transition['archive_checksums']
assert record['pre_commit'] == native['head'] == index['source_commit'] == failed[-1]['post_commit']
assert record['pre_tree'] == native['tree'] == index['source_tree']
assert record['native_working_tree_sha256'] == sha(before / 'native-working-tree.tar.gz')
assert all(sha(checkpoint / name) == h for name, h in index['checksums'].items())
originals.restore(checkpoint / 'history.bundle', native['head'], native['tree'])
originals.restore(before / 'native-history.bundle', native['head'], native['tree'],
                  before / 'native-working-tree.tar.gz', native['dirty'])
out.mkdir()
shutil.copy2(__file__, out / 'executed-controller.py')
(out / 'observed-events.json').write_text(json.dumps(all_failed + finished + [next_attempt], indent=2) + '\n')
proof = {'verified': True, 'restored_originals': restored,
         'recovery_index_sha256': sha(checkpoint / 'index.json'),
         'recovery_record_sha256': sha(folder / 'repository-recovery.json'),
         'recovery_native_files': {name: sha(before / name) for name in
                                  ('native-history.bundle', 'native-working-tree.tar.gz', 'native-git.json')},
         'controller_sha256': sha(Path(__file__)), 'native_model_calls': 0,
         'scope': 'Independent archive restoration and recorded own-checkpoint recovery transition after five identical failures. Active attempt031 is not assessed or modified; effective repair remains unverified.'}
(out / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
lesson = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L069',
          'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm',
          'status': 'verified', 'scope': 'eval016 task021 b004 archive-first own-checkpoint recovery',
          'observation': 'Rejected attempts026–030 share one frozen diagnostic fingerprint; earlier rejected001 remains preserved. Original native histories/working trees, publication bundles, own accepted task020 source and all thirty rejected sources plus before-restore tip independently restore. Recorded restoration and attempt031 start use the own accepted commit; effective task021 repair remains pending.',
          'root_cause': 'Repeated empty-date assertion confirmed; original001 detached-save sequence separately verified. Exact rendering cause and causal repair mechanism remain unestablished.',
          'prevention': 'Retain the existing five-identical-failure control, archive first, restore only the same builder checkpoint and count every native attempt. Keep all repairs and architecture choices with the builder.',
          'verification': proof['scope'],
          'comparison_policy': 'Existing frozen recovery executed; no criteria, packet, profile, harness, accounting or treatment change, no causal finding.',
          'evidence': [str((out / 'verified.json').relative_to(root)), str((out / 'observed-events.json').relative_to(root))]}
with (root / 'lessons/records.jsonl').open('a') as journal:
    journal.write(json.dumps(lesson, sort_keys=True) + '\n')
with (run / 'decisions/lessons-applied.md').open('a') as decisions:
    decisions.write('\nL069 archive-first task021 recovery verified: five identical b004 diagnostics, all thirty original histories and working trees plus before-restore bundle independently restored. The recorded own-task020 restoration matches attempt031 start. Effective task021 repair remains pending; no comparison change or implementation hint.\n')
print(json.dumps({'verified': True, 'restored_attempt_originals': 31, 'restored_before_restore_tip': True,
                  'evidence': str(out.relative_to(root)), 'lesson_record_id': lesson['record_id']}))
