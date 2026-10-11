import hashlib,json,tarfile
from pathlib import Path
ROOT=Path("experiments/instruction-effects/revisions/research-v014/preflight/pi-prompt-source003")
ROOT.mkdir(exist_ok=False)
(ROOT/"executed-controller.py").write_bytes(Path(__file__).read_bytes())
archive=Path(".local/images/pilot-v002.tar")
provenance=json.loads(Path("experiments/instruction-effects/revisions/research-v014/preflight/runtime/image-provenance.json").read_text())
def sha(stream):
 h=hashlib.sha256()
 for chunk in iter(lambda:stream.read(1024*1024),b""):h.update(chunk)
 return h.hexdigest()
with archive.open("rb") as stream:assert sha(stream)==provenance["archive_sha256"]
discovery=json.loads(Path('experiments/instruction-effects/revisions/research-v014/preflight/pi-prompt-source002/path-discovery.json').read_text())
prefix=next(x['path'] for x in discovery if x['path'].endswith('pi-coding-agent/package.json')).removesuffix('package.json')
names=["package.json","dist/cli.js","dist/main.js","dist/cli/initial-message.js","dist/cli/args.js","dist/modes/print-mode.js","dist/bundle/cli.js"]
wanted={prefix+n:n for n in names};observed={};entry=None
with tarfile.open(archive) as outer:
 manifest=json.load(outer.extractfile("manifest.json"));assert manifest==provenance["manifest"]
 for layer in manifest[0]["Layers"]:
  with outer.extractfile(layer) as stream,tarfile.open(fileobj=stream,mode="r|*") as inner:
   for member in inner:
    name=member.name.removeprefix("./")
    if name.endswith("/bin/pi"):entry={"path":name,"linkname":member.linkname,"layer":layer}
    if name in wanted and member.isfile():
     data=inner.extractfile(member).read();observed[wanted[name]]={"text":data.decode() if wanted[name]!="dist/bundle/cli.js" else None,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"layer":layer,"image_path":name}
assert set(observed)==set(names),sorted(observed)
assert json.loads(observed["package.json"]["text"])["version"]=="1.1.0"
(ROOT/"source.json").write_text(json.dumps({"entry":entry,"files":observed},indent=2)+"\n")
(ROOT/"verified.json").write_text(json.dumps({"verified":True,"image_archive":str(archive),"image_archive_sha256":provenance["archive_sha256"],"source_sha256":hashlib.sha256((ROOT/"source.json").read_bytes()).hexdigest(),"native_model_calls":0,"sandboxes_created":0},indent=2)+"\n")
print(json.dumps({"verified":True,"source":str(ROOT/"source.json"),"native_model_calls":0}))
