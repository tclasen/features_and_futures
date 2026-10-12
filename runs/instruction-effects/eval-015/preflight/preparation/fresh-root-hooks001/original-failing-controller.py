"""Independently verify prepared fresh roots and first20 inherited rounds."""
import hashlib,json,os,subprocess
from pathlib import Path
from datetime import datetime,timezone
from orchestrator.prepare import file_hashes
from orchestrator.evidence import digest_json
from orchestrator.task_stream import task_stream,suite_for_stage
from orchestrator.summary_readiness import verify_summary_only_delta
run=Path('runs/instruction-effects/eval-015');source=Path('runs/instruction-effects/eval-014');v=Path('experiments/instruction-effects/revisions/research-v015');manifest=json.loads((run/'manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert manifest['run_id']=='eval-015' and manifest['experiment_revision']=='research-v015' and manifest['purpose']=='research-discovery'
assert digest_json(manifest)==(run/'manifest.sha256').read_text().strip() and file_hashes(run/'definitions')==manifest['provenance']['definition_hashes']
assert sha(v/'analysis-plan.json')==manifest['research']['analysis_plan']['sha256'] and json.loads((v/'analysis-plan.json').read_text())['status']=='frozen-before-main-dispatch'
assert not (run/'events.jsonl').exists() and not (run/'usage.jsonl').exists() and json.loads((run/'state.json').read_text())['status']=='prepared'
prepared=json.loads((run/'preflight/preparation/verified.json').read_text());assert prepared['native_model_calls']==0 and prepared['source_run']=='pilot-015'
assert prepared['latest_stable_npm']=={'@openai/codex':'0.162.1','@earendil-works/pi-coding-agent':'1.1.0'}
assert len(manifest['runtime']['builder_configurations'])==12
configs=manifest['runtime']['builder_configurations'];assert {b['model'] for b in configs}=={'gpt-6-luna','gpt-6.1-sol'}
root=Path(manifest['paths']['builders']);starter=manifest['provenance']['starter_commit'];tree=prepared['starter_tree'];assert starter=='ff430da8d7d2af7cf48edc40f841a2dfe03e59ce'
env=dict(os.environ,GIT_OPTIONAL_LOCKS='0')
def git(path,*args):return subprocess.check_output(['git','-C',str(path),*args],text=True,env=env).strip()
roots=[]
for identity in ['starter',*[b['builder_id'] for b in configs]]:
 p=root/identity;assert git(p,'rev-parse','HEAD')==starter and git(p,'rev-parse','HEAD^{tree}')==tree and not git(p,'status','--porcelain') and not git(p,'remote')
 assert git(p,'config','core.hooksPath')=='/dev/null'
 roots.append({'identity':identity,'path':str(p),'commit':starter,'tree':tree,'clean':True,'no_remotes':True})
original={t['stage']:t for t in task_stream(source)};tasks=task_stream(run);assert len(tasks)==20
for t in tasks:
 stage=t['stage'];assert t['packet_sha256']==original[stage]['packet_sha256'] and t['expected_phase_checks']==original[stage]['expected_phase_checks']
 assert verify_summary_only_delta(suite_for_stage(source,stage),suite_for_stage(run,stage))==([] if stage<12 else ['return-order.spec.mjs'])
 assert file_hashes(suite_for_stage(run,stage))==file_hashes(v/f'decisions/frozen-prefix-drafts/task-{stage:03d}/suite')
output=run/'preflight/preparation/independently-verified.json';assert not output.exists();output.write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'manifest_sha256':sha(run/'manifest.json'),'analysis_plan_sha256':sha(v/'analysis-plan.json'),'starter_commit':starter,'starter_tree':tree,'fresh_roots':roots,'frozen_rounds':20,'identical_public_packets':True,'only_summary_reader_delta_from12':True,'latest_stable_harnesses_match':True,'no_developed_builder_source_inherited':True,'verifier_sha256':sha(Path(__file__)),'scope':'Host starter/root/definition/prefix preparation only. Fresh sandbox isolation and native first-request delivery/accounting still require checks at dispatch; no model outcome or study completion established.'},indent=2)+'\n');print('Independently verified12 fresh roots, common starter and20 inherited packet/suite pairs')
