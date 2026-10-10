"""PM-only independent restoration audit; preserves unknown native usage."""
import hashlib
import json
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from orchestrator.evidence import digest_json,timestamp
from orchestrator.prepare import write_json

run=Path('runs/instruction-effects/eval-002')
events=[json.loads(line) for line in (run/'events.jsonl').read_text().splitlines()]
rows=[]
def git(*args):
 return subprocess.run(['git',*args],check=True,capture_output=True,text=True).stdout.strip()
for path in sorted(run.glob('tasks/task-*/attempts/*/attempt-*/infrastructure-incident.json')):
 marker=json.loads(path.read_text());attempt=path.parent.name;builder=path.parent.parent.name;task=path.parent.parent.parent.parent.name
 index_path=run/'builders'/builder/'checkpoints'/(task+'-'+attempt)/'index.json';index=json.loads(index_path.read_text())
 for name,sha in marker['archive_checksums'].items():assert hashlib.sha256((index_path.parent/name).read_bytes()).hexdigest()==sha
 for name,sha in marker['native_export_sha256'].items():assert hashlib.sha256((path.parent/name).read_bytes()).hexdigest()==sha
 metadata=json.loads((path.parent/'native-git.json').read_text());assert metadata['head']==index['source_commit'] and metadata['tree']==index['source_tree']
 with tempfile.TemporaryDirectory(prefix='eval002-original-incident-') as folder:
  restored=Path(folder)/'original.git';git('init','--bare','-q',str(restored));git('-C',str(restored),'fetch','--no-tags',str((index_path.parent/'history.bundle').resolve()),'HEAD:refs/heads/verified')
  assert git('-C',str(restored),'rev-parse','refs/heads/verified')==index['source_commit'];assert git('-C',str(restored),'rev-parse','refs/heads/verified^{tree}')==index['source_tree'];git('-C',str(restored),'fsck','--full','--no-reflogs')
  native=Path(folder)/'native';git('clone','--quiet',str((path.parent/'native-history.bundle').resolve()),str(native));assert git('-C',str(native),'rev-parse','HEAD')==index['source_commit'];assert git('-C',str(native),'rev-parse','HEAD^{tree}')==index['source_tree']
  for child in native.iterdir():
   if child.name!='.git':
    if child.is_dir() and not child.is_symlink():shutil.rmtree(child)
    else:child.unlink()
  with tarfile.open(path.parent/'native-working-tree.tar.gz') as archive:
   members=archive.getmembers();archive.extractall(native,filter='data')
   content={}
   for member in members:
    if member.isfile():
     data=archive.extractfile(member).read();target=(native/member.name).resolve();assert target.is_relative_to(native.resolve());assert target.read_bytes()==data;content[member.name]=hashlib.sha256(data).hexdigest()
  restored_dirty=bool(git('-C',str(native),'status','--porcelain','--untracked-files=normal'))
  assert restored_dirty==metadata['dirty'], 'Restored native source dirty status differs from original metadata'
 assessed=any(event['kind'] in ('validation_started','attempt_rejected') and (event.get('builder_id'),event.get('task_id'),event.get('attempt_id'))==(builder,task,attempt) for event in events);assert not assessed
 rows.append({'builder_id':builder,'task_id':task,'attempt_id':attempt,'request_ids':marker['request_ids'],'unknown_native_request_ids':marker['unknown_native_request_ids'],'source_commit':index['source_commit'],'source_tree':index['source_tree'],'archive_checksums':marker['archive_checksums'],'native_export_sha256':marker['native_export_sha256'],'restored_original_history':True,'restored_native_history':True,'restored_native_working_tree':True,'restored_working_tree_dirty_matches_metadata':True,'working_tree_source_sha256':content,'assessment_rejected':False,'uncached_reference_usd_bounds':marker['uncached_reference_usd_bounds']})
record={'utc':timestamp(),'purpose':'Independent original history and full native source restoration; unknown counters not inferred','incidents':rows,'audit_script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
output=run/'preflight/incident-audits'/('verified-'+digest_json(record)[:16]+'.json');write_json(output,record)
print(json.dumps({'incidents':len(rows),'all_original_histories_and_working_trees_restored':True,'provider_incidents_assessed_as_rejection':0,'output':str(output)}))
