"""Freeze only after executed prospective and retained controls match their scope."""
import json,hashlib
from pathlib import Path
from orchestrator.prepare import file_hashes,write_json
from orchestrator.evidence import timestamp
v=Path('experiments/instruction-effects/revisions/research-v014');prior_v=Path('experiments/instruction-effects/revisions/research-v013');source=Path('runs/instruction-effects/eval-013')
load=lambda p:json.loads(p.read_text());assert load(source/'state.json')['status']=='superseded'
base=list((v/'preflight').glob('all-restore-full-check-*/verified.json'));directed=list((v/'preflight').glob('all-restore-directed-check-*/verified.json'));assert len(base)==len(directed)==1
assert load(v/'preflight/all-restore-exact-delta.json')['verified']
assert load(v/'preflight/adoption/all-restore-draft-adoption.json')['verified']
assert file_hashes(v/'preflight/all-restore-candidate/task-020/suite')==file_hashes(v/'decisions/frozen-prefix-drafts/task-020/suite')
b=load(base[0]);c=load(directed[0]);assert b['verified'] and len(b['results'])==24 and c['verified'] and len(c['results'])==18
for p in [base[0],directed[0]]:assert load(p.parent/'input-closure.json')['verified']
assert sum(r['exit']==0 for r in c['results'])==6 and sum(r['exit']!=0 for r in c['results'])==12
for r in c['results']:
 s=r['statistics'];assert s['flaky']==s['skipped']==0
 if r['exit']==0:
  assert s['expected']==2 and s['unexpected']==0 and r['restores']>=2
  if r['transition']!='form':assert r['asyncRestores']>=2
 else:assert s['unexpected']>=1
assert load(v/'preflight/all-restore-phase-listing/verified.json')['verified'] and len(load(v/'preflight/all-restore-phase-listing/verified.json')['phase_listings'])==59
pm=load(v/'preflight/pm-checks/all-restore-preparation-verified.json');assert pm['verified'] and pm['tests']==178
for name,h in pm['code_files'].items():assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==h
runtime=load(v/'preflight/runtime/verified.json');assert all(runtime[k] for k in ('passed','isolation_passed','versions_passed','source_history_restored','full_working_tree_independently_restored','inventory_absence_verified'))
assert load(v/'preflight/runtime/resource.json')['status']=='removed' and load(v/'preflight/runtime/retirement-verified.json')['verified']
assert load(v/'preflight/runtime/image-provenance.json')['verified_blobs']==18
assert load(v/'preflight/runtime/latest-stable-npm.json')['versions']=={'@openai/codex':'0.162.1','@earendil-works/pi-coding-agent':'1.1.0'}
native=source/'preflight/restore-navigation-full-replay-002/verified.json';n=load(native);assert n['verified'] and n['source_unchanged'] and n['full_cumulative_3_cases']==11 and n['own_prior2_upgrade_passed'] and n['actual_restart_passed'];assert load(native.parent/'resource.json')['inventory_absence_verified']
exact_native=v/'preflight/all-restore-native-replay-003/verified.json'
exact=load(exact_native);assert exact['verified'] and exact['source_unchanged'] and exact['full_cumulative_3_cases']==11 and exact['own_prior2_upgrade_passed'] and exact['actual_restart_passed']
assert exact['exact_candidate_suite_files']==file_hashes(v/'preflight/all-restore-candidate/task-003/suite')
assert load(exact_native.parent/'resource.json')['status']=='removed' and load(exact_native.parent/'resource.json')['inventory_absence_verified']
focused=load(source/'preflight/restore-navigation-replay-001/verified.json');assert focused['verified'] and focused['original_pairs_failed']==focused['readiness_pairs_passed']==3
for filename in ('directory.spec.mjs','search-whitespace.spec.mjs'):
 assert file_hashes(v/'preflight/all-restore-candidate/task-020/suite')[filename]==file_hashes(prior_v/'preflight/all-restore-candidate/task-020/suite')[filename]
# The unchanged historical directed controls remain scoped as retained proofs.
assert len(load(next((prior_v/'preflight').glob('directory065-check-*/verified.json')))['results'])==18
prior=load(prior_v/'analysis-plan.json');plan=load(v/'analysis-plan.json');assert plan['status']=='draft-before-main-dispatch';changed={k for k in prior.keys()|plan.keys() if prior.get(k)!=plan.get(k)};assert changed<={'revision_id','status','lineage','adoption_evidence','frozen_at'},changed
plan['status']='frozen-before-main-dispatch';plan['frozen_at']=timestamp();write_json(v/'analysis-plan.json',plan)
write_json(v/'preflight/adoption/plan-freeze.json',{'utc':plan['frozen_at'],'verified':True,'native_model_calls':0,'baseline':str(base[0]),'baseline_variants':24,'full_checks_per_mode':68,'directed_controls':str(directed[0]),'directed_variants':18,'pm_checks':178,'phase_listings':59,'mathematical_and_stopping_rules_unchanged':True,'changed_plan_fields':sorted(changed),'source_run':'pilot-015','prior_run_superseded':'eval-013','comparison_correction':'All project Restore callers wait for restore completion only','native_original_proof':str(native),'native_exact_candidate_proof':str(exact_native),'future21through40_unfrozen':True});print('Frozenresearchv014afterallverifiedgates')
