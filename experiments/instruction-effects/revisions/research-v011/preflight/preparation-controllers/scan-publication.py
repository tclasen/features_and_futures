from pathlib import Path
import json,subprocess,shutil
from orchestrator.task_stream import task_stream
from orchestrator.prepare import file_hashes
repo=Path.cwd();run=repo/'runs/instruction-effects/eval-011';manifest=json.loads((run/'manifest.json').read_text());adoption=json.loads((run/'preflight/preparation/final-adoption.json').read_text());assert adoption['native_dispatch_ready'];assert len(task_stream(run))==20 and not (run/'events.jsonl').exists();assert file_hashes(run/'definitions')==manifest['provenance']['definition_hashes']
target=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],text=True).strip();clone=repo/'.local/eval011-preparation-publication-snapshot';assert not clone.exists()
try:
 subprocess.run(['git','clone','--shared','--single-branch','--branch','main','--quiet',str(repo),str(clone)],check=True)
 assert subprocess.check_output(['git','-C',str(clone),'rev-parse','HEAD'],text=True).strip()==target
 refs={}
 for runid,count in [('eval-009',290),('eval-010',242)]:
  paths=subprocess.check_output(['git','ls-tree','-r','--name-only',target,f'runs/instruction-effects/{runid}/builders/'],text=True).splitlines();indexes=[p for p in paths if p.endswith('/index.json')];assert len(indexes)==count
  for path in indexes:
   index=json.loads(subprocess.check_output(['git','show',target+':'+path],text=True))
   for ref in index['github_refs']:
    assert ref.startswith('refs/heads/builders/instruction-effects/'+runid+'/');sha=subprocess.check_output(['git','rev-parse',ref],text=True).strip();assert sha==index['source_commit'];refs[ref]=sha
 assert len(refs)==1064
 subprocess.run(['git','-C',str(clone),'update-ref','--stdin'],input=''.join('update '+r+' '+s+'\n' for r,s in refs.items()),text=True,capture_output=True,check=True)
 out=repo/'.local/eval011-preparation-publication-scan.json'
 with out.open('w') as f:subprocess.run(['python3','-B',str(repo/'scripts/scan-publication.py'),'--repo',str(clone)],stdout=f,check=True)
 scan=json.loads(out.read_text());assert scan['status']=='passed' and scan['target_git_commit']==target
 print(json.dumps({'verified':True,'target':target,'original_history_refs':len(refs),'native_calls':0}))
finally:
 if clone.exists():shutil.rmtree(clone)
