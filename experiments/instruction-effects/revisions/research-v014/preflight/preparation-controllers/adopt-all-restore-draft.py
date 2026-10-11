"""Adopt a verified broader candidate into an unstarted, unfrozen draft."""
import json
import shutil
from pathlib import Path
from orchestrator.prepare import file_hashes, write_json
from orchestrator.evidence import timestamp
from orchestrator.restore_readiness import verify_restore_only_delta
from orchestrator.task_stream import task_stream, suite_for_stage

v = Path('experiments/instruction-effects/revisions/research-v014')
source = Path('runs/instruction-effects/eval-013')
load = lambda p: json.loads(p.read_text())
assert not Path('runs/instruction-effects/eval-014').exists()
assert load(v/'analysis-plan.json')['status'] == 'draft-before-main-dispatch'
baseline = list((v/'preflight').glob('all-restore-full-check-*/verified.json'))
directed = list((v/'preflight').glob('all-restore-directed-check-*/verified.json'))
assert len(baseline) == len(directed) == 1
for proof, expected in [(baseline[0], 24), (directed[0], 18)]:
    assert load(proof)['verified'] and len(load(proof)['results']) == expected
    assert load(proof.parent/'input-closure.json')['verified']
assert load(v/'preflight/all-restore-exact-delta.json')['verified']
assert load(v/'preflight/all-restore-phase-listing/verified.json')['verified']
archive = v/'preflight/retained-two-wait-drafts'
assert not archive.exists()
rows = []
for task in task_stream(source):
    stage = task['stage']
    old = v/f'decisions/frozen-prefix-drafts/task-{stage:03d}'
    candidate = v/f'preflight/all-restore-candidate/task-{stage:03d}'
    assert (old/'requirements.md').read_bytes() == (candidate/'requirements.md').read_bytes()
    changed = verify_restore_only_delta(suite_for_stage(source, stage), candidate/'suite')
    rows.append({'stage': stage, 'before': file_hashes(old/'suite'),
                 'after': file_hashes(candidate/'suite'), 'changed_suite_files': changed})
shutil.copytree(v/'decisions/frozen-prefix-drafts', archive)
for task in task_stream(source):
    stage = task['stage']
    old = v/f'decisions/frozen-prefix-drafts/task-{stage:03d}/suite'
    candidate = v/f'preflight/all-restore-candidate/task-{stage:03d}/suite'
    for name in file_hashes(candidate):
        shutil.copy2(candidate/name, old/name)
    assert file_hashes(old) == file_hashes(candidate)
plan = load(v/'analysis-plan.json')
plan['lineage']['broader_draft_correction'] = (
    'Synthetic029 independently reproduces the same restore race. All14 project Restore '
    'callers in cumulative20 now wait for restore completion; public requirements unchanged.'
)
plan['adoption_evidence'].extend([str(baseline[0]), str(directed[0]),
    str(v/'preflight/all-restore-exact-delta.json')])
write_json(v/'analysis-plan.json', plan)
write_json(v/'preflight/adoption/all-restore-draft-adoption.json', {
    'verified': True, 'utc': timestamp(), 'frozen': False, 'native_model_calls': 0,
    'prior_drafts_retained': str(archive), 'rows': rows,
    'scope': 'Prospective unstarted draft only; original runs/outcomes unchanged.'
})
print('Adopted verified all-Restore readiness candidate into unfrozen draft14')
