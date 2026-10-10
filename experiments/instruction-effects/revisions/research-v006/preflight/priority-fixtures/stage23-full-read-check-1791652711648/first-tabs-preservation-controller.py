import json,time,shutil,hashlib
from pathlib import Path
p=Path('experiments/instruction-effects/revisions/research-v006/preflight/priority-fixtures/stage23-full-read-check-1791652711648')
src=p/'negative-search-tabs-ignored';dst=p/'retained-first-tabs-050'
for i in range(30000):
 try:
  data=(src/'results.json').read_bytes();d=json.loads(data)
  if '050 ' in json.dumps(d) and d['stats']['unexpected']==1:
   dst.mkdir(exist_ok=False);(dst/'results.json').write_bytes(data)
   errors=[]
   for name in ['stdout.log','stderr.log','artifacts']:
    try:
     q=src/name
     if q.is_dir():shutil.copytree(q,dst/name)
     elif q.is_file():shutil.copy2(q,dst/name)
     else:errors.append(name+' unavailable at capture')
    except Exception as e:errors.append(name+': '+type(e).__name__)
   proof={'captured':True,'original_variant':'negative-search-tabs-ignored, test050','reason':'Running prototype reuses an output directory for050and051; preserve first report before later overwrite. Supplementary distinct-name rerun required.','copy_limitations':errors,'checksums':{str(f.relative_to(dst)):hashlib.sha256(f.read_bytes()).hexdigest() for f in dst.rglob('*') if f.is_file()}}
   (dst/'capture.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof));break
 except (FileNotFoundError,json.JSONDecodeError):pass
 time.sleep(.02)
else:raise RuntimeError('First050report not observed; do not infer preservation')
