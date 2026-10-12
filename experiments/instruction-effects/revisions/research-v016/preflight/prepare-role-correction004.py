"""Prepare new unfrozen future suites; retain every prior executed namespace."""
import hashlib
import inspect
import json
import shutil
from pathlib import Path
from orchestrator.action_role_readiness import with_action_role_choices, verify_role_only_delta

revision = Path('experiments/instruction-effects/revisions/research-v016')
base = revision / 'preflight'
old = Path('experiments/instruction-effects/revisions/research-v015/preflight/task040-summary-suite')
suite = base / 'task040-action-role-suite003'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert json.loads((revision / 'analysis-plan.json').read_text())['status'] == 'prepared-unfrozen'
assert not suite.exists()
shutil.copytree(old, suite)
for p in suite.glob('*.mjs'):
    p.write_text(with_action_role_choices(p.read_text(), p.name))
verify_role_only_delta(old, suite)
previous = base / 'task040-action-role-suite002'
changed = [str(p.relative_to(suite)) for p in suite.rglob('*') if p.is_file() and p.read_bytes() != (previous / p.relative_to(suite)).read_bytes()]
assert changed == ['directory-word-search.spec.mjs'], changed
guard = Path('orchestrator/action_role_readiness.py')
(base / 'action-role-delta003.py').write_text(inspect.getsource(with_action_role_choices))
files = {str(p.relative_to(suite)): sha(p) for p in suite.rglob('*') if p.is_file()}
source = base / 'task040-action-role-broader002-fixture.mjs'
controller = base / 'task040-action-role-broader003-fixture.mjs'
assert not controller.exists()
text = source.read_text().replace('task040-action-role-suite002', 'task040-action-role-suite003').replace('task040-action-role-broader002', 'task040-action-role-broader003')
# Same ten crossed variants; inspect link behavior early in the new PM-only gate.
text = text.replace("for(const role of ['button','link'])for(const variant", "for(const role of ['link','button'])for(const variant")
controller.write_text(text)
inputs = json.loads((base / 'task040-action-role-broader002-inputs.json').read_text())
inputs.update(controller_sha256=sha(controller), source_controller=str(source),
              source_controller_sha256=sha(source), role_helper_source_sha256=sha(guard),
              suite_files=files, supersedes='task040-action-role-broader002',
              correction='Only future word-search protectedWrites Complete/Reopen role union; all140assertions unchanged.')
(base / 'task040-action-role-broader003-inputs.json').write_text(json.dumps(inputs, indent=2) + '\n')
# Reuse the exact terminal fixture implementation with a short, genuine directed gate.
focused = base / 'word-search-action-role-focused001-fixture.mjs'
start = text.index('try {\n for(const role', text.index('const results=[];'))
end = text.index('}finally{await new Promise(r=>server.close(r));}', start)
body = """try {
 for(const role of ['button','link']){
  exportRole=role;mode='form';reloadReset=true;restoreTransition='none';defect='none';seed();
  const r=await run('positive-'+role,'acceptance','115 ');results.push(r);await writeFile(evidence+'/progress.json',JSON.stringify(results,null,2)+'\\n');
  assert.equal(r.exit,0);assert.equal(r.statistics.expected,1);assert.equal(r.statistics.unexpected,0);assert.equal(r.statistics.skipped,0);assert.equal(r.statistics.flaky,0);
 }
 for(const role of ['button','link']){
  exportRole=role;mode='form';reloadReset=true;restoreTransition='none';defect='bulk-enabled-protected';seed();
  const r=await run('fault-'+role,'acceptance','115 ');results.push(r);await writeFile(evidence+'/progress.json',JSON.stringify(results,null,2)+'\\n');
  assert.notEqual(r.exit,0);assert.equal(r.statistics.expected,0);assert.equal(r.statistics.unexpected,1);assert.equal(r.statistics.skipped,0);assert.equal(r.statistics.flaky,0);
 }
 await writeFile(evidence+'/verified.json',JSON.stringify({verified:true,model_calls:0,results,scope:'Two115role positives and two genuinely enabled-protected-scope faults; no real restart or complete broader gate.'},null,2)+'\\n');
"""
focused.write_text((text[:start] + body + text[end:]).replace('task040-action-role-broader003-check-', 'word-search-action-role-focused001-check-'))
focused_inputs = {**inputs, 'controller_sha256': sha(focused), 'source_controller': str(controller),
                  'source_controller_sha256': sha(controller), 'positive_cases': 2, 'genuine_fault_variants': 2}
(base / 'word-search-action-role-focused001-inputs.json').write_text(json.dumps(focused_inputs, indent=2) + '\n')
for old_name, new_name in [('prepare-future-role-metadata002.py','prepare-future-role-metadata003.py'),
    ('role-delta031-verifier002.py','role-delta031-verifier003.py'),
    ('future031040-role-phase-listing002-controller.py','future031040-role-phase-listing003-controller.py'),
    ('future031040-role-phase-listing002-verify.py','future031040-role-phase-listing003-verify.py'),
    ('pm-regression003-controller.py','pm-regression004-controller.py')]:
    target = base / new_name
    assert not target.exists()
    value = (base / old_name).read_text()
    for a,b in [('future031040-role-preparation002','future031040-role-preparation003'),
        ('task040-action-role-suite002','task040-action-role-suite003'),
        ('action-role-delta002.py','action-role-delta003.py'),
        ('role-delta031-verification002','role-delta031-verification003'),
        ('future031040-role-phase-listing002','future031040-role-phase-listing003'),
        ('pm-regression003','pm-regression004')]: value = value.replace(a,b)
    target.write_text(value)
out = revision / 'decisions/action-role-preparation-correction004.json'
assert not out.exists()
out.write_text(json.dumps({'prepared_unfrozen':True, 'native_model_calls':0,
    'executed_controller_sha256':sha(Path(__file__)), 'role_guard_sha256':sha(guard),
    'supersedes_candidate_suite':str(previous), 'candidate_suite':str(suite),
    'changed_files_from_previous_candidate':changed, 'suite_files':files,
    'first30_suite_unchanged':True, 'public_requirements_and_math_unchanged':True,
    'verification_pending':['focused115','full140tenvariants','currentPMregressions','newmetadataanddelta']}, indent=2)+'\n')
print('Prepared corrected future suite003 and new PM fixture sources; no native dispatch or freeze')
