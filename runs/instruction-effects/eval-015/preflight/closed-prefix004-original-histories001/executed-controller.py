import argparse,hashlib,json,subprocess,tempfile
from pathlib import Path
from datetime import datetime,timezone
parser=argparse.ArgumentParser();parser.add_argument('--stage',required=True,type=int);args=parser.parse_args();r=Path('runs/instruction-effects/eval-015');m=json.loads((r/'manifest.json').read_text());events=[json.loads(x) for x in (r/'events.jsonl').read_text().splitlines()];rounds=[x for x in events if x['kind']=='round_completed'];assert {x['stage'] for x in rounds}>=set(range(1,args.stage+1));out=r/'preflight'/('closed-prefix%03d-original-histories001'%args.stage);assert not out.exists();checks=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def git(repo,*args):return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.PIPE)
for stage in range(1,args.stage+1):
 task='task-%03d'%stage
 for b in m['runtime']['builder_configurations']:
  bid=b['builder_id'];attempts=sorted((r/'tasks'/task/'attempts'/bid).glob('attempt-*'));assert attempts
  assert json.loads((attempts[-1]/'result.json').read_text())['accepted']
  for a in attempts:
   checkpoint=task+'-'+a.name;p=r/'builders'/bid/'checkpoints'/checkpoint;x=json.loads((p/'index.json').read_text());result=json.loads((a/'result.json').read_text());native=json.loads((a/'native-git.json').read_text());assert (x['run_id'],x['builder_id'],x['checkpoint_id'])==('eval-015',bid,checkpoint);assert x['source_commit']==result['commit']==native['head'] and x['source_tree']==result['tree']==native['tree'];assert all(sha(p/n)==h for n,h in x['checksums'].items());assert sha(a/'working-tree.tar.gz')==json.loads((a/'working-tree-checksum.json').read_text())['sha256']
   with tempfile.TemporaryDirectory(prefix='eval015-closed-original-restore-',dir='/private/tmp') as d:
    for label,bundle,head,tree in [('publication',p/'history.bundle',x['source_commit'],x['source_tree']),('native',a/'native-history.bundle',native['head'],native['tree'])]:
     restored=Path(d)/label;subprocess.run(['git','clone','--quiet','--no-checkout',str(bundle.resolve()),str(restored)],check=True,capture_output=True);git(restored,'bundle','verify',str(bundle.resolve()));git(restored,'fsck','--full');assert git(restored,'rev-parse',head+'^{tree}').decode().strip()==tree;assert m['provenance']['starter_commit'] in git(restored,'rev-list',head).decode().splitlines()
     if label=='publication':assert hashlib.sha256(git(restored,'archive','--format=tar',head)).hexdigest()==x['checksums']['committed-source.tar']
   assert all(git(Path.cwd(),'rev-parse',ref).decode().strip()==x['source_commit'] for ref in x['github_refs'])
   checks.append({'builder_id':bid,'task_id':task,'attempt_id':a.name,'accepted':result['accepted'],'commit':x['source_commit'],'tree':x['source_tree'],'index_sha256':sha(p/'index.json'),'checksums':x['checksums'],'original_native_bundle_sha256':sha(a/'native-history.bundle'),'working_tree_sha256':sha(a/'working-tree.tar.gz'),'original_native_working_tree_sha256':sha(a/'native-working-tree.tar.gz'),'result_sha256':sha(a/'result.json'),'refs':x['github_refs']})
assert len([x for x in checks if x['accepted']])==12*args.stage;out.mkdir();(out/'executed-controller.py').write_bytes(Path(__file__).read_bytes());(out/'verified.json').write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'common_rounds':args.stage,'original_attempts':len(checks),'independently_restored_native_and_publication_histories':2*len(checks),'native_model_calls_in_verification':0,'checks':checks,'verifier_sha256':sha(Path(__file__)),'scope':'Exact closed-prefix original histories and source snapshots including rejected attempts; local refs not publication proof. All temporary restored repositories removed; active native resources retained.'},indent=2)+'\n');print(json.dumps({'verified':True,'common_rounds':args.stage,'original_attempts':len(checks),'restored_histories':2*len(checks),'evidence':str(out/'verified.json')}))
