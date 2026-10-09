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
        self.created = False
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
                 "--publish",f"127.0.0.1:{self.port}:8080/tcp4","shell"])
        self.created = True
        with archive.open("rb") as stream:
            script="import sys,pathlib,tarfile;p=pathlib.Path('/home/agent/app');p.mkdir();tarfile.open(fileobj=sys.stdin.buffer,mode='r|').extractall(p,filter='data');(p/'.runtime').mkdir()"
            result=subprocess.run(["sbx","exec","-i",self.name,"python3","-c",script],stdin=stream,capture_output=True)
            if result.returncode:raise RuntimeError(result.stderr.decode())
        for name in ("app.sqlite","app.sqlite-wal","app.sqlite-shm"):
            path=runtime/name
            if path.exists():
                with path.open("rb") as stream:
                    script="import pathlib,sys;pathlib.Path(sys.argv[1]).write_bytes(sys.stdin.buffer.read())"
                    result=subprocess.run(["sbx","exec","-i",self.name,"python3","-c",script,self.private_root+"/.runtime/"+name],stdin=stream,capture_output=True)
                    if result.returncode:raise RuntimeError(result.stderr.decode())
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

    def probe_health(self):
        # A post-promotion sample must expose an outage, rather than retry it away.
        try:
            with urllib.request.urlopen(self.base+"/health",timeout=2) as response:
                if response.status!=200 or json.load(response)!={"status":"ok"}:
                    raise RuntimeError("Post-promotion health contract failed")
        except Exception as error:
            raise RuntimeError("Post-promotion health sample failed: "+str(error)) from error

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
        # SQLite backup creates a consistent private snapshot without interrupting the surrogate.
        script="import sqlite3,sys,pathlib;a=sqlite3.connect(sys.argv[1]);b=sqlite3.connect(sys.argv[2]);a.backup(b);b.close();a.close();sys.stdout.buffer.write(pathlib.Path(sys.argv[2]).read_bytes())"
        result=subprocess.run(["sbx","exec",self.name,"python3","-c",script,
            self.private_root+"/.runtime/app.sqlite",self.private_root+"/.runtime/snapshot.sqlite"],capture_output=True)
        if result.returncode:raise RuntimeError("PM database backup failed: "+result.stderr.decode())
        self.database.write_bytes(result.stdout)
        for suffix in ("-wal","-shm"):
            stale=Path(str(self.database)+suffix)
            if stale.exists(): stale.unlink()
        result=subprocess.run(["sbx","exec",self.name,"cat",self.private_root+"/.runtime/server.log"],capture_output=True)
        if result.returncode==0:
            (self.source/".runtime/server.log").write_bytes(result.stdout)
            (self.output/"server.log").write_bytes(result.stdout)

    def stop(self):
        if not getattr(self,"created",True):
            return
        # Rejected apps may have absent/corrupt/non-SQLite data. Preserve raw
        # evidence when a consistent backup is impossible, then stop the VM.
        try:
            self.stop_process()
            try:
                self.capture()
            except RuntimeError as error:
                preserved=[]
                for name in ("app.sqlite", "app.sqlite-wal", "app.sqlite-shm", "server.log"):
                    result=subprocess.run(["sbx","exec",self.name,"cat",
                        self.private_root+"/.runtime/"+name],capture_output=True)
                    if result.returncode==0:
                        (self.output/("rejected-raw-"+name)).write_bytes(result.stdout)
                        preserved.append(name)
                write_json(self.output/"cleanup.json",{
                    "consistent_database_backup":False,"observed_error":str(error),
                    "raw_files_preserved":preserved,"acceptance_unchanged":True})
        finally:
            result=invoke(["sbx","stop",self.name])
            if result.returncode:
                raise RuntimeError("PM sandbox stop failed: "+result.stderr)

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
    feedback_v3=(run/"manifest.json").exists() and json.loads((run/"manifest.json").read_text())["execution"].get("feedback_rendering")=="native-and-visible-state-v3"
    def visit(suites):
        for suite in suites:
            for spec in suite.get("specs",[]):
                for test in spec.get("tests",[]):
                    for res in test.get("results",[]):
                        if res["status"] not in ("passed","skipped"):
                            item={"test":spec["title"],"phase":phase,"status":res["status"],
                                  "errors":[e.get("message","") for e in res.get("errors",[])]}
                            if feedback_v3:
                                from .diagnostics import browser_diagnostics, page_snapshot
                                item=browser_diagnostics([item],master)[0]
                                for attachment in res.get("attachments",[]):
                                    path=Path(attachment.get("path", ""))
                                    if path.name=="error-context.md" and path.is_file() and path.resolve().is_relative_to(target.resolve()):
                                        snapshot=page_snapshot(path.read_text())
                                        if snapshot: item["page_snapshot"]=snapshot
                            diagnostics.append(item)
            visit(suite.get("suites",[]))
    visit(report.get("suites",[]))
    return result.returncode == 0, diagnostics, report.get("stats",{})
