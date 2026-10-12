"""Freeze the role observer revision only after all declared evidence closes."""
import hashlib
import json
import shutil
from pathlib import Path

from orchestrator.evidence import timestamp
from orchestrator.prepare import file_hashes, write_json

revision = Path('experiments/instruction-effects/revisions/research-v016')
previous = Path('experiments/instruction-effects/revisions/research-v015')
run = Path('runs/instruction-effects/eval-015')
base = revision / 'preflight'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
load = lambda p: json.loads(p.read_text())
evidence = {}


def checked(path, fields, file_key=None, relative_to=None):
    proof = load(path)
    for key, value in fields.items():
        assert proof[key] == value, (path, key)
    if file_key:
        for name, value in proof[file_key].items():
            p = (relative_to / name) if relative_to else Path(name)
            assert sha(p) == value, p
    evidence[str(path)] = sha(path)
    return proof


plan = load(revision / 'analysis-plan.json')
prior_plan = load(previous / 'analysis-plan.json')
assert plan['status'] == 'prepared-unfrozen'
assert load(run / 'state.json')['status'] == 'superseded'
changed = {k for k in plan.keys() | prior_plan.keys() if plan.get(k) != prior_plan.get(k)}
assert changed <= {'revision_id', 'status', 'lineage', 'adoption_evidence', 'frozen_at', 'pre_dispatch_gates'}
assert plan['pre_dispatch_gates'][:-1] == prior_plan['pre_dispatch_gates']
assert plan['primary_family_size'] == plan['stopping']['required_primary_classifications'] == 36
assert plan['stopping']['required_independent_batches'] == 2
assert plan['stopping']['source_line_threshold'] is plan['stopping']['fixed_task_limit'] is None
pm = checked(base / 'pm-regression004/verified.json', {'verified': True, 'exit_code': 0, 'source_unchanged': True})
pm_inputs = base / 'pm-regression004/inputs.json'
assert pm['input_sha256'] == sha(pm_inputs)
assert pm['terminal_log_sha256'] == sha(base / 'pm-regression004/terminal.log')
assert 'Ran 196 tests' in (base / 'pm-regression004/terminal.log').read_text()
for name, value in load(pm_inputs)['source_files'].items():
    assert sha(Path(name)) == value, name
checked(base / 'prefix-phase-listing001/independently-verified.json',
        {'verified': True, 'phase_listings': 89, 'stages': 30}, 'originals', base / 'prefix-phase-listing001')
delta = checked(base / 'role-delta031-verification003/verified.json',
                {'verified': True, 'checked_suites': 31, 'mathematical_and_stopping_fields_unchanged': True}, 'files')
assert delta['role_guard_sha256'] == sha(Path('orchestrator/action_role_readiness.py'))
assert file_hashes(base / 'task030-action-role-suite') == file_hashes(revision / 'decisions/frozen-prefix-drafts/task-030/suite')
checked(base / 'future031040-role-phase-listing003/independently-verified.json',
        {'verified': True, 'phase_listings': 40, 'exact_requirement_lineage': True,
         'only_exact_generic_role_delta': True}, 'originals', base / 'future031040-role-phase-listing003')
future_preparation = checked(revision / 'decisions/future031040-role-preparation003/prepared.json',
                             {'prepared_unfrozen': True, 'native_model_calls': 0, 'no_native_dispatch': True})
assert len(future_preparation['requirements']) == 10
assert future_preparation['suite_files'] == file_hashes(base / 'task040-action-role-suite003')
checked(base / 'export017-role-focused-combined001/verified.json',
        {'verified': True, 'positive_cases': 12, 'fault_variants': 36}, 'files')
checked(base / 'directory-action-role-focused001-independent/verified.json',
        {'verified': True, 'positive_cases': 30, 'genuine_fault_variants': 22}, 'files')
checked(base / 'future-owner-action-role-focused003-independent/verified.json',
        {'verified': True, 'positive_cases': 16, 'genuine_fault_variants': 16}, 'files')
checked(base / 'word-search-role-independent001/verified.json',
        {'verified': True, 'positive_cases': 2, 'genuine_fault_variants': 2}, 'files')
