import json,shutil,subprocess,tempfile,tarfile,hashlib,sqlite3
from pathlib import Path
from orchestrator.private import export
from orchestrator.prepare import write_json
from orchestrator.evidence import digest_bytes,timestamp
run=Path('runs/instruction-effects/eval-004').resolve();m=json.loads((run/'manifest.json').read_text());state=json.loads((run/'state.json').read_text());assert state['status']=='infrastructure_attention'
events=[json.loads(l) for l in (run/'events.jsonl').read_text().splitlines()]
attempts=lambda kind:{(e['builder_id'],e['task_id'],e['attempt_id']) for e in events if e['kind']==kind}
assert attempts('attempt_started')==attempts('attempt_finished')
root=run/'preflight/terminal-preservation';root.mkdir(exist_ok=True)
for name in ('events.jsonl','usage.jsonl','state.json'):shutil.copy2(run/name,root/('original-'+name))
shutil.copy2('.local/eval004-driver.log',root/'driver-terminal.log');shutil.copy2(__file__,root/'preservation-procedure.py')
inventory=json.loads(subprocess.check_output(['sbx','ls','--json'],text=True))['sandboxes'];owned=[e['name'] for e in inventory if e['name'].startswith('ff-eval-004-')];assert len(owned)==24;write_json(root/'owned-inventory-before.json',{'utc':timestamp(),'sandboxes':owned})
proofs=[]
def command(*args):return subprocess.run(list(args),check=True,capture_output=True,text=True).stdout.strip()
def restore(bundle,head,tree):
 with tempfile.TemporaryDirectory(prefix='eval004-terminal-history-') as folder:
  bare=Path(folder)/'restored.git';command('git','init','--bare','-q',str(bare));command('git','-C',str(bare),'fetch','--no-tags',str(bundle),'HEAD:refs/heads/verified');assert command('git','-C',str(bare),'rev-parse','refs/heads/verified')==head;assert command('git','-C',str(bare),'rev-parse','refs/heads/verified^{tree}')==tree;command('git','-C',str(bare),'fsck','--full','--no-reflogs')
for builder in m['runtime']['builder_configurations']:
 bid=builder['builder_id'];name='ff-eval-004-'+bid;assert name in owned
 out=root/'builders'/bid;out.mkdir(parents=True);shadow=Path(m['paths']['builders'])/bid
 meta=export(name,shadow,out);restore((out/'native-history.bundle').resolve(),meta['head'],meta['tree'])
 with tempfile.TemporaryDirectory(prefix='eval004-terminal-source-') as folder:
  restored=Path(folder)/'source';command('git','clone','--quiet',str((out/'native-history.bundle').resolve()),str(restored));command('git','-C',str(restored),'checkout','--detach',meta['head'])
  for child in restored.iterdir():
   if child.name!='.git':
    if child.is_dir() and not child.is_symlink():shutil.rmtree(child)
    else:child.unlink()
  with tarfile.open(out/'native-working-tree.tar.gz') as archive:archive.extractall(restored,filter='data');members=len(archive.getmembers())
  assert command('git','-C',str(restored),'status','--porcelain','--untracked-files=normal')==meta['dirty']
 command('python3','-B','scripts/archive-builder-history.py','--experiment','instruction-effects','--run','eval-004','--builder',bid,'--checkpoint','terminal-closure','--repository',str(shadow))
 proof={'sandbox':name,'kind':'builder','source_commit':meta['head'],'source_tree':meta['tree'],'source_dirty':meta['dirty'],'restored_original_history':True,'restored_working_tree_status':True,'native_history_sha256':digest_bytes((out/'native-history.bundle').read_bytes()),'native_working_tree_sha256':digest_bytes((out/'native-working-tree.tar.gz').read_bytes()),'members':members,'status':'verified_before_removal'};write_json(out/'retirement.json',proof)
 command('sbx','stop',name);command('sbx','rm','--force',name);proof.update(status='removed',completed_utc=timestamp());write_json(out/'retirement.json',proof);proofs.append(proof);write_json(root/'verified-resources.json',proofs);print('Preserved, restored and removed '+name,flush=True)
for bid,accepted in state['accepted'].items():
 name=accepted['sandbox'];assert name in owned and name.startswith('ff-eval-004-app-')
 index_path=Path(accepted['checkpoint_archive'])/'index.json';index=json.loads(index_path.read_text());assert index['run_id']=='eval-004'
 for f,sha in index['checksums'].items():assert digest_bytes((index_path.parent/f).read_bytes())==sha
 restore((index_path.parent/'history.bundle').resolve(),index['source_commit'],index['source_tree'])
 out=root/'apps'/name;out.mkdir(parents=True);archive_path=out/'private-app.tar.gz'
 # Preserve a consistent accepted database before stopping any process/resource.
 backup_script="import sqlite3,pathlib,sys;a=sqlite3.connect('/home/agent/app/.runtime/app.sqlite');b=sqlite3.connect('/home/agent/app/.runtime/terminal-snapshot.sqlite');a.backup(b);b.close();a.close();sys.stdout.buffer.write(pathlib.Path('/home/agent/app/.runtime/terminal-snapshot.sqlite').read_bytes())"
 with (out/'consistent-app.sqlite').open('wb') as stream:
  subprocess.run(['sbx','exec',name,'python3','-c',backup_script],stdout=stream,stderr=subprocess.PIPE,check=True)
 with sqlite3.connect(str(out/'consistent-app.sqlite')) as connection:assert connection.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 stop_process="import pathlib,os,signal,time;p=pathlib.Path('/home/agent/app/.runtime/server.pid');pid=int(p.read_text());os.killpg(pid,signal.SIGTERM);time.sleep(.5)"
 command('sbx','exec',name,'python3','-c',stop_process)
 script="import sys,tarfile;t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz');t.add('/home/agent/app',arcname='app');t.close()"
 with archive_path.open('wb') as stream:
  result=subprocess.run(['sbx','exec',name,'python3','-c',script],stdout=stream,stderr=subprocess.PIPE,check=True)
 with tempfile.TemporaryDirectory(prefix='eval004-terminal-app-') as folder:
  with tarfile.open(archive_path) as archive:archive.extractall(folder,filter='data');members=len(archive.getmembers())
  db=Path(folder)/'app/.runtime/app.sqlite';assert db.is_file()
  with sqlite3.connect(str(db)) as connection:assert connection.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 proof={'sandbox':name,'kind':'app','builder_id':bid,'accepted_stage':accepted['stage'],'original_source_commit':index['source_commit'],'original_source_tree':index['source_tree'],'restored_original_history':True,'restored_private_app':True,'sqlite_integrity':'ok','archive_sha256':digest_bytes(archive_path.read_bytes()),'members':members,'status':'verified_before_removal'};write_json(out/'retirement.json',proof)
 command('sbx','stop',name);command('sbx','rm','--force',name);proof.update(status='removed',completed_utc=timestamp());write_json(out/'retirement.json',proof);proofs.append(proof);write_json(root/'verified-resources.json',proofs);print('Preserved, restored and removed '+name,flush=True)
remaining=[e['name'] for e in json.loads(subprocess.check_output(['sbx','ls','--json'],text=True))['sandboxes'] if e['name'].startswith('ff-eval-004-')];assert not remaining;write_json(root/'owned-inventory-after.json',{'utc':timestamp(),'remaining_sandboxes':remaining,'removed':len(proofs),'all_originals_restored':True,'unrelated_resources_untouched':True});print('All24owned resources independently restored before exact-name removal.',flush=True)
