from pathlib import Path
import json
from orchestrator.prepare import file_hashes,write_json
from orchestrator.evidence import timestamp
v=Path('experiments/instruction-effects/revisions/research-v011')
baselines=list((v/'preflight').glob('task020-full02-check-*/verified.json'));assert len(baselines)==1
b=json.loads(baselines[0].read_text());assert b['verified'] and len(b['results'])==18
for row in b['results']:assert row['exit']==0 and row['statistics']['unexpected']==0 and row['statistics']['flaky']==0
inputs=json.loads((v/'preflight/task020-full02-inputs.json').read_text());assert inputs['ordinary_read_ms']==50 and inputs['delayed_read_ms']==300 and inputs['bulk_mutation_ms']==500 and inputs['test_watchdog_seconds']==20
assert inputs['controller_sha256']==__import__('hashlib').sha256((baselines[0].parent/'executed-controller.mjs').read_bytes()).hexdigest()
assert inputs['suite_files']==file_hashes(v/'preflight/task020-executed-suite')==file_hashes(v/'decisions/frozen-prefix-drafts/task-020/suite')
controls=list((v/'preflight').glob('deletion057-check-*/verified.json'));assert len(controls)==1
c=json.loads(controls[0].read_text());assert c['verified'] and len(c['results'])==9
assert sum(x['exit']==0 for x in c['results'])==6 and sum(x['exit']!=0 for x in c['results'])==3
for p,key in [(v/'preflight/pm-checks/verified.json','verified'),(v/'preflight/runtime/verified.json','passed'),(v/'preflight/prefix-phase-listing/verified.json','verified')]:assert json.loads(p.read_text())[key]
assert json.loads((v/'preflight/runtime/resource.json').read_text())['status']=='removed'
assert json.loads((v/'preflight/runtime/image-provenance.json').read_text())['verified_blobs']==18
assert json.loads((v/'preflight/runtime/latest-stable-npm.json').read_text())['registry_versions']=={'@openai/codex':'0.162.1','@earendil-works/pi-coding-agent':'1.1.0'}
original=Path('runs/instruction-effects/eval-010/preflight/deletion057-native-original1-full01/verified.json');assert json.loads(original.read_text())['verified']
prior=json.loads(Path('experiments/instruction-effects/revisions/research-v010/analysis-plan.json').read_text());plan=json.loads((v/'analysis-plan.json').read_text());assert plan['status']=='draft-before-main-dispatch'
changed={k for k in prior.keys()|plan.keys() if prior.get(k)!=plan.get(k)};assert changed<={'revision_id','status','limitations','lineage','adoption_evidence','frozen_at'},changed
plan['status']='frozen-before-main-dispatch';plan['frozen_at']=timestamp();write_json(v/'analysis-plan.json',plan)
write_json(v/'preflight/adoption/plan-freeze.json',{'utc':plan['frozen_at'],'verified':True,'native_model_calls':0,'baseline':str(baselines[0]),'baseline_variants':18,'directed_controls':str(controls[0]),'directed_variants':9,'full_checks_per_mode':68,'pm_checks':178,'mathematical_and_stopping_rules_unchanged':True,'changed_plan_fields':sorted(changed),'source_run':'pilot-015','prior_run_superseded':'eval-010','comparison_correction':'057explicitviewreselectionafterreload','future21through40_unfrozen':True})
print('Frozenresearchv011afterverifiedreloadviewcontrols')
