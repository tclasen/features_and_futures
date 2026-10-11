import json,shutil
from pathlib import Path
from orchestrator.prepare import ROOT,write_json,file_hashes,git
from orchestrator.task_stream import task_stream,suite_for_stage
from orchestrator.restore_readiness import verify_restore_only_delta
from orchestrator.evidence import timestamp,digest_bytes,digest_json
r=ROOT/'runs/instruction-effects/eval-014';v=ROOT/'experiments/instruction-effects/revisions/research-v014';source=ROOT/'runs/instruction-effects/eval-013';load=lambda p:json.loads(p.read_text())
m=load(r/'manifest.json');phase=load(r/'preflight/phase-listing/verified.json');assert phase['verified'] and len(phase['phase_listings'])==59
for row in phase['phase_listings']:assert file_hashes(suite_for_stage(r,row['tested_stage']))==row['suite_files']
assert digest_json(m)==(r/'manifest.sha256').read_text().strip();assert file_hashes(r/'definitions')==m['provenance']['definition_hashes'];assert digest_bytes((v/'analysis-plan.json').read_bytes())==m['research']['analysis_plan']['sha256'];assert len(task_stream(r))==20 and not (r/'events.jsonl').exists()
prior={t['stage']:t for t in task_stream(source)}
for t in task_stream(r):
 stage=t['stage'];assert t['packet_sha256']==prior[stage]['packet_sha256'];a=file_hashes(suite_for_stage(source,stage));b=file_hashes(suite_for_stage(r,stage));assert verify_restore_only_delta(suite_for_stage(source,stage),suite_for_stage(r,stage));assert b==file_hashes(v/f'decisions/frozen-prefix-drafts/task-{stage:03d}/suite')
roots=[]
for conf in m['runtime']['builder_configurations']:
 p=Path(m['paths']['builders'])/conf['builder_id'];assert git(p,'rev-parse','HEAD')==m['provenance']['starter_commit'];assert git(p,'rev-parse','HEAD^{tree}')==m['provenance']['starter_tree'];assert not git(p,'status','--porcelain');assert not git(p,'remote');roots.append(conf['builder_id'])
assert len(roots)==12 and m['provenance']['starter_commit']=='ff430da8d7d2af7cf48edc40f841a2dfe03e59ce'
base=next((v/'preflight').glob('all-restore-full-check-*/verified.json'));control=next((v/'preflight').glob('all-restore-directed-check-*/verified.json'))
for p,count in [(base,24),(control,18)]:d=load(p);assert d['verified'] and len(d['results'])==count and load(p.parent/'input-closure.json')['verified']
pm=load(v/'preflight/pm-checks/all-restore-preparation-verified.json');assert pm['tests']==178 and pm['verified']
for name,h in pm['code_files'].items():assert digest_bytes((ROOT/name).read_bytes())==h
assert load(v/'preflight/runtime/verified.json')['passed'] and load(v/'preflight/runtime/resource.json')['status']=='removed' and load(v/'preflight/runtime/retirement-verified.json')['verified'];assert load(v/'preflight/runtime/image-provenance.json')['verified_blobs']==18
native=source/'preflight/restore-navigation-full-replay-002/verified.json';n=load(native);assert n['verified'] and n['source_unchanged'] and n['full_cumulative_3_cases']==11 and n['own_prior2_upgrade_passed'] and n['actual_restart_passed'] and load(native.parent/'resource.json')['inventory_absence_verified']
assert load(source/'state.json')['status']=='superseded' and load(source/'preflight/terminal-preservation/owned-inventory-after.json')['remaining_sandboxes']==[]
assert load(r/'preflight/preparation/prospective-observer-adoption.json')['verified']
proof={'utc':timestamp(),'native_dispatch_ready':True,'native_model_calls':0,'plan_sha256':m['research']['analysis_plan']['sha256'],'manifest_sha256':digest_json(m),'full_pm_checks':178,'phase_listings':59,'frozen_rounds':20,'fresh_starter_only_roots':roots,'all20packets_identical_to_eval013':True,'changed_acceptance_guarded_from3':'14 project Restore callers across cumulative20; readiness waits only','native_original_proof':str(native.relative_to(ROOT)),'synthetic_positive_and_fault_fixture':str(control.relative_to(ROOT)),'full68baseline_eight_rendering_restore_variants':str(base.relative_to(ROOT)),'baseline_variants_including_synthetic_lifecycle_probes':24,'native_runtime_restored_removed':True,'all18imageblobs_reverified':True,'latest_harness_versions':load(r/'preflight/preparation/verified.json')['latest_stable_npm'],'gateway_lifecycle':'drain-upstream-and-partial-response-v1','mathematical_and_stopping_rules_unchanged':True,'original_exposures_retained':True,'limitations':['PM conversation usage unavailable','Hosted aliases do not prove immutable weights','Unknown native costs require containing bounds','Synthetic lifecycle probes do not replace native restarts'],'future_features':'21–40 remain unfrozen pending common20, audits, first allowed inspection and behavior gates','resources_left_behind':[]}
write_json(r/'preflight/preparation/final-adoption.json',proof);write_json(v/'preflight/adoption/verified.json',proof);shutil.copy2(__file__,r/'preflight/preparation/finalize-controller.py');print('Preparedfreshnativeeval014with20identicalpublicpackets')
