import json,os,re,subprocess,shutil
from pathlib import Path
from orchestrator.task_stream import task_stream,suite_for_stage
from orchestrator.workload import phase_expectations
from orchestrator.prepare import file_hashes
from orchestrator.evidence import timestamp
run=Path('runs/instruction-effects/eval-006').resolve();root=Path('experiments/instruction-effects/revisions/research-v006').resolve();out=run/'preflight/phase-listing';out.mkdir(exist_ok=False);shutil.copy2(__file__,out/'controller.py');actual={t['stage']:t for t in task_stream(run)};results=[]
def suite(stage):
 if stage<=13:return suite_for_stage(run,stage)
 if stage<18:return root/f'decisions/task-{stage:03d}-draft/suite'
 return root/f'decisions/final-cumulative-suites/task-{stage:03d}'
for stage in range(1,21):
 task=actual[stage] if stage<=13 else json.loads(Path(f'runs/instruction-effects/eval-005/tasks/task-{stage:03d}/round.json').read_text())
 for phase,expected in phase_expectations(task).items():
  tested=stage-1 if phase=='upgrade' else stage;path=suite(tested);env=dict(os.environ,FF_STAGE=str(tested),FF_PHASE=phase,FF_FIXTURE_PREFIX=f'task-{tested:03d}',FF_BASE_URL='http://127.0.0.1:1')
  p=subprocess.run(['node_modules/.bin/playwright','test','--list','--reporter=line','--config',str(path/'playwright.config.mjs')],env=env,text=True,capture_output=True,check=True);match=re.search(r'Total: (\d+) tests?',p.stdout);assert match and int(match[1])==expected,(stage,phase,p.stdout,p.stderr);results.append({'target_stage':stage,'phase':phase,'tested_stage':tested,'expected':expected,'listed':int(match[1]),'suite':str(path),'suite_files':file_hashes(path)});print(stage,phase,expected,flush=True)
(out/'verified.json').write_text(json.dumps({'verified':True,'utc':timestamp(),'native_calls':0,'phase_listings':results,'limitations':'Listing only; does not substitute for executing behavioral checks, native upgrade or actual process restart.'},indent=2)+'\n')
