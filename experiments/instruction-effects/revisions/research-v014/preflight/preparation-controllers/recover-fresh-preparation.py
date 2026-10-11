"""Finalize an unstarted partial preparation with explicit metadata supersession."""
import copy
import json
import shutil
from pathlib import Path
from orchestrator.prepare import ROOT, file_hashes, write_json, checked, git
from orchestrator.prepare_evaluation import verify_prepared_stream
from orchestrator.evidence import digest_bytes, digest_json, timestamp
from orchestrator.task_stream import task_stream, suite_for_stage
from orchestrator.restore_readiness import verify_restore_only_delta
from orchestrator.workload import phase_expectations

r = ROOT/'runs/instruction-effects/eval-014'
v = ROOT/'experiments/instruction-effects/revisions/research-v014'
source = ROOT/'runs/instruction-effects/pilot-015'
load = lambda p: json.loads(p.read_text())
assert not (r/'events.jsonl').exists()
assert load(r/'state.json')['status'] == 'prepared'
assert not (r/'preflight/preparation/verified.json').exists()
old = load(r/'manifest.json')
retained = r/'preflight/preparation/failed-exact-replay-001'
assert old == load(retained/'manifest.json')
assert (r/'manifest.sha256').read_text().strip() == digest_json(old)
assert file_hashes(r/'definitions') == old['provenance']['definition_hashes']
assert load(v/'analysis-plan.json')['status'] == 'frozen-before-main-dispatch'
pm = load(v/'preflight/pm-checks/fresh-preparation-final-verified.json')
assert pm['verified'] and pm['tests'] == 182
for name, sha in pm['code_files'].items():
    assert digest_bytes((ROOT/name).read_bytes()) == sha
latest = {p: checked(['npm','view',p,'version']) for p in
          ('@openai/codex','@earendil-works/pi-coding-agent')}
assert latest == {'@openai/codex':'0.162.1','@earendil-works/pi-coding-agent':'1.1.0'}
m = copy.deepcopy(old)
base = digest_json(file_hashes(r/'definitions/project/acceptance'))
for task in m['tasks']:
    task['suite_hash'] = base
m['provenance']['pm_commit'] = git(ROOT,'rev-parse','HEAD')
m['frozen_at'] = timestamp()
assert {k for k in old if old[k] != m[k]} <= {'tasks','provenance','frozen_at'}
roots = []
for name in ['starter']+[b['builder_id'] for b in m['runtime']['builder_configurations']]:
    path = Path(m['paths']['builders'])/name
    assert git(path,'rev-parse','HEAD') == m['provenance']['starter_commit']
    assert git(path,'rev-parse','HEAD^{tree}') == m['provenance']['starter_tree']
    assert not git(path,'status','--porcelain') and not git(path,'remote')
    roots.append(name)
assert len(roots) == 13
assert m['runtime'] == load(source/'manifest.json')['runtime']
assert load(r/'preflight/preparation/prospective-observer-adoption.json')['verified']
left, right = task_stream(source), task_stream(r, m)
assert len(left) == len(right) == 5
for original, prepared in zip(left, right):
    assert all(original[k] == prepared[k] for k in ('task_id','stage','packet_sha256'))
    assert phase_expectations(original) == phase_expectations(prepared)
    stage = original['stage']
    assert prepared['suite_hash'] == digest_json(file_hashes(suite_for_stage(r, stage)))
    verify_restore_only_delta(suite_for_stage(source, stage), suite_for_stage(r, stage))
write_json(r/'preflight/preparation/metadata-supersession.json', {
    'utc':timestamp(),'original_manifest_retained':str(retained/'manifest.json'),
    'original_manifest_sha256':digest_json(old),'replacement_manifest_sha256':digest_json(m),
    'changed_fields':['tasks.suite_hash','provenance.pm_commit','frozen_at'],
    'reason':'Finalize declared prospective preparation; correct base hashes to delivered suite and identify verified PM guard code before first native dispatch.',
    'public_packets_and_definition_files_unchanged':True,'fresh_roots_unchanged':roots,
    'native_model_calls':0,'pm_checks':182,'latest_stable_npm':latest})
write_json(r/'manifest.json',m)
(r/'manifest.sha256').write_text(digest_json(m)+'\n')
stream = verify_prepared_stream(source,r,'research-v014')
assert stream['verified'] and stream['checkpoints'] == 5
write_json(r/'preflight/preparation/verified.json', {
    'utc':timestamp(),'source_run':'pilot-015','revision':'research-v014',
    'plan_sha256':m['research']['analysis_plan']['sha256'],'manifest_sha256':digest_json(m),
    'starter_commit':m['provenance']['starter_commit'],'starter_tree':m['provenance']['starter_tree'],
    'latest_stable_npm':latest,'runtime_selection':'Latest stable registry versions match source immutable image',
    'replay':stream,'fresh_builder_roots':m['paths']['builders'],'native_model_calls':0,
    'recovered_preparation_failure':str(retained/'observation.json')})
shutil.copy2(__file__,r/'preflight/preparation/recovery-controller.py')
print('Verified unstarted fresh preparation: five identical packets, declared observer-only suites, twelve unchanged starter-only builder roots')
