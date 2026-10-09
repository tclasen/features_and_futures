import json,pathlib,subprocess,time,shutil,tarfile,sys,traceback
from orchestrator.prepare import write_json
from orchestrator.private import export
from orchestrator.evidence import digest_bytes,digest_json,Ledger
run_id=sys.argv[1];run=pathlib.Path('runs/instruction-effects')/run_id;run=run.resolve();m=json.loads((run/'manifest.json').read_text());root=run/'preflight/terminal-preservation';root.mkdir(exist_ok=True)
for name in ('events.jsonl','usage.jsonl','state.json'):
 if not (root/('original-'+name)).exists():shutil.copy2(run/name,root/('original-'+name))
shutil.copy2('.local/'+run_id.replace('-','')+'-driver.log',root/'driver-terminal.log')
snapshots=[]
for b in m['runtime']['builder_configurations']:
 bid=b['builder_id'];name='ff-'+run_id+'-'+bid;out=root/'builders'/bid;out.mkdir(parents=True,exist_ok=True);print('Preserving',bid,flush=True)
 subprocess.run(['sbx','stop',name],capture_output=True,check=True,timeout=90)
 shadow=pathlib.Path(m['paths']['builders'])/bid;replacement=shadow.parent/(shadow.name+'.pm-shadow')
 if replacement.exists():replacement.rename(shadow.parent/(replacement.name+'.interrupted-'+str(time.time_ns())))
 meta=export(name,shadow,out)
 subprocess.run(['git','-C',str(shadow),'bundle','verify',str(out/'native-history.bundle')],capture_output=True,check=True)
 checkpoint='terminal-closure';dest=run/'builders'/bid/'checkpoints'/checkpoint
 if not dest.exists():subprocess.run(['python3','-B','scripts/archive-builder-history.py','--experiment','instruction-effects','--run',run_id,'--builder',bid,'--checkpoint',checkpoint,'--repository',str(shadow)],capture_output=True,check=True)
 proof={'builder_id':bid,'source_commit':meta['head'],'source_tree':meta['tree'],'dirty':meta['dirty'],'bundle_sha256':digest_bytes((out/'native-history.bundle').read_bytes()),'working_tree_sha256':digest_bytes((out/'native-working-tree.tar.gz').read_bytes())};snapshots.append(proof);write_json(root/'builder-snapshots.json',snapshots)
 subprocess.run(['sbx','stop',name],capture_output=True,check=True,timeout=90)
 subprocess.run(['sbx','rm','--force',name],capture_output=True,check=True,timeout=90)
resources=[]
for entry in json.loads(subprocess.check_output(['sbx','ls','--json']))['sandboxes']:
 name=entry['name']
 if not name.startswith('ff-'+run_id+'-app-'):continue
 print('Preserving app',name,flush=True);subprocess.run(['sbx','stop',name],capture_output=True,check=True,timeout=90)
 out=root/'apps'/name;out.mkdir(parents=True,exist_ok=True);archive=out/'private-app.tar.gz'
 script="import tarfile,sys;t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz');t.add('/home/agent/app',arcname='app');t.close()"
 with archive.open('wb') as f:result=subprocess.run(['sbx','exec',name,'python3','-c',script],stdout=f,stderr=subprocess.PIPE,timeout=180)
 if result.returncode:raise RuntimeError('Application preservation failed; leave resource: '+name)
 with tarfile.open(archive) as t:members=t.getmembers()
 proof={'sandbox':name,'archive_sha256':digest_bytes(archive.read_bytes()),'members':len(members)};resources.append(proof);write_json(root/'app-snapshots.json',resources)
 subprocess.run(['sbx','stop',name],capture_output=True,check=True,timeout=90);subprocess.run(['sbx','rm','--force',name],capture_output=True,check=True,timeout=90)
state=json.loads((run/'state.json').read_text());state.update(status='superseded',last_error='Provider transport usage gap and PM alert-locator layout assumption retained; new comparison uses fresh inputs');write_json(run/'state.json',state)
identity={k:m[k] for k in ('experiment_id','experiment_revision','project_id','project_revision','run_id')};identity['manifest_sha256']=digest_json(m);Ledger(run,identity).event('run_superseded',reason=state['last_error'],preserved_builder_sources=len(snapshots),preserved_application_resources=len(resources),missing_cost_request_ids=['de9b47e5-7488-4628-b07e-0de656f8a603'])
shutil.copy2('.local/close-pilot.py',root/'preservation-procedure.py');print('Preserved all native sources and current resources before exact-name retirement',flush=True)
