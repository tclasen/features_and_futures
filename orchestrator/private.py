"""Private sandbox workspaces, with data-only history export to trusted PM shadows."""
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from .adapters import invoke
from .prepare import checked, git, write_json

WORK = "/home/agent/work"

def sandbox_git(sandbox, *args):
    return checked(["sbx","exec","-w",WORK,sandbox,"git",*args])

def initialize(sandbox, starter):
    # Only trusted starter files enter the private filesystem; no host bind mount.
    with tempfile.TemporaryFile() as stream:
        with tarfile.open(fileobj=stream,mode="w") as archive:
            for entry in sorted(starter.iterdir()):
                archive.add(entry,arcname=entry.name)
        stream.seek(0)
        script="import sys,tarfile,pathlib;p=pathlib.Path('/home/agent/work');p.mkdir();tarfile.open(fileobj=sys.stdin.buffer,mode='r|').extractall(p,filter='data')"
        result=subprocess.run(["sbx","exec","-i",sandbox,"python3","-c",script],stdin=stream,capture_output=True)
        if result.returncode: raise RuntimeError(result.stderr.decode())
    sandbox_git(sandbox,"config","user.name","Experiment Builder")
    sandbox_git(sandbox,"config","user.email","builder@experiment.invalid")

def export(sandbox, shadow, output):
    metadata={"head":sandbox_git(sandbox,"rev-parse","HEAD"),
              "tree":sandbox_git(sandbox,"rev-parse","HEAD^{tree}"),
              "dirty":sandbox_git(sandbox,"status","--porcelain","--untracked-files=normal"),
              "refs":sandbox_git(sandbox,"for-each-ref","--format=%(refname) %(objectname)")}
    write_json(output/"native-git.json",metadata)
    bundle="/home/agent/.ff-export.bundle"
    sandbox_git(sandbox,"bundle","create",bundle,"--all","HEAD")
    with (output/"native-history.bundle").open("wb") as stream:
        result=subprocess.run(["sbx","exec",sandbox,"cat",bundle],stdout=stream,stderr=subprocess.PIPE)
        if result.returncode: raise RuntimeError(result.stderr.decode())
    script="""import tarfile,sys,pathlib
p=pathlib.Path('/home/agent/work')
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz') as archive:
    for f in sorted(p.iterdir()):
        if f.name!='.git': archive.add(f,arcname=f.name)
"""
    with (output/"native-working-tree.tar.gz").open("wb") as stream:
        result=subprocess.run(["sbx","exec",sandbox,"python3","-c",script],stdout=stream,stderr=subprocess.PIPE)
        if result.returncode:raise RuntimeError(result.stderr.decode())
    # Never copy builder .git configuration/hooks to the host. A bundle contains objects/refs only.
    replacement=shadow.parent/(shadow.name+".pm-shadow")
    replacement.mkdir()
    git(replacement,"init","-b","main")
    git(replacement,"config","core.hooksPath","/dev/null")
    git(replacement,"config","core.fsmonitor","false")
    git(replacement,"fetch","--atomic","--update-head-ok","--no-write-fetch-head",str(output/"native-history.bundle"),
        "+refs/*:refs/*")
    git(replacement,"checkout","--detach",metadata["head"])
    # Original branches and every rejected commit remain intact; HEAD can be detached.
    shutil.rmtree(shadow)
    replacement.rename(shadow)
    return metadata
