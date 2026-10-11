import json,shutil
from pathlib import Path
from orchestrator.prepare import ROOT,write_json,file_hashes,git
from orchestrator.task_stream import task_stream,suite_for_stage
from orchestrator.evidence import timestamp,digest_bytes,digest_json
r=ROOT/'runs/instruction-effects/eval-012';v=ROOT/'experiments/instruction-effects/revisions/research-v012'
m=json.loads((r/'manifest.json').read_text());phase=json.loads((r/'preflight/phase-listing/verified.json').read_text());assert phase['verified'] and len(phase['phase_listings'])==59
for row in phase['phase_listings']:assert file_hashes(suite_for_stage(r,row['tested_stage']))==row['suite_files']
assert digest_json(m)==(r/'manifest.sha256').read_text().strip();assert file_hashes(r/'definitions')==m['provenance']['definition_hashes'];assert digest_bytes((v/'analysis-plan.json').read_bytes())==m['research']['analysis_plan']['sha256'];assert len(task_stream(r))==20 and not (r/'events.jsonl').exists()
source=ROOT/'runs/instruction-effects/eval-011';prior={t['stage']:t for t in task_stream(source)}
for task in task_stream(r):
 assert task['packet_sha256']==prior[task['stage']]['packet_sha256']
 a=file_hashes(suite_for_stage(source,task['stage']));b=file_hashes(suite_for_stage(r,task['stage']));assert a.keys()==b.keys();assert [k for k in a if a[k]!=b[k]]==(['search-whitespace.spec.mjs'] if task['stage']>=14 else [])
roots=[]
for conf in m['runtime']['builder_configurations']:
 p=Path(m['paths']['builders'])/conf['builder_id'];assert git(p,'rev-parse','HEAD')==m['provenance']['starter_commit'];assert git(p,'rev-parse','HEAD^{tree}')==m['provenance']['starter_tree'];assert not git(p,'status','--porcelain');assert not git(p,'remote');roots.append(conf['builder_id'])
assert len(roots)==12 and m['provenance']['starter_commit']=='ff430da8d7d2af7cf48edc40f841a2dfe03e59ce'
baseline=next((v/'preflight').glob('task020-full01-check-*/verified.json'));control=next((v/'preflight').glob('search051-check-*/verified.json'))
for p,n in [(baseline,18),(control,24)]:d=json.loads(p.read_text());assert d['verified'] and len(d['results'])==n;assert json.loads((p.parent/'input-closure.json').read_text())['verified']
assert json.loads((v/'preflight/pm-checks/verified.json').read_text())['tests']==178
assert json.loads((v/'preflight/runtime/retirement-verified.json').read_text())['verified'];assert json.loads((v/'preflight/runtime/verified.json').read_text())['passed'];assert json.loads((v/'preflight/runtime/resource.json').read_text())['status']=='removed';assert json.loads((v/'preflight/runtime/image-provenance.json').read_text())['verified_blobs']==18
native=source/'preflight/search-readiness-full-replay-003/verified.json';n=json.loads(native.read_text());assert n['verified'] and n['original_source_unchanged'] and n['actual_process_restart_passed'];assert json.loads((source/'preflight/repair-observations/search-readiness-diagnostic-retirement-verified.json').read_text())['verified']
proof={'utc':timestamp(),'native_dispatch_ready':True,'native_model_calls':0,'plan_sha256':m['research']['analysis_plan']['sha256'],'manifest_sha256':digest_json(m),'full_pm_checks':178,'phase_listings':59,'frozen_rounds':20,'fresh_starter_only_roots':roots,'all20packets_identical_to_eval011':True,'suites1through13_identical':True,'changed_acceptance_from14':['search-whitespace.spec.mjs:051 omit redundant initial empty search submission'],'native_original_proof':str(native.relative_to(ROOT)),'synthetic_positive_and_negative_fixture':str(control.relative_to(ROOT)),'full68baseline_three_modes_and_two_reload_policies':str(baseline.relative_to(ROOT)),'native_runtime_restored_removed':True,'all18imageblobs_reverified':True,'latest_harness_versions':json.loads((r/'preflight/preparation/verified.json').read_text())['latest_stable_npm'],'gateway_lifecycle':'drain-upstream-and-partial-response-v1','mathematical_and_stopping_rules_unchanged':True,'original_exposures_retained':True,'limitations':['PM conversation usage unavailable','Hosted aliases do not prove immutable weights','Unknown native costs have containing bounds','Synthetic lifecycle probes do not replace native restarts'],'future_features':'21–40 unfrozen pending shared20, audit, first allowed inspection and full readiness gates','resources_left_behind':[]}
write_json(r/'preflight/preparation/final-adoption.json',proof);write_json(v/'preflight/adoption/verified.json',proof);shutil.copy2(__file__,r/'preflight/preparation/finalize-controller.py');print('Prepared fresh native eval012 with20frozen identical public packets')
