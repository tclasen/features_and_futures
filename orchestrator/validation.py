"""Run submitted application code only in a separate, network-denied sandbox."""
import json
import os
import shutil
import socket
import subprocess
import tarfile
import time
import urllib.request
from pathlib import Path
from .adapters import invoke
from .prepare import checked, write_json

def reserve_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0))
        return sock.getsockname()[1]

class Deployment:
    def __init__(self, manifest, builder, task_id, attempt_id, repo, commit, output, prior):
        self.name = f"ff-{manifest['run_id']}-app-{builder}-{task_id[-3:]}-{attempt_id[-3:]}"
        self.source = Path(manifest["paths"]["deployments"]) / builder / task_id / attempt_id
        self.output = output
        self.port = reserve_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.source.mkdir(parents=True, exist_ok=False)
        archive = output / "submission.tar"
        checked(["git","-C",str(repo),"archive","--format=tar",f"--output={archive}",commit])
        with tarfile.open(archive) as tar:
            tar.extractall(self.source, filter="data")
        runtime = self.source / ".runtime"
        runtime.mkdir()
        self.database = runtime / "app.sqlite"
        self.private_root="/home/agent/app"
        if prior:
            # The accepted deployment is stopped before its database is copied.
            for suffix in ("","-wal","-shm"):
                old = Path(prior["database"] + suffix)
                if old.exists():
                    shutil.copy2(old, Path(str(self.database)+suffix))
        checked(["sbx","create","--name",self.name,"--cpus","4","--memory","512m",
                 "--skills","off","--pull","never","-t",manifest["runtime"]["image"],
                 "--publish",f"127.0.0.1:{self.port}:8080/tcp4","shell",str(self.source)+":ro"])
        checked(["sbx","exec",self.name,"cp","-a",str(self.source),self.private_root])
        checked(["sbx","exec",self.name,"chmod","-R","u+w",self.private_root])
        policy = json.loads(checked(["sbx","policy","ls",self.name,"--json"]))
        write_json(output / "deployment-policy.json",policy)
        self.start()

    def start(self):
        root = self.private_root
        # Use an independent process group so a real process restart kills all children.
        script = """import pathlib,subprocess,os,sys
p=pathlib.Path(sys.argv[1]); runtime=p/'.runtime'
env=dict(os.environ,PORT='8080',DB_PATH=str(runtime/'app.sqlite'))
log=(runtime/'server.log').open('ab')
proc=subprocess.Popen(['npm','start'],cwd=p,env=env,stdout=log,stderr=log,
                      stdin=subprocess.DEVNULL,start_new_session=True)
(runtime/'server.pid').write_text(str(proc.pid))
"""
        checked(["sbx","exec",self.name,"python3","-c",script,root])
        self.health()

    def health(self):
        deadline = time.monotonic()+30
        last = None
        while time.monotonic()<deadline:
            try:
                with urllib.request.urlopen(self.base+"/health",timeout=1) as response:
                    if response.status==200 and json.load(response)=={"status":"ok"}:
                        return
            except Exception as error:
                last = str(error)
            time.sleep(.25)
        raise RuntimeError("Launch/health contract failed: "+str(last))

    def stop_process(self):
        script = """import pathlib,os,signal,sys,time
p=pathlib.Path(sys.argv[1])/'.runtime/server.pid'
if p.exists():
    try: os.killpg(int(p.read_text()),signal.SIGTERM)
    except ProcessLookupError: pass
    time.sleep(.5)
"""
        checked(["sbx","exec",self.name,"python3","-c",script,self.private_root])

    def restart(self):
        self.stop_process()
        self.start()

    def capture(self):
        for name in ("server.log","app.sqlite","app.sqlite-wal","app.sqlite-shm"):
            result=subprocess.run(["sbx","exec",self.name,"cat",self.private_root+"/.runtime/"+name],capture_output=True)
            if result.returncode==0:
                (self.source/".runtime"/name).write_bytes(result.stdout)
                if name=="server.log": (self.output/"server.log").write_bytes(result.stdout)

    def stop(self):
        self.stop_process()
        self.capture()
        invoke(["sbx","stop",self.name])

def run_suite(master, run, deployment, output, stage, phase, prefix):
    target = output / phase
    target.mkdir(parents=True)
    env = dict(os.environ,
        PLAYWRIGHT_BROWSERS_PATH=str(master/".local/browsers"),
        FF_STAGE=str(stage),FF_PHASE=phase,FF_FIXTURE_PREFIX=prefix,
        FF_BASE_URL=deployment.base,FF_RESULT=str(target/"results.json"),
        FF_OUTPUT=str(target/"artifacts"))
    command = [str(master/"node_modules/.bin/playwright"),"test","--config",
               str(run/"definitions/project/acceptance/playwright.config.mjs")]
    result = subprocess.run(command,env=env,text=True,capture_output=True,cwd=master)
    (target/"stdout.log").write_text(result.stdout)
    (target/"stderr.log").write_text(result.stderr)
    if not (target/"results.json").exists():
        raise RuntimeError("PM acceptance runner produced no result: "+result.stderr[-2000:])
    report = json.loads((target/"results.json").read_text())
    diagnostics=[]
    def visit(suites):
        for suite in suites:
            for spec in suite.get("specs",[]):
                for test in spec.get("tests",[]):
                    for res in test.get("results",[]):
                        if res["status"] not in ("passed","skipped"):
                            diagnostics.append({
                                "test":spec["title"],"phase":phase,"status":res["status"],
                                "errors":[e.get("message","") for e in res.get("errors",[])]})
            visit(suite.get("suites",[]))
    visit(report.get("suites",[]))
    return result.returncode == 0, diagnostics, report.get("stats",{})