for stage, variants, cases, probes in [(30, 16, 1584, 32), (40, 10, 1400, 20)]:
    version = '001' if stage == 30 else '002'
    full = checked(base / ('full%03d-action-role-independent%s' % (stage, version)) / 'verified.json',
            {'verified': True, 'stage': stage, 'cumulative_variants': variants,
             'cumulative_cases': cases, 'process_local_probe_cases': probes}, 'files')
    assert full['verifier_sha256'] == sha(base / ('full-action-role-independent%s.py' % version))
native = checked(run / 'preflight/export017-native-full001/source-bound-verification001/verified.json',
                 {'verified': True, 'full_cumulative_checks': 58, 'own_prior_upgrade_passed': True,
                  'actual_restart_passed': True, 'source_unchanged': True,
                  'resource_archived_restored_removed': True}, 'files', run / 'preflight/export017-native-full001')
assert native['source_commit'] == '80b7d2f1f3c2307478b07a09a38b500fbc36c867'
assert native['source_tree'] == '3b966361e995969506606a6ba66eba763785c733'
checked(run / 'preflight/export017-native-replay001/input-closure.json',
        {'verified': True, 'original_successes': 0, 'diagnostic_control_successes': 2,
         'source_unchanged': True, 'resource_removed': True})
runtime = checked(base / 'runtime/verified.json', {
    'passed': True, 'isolation_passed': True, 'versions_passed': True,
    'source_history_restored': True, 'full_working_tree_independently_restored': True,
    'inventory_absence_verified': True, 'native_model_calls': 0}, 'archive_sha256', base / 'runtime')
assert runtime['controller_sha256'] == sha(base / 'runtime/check.py')
assert load(base / 'runtime/resource.json')['status'] == 'removed'
checked(base / 'runtime/image-provenance.json', {
    'verified_blobs': 18, 'all_content_addressed_blobs_rehashed': True, 'all_blob_sha256_verified': True})
registry = checked(base / 'latest-stable-npm002/verified.json', {'verified': True, 'native_model_calls': 0})
assert registry['controller_sha256'] == sha(base / 'latest-stable-npm002/executed-controller.py')
assert registry['observed'] == {'@openai/codex': '0.162.1', '@earendil-works/pi-coding-agent': '1.1.0'}
checked(run / 'reports/terminal-closure.json', {
    'verified': True, 'all_terminal_resources_independently_restored_and_removed': True,
    'terminal_resource_archives': 24, 'native_requests': 2252, 'unknown_native_receipts': 3,
    'analysis_ready': False}, 'evidence_sha256')
checked(run / 'reports/publication-terminal001.json', {
    'verified': True, 'eval015_original_refs_verified': 492,
    'eval015_source_checkpoints': 246, 'all_scanned_original_refs': 7806})
assert (revision / 'decisions/lessons-applied.md').is_file()
output = base / 'adoption'
assert not output.exists()
original_plan = (revision / 'analysis-plan.json').read_bytes()
plan['status'] = 'frozen-before-main-dispatch'
plan['frozen_at'] = timestamp()
plan['lineage']['comparison_changes'] = 'Exact named generic action button-or-link locators and directory-task-row Open project only; all explicit button contracts, public packets and behavioral assertions preserved.'
plan['lineage']['scope'] = 'Verified prospective observer revision. New fresh starter roots, committed manifest and publication scan required before native dispatch.'
output.mkdir()
(output / 'prepared-plan-original.json').write_bytes(original_plan)
shutil.copy2(__file__, output / 'executed-freeze-controller.py')
write_json(output / 'plan-freeze.json', {
    'verified': True, 'utc': plan['frozen_at'], 'native_model_calls': 0,
    'mathematical_and_stopping_rules_unchanged': True, 'changed_plan_fields': sorted(changed),
    'pm_checks': 196, 'phase_listings': 89, 'future_phase_listings': 40, 'role_delta_suites': 31,
    'focused_cases': 136, 'synthetic_cumulative_cases': 2984,
    'process_local_probe_cases': 52, 'native_source_full_cases': 58,
    'actual_native_restart_verified': True, 'prior_run': 'eval-015',
    'fresh_source_run': 'pilot-015', 'future031040_public_rounds_unfrozen': True,
    'evidence_sha256': evidence, 'prepared_plan_sha256': hashlib.sha256(original_plan).hexdigest()})
write_json(revision / 'analysis-plan.json', plan)
print('Frozen research-v016 after closed and hash-verified declared readiness gates')
