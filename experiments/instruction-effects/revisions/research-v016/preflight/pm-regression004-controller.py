"""Run all PM regressions with exact source/input/log provenance."""
import hashlib,json,subprocess,shutil
from pathlib import Path
from datetime import datetime,timezone
root=Path.cwd();v=root/'experiments/instruction-effects/revisions/research-v016/preflight';out=v/'pm-regression004';assert not out.exists();out.mkdir();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();shutil.copy2(__file__,out/'executed-controller.py');inputs={'controller_sha256':sha(Path(__file__)),'command':['python3','-B','-m','unittest','discover','-s','tests','-v'],'source_files':{str(p.relative_to(root)):sha(p) for folder in ['orchestrator','tests'] for p in (root/folder).rglob('*') if p.is_file() and p.suffix in {'.py','.mjs'}},'native_model_calls':0};(out/'inputs.json').write_text(json.dumps(inputs,indent=2)+'\n')
with (out/'terminal.log').open('w') as f:r=subprocess.run(inputs['command'],stdout=f,stderr=subprocess.STDOUT)
assert all(sha(root/n)==h for n,h in inputs['source_files'].items());text=(out/'terminal.log').read_text();proof={'verified':r.returncode==0,'utc':datetime.now(timezone.utc).isoformat(),'exit_code':r.returncode,'native_model_calls':0,'input_sha256':sha(out/'inputs.json'),'terminal_log_sha256':sha(out/'terminal.log'),'source_unchanged':True};(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof));raise SystemExit(r.returncode)
