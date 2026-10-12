"""Read exact current stable registry versions with durable source provenance."""
import subprocess,json,hashlib,shutil
from pathlib import Path
from datetime import datetime,timezone
out=Path('experiments/instruction-effects/revisions/research-v016/preflight/latest-stable-npm002');assert not out.exists();out.mkdir();shutil.copy2(__file__,out/'executed-controller.py');results={}
for name in ['@openai/codex','@earendil-works/pi-coding-agent']:
 command=['npm','view',name,'version','--json'];x=subprocess.run(command,capture_output=True,text=True,check=True);results[name]={'command':command,'stdout':x.stdout,'stderr':x.stderr,'version':json.loads(x.stdout)}
proof={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'controller_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'results':results,'observed':{name:r['version'] for name,r in results.items()},'supersedes_inline_source_limitation':'latest-stable-npm001','scope':'Source-bound stable registry observation only; immutable image and zero-inference runtime/isolation gates separately required.'};(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof['observed']))
