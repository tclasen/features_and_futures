"""Publish an exact scanned committed closed-fifteen-round checkpoint during a live run."""
import argparse,hashlib,json,shutil,subprocess
from pathlib import Path
from datetime import datetime,timezone
parser=argparse.ArgumentParser();parser.add_argument('action',choices=['scan','publish']);args=parser.parse_args();repo=Path.cwd();run=repo/'runs/instruction-effects/eval-016';prefix=repo/'.local/eval016-checkpoint015-publication001';snapshot=Path(str(prefix)+'-snapshot');scan_path=Path(str(prefix)+'-scan.json');binding=Path(str(prefix)+'-binding.json')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def git(*args,cwd=repo):return subprocess.check_output(['git','-C',str(cwd),*args],text=True).strip()
def remote_heads():return dict((ref,commit) for commit,ref in (line.split() for line in git('ls-remote','--heads','origin').splitlines()))
audit=run/'reports/closed-rounds-015-4e64c7f42b9df9b7/verified.json';originals=run/'preflight/originals-closed-rounds-015-4e64c7f42b9df9b7/verified.json';a=json.loads(audit.read_text());o=json.loads(originals.read_text());assert a['verified'] and a['through']==15 and a['requests']==1897 and a['unknown_receipts']==3 and o['verified'] and len(o['native_originals'])==len(o['deliveries'])==201 and len(o['isolation'])==180
if args.action=='scan':
 assert not snapshot.exists() and not scan_path.exists() and not binding.exists();target=git('rev-parse','HEAD');refs={};counts={}
 for path in git('ls-tree','-r','--name-only',target,'runs/instruction-effects').splitlines():
  parts=Path(path).parts
  if len(parts)!=8 or parts[:2]!=('runs','instruction-effects') or parts[3]!='builders' or parts[5]!='checkpoints' or parts[7]!='index.json':continue
  item=json.loads(git('show',target+':'+path));sources=dict(line.split(' ',1) for line in item['source_refs']);counts[item['run_id']]=counts.get(item['run_id'],0)+1
  for ref in item['github_refs']:
   assert ref.startswith('refs/heads/builders/instruction-effects/');expected=item['source_commit'] if ref.endswith('/head') else sources['refs/heads/'+ref.split('/branches/',1)[1]];assert git('rev-parse',ref)==expected
   if ref in refs:assert refs[ref]==expected
   refs[ref]=expected
 assert counts['eval-016']==202
 for p in (audit,originals):assert git('show',target+':'+str(p.relative_to(repo)))==p.read_text().strip()
 try:
  subprocess.run(['git','clone','--shared','--single-branch','--branch','main','--quiet',str(repo),str(snapshot)],check=True,capture_output=True);assert git('rev-parse','HEAD',cwd=snapshot)==target
  subprocess.run(['git','-C',str(snapshot),'update-ref','--stdin'],input=''.join(f'update {ref} {commit}\n' for ref,commit in refs.items()),text=True,capture_output=True,check=True)
  with scan_path.open('w') as stream:subprocess.run(['python3','-B',str(repo/'scripts/scan-publication.py'),'--repo',str(snapshot)],stdout=stream,check=True)
  scan=json.loads(scan_path.read_text());assert scan['status']=='passed' and not scan['findings'] and scan['target_git_commit']==target
  binding.write_text(json.dumps({'target':target,'all_scanned_history_refs':refs,'archive_counts':counts,'scan_sha256':sha(scan_path),'audit_sha256':sha(audit),'originals_sha256':sha(originals),'controller_sha256':sha(Path(__file__)),'scope':'Committed full closed015 originals and202 indexed eval016 source checkpoints through015, plus all indexed retained histories. Live uncommitted state/events/usage and later native outputs excluded; no full-study readiness claim.'},indent=2)+'\n');print(json.dumps({'verified':True,'target':target,'scanned_original_refs':len(refs),'eval016_source_checkpoints':202}))
 finally:
  if snapshot.exists():shutil.rmtree(snapshot)
else:
 bound=json.loads(binding.read_text());target=bound['target'];scan=json.loads(scan_path.read_text());assert not snapshot.exists() and git('rev-parse','HEAD')==target and scan['status']=='passed' and not scan['findings'] and scan['target_git_commit']==target and sha(scan_path)==bound['scan_sha256'] and sha(audit)==bound['audit_sha256'] and sha(originals)==bound['originals_sha256'] and sha(Path(__file__))==bound['controller_sha256']
 refs={ref:commit for ref,commit in bound['all_scanned_history_refs'].items() if ref.startswith('refs/heads/builders/instruction-effects/eval-016/')};assert len(refs)==404 and all(git('rev-parse',ref)==commit for ref,commit in refs.items())
 before=remote_heads();assert subprocess.run(['git','merge-base','--is-ancestor',before['refs/heads/main'],target],capture_output=True).returncode==0;assert all(ref not in before or before[ref]==commit for ref,commit in refs.items())
 subprocess.run(['git','push','--atomic','origin',target+':refs/heads/main',*[commit+':'+ref for ref,commit in refs.items()]],check=True,capture_output=True,text=True)
 after=remote_heads();assert after['refs/heads/main']==target and all(after.get(ref)==commit for ref,commit in refs.items()) and all(ref=='refs/heads/main' or after.get(ref)==commit for ref,commit in before.items())
 out=run/'reports/publication-checkpoint015001.json';assert not out.exists();out.write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'target_git_commit':target,'remote_main':after['refs/heads/main'],'eval016_original_refs_verified':404,'eval016_source_checkpoints':202,'all_scanned_original_refs':len(bound['all_scanned_history_refs']),'prior_remote_heads_unchanged':len(before)-1,'scan_sha256':sha(scan_path),'audit_sha256':sha(audit),'originals_sha256':sha(originals),'closed_rounds':15,'closed_requests':1897,'known_native_receipts':1894,'unknown_native_receipts':3,'uncached_reference_lower_bound_usd':a['known_uncached_reference_lower_bound_usd'],'upper_bound_usd':None,'point_estimate':None,'scope':bound['scope']},indent=2)+'\n');print(json.dumps({'published':target,'remote_verified':True,'original_refs':404}))
