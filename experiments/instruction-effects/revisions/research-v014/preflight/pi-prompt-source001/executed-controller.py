import hashlib,json,subprocess
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path("experiments/instruction-effects/revisions/research-v014/preflight/pi-prompt-source001")
ROOT.mkdir(exist_ok=False)
NAME="ff-diag-eval014-pi-prompt-source001"
manifest=json.loads(Path("runs/instruction-effects/eval-014/manifest.json").read_text())
image=manifest["runtime"]["image"]
ledger_path=Path(".local/eval014-owned-resource-ledger.json")
ledger=json.loads(ledger_path.read_text());entry={"sandbox":NAME,"kind":"PM-prompt-transport-source-probe","status":"planned","proof":str(ROOT/"resource.json")};ledger["resources"].append(entry);ledger_path.write_text(json.dumps(ledger,indent=2)+"\n")
def run(args):
 r=subprocess.run(args,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout
created=False
try:
 actual=run(["docker","image","inspect",image,"--format","{{.Id}}"]).strip();assert actual==manifest["runtime"]["image_digest"]
 run(["sbx","create","--name",NAME,"--cpus","2","--memory","2g","--skills","off","--pull","never","-t",image,"shell"]);created=True
 entry["status"]="active";ledger_path.write_text(json.dumps(ledger,indent=2)+"\n")
 script="""import pathlib,shutil,json
p=pathlib.Path(shutil.which('pi')).resolve()
roots=list(pathlib.Path('/usr/local/lib/node_modules').glob('*/pi-coding-agent'))+list(pathlib.Path('/usr/local/lib/node_modules').glob('pi-coding-agent'))
assert len(roots)==1,roots
root=roots[0];names=['package.json','dist/cli.js','dist/main.js','dist/cli/initial-message.js','dist/cli/args.js','dist/modes/print-mode.js']
print(json.dumps({'entry':str(p),'package_root':str(root),'entry_text':p.read_text(),'files':{n:(root/n).read_text() for n in names}}))
"""
 observed=json.loads(run(["sbx","exec",NAME,"python3","-c",script]));(ROOT/"source.json").write_text(json.dumps(observed,indent=2)+"\n");assert json.loads(observed["files"]["package.json"])["version"]==manifest["runtime"]["harness_versions"]["pi"]
 (ROOT/"verified.json").write_text(json.dumps({"verified":True,"image_digest":actual,"pi_version":"1.1.0","native_model_calls":0,"source_sha256":hashlib.sha256((ROOT/"source.json").read_bytes()).hexdigest()},indent=2)+"\n")
 print(json.dumps({"verified":True,"source":str(ROOT/"source.json"),"native_model_calls":0}))
except BaseException as error:
 (ROOT/"failure.json").write_text(json.dumps({"error":str(error),"native_model_calls":0},indent=2)+"\n");raise
finally:
 if created:
  archive={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.iterdir() if p.is_file()}
  run(["sbx","stop",NAME]);run(["sbx","rm","--force",NAME]);assert subprocess.run(["sbx","inspect",NAME,"--json"],capture_output=True).returncode!=0
  entry.update(status="removed");ledger_path.write_text(json.dumps(ledger,indent=2)+"\n")
  (ROOT/"resource.json").write_text(json.dumps({"sandbox":NAME,"status":"removed","completed_utc":datetime.now(timezone.utc).isoformat(),"archived_sha256":archive,"native_model_calls":0},indent=2)+"\n")
