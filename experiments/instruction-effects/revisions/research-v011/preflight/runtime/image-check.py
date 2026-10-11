from pathlib import Path
import hashlib,json,tarfile
from orchestrator.prepare import write_json
from orchestrator.evidence import timestamp
archive=Path('.local/images/pilot-v002.tar');expected='aebb05872638f3c53b5098ee6d6d7f3c52477c4c8be35ef760a2a001579cd0b2'
def sha(f):
 h=hashlib.sha256()
 for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
with archive.open('rb') as f:assert sha(f)==expected
with tarfile.open(archive) as t:
 manifest=json.load(t.extractfile('manifest.json'));blobs=[m for m in t.getmembers() if m.isfile() and m.name.startswith('blobs/sha256/')]
 for m in blobs:
  with t.extractfile(m) as f:assert sha(f)==m.name.split('/')[-1]
 assert len(blobs)==18
write_json(Path(__file__).parent/'image-provenance.json',{'archive':str(archive),'archive_sha256':expected,'manifest':manifest,'reverified_utc':timestamp(),'all_content_addressed_blobs_rehashed':True,'all_blob_sha256_verified':True,'verified_blobs':len(blobs),'image_retained_for_next_run':True,'native_model_calls':0})
print('All18imageblobs independently rehashed')
