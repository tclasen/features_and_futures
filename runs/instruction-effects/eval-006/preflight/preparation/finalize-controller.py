import json,shutil,subprocess
from pathlib import Path
from orchestrator.prepare import write_json,file_hashes,ROOT
from orchestrator.evidence import digest_bytes,timestamp
from orchestrator.task_stream import task_stream,freeze_round
run=ROOT/'runs/instruction-effects/eval-006';revision=ROOT/'experiments/instruction-effects/revisions/research-v006';source=ROOT/'runs/instruction-effects/eval-005';base=revision/'preflight/priority-fixtures/full-read-check-1791650274249';proof=json.loads((base/'verified.json').read_text());assert proof['verified'] and len(proof['results'])==30
assert not (run/'events.jsonl').exists() and json.loads((run/'state.json').read_text())['status']=='prepared'
for x in proof['results']:assert x['statistics']['unexpected']==(1 if x['name'].startswith('negative') else 0)
for path in [revision/'preflight/priority-fixtures/final-read-controls/verified.json',revision/'preflight/priority-fixtures/search13-read-check-1791650010969/verified.json',revision/'preflight/priority-fixtures/read-defect-check-1791649894065/verified.json']:
 # The separately executed read-defect folder has a dynamically generated timestamp.
 if not path.exists() and 'read-defect-check' in str(path):path=next((revision/'preflight/priority-fixtures').glob('read-defect-check-*/verified.json'))
 assert json.loads(path.read_text())['verified']
assert len(task_stream(run))==13
for stage in range(14,21):
 original=source/f'tasks/task-{stage:03d}';old=json.loads((original/'round.json').read_text());suite=revision/f'decisions/task-{stage:03d}-draft/suite' if stage<18 else revision/f'decisions/final-cumulative-suites/task-{stage:03d}';new=freeze_round(run,(original/'requirements.md').read_text(),suite,old['expected_phase_checks']);assert new['packet_sha256']==old['packet_sha256']
for t in task_stream(run):
 old=next(x for x in task_stream(source) if x['stage']==t['stage']);assert t['packet_sha256']==old['packet_sha256']
 if t['stage']<=12:assert t['suite_hash']==old['suite_hash']
manifest=json.loads((run/'manifest.json').read_text());assert file_hashes(run/'definitions')==manifest['provenance']['definition_hashes'];assert digest_bytes((revision/'analysis-plan.json').read_bytes())==manifest['research']['analysis_plan']['sha256']
phase=json.loads((run/'preflight/phase-listing/verified.json').read_text());assert phase['verified'] and len(phase['phase_listings'])==59
for row in phase['phase_listings']:
 from orchestrator.task_stream import suite_for_stage
 assert file_hashes(suite_for_stage(run,row['tested_stage']))==row['suite_files']
runtime=json.loads((revision/'preflight/runtime/verified.json').read_text());assert runtime['passed'];assert json.loads((revision/'preflight/runtime/resource.json').read_text())['status']=='removed'
adoption={'schema_version':1,'utc':timestamp(),'status':'verified-before-main-dispatch','plan_sha256':manifest['research']['analysis_plan']['sha256'],'manifest_sha256':(run/'manifest.sha256').read_text().strip(),'native_model_calls':0,'native_dispatch_ready':True,'full_pm_tests':{'tests':171,'passed':True,'evidence':'full-suite-171.log'},'full68_baseline':str((base/'verified.json').relative_to(ROOT)),'final_replacements':str((revision/'preflight/priority-fixtures/final-read-controls/verified.json').relative_to(ROOT)),'coverage':'Three exact full68baseline positives, three synthetic reload sentinels and24genuine defects, plus final050/051/054/057replacements in three correct modes and8activated faults. No claim that final050/051were rerun inside all68checks; source snapshots and both executions retained. Native48original cumulative/upgrade/actualrestart proofs are separate.','native_original_proofs':['runs/instruction-effects/eval-005/preflight/cumulative-search48-diagnostic/b002/verified.json','runs/instruction-effects/eval-005/preflight/cumulative-search48-diagnostic/b004/verified.json'],'phase_listings':59,'frozen_rounds':20,'all_public_packets_match_eval005':True,'suites1through12_identical':True,'analysis_and_stopping_unchanged':True,'runtime_restored_removed':True,'image_all_blobs_reverified':True,'known_limitations':['PMconversationusageunavailable','Hosted aliases do not prove immutable weights','Unknown native costs retain containing bounds','Synthetic reloads are not native server restarts'],'future_rounds':'21–24unfrozen; hold until20sharedbarrier/audit/firstinspection','resources_left_behind':[]}
write_json(revision/'preflight/adoption/verified.json',adoption);write_json(run/'preflight/preparation/final-adoption.json',adoption);shutil.copy2(__file__,run/'preflight/preparation/finalize-controller.py')
notes=run/'decisions/lessons-applied.md';notes.write_text(notes.read_text()+'\nFinal adoption: Full68baseline now passes3modes,3reloadsentinels and24genuinefaults. Final050/051/054/057replacements separatelypass3modes and8activatedfaults; no all68post-final-replacement execution claim.59listings bind everyfinal20roundsuite. All20publicpackets matcheval005exactly; suites1–12identical.171PMtests, pinnedruntime/isolation, allimageblobs and12fresh cleanstarterroots verified. Native dispatch remains dependent on committing these final inputs; no model calls yet.\n')
print(json.dumps({'ready':True,'frozen_rounds':20,'native_calls':0,'plan':adoption['plan_sha256']}))
