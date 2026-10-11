import json,os,re,subprocess,hashlib
from pathlib import Path
from orchestrator.prepare import write_json,file_hashes
from orchestrator.evidence import timestamp
v=Path('experiments/instruction-effects/revisions/research-v011');draft=v/'decisions/next-round-preparation';out=v/'preflight/next-round-phase-listing';out.mkdir(exist_ok=False)
source=json.loads((draft/'prepared.json').read_text());rows=[]
for task in source['rounds']:
 stage=task['stage'];requirement=draft/f'task-{stage:03d}/requirements.md';assert hashlib.sha256(requirement.read_bytes()).hexdigest()==task['requirements_sha256']
 for phase,n in [*task['expected_phase_checks'].items(),(f'observation-{stage}',1)]:
  tested=stage-1 if phase=='upgrade' else stage;suite=v/'preflight/task020-executed-suite' if tested==20 else draft/'cumulative-suite';env=dict(os.environ,FF_STAGE=str(tested),FF_PHASE=phase,FF_FIXTURE_PREFIX=f'task-{tested:03d}',FF_BASE_URL='http://127.0.0.1:1');p=subprocess.run(['node_modules/.bin/playwright','test','--list','--reporter=line','--config',str(suite/'playwright.config.mjs')],env=env,capture_output=True,text=True,check=True);match=re.search(r'Total: (\d+) tests?',p.stdout);assert match and int(match[1])==n,(stage,phase,p.stdout,p.stderr);(out/f'{stage:03d}-{phase}.log').write_text(p.stdout+p.stderr);rows.append({'target_stage':stage,'phase':phase,'tested_stage':tested,'expected':n,'listed':int(match[1]),'suite_files':file_hashes(suite),'requirement_sha256':task['requirements_sha256']})
write_json(out/'verified.json',{'utc':timestamp(),'verified':True,'native_calls':0,'frozen':False,'dispatched':False,'phase_listings':rows,'limitations':'Listings only; copied v010behavioralproof does not verify modified v011suite. Full cumulative, native phases, shared20/audit/inspection still required before future dispatch.'})
print('Verified40prospectivephase listings for21through30')
