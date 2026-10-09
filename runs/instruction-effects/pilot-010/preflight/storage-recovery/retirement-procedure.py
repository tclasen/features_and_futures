import json,pathlib,subprocess,tarfile
from orchestrator.prepare import write_json
from orchestrator.evidence import digest_bytes
r=pathlib.Path('runs/instruction-effects/pilot-010').resolve();root=r/'preflight/storage-recovery';snapshots=json.loads((root/'interrupted-source-snapshots.json').read_text());inventory=json.loads(subprocess.check_output(['sbx','ls','--json']))['sandboxes'];results=[]
for entry in inventory:
 name=entry['name']
 if not name.startswith('ff-pilot-010-'):continue
 print('Retaining and removing',name,flush=True)
 subprocess.run(['sbx','stop',name],capture_output=True,check=True,timeout=90)
 if '-app-' in name:
  out=root/'retired-apps'/name;out.mkdir(parents=True,exist_ok=True);archive=out/'private-app.tar.gz'
  if not archive.exists():
   script="import tarfile,sys; t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz');t.add('/home/agent/app',arcname='app');t.close()"
   with archive.open('wb') as f:result=subprocess.run(['sbx','exec',name,'python3','-c',script],stdout=f,stderr=subprocess.PIPE,timeout=180)
   if result.returncode:
    (out/'capture-error.log').write_bytes(result.stderr);raise RuntimeError('App capture failed; sandbox retained: '+name)
  with tarfile.open(archive) as t:members=t.getmembers()
  proof={'archive_sha256':digest_bytes(archive.read_bytes()),'members':len(members),'scope':'Own private submitted app, SQLite/raw files and logs; original runtime interruption'}
 else:
  bid=name.rsplit('-',1)[-1];proof=next(b for b in snapshots if b['builder_id']==bid)
 subprocess.run(['sbx','stop',name],capture_output=True,check=True,timeout=90)
 subprocess.run(['sbx','rm','--force',name],capture_output=True,check=True,timeout=90)
 results.append({'sandbox':name,'status':'archived_and_removed','proof':proof});write_json(root/'interrupted-resource-retirement.json',results)
print('Removed',len(results),'archived010resources',flush=True)
