"""Append the preselected021through030 rounds after the first verified inspection."""
import hashlib, json, shutil
from pathlib import Path
from orchestrator.prepare import file_hashes, write_json
from orchestrator.task_stream import task_stream, freeze_round
from orchestrator.study import evidence

run = Path('runs/instruction-effects/eval-016')
revision = Path('experiments/instruction-effects/revisions/research-v016')
selection = run / 'preflight/checkpoint015-publication001/scan-archive001/later-observations/eval016-next-prefix-selection001.json'
verification = selection.with_name('eval016-next-prefix-selection002.json')
verifier = selection.with_name('eval016-next-prefix-selection-verifier002.py')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
selected = json.loads(selection.read_text()); checked = json.loads(verification.read_text())
assert selected['verified'] and checked['verified']
assert sha(selection) == checked['selection_sha256'] and sha(verifier) == checked['controller_sha256']
assert checked['git_blobs_checked'] == 960 and not selected['first_comparative_inspection_record_exists']
assert len(task_stream(run)) == 20
state = json.loads((run / 'state.json').read_text())
assert state['status'] == 'awaiting_frozen_round'
assert len(state['accepted']) == 12 and all(x['stage'] == 20 for x in state['accepted'].values())
manifest, report, binding = evidence(run)
assert report['analysis_ready'] and len(report['tasks']) == 240
inspections = list(map(json.loads, (run / 'analysis/inspections.jsonl').read_text().splitlines()))
assert len(inspections) == 1 and inspections[0]['checkpoint'] == 20
assert inspections[0]['input_binding'] == binding
assert not (run / 'analysis/candidate.json').exists()
original_stream = task_stream(run)
output = run / 'preflight/next-prefix021030-freeze001'
assert not output.exists()
for row in selected['selected_rounds']:
    stage = row['stage']; draft = revision / f'decisions/frozen-prefix-drafts/task-{stage:03d}'
    assert file_hashes(draft) == row['prepared_files']
    task = freeze_round(run, (draft / 'requirements.md').read_text(), draft / 'suite', row['expected_phase_checks'])
    assert task['stage'] == stage and task['suite_files'] == file_hashes(draft / 'suite')
assert task_stream(run)[:20] == original_stream and len(task_stream(run)) == 30
output.mkdir()
shutil.copy2(__file__, output / 'executed-controller.py')
write_json(output / 'verified.json', {'verified': True, 'prepared_selection_sha256': sha(selection),
    'source_bound_selection_verification_sha256': sha(verification), 'controller_sha256': sha(Path(__file__)),
    'inspection_input_binding': binding, 'prior_prefix_unchanged': True,
    'new_stages': list(range(21, 31)), 'native_model_calls': 0, 'native_dispatch_started': False,
    'scope': 'Identical preselected021through030 packets and cumulative suites appended after verified common020 and first descriptive inspection. No prior evidence, treatment, model/harness, prices or stopping mathematics changed.'})
print(json.dumps({'frozen_rounds': 30, 'appended_rounds': 10, 'evidence': str(output)}))
