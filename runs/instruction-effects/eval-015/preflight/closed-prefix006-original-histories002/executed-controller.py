"""Bind unchanged prior proofs; independently restore only new closed originals."""
import argparse,hashlib,json,subprocess,tempfile
from pathlib import Path
from datetime import datetime,timezone
parser=argparse.ArgumentParser();parser.add_argument('--stage',required=True,type=int);parser.add_argument('--previous',required=True,type=Path);args=parser.parse_args()
run=Path('runs/instruction-effects/eval-015');manifest=json.loads((run/'manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def git(repo,*args):return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.PIPE)
prior_path=args.previous;prior=json.loads(prior_path.read_text());assert prior['verified'] and prior['common_rounds']<args.stage
assert (prior_path.parent/'executed-controller.py').is_file() and sha(prior_path.parent/'executed-controller.py')==prior['verifier_sha256']
assert git(Path.cwd(),'show','HEAD:'+str(prior_path))==prior_path.read_bytes()
previous={(x['builder_id'],x['task_id'],x['attempt_id']):x for x in prior['checks']};assert len(previous)==prior['original_attempts'];assert len([x for x in previous.values() if x['accepted']])==12*prior['common_rounds']
events=[json.loads(x) for x in (run/'events.jsonl').read_text().splitlines()];assert {x['stage'] for x in events if x['kind']=='round_completed'}>=set(range(1,args.stage+1))
out=run/'preflight'/('closed-prefix%03d-original-histories002'%args.stage);assert not out.exists();checks=[];new_restores=0;rebound=0
for stage in range(1,args.stage+1):
 task='task-%03d'%stage
 for builder in manifest['runtime']['builder_configurations']:
  bid=builder['builder_id'];attempts=sorted((run/'tasks'/task/'attempts'/bid).glob('attempt-*'));assert attempts and json.loads((attempts[-1]/'result.json').read_text())['accepted']
  for attempt in attempts:
   archive=run/'builders'/bid/'checkpoints'/(task+'-'+attempt.name);index=json.loads((archive/'index.json').read_text());result=json.loads((attempt/'result.json').read_text());native=json.loads((attempt/'native-git.json').read_text());assert (index['run_id'],index['builder_id'],index['checkpoint_id'])==('eval-015',bid,task+'-'+attempt.name)
   assert index['source_commit']==result['commit']==native['head'] and index['source_tree']==result['tree']==native['tree'];assert all(sha(archive/name)==checksum for name,checksum in index['checksums'].items());assert sha(attempt/'working-tree.tar.gz')==json.loads((attempt/'working-tree-checksum.json').read_text())['sha256']
   row={'builder_id':bid,'task_id':task,'attempt_id':attempt.name,'accepted':result['accepted'],'commit':index['source_commit'],'tree':index['source_tree'],'index_sha256':sha(archive/'index.json'),'checksums':index['checksums'],'original_native_bundle_sha256':sha(attempt/'native-history.bundle'),'working_tree_sha256':sha(attempt/'working-tree.tar.gz'),'original_native_working_tree_sha256':sha(attempt/'native-working-tree.tar.gz'),'result_sha256':sha(attempt/'result.json'),'refs':index['github_refs']}
   key=(bid,task,attempt.name)
   if stage<=prior['common_rounds']:
    assert key in previous and row==previous[key];rebound+=1
   else:
    assert key not in previous
    with tempfile.TemporaryDirectory(prefix='eval015-incremental-original-restore-',dir='/private/tmp') as tmp:
     for label,bundle in [('publication',archive/'history.bundle'),('native',attempt/'native-history.bundle')]:
      restored=Path(tmp)/label;subprocess.run(['git','clone','--quiet','--no-checkout',str(bundle.resolve()),str(restored)],check=True,capture_output=True);git(restored,'bundle','verify',str(bundle.resolve()));git(restored,'fsck','--full');assert git(restored,'rev-parse',row['commit']+'^{tree}').decode().strip()==row['tree'];assert manifest['provenance']['starter_commit'] in git(restored,'rev-list',row['commit']).decode().splitlines()
      if label=='publication':assert hashlib.sha256(git(restored,'archive','--format=tar',row['commit'])).hexdigest()==index['checksums']['committed-source.tar']
      new_restores+=1
   assert all(git(Path.cwd(),'rev-parse',ref).decode().strip()==row['commit'] for ref in row['refs']);checks.append(row)
assert rebound==len(previous) and len([x for x in checks if x['accepted']])==12*args.stage
out.mkdir();(out/'executed-controller.py').write_bytes(Path(__file__).read_bytes());proof={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'common_rounds':args.stage,'original_attempts':len(checks),'previous_proof':str(prior_path),'previous_proof_sha256':sha(prior_path),'previous_proof_git_commit':git(Path.cwd(),'rev-parse','HEAD').decode().strip(),'previous_original_attempts_rebound':rebound,'new_histories_independently_restored':new_restores,'historically_restored_current_hash_bound_histories':2*len(checks),'native_model_calls_in_verification':0,'checks':checks,'verifier_sha256':sha(Path(__file__)),'scope':'Only new originals restored this execution. All unchanged older source/history hashes rebound to committed independent restoration proof. Local refs are not remote publication proof; temporary restored roots removed and active native resources retained.'};(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'verified':True,'common_rounds':args.stage,'original_attempts':len(checks),'new_histories_restored':new_restores,'previous_attempts_rebound':rebound,'evidence':str(out/'verified.json')}))
