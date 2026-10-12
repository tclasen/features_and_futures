"""Freeze the first twenty equal public rounds after fresh starter preparation."""
import json
import shutil
from pathlib import Path

from orchestrator.action_role_readiness import verify_role_only_delta
from orchestrator.prepare import file_hashes, write_json
from orchestrator.task_stream import freeze_round, suite_for_stage, task_stream

run = Path('runs/instruction-effects/eval-016')
revision = Path('experiments/instruction-effects/revisions/research-v016')
source = Path('runs/instruction-effects/eval-015')
assert json.loads((revision / 'analysis-plan.json').read_text())['status'] == 'frozen-before-main-dispatch'
assert len(task_stream(run)) == 5 and not (run / 'events.jsonl').exists()
original = {task['stage']: task for task in task_stream(source)}
for stage in range(1, 6):
    draft = revision / f'decisions/frozen-prefix-drafts/task-{stage:03d}'
    assert file_hashes(suite_for_stage(run, stage)) == file_hashes(draft / 'suite')
    assert (run / f'tasks/task-{stage:03d}/packet.md').read_bytes() == (source / f'tasks/task-{stage:03d}/packet.md').read_bytes()
for stage in range(6, 21):
    draft = revision / f'decisions/frozen-prefix-drafts/task-{stage:03d}'
    task = freeze_round(run, (draft / 'requirements.md').read_text(), draft / 'suite', original[stage]['expected_phase_checks'])
    assert task['packet_sha256'] == original[stage]['packet_sha256']
changes = {}
for task in task_stream(run):
    stage = task['stage']
    assert task['packet_sha256'] == original[stage]['packet_sha256']
    changes[str(stage)] = verify_role_only_delta(suite_for_stage(source, stage), suite_for_stage(run, stage))
    assert stage >= 17 or not changes[str(stage)]
    assert file_hashes(suite_for_stage(run, stage)) == file_hashes(revision / f'decisions/frozen-prefix-drafts/task-{stage:03d}/suite')
write_json(run / 'preflight/preparation/prefix-lineage.json', {
    'verified': True, 'rounds': 20, 'all_public_packets_identical': True,
    'changed_suite_files_by_stage': changes, 'only_exact_generic_action_roles_changed': True,
    'native_model_calls': 0, 'previous_run': 'eval-015',
    'original_developed_source_inherited': False, 'first_comparative_inspection_checkpoint': 20,
    'later21through40_not_yet_frozen': True})
shutil.copy2(__file__, run / 'preflight/preparation/freeze-prefix-controller.py')
(run / 'decisions').mkdir(exist_ok=True)
shutil.copy2(revision / 'decisions/lessons-applied.md', run / 'decisions/lessons-applied.md')
print('Frozen20 inherited public packets with the declared role-only observer correction')
