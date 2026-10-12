"""Bind fresh preparation publication to an exact scanned committed snapshot."""
import argparse,hashlib,json,shutil,subprocess
from pathlib import Path
from datetime import datetime,timezone
from orchestrator.task_stream import stream_input_hash
parser=argparse.ArgumentParser();parser.add_argument('action',choices=['scan','publish']);args=parser.parse_args();repo=Path.cwd();run=repo/'runs/instruction-effects/eval-015';prior=repo/'runs/instruction-effects/eval-014'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def git(*args,cwd=repo):return subprocess.check_output(['git','-C',str(cwd),*args],text=True).strip()
assert json.loads((run/'state.json').read_text())['status']=='prepared' and not (run/'events.jsonl').exists() and not (run/'usage.jsonl').exists()
proof=run/'preflight/preparation/independently-verified.json';assert json.loads(proof.read_text())['verified']
index=prior/'preflight/terminal-publication-index001/verified.json';old=json.loads(index.read_text());assert old['verified'] and len(old['refs'])==790
prefix=repo/'.local/eval015-preparation-publication001';snapshot=Path(str(prefix)+'-snapshot');scan_path=Path(str(prefix)+'-scan.json');binding=Path(str(prefix)+'-binding.json')
if args.action=='scan':
 assert not snapshot.exists() and not scan_path.exists() and not binding.exists() and not git('diff','--name-only','HEAD')
 target=git('rev-parse','HEAD');refs={}
 for path in git('ls-tree','-r','--name-only',target,'runs/instruction-effects').splitlines():
  if not path.endswith('/index.json') or '/builders/' not in path or '/checkpoints/' not in path:continue
  item=json.loads(git('show',target+':'+path))
  for ref in item.get('github_refs',[]):
   assert ref.startswith('refs/heads/builders/instruction-effects/') and git('rev-parse',ref)==item['source_commit']
   if ref in refs:assert refs[ref]==item['source_commit']
   refs[ref]=item['source_commit']
 assert all(refs.get(ref)==commit for ref,commit in old['refs'].items())
 try:
  subprocess.run(['git','clone','--shared','--single-branch','--branch','main','--quiet',str(repo),str(snapshot)],check=True,capture_output=True)
  assert git('rev-parse','HEAD',cwd=snapshot)==target
  subprocess.run(['git','-C',str(snapshot),'update-ref','--stdin'],input=''.join(f'update {ref} {commit}\n' for ref,commit in refs.items()),text=True,capture_output=True,check=True)
  with scan_path.open('w') as stream:subprocess.run(['python3','-B',str(repo/'scripts/scan-publication.py'),'--repo',str(snapshot)],stdout=stream,check=True)
  scan=json.loads(scan_path.read_text());assert scan['status']=='passed' and scan['target_git_commit']==target
  binding.write_text(json.dumps({'target':target,'all_scanned_history_refs':refs,'manifest_sha256':sha(run/'manifest.json'),'preparation_proof_sha256':sha(proof),'prefix_sha256':stream_input_hash(run),'scan_sha256':sha(scan_path),'original_index_sha256':sha(index),'snapshot_removed_on_return':True,'scope':'Committed prepared eval015 and all reachable indexed original histories; active uncommitted PM fixture output excluded.'},indent=2)+'\n')
  print(json.dumps({'verified':True,'target':target,'scanned_history_refs':len(refs)}))
 finally:
  if snapshot.exists():shutil.rmtree(snapshot)
else:
 bound=json.loads(binding.read_text());target=bound['target'];scan=json.loads(scan_path.read_text());assert not snapshot.exists() and git('rev-parse','HEAD')==target and not git('diff','--name-only','HEAD')
 assert scan['status']=='passed' and scan['target_git_commit']==target and sha(scan_path)==bound['scan_sha256'] and sha(run/'manifest.json')==bound['manifest_sha256'] and sha(proof)==bound['preparation_proof_sha256'] and stream_input_hash(run)==bound['prefix_sha256'] and sha(index)==bound['original_index_sha256']
 assert all(git('rev-parse',ref)==commit for ref,commit in bound['all_scanned_history_refs'].items())
 subprocess.run(['git','push','--atomic','origin',target+':refs/heads/main',*[f'{commit}:{ref}' for ref,commit in old['refs'].items()]],check=True,capture_output=True,text=True)
 remote=dict(line.split()[::-1] for line in git('ls-remote','origin','refs/heads/main',*old['refs']).splitlines());assert remote['refs/heads/main']==target and all(remote.get(ref)==commit for ref,commit in old['refs'].items())
 reports=run/'reports';reports.mkdir(exist_ok=True);output=reports/'preparation-publication001.json';assert not output.exists();output.write_text(json.dumps({'utc':datetime.now(timezone.utc).isoformat(),'pm_commit':target,'run_status':'prepared','frozen_rounds':20,'fresh_builder_roots':12,'native_model_calls':0,'remote_verified':True,'retained_eval014_refs_verified':790,'all_scanned_history_refs':len(bound['all_scanned_history_refs']),'scan_sha256':sha(scan_path),'scan_status':'passed','manifest_sha256':bound['manifest_sha256'],'prefix_sha256':bound['prefix_sha256']},indent=2)+'\n');print(json.dumps({'published':target,'remote_verified':True}))
