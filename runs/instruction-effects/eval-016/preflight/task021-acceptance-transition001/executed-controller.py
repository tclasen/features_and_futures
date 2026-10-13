"""Record observed acceptance without claiming a causal implementation repair."""
import datetime, hashlib, json, shutil, uuid
from pathlib import Path

root = Path.cwd()
run = root / 'runs/instruction-effects/eval-016'
out = run / 'preflight/task021-acceptance-transition001'
assert not out.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
earlier = run / 'tasks/task-021/attempts/b004/attempt-094'
accepted = run / 'tasks/task-021/attempts/b004/attempt-096'
old, new = [json.loads((p / 'result.json').read_text()) for p in (earlier, accepted)]
assert not old['accepted'] and new['accepted'] and new['native_usage_complete']
assert new['requests'] == 6
assert (old['commit'], old['tree']) == (new['commit'], new['tree'])
assert {d['test'][:3] for d in old['diagnostics']} == {'011'}
assert {s['phase'] for s in new['acceptance_statistics']} == {'upgrade', 'acceptance', 'postrestart'}
assert all(s['unexpected'] == s['skipped'] == s['flaky'] == 0 for s in new['acceptance_statistics'])
sources = [run / 'builders/b004/checkpoints' / ('task-021-attempt-' + a) / 'committed-source.tar' for a in ('094', '096')]
assert sha(sources[0]) == sha(sources[1])
assert all(json.loads((p / 'native-git.json').read_text())['dirty'] == '' for p in (earlier, accepted))
recovery = run / 'preflight/incident004-recovery/verified.json'
verified = json.loads(recovery.read_text())
assert verified['verified'] and verified['recovery_accepted'] and verified['post_deployment_checks_passed'] and verified['original_missing_counter_preserved']
events = list(map(json.loads, (run / 'events.jsonl').read_text().splitlines()))
deployment = [e for e in events if e['kind'] == 'post_deployment_checks_passed' and e.get('builder_id') == 'b004' and e.get('task_id') == 'task-021' and e.get('attempt_id') == 'attempt-096']
barriers = [e for e in events if e['kind'] == 'round_completed' and e.get('task_id') == 'task-021']
assert len(deployment) == len(barriers) == 1
assert deployment[0]['monotonic_ns'] < barriers[0]['monotonic_ns']
out.mkdir()
shutil.copy2(__file__, out / 'executed-controller.py')
proof = {'verified': True, 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'accepted_attempt': 'attempt-096', 'earlier_rejected_attempt': 'attempt-094', 'same_commit': new['commit'], 'same_tree': new['tree'], 'committed_source_sha256': sha(sources[0]), 'both_git_statuses_clean': True, 'rejected_diagnostics': [{k: d.get(k) for k in ('test', 'phase', 'status', 'errors')} for d in old['diagnostics']], 'accepted_statistics': new['acceptance_statistics'], 'accepted_native_receipts': 6, 'post_deployment_checks_passed': True, 'shared_round_completed': 21, 'original_missing_receipt_preserved': True, 'whole_working_file_hashes': {a: json.loads((p / 'working-tree-checksum.json').read_text())['sha256'] for a, p in [('094', earlier), ('096', accepted)]}, 'files': {str(p.relative_to(root)): sha(p) for p in [earlier / 'result.json', accepted / 'result.json', earlier / 'native-git.json', accepted / 'native-git.json', *sources, recovery]}, 'controller_sha256': sha(Path(__file__)), 'native_model_calls': 0, 'scope': 'Acceptance and rejection vary at an identical recorded commit/tree and identical committed-source archive. Whole archived working-file hashes differ; their contents and runtime effects are not causally assessed. No source-fix, test-flakiness or deeper rendering attribution. Observed acceptance and deployment are retained under the frozen policy; this is not an independent stability estimate.'}
(out / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
for lesson, status, observation in [('L026', 'verified', 'Same-packet fresh-context attempt096 accepted with six complete native receipts and post-deployment checks before shared021 barrier. Original attempt095 missing usage remains unknown.'), ('L069', 'observed', 'Accepted096 and date-rejected094 have the same clean recorded commit/tree and identical committed-source archive. Outcome variation is confirmed; whole-working-file hashes differ and deeper causes remain unexamined. Acceptance is not evidence of a causal source repair or stable behavior.')]:
    record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': lesson, 'utc': proof['utc'], 'author': 'pm', 'status': status, 'scope': 'eval016 task021 b004 acceptance transition', 'observation': observation, 'root_cause': 'Raw acceptance/deployment and identical committed-source identities verified. Runtime, ignored-file, application and observer causes unestablished.', 'prevention': 'Keep earlier failures and missing counters intact. Distinguish observed passing attempts from source repairs and independently measured stability; preserve frozen acceptance and recovery policy.', 'verification': {'proof': str((out / 'verified.json').relative_to(root)), 'sha256': sha(out / 'verified.json')}, 'comparison_policy': 'No criteria, observer, feedback, instruction, model, accounting or stopping change. Every failed and retried exposure remains measured.', 'evidence': [str((out / 'verified.json').relative_to(root)), str(recovery.relative_to(root))]}
    with (root / 'lessons/records.jsonl').open('a') as journal:
        journal.write(json.dumps(record, sort_keys=True) + '\n')
with (run / 'decisions/lessons-applied.md').open('a') as decisions:
    decisions.write('\nL026/L069 task021 transition: attempt096 accepted with six complete receipts, deployment checks and shared021 barrier; original095 missing usage remains unknown. Accepted096 and rejected094 have identical clean commit/tree and committed-source archive, while whole-working-file hashes differ. Causal repair, runtime/observer attribution and independent stability are unestablished. Evidence: preflight/task021-acceptance-transition001/verified.json. No comparison change.\n')
print(json.dumps({'verified': True, 'shared_checkpoint': 21, 'accepted_receipts': 6, 'same_committed_source_as_rejected094': True, 'causal_repair_inferred': False}))
