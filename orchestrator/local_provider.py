"""Manage only the PM's isolated, instrumented Ollama process."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from .prepare import ROOT,write_json,checked
from .evidence import digest_bytes

BASE=ROOT/".local/ollama-provider"
ENDPOINT="http://127.0.0.1:11435"
USAGE=BASE/"native-usage.jsonl"

def query(route, payload=None):
    request=urllib.request.Request(ENDPOINT+route,
        json.dumps(payload).encode() if payload is not None else None,
        {"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(request,timeout=1800))

def start():
    try:
        if query("/api/version")["version"]=="0.40.1-ff-accounting-v1":
            return
        raise RuntimeError("Private provider port is occupied by a different service")
    except urllib.error.URLError:
        pass
    env=dict(os.environ,OLLAMA_HOST="127.0.0.1:11435",OLLAMA_MODELS=str(BASE/"models"),
        OLLAMA_NO_CLOUD="true",OLLAMA_NOPRUNE="true",OLLAMA_NUM_PARALLEL="1",
        OLLAMA_CONTEXT_LENGTH="131072",OLLAMA_KEEP_ALIVE="20m",
        FF_OLLAMA_USAGE_LOG=str(USAGE))
    stream=(BASE/"server.log").open("ab")
    process=subprocess.Popen([str(BASE/"bin/ollama"),"serve"],env=env,
        stdout=stream,stderr=stream,start_new_session=True)
    write_json(BASE/"process.json",{"pid":process.pid,"endpoint":ENDPOINT,
        "native_usage_file":str(USAGE),"upstream_commit":"cf2a313a298066d572c36812e5ad30a21c0db13b"})
    for _ in range(100):
        try:
            query("/api/version");return
        except urllib.error.URLError:
            if process.poll() is not None:raise RuntimeError("Private Ollama exited during startup; inspect its log.")
            time.sleep(.2)
    raise RuntimeError("Private Ollama did not start")

def provenance():
    start()
    tag=query("/api/tags")
    if len(tag["models"])!=1 or tag["models"][0]["name"]!="gpt-oss:120b":
        raise RuntimeError("Private model catalog differs from the frozen selected model")
    model=tag["models"][0]
    if model["digest"]!="ad84bf7720de3aac13b8f07008047c85ff5c277721a648dbf51517453a0331f6":
        raise RuntimeError("Private model manifest digest changed")
    return {
        "endpoint":ENDPOINT,"native_usage_file":str(USAGE),
        "version":query("/api/version")["version"],
        "upstream_release":"v0.40.1","upstream_commit":"cf2a313a298066d572c36812e5ad30a21c0db13b",
        "binary_sha256":digest_bytes((BASE/"bin/ollama").read_bytes()),
        "runner_binary_sha256":digest_bytes(Path("/opt/homebrew/Cellar/ollama/0.40.1/libexec/lib/ollama/llama-server").read_bytes()),
        "instrumentation_sha256":{p.name:digest_bytes(p.read_bytes())
            for p in (ROOT/"orchestrator/providers/ollama").glob("*") if p.is_file()},
        "model":model,"show":query("/api/show",{"model":"gpt-oss:120b"}),
        "weights_blob_sha256":"a5b03e4c678e1671191c0115861445b61529f518e751ce38a2bb6030cca9b1d0",
        "settings":{"context_length":131072,"parallel":1,"cloud":False,"keep_alive":"20m",
                    "backend":"llamacpp; optional incompatible MLX backend excluded"},
        "semantics":"Only request identity and pre-parser native-counter observation added; inputs, sampler, outputs, cancellation and parser unchanged.",
    }

if __name__=="__main__":
    print(json.dumps(provenance(),indent=2))
