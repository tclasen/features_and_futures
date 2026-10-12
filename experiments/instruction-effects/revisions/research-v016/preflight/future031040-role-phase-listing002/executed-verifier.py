import hashlib,json,re,shutil
from pathlib import Path
from datetime import datetime,timezone
from orchestrator.prepare import file_hashes
from orchestrator.action_role_readiness import verify_role_only_delta
v=Path('experiments/instruction-effects/revisions/research-v016');out=v/'preflight/future031040-role-phase-listing002';draft=v/'decisions/future031040-role-preparation002';suite=v/'preflight/task040-action-role-suite002';source=Path('experiments/instruction-effects/revisions/research-v015/preflight/task040-summary-suite');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof=json.loads((out/'verified.json').read_text());prep=json.loads((draft/'prepared.json').read_text());assert proof['verified'] and not proof['frozen'] and not proof['dispatched'] and proof['native_calls']==0
assert sha(draft/'prepared.json')==proof['preparation_sha256'] and sha(out/'executed-controller.py')==proof['controller_sha256']
assert verify_role_only_delta(source,suite) and file_hashes(suite)==prep['suite_files']
rows=proof['phase_listings'];assert len(rows)==40 and {(x['target_stage'],x['phase']) for x in rows}=={(stage,phase) for stage in range(31,41) for phase in ['acceptance','upgrade','postrestart',f'observation-{stage}']}
for row in rows:
 stage=row['target_stage'];inputs=json.loads((draft/f'task-{stage:03d}/inputs.json').read_text());requirement=draft/f'task-{stage:03d}/requirements.md';assert sha(requirement)==sha(Path(inputs['source_requirements']))==inputs['requirements_sha256']==row['requirement_sha256']
 expected=1 if row['phase'].startswith('observation-') else inputs['expected_phase_checks'][row['phase']]
 raw=(out/f"{stage:03d}-{row['phase']}.log").read_text();match=re.search(r'Total: (\d+) tests?',raw);assert match and int(match[1])==row['listed']==row['expected']==expected
 tested=stage-1 if row['phase']=='upgrade' else stage;assert row['tested_stage']==tested
 selected=v/'decisions/frozen-prefix-drafts/task-030/suite' if tested==30 else suite;assert row['suite_files']==file_hashes(selected)
assert not (out/'independently-verified.json').exists();shutil.copy2(__file__,out/'executed-verifier.py')
(out/'independently-verified.json').write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'phase_listings':40,'native_three_phase_listings':30,'synthetic_observation_listings':10,'exact_requirement_lineage':True,'only_exact_generic_role_delta':True,'originals':file_hashes(out),'scope':'Prospective031040 case enumeration only; no browser behavior, actual process restart, model outcome or native dispatch verified.'},indent=2)+'\n');print('Independently verified40 future phase listings and exact source lineage')
