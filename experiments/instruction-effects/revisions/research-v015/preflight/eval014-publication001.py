"""Scan an exact committed snapshot before authorized original-history publication."""
import argparse,hashlib,json,shutil,subprocess
from pathlib import Path
from datetime import datetime,timezone
parser=argparse.ArgumentParser();parser.add_argument('action',choices=['scan','publish']);args=parser.parse_args();repo=Path.cwd();run=repo/'runs/instruction-effects/eval-014'
index=run/'preflight/terminal-publication-index001/verified.json';verified=json.loads(index.read_text());assert verified['verified'] and len(verified['archives'])==395 and len(verified['refs'])==790
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def git(*args,cwd=repo):return subprocess.check_output(['git','-C',str(cwd),*args],text=True).strip()
clone=repo/'.local/eval014-terminal-publication001-snapshot';scan_path=repo/'.local/eval014-terminal-publication001-scan.json';binding=repo/'.local/eval014-terminal-publication001-binding.json'
assert json.loads((run/'state.json').read_text())['status']=='superseded'
if args.action=='scan':
 assert not clone.exists() and not scan_path.exists() and not binding.exists()
 assert not git('diff','--name-only','HEAD'), 'Commit tracked publication changes first'
 target=git('rev-parse','HEAD');assert json.loads(git('show',target+':'+str(index.relative_to(repo))))==verified
 refs={}
 for path in git('ls-tree','-r','--name-only',target,'runs/instruction-effects').splitlines():
  if not path.endswith('/index.json') or '/builders/' not in path or '/checkpoints/' not in path:continue
  item=json.loads(git('show',target+':'+path))
  for ref in item.get('github_refs',[]):
   assert ref.startswith('refs/heads/builders/instruction-effects/')
   commit=git('rev-parse',ref);assert commit==item['source_commit']
   if ref in refs:assert refs[ref]==commit
   refs[ref]=commit
 for ref,commit in verified['refs'].items():assert refs[ref]==commit
 try:
  subprocess.run(['git','clone','--shared','--single-branch','--branch','main','--quiet',str(repo),str(clone)],check=True,capture_output=True)
  assert git('rev-parse','HEAD',cwd=clone)==target
  subprocess.run(['git','-C',str(clone),'update-ref','--stdin'],input=''.join(f'update {ref} {commit}\n' for ref,commit in refs.items()),text=True,capture_output=True,check=True)
  with scan_path.open('w') as stream:subprocess.run(['python3','-B',str(repo/'scripts/scan-publication.py'),'--repo',str(clone)],stdout=stream,check=True)
  scan=json.loads(scan_path.read_text());assert scan['status']=='passed' and scan['target_git_commit']==target
  binding.write_text(json.dumps({'target':target,'all_scanned_history_refs':refs,'terminal_index_sha256':sha(index),'scan_sha256':sha(scan_path),'snapshot_removed_on_return':True,'scope':'Exact committed working files, decoded archives and all reachable original builder objects. Active uncommitted PM browser outputs are excluded from publication.'},indent=2)+'\n')
  print(json.dumps({'verified':True,'target':target,'all_scanned_history_refs':len(refs),'eval014_refs':790}))
 finally:
  if clone.exists():shutil.rmtree(clone)
else:
 bound=json.loads(binding.read_text());scan=json.loads(scan_path.read_text());target=bound['target'];assert not clone.exists() and scan['status']=='passed' and scan['target_git_commit']==target and sha(scan_path)==bound['scan_sha256'] and sha(index)==bound['terminal_index_sha256']
 assert git('rev-parse','HEAD')==target and not git('diff','--name-only','HEAD')
 assert all(git('rev-parse',ref)==commit for ref,commit in bound['all_scanned_history_refs'].items())
 refs=verified['refs'];subprocess.run(['git','push','--atomic','origin',target+':refs/heads/main',*[f'{commit}:{ref}' for ref,commit in refs.items()]],check=True,capture_output=True,text=True)
 remote=dict(line.split()[::-1] for line in git('ls-remote','origin','refs/heads/main',*refs).splitlines());assert remote['refs/heads/main']==target and all(remote.get(ref)==commit for ref,commit in refs.items())
 output=run/'reports/publication-terminal.json';assert not output.exists();output.write_text(json.dumps({'utc':datetime.now(timezone.utc).isoformat(),'pm_commit':target,'run_status':'superseded','last_complete_shared_round':24,'accepted_checkpoints':299,'archives':395,'published_refs':790,'refs':refs,'remote_verified':True,'all_scanned_history_refs':len(bound['all_scanned_history_refs']),'scan_sha256':sha(scan_path),'scan_status':'passed','native_model_calls':0},indent=2)+'\n')
 print(json.dumps({'published':target,'verified_refs':790}))
