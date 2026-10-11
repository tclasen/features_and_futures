"""Fail-closed freeze gate for the prospective summary observer revision.
Prepared on host while browser fixtures run; execution requires their terminal proofs.
"""
import hashlib,json,shutil
from pathlib import Path
from orchestrator.prepare import file_hashes,write_json
from orchestrator.evidence import timestamp
from orchestrator.summary_readiness import verify_summary_only_delta
from orchestrator.task_stream import task_stream,suite_for_stage
v=Path('experiments/instruction-effects/revisions/research-v015');prior=Path('experiments/instruction-effects/revisions/research-v014');run=Path('runs/instruction-effects/eval-014')
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bind_files(folder,proof,key='files'):
 for name,h in proof[key].items():assert sha(folder/name)==h,(folder,name)
plan=load(v/'analysis-plan.json');old=load(prior/'analysis-plan.json')
assert plan['status']=='prepared-unfrozen' and load(run/'state.json')['status']=='superseded'
changed={k for k in old.keys()|plan.keys() if old.get(k)!=plan.get(k)}
assert changed<={'revision_id','status','lineage','adoption_evidence','frozen_at'},changed
assert plan['primary_family_size']==36 and plan['stopping']['required_independent_batches']==2
assert plan['stopping']['source_line_threshold'] is None and plan['stopping']['fixed_task_limit'] is None
pm_path=v/'preflight/pm-regression003/verified.json';pm=load(pm_path);pm_inputs=v/'preflight/pm-regression003-inputs.json'
assert pm['verified'] and pm['checks']==192 and pm['input_sha256']==sha(pm_inputs)
assert pm['terminal_log_sha256']==sha(pm_path.parent/'terminal.log')
for name,h in load(pm_inputs)['source_files'].items():assert sha(Path(name))==h,name
ph_path=v/'preflight/prefix-phase-listing/independently-verified.json';ph=load(ph_path)
assert ph['verified'] and ph['phase_listings']==89 and ph['stages']==30
bind_files(ph_path.parent,ph,'originals')
metadata={t['stage']:t for t in task_stream(run)};assert len(metadata)>=30
for stage in range(1,31):
 draft=v/f'decisions/frozen-prefix-drafts/task-{stage:03d}'
 assert (draft/'packet.md').read_bytes()==(run/f'tasks/task-{stage:03d}/packet.md').read_bytes()
 delta=verify_summary_only_delta(suite_for_stage(run,stage),draft/'suite')
 assert delta==([] if stage<12 else ['return-order.spec.mjs'])
full=list((v/'preflight').glob('task030-summary-full001-check-*/independently-verified.json'));assert len(full)==1
full_path=full[0];f=load(full_path);assert f['verified'] and f['model_calls']==0 and f['full99_variants']==8 and f['process_local_probes']==16
assert sum(x['tests'] for x in f['checks'])==808 and len(f['checks'])==24
assert f['input_closure_sha256']==sha(full_path.parent/'input-closure.json')
closure=load(full_path.parent/'input-closure.json');assert closure['exit_code']==0
bind_files(full_path.parent,closure)
assert file_hashes(v/'preflight/task030-summary-suite')==file_hashes(v/'decisions/frozen-prefix-drafts/task-030/suite')
for name in ['summary043-native-replay-002','summary043-native-full-003']:
 folder=prior/'preflight'/name;n=load(folder/'independently-verified.json');assert n['verified'] and n['model_calls']==0
 assert n['source_commit']=='e255bb0df3cc27fc0e649c880a4538782cf4a6f0' and n['source_tree']=='3340c2eb6ea812f38e9070f7cacbea86f213f3aa'
 bind_files(folder,n)
 if name.endswith('full-003'):
  assert [(x['phase'],x['count'],x['passed']) for x in n['checks']]==[('upgrade',1,True),('acceptance',83,True),('postrestart',1,True)]
 else:assert len(n['checks'])==6 and sum(x['passed'] for x in n['checks'])==3
 r=load(folder/'resource.json');assert r['status']=='removed' and r['inventory_absence_verified']
focused=list((prior/'preflight').glob('summary043-focused-fixture001-check-*/independently-verified.json'));assert len(focused)==1
c=load(focused[0]);assert c['verified'] and c['positive_modes']==3 and c['positive_cases_per_mode']==3 and c['genuine_faults']==3
bind_files(focused[0].parent,c)
runtime=load(v/'preflight/runtime/verified.json')
assert all(runtime[k] for k in ('passed','isolation_passed','versions_passed','source_history_restored','full_working_tree_independently_restored','inventory_absence_verified'))
for name,h in runtime['archive_sha256'].items():assert sha(v/'preflight/runtime'/name)==h
assert load(v/'preflight/runtime/resource.json')['status']=='removed'
image=load(v/'preflight/runtime/image-provenance.json');assert image['verified_blobs']==18 and image['all_content_addressed_blobs_rehashed'] and image['all_blob_sha256_verified']
assert load(v/'preflight/runtime/latest-stable-npm.json')['observed']=={'@openai/codex':'0.162.1','@earendil-works/pi-coding-agent':'1.1.0'}
terminal=load(run/'reports/terminal-closure.json');assert terminal['verified'] and terminal['all_terminal_resources_independently_restored_and_removed'] and terminal['terminal_resource_archives']==24
assert terminal['native_requests']==3889 and terminal['unknown_native_receipts']==5 and not terminal['analysis_ready']
assert (v/'decisions/lessons-applied.md').is_file()
plan['status']='frozen-before-main-dispatch';plan['frozen_at']=timestamp()
plan['lineage']['reason']='Confirmed frozen summary reader rejects correct layout-skipped offscreen rows; unchanged native source verifies paired original-fail/DOM-text-pass and83 cumulative checks, prior upgrade and actual restart.'
plan['lineage']['scope']='Verified prospective reader revision; fresh native starter roots and committed manifest required before dispatch.'
write_json(v/'analysis-plan.json',plan)
output=v/'preflight/adoption';output.mkdir(exist_ok=True)
shutil.copy2(__file__,output/'executed-freeze-controller.py')
write_json(output/'plan-freeze.json',{'verified':True,'utc':plan['frozen_at'],'native_model_calls':0,'mathematical_and_stopping_rules_unchanged':True,'changed_plan_fields':sorted(changed),'pm_checks':192,'phase_listings':89,'full99_variants':8,'process_local_probes':16,'only_summary_reader_delta':True,'native_source_full_cases':83,'actual_native_restart_verified':True,'prior_run':'eval-014','fresh_source_run':'pilot-015','future031040_unfrozen':True,'evidence_sha256':{str(p):sha(p) for p in [pm_path,ph_path,full_path,*focused,prior/'preflight/summary043-native-replay-002/independently-verified.json',prior/'preflight/summary043-native-full-003/independently-verified.json',v/'preflight/runtime/verified.json',run/'reports/terminal-closure.json']}})
print('Frozen research-v015 only after all declared gates verified')
