"""Bind every original eval014 checkpoint and its immutable namespaced refs."""
import hashlib,json,subprocess
from pathlib import Path
from datetime import datetime,timezone
run=Path('runs/instruction-effects/eval-014');assert json.loads((run/'state.json').read_text())['status']=='superseded'
terminal=run/'reports/terminal-closure.json';assert json.loads(terminal.read_text())['verified']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
archives=[];refs={}
for path in sorted((run/'builders').glob('b*/checkpoints/*/index.json')):
 idx=json.loads(path.read_text());assert idx['run_id']=='eval-014'
 for name,checksum in idx['checksums'].items():assert sha(path.parent/name)==checksum
 subprocess.run(['git','bundle','verify',str((path.parent/'history.bundle').resolve())],check=True,capture_output=True)
 for ref in idx['github_refs']:
  assert ref.startswith('refs/heads/builders/instruction-effects/eval-014/')
  actual=subprocess.check_output(['git','rev-parse',ref],text=True).strip();assert actual==idx['source_commit']
  if ref in refs:assert refs[ref]==actual
  refs[ref]=actual
 archives.append({'index':str(path),'index_sha256':sha(path),'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'checksums':idx['checksums']})
assert len(archives)==395 and len(refs)==790
out=run/'preflight/terminal-publication-index001';out.mkdir();(out/'executed-controller.py').write_bytes(Path(__file__).read_bytes());(out/'verified.json').write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'run_id':'eval-014','archives':archives,'refs':refs,'terminal_closure_sha256':sha(terminal),'native_model_calls':0,'scope':'Local original-history publication identity only. No secret scan or remote publication claimed.'},indent=2)+'\n')
print(json.dumps({'verified':True,'archives':len(archives),'refs':len(refs),'evidence':str(out/'verified.json')}))
