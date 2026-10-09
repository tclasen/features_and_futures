import json,pathlib,re,subprocess,tarfile,time,hashlib,shutil
root=pathlib.Path('runs/instruction-effects/pilot-015/preflight/legacy-sandbox-retirement');root.mkdir(parents=True,exist_ok=True)
exact={'ff-blank-race-audit-1791570006719684000-app-b010-001-001','ff-lifecycle-1791569767605059000-app-background-v1-001-001','ff-lifecycle-1791569890300011000-app-bg-001-001','ff-lifecycle-1791569890300011000-app-fg-001-001','ff-recovery-1791562718469764000-app-b008-002-001','ff-stability-1791569164164478000-app-fixture-001-001','ff-pilot-app-b001-001-001','ff-pilot-app-b001-001-002','ff-pilot-b001','ff-pilot-nodocker','ff-pilot-preflight','ff-pilot-storage-check'}
rows=json.loads(subprocess.check_output(['sbx','ls','--json']))['sandboxes']
plan=[x for x in rows if x['status']=='stopped' and (re.fullmatch(r'ff-pilot-(?:002|003|004|005|008|009)-.*',x['name']) or x['name'] in exact)]
(root/('plan-'+str(time.time_ns())+'.json')).write_text(json.dumps({'scope':'Explicit historical PM experiment resources only; active015 and unrelated resources excluded','sandboxes':plan},indent=2)+'\n')
shutil.copy2(__file__,root/'procedure.py')
script="""import pathlib,json,sys,tarfile,io
requested=json.loads(sys.argv[1]); selected=[]
for text in requested:
 p=pathlib.Path(text)
 if p.exists() and not any(p==q or q in p.parents for q in selected): selected.append(p)
meta={'requested_roots':requested,'present_roots':[str(p) for p in selected],'home_entries':[p.name for p in pathlib.Path('/home/agent').iterdir()]}
t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz'); data=json.dumps(meta,sort_keys=True).encode();i=tarfile.TarInfo('capture-manifest.json');i.size=len(data);t.addfile(i,io.BytesIO(data))
for i,p in enumerate(selected): t.add(p,arcname='source-'+str(i),recursive=True)
t.close()
"""
results=json.loads((root/'results.json').read_text()) if (root/'results.json').exists() else []
for entry in plan:
 name=entry['name'];out=root/name;out.mkdir(exist_ok=True);print('Preserving',name,flush=True)
 subprocess.run(['sbx','stop',name],capture_output=True,check=True,timeout=90)
 paths=['/home/agent/work','/home/agent/app']+[x.removesuffix(':ro') for x in entry.get('workspaces',[])]
 archive=out/'original-source-history-runtime.tar.gz'
 if not archive.exists():
  with archive.open('wb') as f: result=subprocess.run(['sbx','exec',name,'python3','-c',script,json.dumps(paths)],stdout=f,stderr=subprocess.PIPE,timeout=180)
  (out/'capture.stderr.log').write_bytes(result.stderr)
  if result.returncode:
   match=re.search(rb'host port 127\.0\.0\.1:(\d+): address already in use',result.stderr)
   if match and '-app-' in name:
    archive.rename(out/('incomplete-capture-'+str(time.time_ns())+'.tar.gz'))
    subprocess.run(['sbx','ports',name,'--unpublish','127.0.0.1:'+match[1].decode()+':8080/tcp4'],capture_output=True,check=True)
    with archive.open('wb') as f: result=subprocess.run(['sbx','exec',name,'python3','-c',script,json.dumps(paths)],stdout=f,stderr=subprocess.PIPE,timeout=180)
    (out/'retry.stderr.log').write_bytes(result.stderr)
   if result.returncode: raise RuntimeError('Archive failed; resource retained: '+name)
 digest=hashlib.sha256(); total=0
 with archive.open('rb') as f:
  for chunk in iter(lambda:f.read(1048576),b''):digest.update(chunk)
 with tarfile.open(archive) as tar:
  meta=json.load(tar.extractfile('capture-manifest.json'));members=tar.getmembers()
  for member in members:
   if member.isfile():
    with tar.extractfile(member) as stream:
     for chunk in iter(lambda:stream.read(1048576),b''):total+=len(chunk)
 proof={'sandbox':name,'utc':time.time(),'archive_sha256':digest.hexdigest(),'verified_members':len(members),'verified_file_bytes':total,'capture':meta,'scope':'Original raw source, .git history, workspace and application data retained; no claim that formerly corrupt Git objects became restorable'}
 (out/'preservation.json').write_text(json.dumps(proof,indent=2)+'\n')
 subprocess.run(['sbx','stop',name],capture_output=True,check=True,timeout=90)
 subprocess.run(['sbx','rm','--force',name],capture_output=True,check=True,timeout=90)
 results.append({'sandbox':name,'status':'archived_and_removed','proof':str(out/'preservation.json')});(root/'results.json').write_text(json.dumps(results,indent=2)+'\n')
print('Retired',len(results),'specific historical resources',flush=True)
