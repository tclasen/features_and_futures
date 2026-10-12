"""Supersede unfrozen future metadata without rewriting its initial candidate."""
import hashlib
import json
import shutil
from pathlib import Path
from orchestrator.action_role_readiness import verify_role_only_delta
from orchestrator.prepare import file_hashes, write_json

revision = Path('experiments/instruction-effects/revisions/research-v016')
previous = Path('experiments/instruction-effects/revisions/research-v015')
source = revision / 'decisions/future031040-summary-preparation001'
output = revision / 'decisions/future031040-role-preparation003'
suite = revision / 'preflight/task040-action-role-suite003'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert not output.exists()
assert json.loads((revision / 'analysis-plan.json').read_text())['status'] == 'prepared-unfrozen'
delta = verify_role_only_delta(previous / 'preflight/task040-summary-suite', suite)
suite_files = file_hashes(suite)
requirements = []
for stage in range(31, 41):
    old = source / f'task-{stage:03d}'
    prior = previous / 'decisions/future031040-summary-preparation001' / f'task-{stage:03d}'
    assert (old / 'requirements.md').read_bytes() == (prior / 'requirements.md').read_bytes()
    inputs = json.loads((old / 'inputs.json').read_text())
    assert inputs['prepared_unfrozen'] and inputs['stage'] == stage
    assert inputs['requirements_sha256'] == sha(old / 'requirements.md')
    target = output / f'task-{stage:03d}'
    target.mkdir(parents=True)
    shutil.copy2(old / 'requirements.md', target / 'requirements.md')
    inputs.update(suite=str(suite), suite_files=suite_files, changed_files=delta,
                  transformation_sha256=sha(revision / 'preflight/action-role-delta003.py'),
                  role_guard_sha256=sha(Path('orchestrator/action_role_readiness.py')),
                  supersedes_prepared_inputs=str(old / 'inputs.json'),
                  supersedes_prepared_inputs_sha256=sha(old / 'inputs.json'),
                  source_summary_suite=str(previous / 'preflight/task040-summary-suite'),
                  source_summary_suite_files=file_hashes(previous / 'preflight/task040-summary-suite'))
    write_json(target / 'inputs.json', inputs)
    requirements.append({'stage': stage, 'requirements_sha256': sha(target / 'requirements.md'),
                         'inputs_sha256': sha(target / 'inputs.json'),
                         'expected_phase_checks': inputs['expected_phase_checks']})
assert file_hashes(suite) == suite_files
shutil.copy2(__file__, output / 'executed-controller.py')
write_json(output / 'prepared.json', {
    'prepared_unfrozen': True, 'native_model_calls': 0, 'suite_files': suite_files,
    'requirements': requirements, 'controller_sha256': sha(Path(__file__)),
    'requirements_lineage': 'Exact original future031040 public requirements; initial candidate metadata preserved.',
    'suite_delta': 'Named generic role choices plus conditional Complete/Reopen only in dynamic protected-write helper; explicit task-write buttons preserved.',
    'supersedes': str(source), 'no_native_dispatch': True})
print('Prepared10future requirement records against corrected suite002; no freeze or dispatch')
