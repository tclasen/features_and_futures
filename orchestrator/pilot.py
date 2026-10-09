"""Resume the synchronized, measured three-round pilot; never start a main run."""
import json
import os
import shutil
import subprocess
import tarfile
import threading
import time
from pathlib import Path
from .adapters import execute_attempt, isolation_probe, sandbox_policy, invoke
from .evidence import Ledger, digest_bytes, digest_json, read_jsonl, timestamp
from .gateway import InferenceGateway
from .prepare import ROOT, checked, file_hashes, git, write_json
from .validation import Deployment, run_suite

class CommitObserver:
    def __init__(self, repo, ledger, identity):
        self.repo,self.ledger,self.identity=repo,ledger,identity
        self.seen=set(git(repo,"rev-list","--all").splitlines())
        self.stop_event=threading.Event()
        self.thread=threading.Thread(target=self.watch,daemon=True)
    def observe(self):
        try:
            current=set(git(self.repo,"rev-list","--all").splitlines())
            for commit in sorted(current-self.seen):
                self.ledger.event("commit_first_observed",commit=commit,
                                  observation_interval_seconds=1,**self.identity)
            self.seen.update(current)
        except RuntimeError:
            pass
    def watch(self):
        while not self.stop_event.wait(1):
            self.observe()
    def start(self): self.thread.start()
    def stop(self):
        self.stop_event.set(); self.thread.join(); self.observe()

def verify_isolation(probe):
    return (probe["own_workspace"] and not any(probe[x] for x in
        ("master_repo","sibling_repo","host_auth","docker_socket_readable"))
        and all(not probe[x]["readable"] for x in
            ("github","github_api","raw_source","mirror","generic_internet","direct_ollama"))
        and probe["gateway"].get("status")==405)

def archive(run, repo, builder, checkpoint, output):
    checked(["python3","-B",str(ROOT/"scripts/archive-builder-history.py"),
             "--experiment","instruction-effects","--run","pilot-001",
             "--builder",builder,"--checkpoint",checkpoint,"--repository",str(repo)])
    # Includes relevant untracked/dirty files before any recovery, excludes only Git internals.
    with tarfile.open(output/"working-tree.tar.gz","w:gz") as tar:
        for entry in sorted(repo.iterdir()):
            if entry.name != ".git":
                tar.add(entry,arcname=entry.name)
    write_json(output/"working-tree-checksum.json",{
        "sha256":digest_bytes((output/"working-tree.tar.gz").read_bytes()),
        "scope":"all working files excluding .git"})
    return json.loads((run/"builders"/builder/"checkpoints"/checkpoint/"index.json").read_text())

def main():
    run=ROOT/"runs/instruction-effects/pilot-001"
    manifest=json.loads((run/"manifest.json").read_text())
    manifest_hash=digest_json(manifest)
    assert manifest_hash==(run/"manifest.sha256").read_text().strip()
    assert file_hashes(run/"definitions")==manifest["provenance"]["definition_hashes"]
    instructions=json.loads((run/"definitions/instructions.json").read_text())
    state=json.loads((run/"state.json").read_text())
    if state["status"]=="completed":
        print("Pilot already completed. Run orchestrator.report to verify.",flush=True)
        return
    identity={k:manifest[k] for k in ("experiment_id","experiment_revision","project_id","project_revision","run_id")}
    identity["manifest_sha256"]=manifest_hash
    ledger=Ledger(run,identity)
    gateway=InferenceGateway(ledger,manifest["pricing"])
    state["status"]="running"; state["last_error"]=None
    write_json(run/"state.json",state)
    ledger.event("runner_started",process_id=os.getpid())
    builders=manifest["runtime"]["builder_configurations"]
    try:
        for task in manifest["tasks"]:
            task_id=task["task_id"]; stage=task["stage"]
            order=builders[(stage-1)*6:]+builders[:(stage-1)*6]
            for builder in order:
                bid=builder["builder_id"]; accepted=state["accepted"].get(bid)
                if accepted and accepted["stage"]>=stage:
                    continue
                repo=Path(manifest["paths"]["builders"])/bid
                sandbox="ff-pilot-"+bid
                known=invoke(["sbx","inspect",sandbox,"--json"])
                if known.returncode:
                    checked(["sbx","create","--name",sandbox,"--cpus","4","--memory","4g",
                             "--skills","off","--pull","never","-t",manifest["runtime"]["image"],
                             "shell",str(repo)])
                # sbx exec starts a stopped sandbox; policy applies before any harness call.
                policy=sandbox_policy(sandbox,gateway.port)
                probe=isolation_probe(sandbox,repo,
                    Path(manifest["paths"]["builders"])/("b002" if bid!="b002" else "b001"),
                    gateway.port)
                prep=run/"builders"/bid
                prep.mkdir(parents=True,exist_ok=True)
                write_json(prep/f"isolation-{task_id}.json",{"probe":probe,"policy":policy})
                if not verify_isolation(probe):
                    raise RuntimeError(f"{bid} isolation failed: {probe}")
                packet=(run/"tasks"/task_id/"packet.md").read_text()
                assert digest_bytes(packet.encode())==task["packet_sha256"]
                task_identity={"builder_id":bid,"task_id":task_id,
                               "packet_sha256":task["packet_sha256"],"suite_hash":task["suite_hash"]}
                events=read_jsonl(run/"events.jsonl")
                if not any(e["kind"]=="task_dispatched" and e.get("builder_id")==bid
                           and e.get("task_id")==task_id for e in events):
                    ledger.event("task_dispatched",**task_identity)
                attempt_root=run/"tasks"/task_id/"attempts"/bid
                previous=[]
                if attempt_root.exists():
                    previous=sorted(attempt_root.glob("attempt-*"))
                # Never overwrite interrupted attempts; preserve and resume with explicit fresh attempt.
                feedback=""
                if previous:
                    last=previous[-1]/"feedback.json"
                    if last.exists():
                        feedback="\n\nFeedback on your previous submission:\n"+last.read_text()
                    else:
                        ledger.event("interrupted_attempt_retained",attempt_id=previous[-1].name,**task_identity)
                        feedback="\n\nThe PM runner was interrupted. Continue the same task from your own current repository and submit a committed implementation."
                consecutive=0
                while True:
                    number=len(list(attempt_root.glob("attempt-*")))+1 if attempt_root.exists() else 1
                    attempt_id=f"attempt-{number:03d}"
                    output=attempt_root/attempt_id; output.mkdir(parents=True)
                    attrs={**task_identity,"attempt_id":attempt_id}
                    pre_head=git(repo,"rev-parse","HEAD")
                    # Contention is a covariate, not an exclusion.
                    write_json(output/"host-contention.json",{"load_average":os.getloadavg(),
                        "vm_stat":checked(["vm_stat"]),"observed_at":timestamp()})
                    provider="ollama" if builder["model"]=="gpt-oss:120b" else "subscription"
                    key=gateway.lease(builder["model"],bid,task_id,attempt_id,provider)
                    started=[]
                    def on_start():
                        started.append(ledger.event("attempt_started",pre_commit=pre_head,**attrs))
                    observer=CommitObserver(repo,ledger,attrs); observer.start()
                    print(f"{task_id} {bid} {builder['model']} {builder['harness']} {builder['profile']} {attempt_id} START",flush=True)
                    result=None
                    try:
                        result=execute_attempt(sandbox,builder["harness"],builder["model"],key,
                            gateway.port,packet+feedback,output,instructions["profiles"][builder["profile"]],
                            on_start=on_start)
                    finally:
                        observer.stop()
                        gateway.revoke()
                        ended=ledger.event("attempt_finished",
                            exit_code=result.returncode if result else None,**attrs)
                        checked(["sbx","stop",sandbox])
                    head=git(repo,"rev-parse","HEAD")
                    tree=git(repo,"rev-parse","HEAD^{tree}")
                    dirty=git(repo,"status","--porcelain","--untracked-files=normal")
                    checkpoint=f"{task_id}-{attempt_id}"
                    index=archive(run,repo,bid,checkpoint,output)
                    ledger.event("submission_observed",commit=head,tree=tree,
                        working_tree_clean=not bool(dirty),archive=index["checksums"],**attrs)
                    usage=[u for u in read_jsonl(run/"usage.jsonl") if
                           all(u.get(k)==attrs[k] for k in ("builder_id","task_id","attempt_id"))]
                    if not usage or any(u["counts"] is None for u in usage):
                        raise RuntimeError(f"{bid} {attempt_id}: incomplete native accounting; preserve and diagnose before retrying")
                    if any(u["status"]!=200 for u in usage):
                        raise RuntimeError(f"{bid} {attempt_id}: provider failure; preserve and diagnose")
                    diagnostics=[]
                    if result.returncode:
                        diagnostics.append({"contract":"Harness exited unsuccessfully",
                                            "exit_code":result.returncode})
                    if dirty:
                        diagnostics.append({"contract":"Relevant source must be committed",
                                            "observed_git_status":dirty})
                    if head==(accepted["commit"] if accepted else manifest["provenance"]["starter_commit"]):
                        diagnostics.append({"contract":"Submit the implemented task in a new exact commit",
                                            "observed_commit":head})
                    package=json.loads((repo/"package.json").read_text()) if (repo/"package.json").exists() else {}
                    if package.get("dependencies"):
                        diagnostics.append({"contract":"No external application dependencies permitted",
                                            "observed_dependencies":list(package["dependencies"])})
                    deployment=None; stats=[]
                    ledger.event("validation_started",commit=head,**attrs)
                    if not diagnostics:
                        if accepted:
                            checked(["sbx","stop",accepted["sandbox"]])
                        try:
                            deployment=Deployment(manifest,bid,task_id,attempt_id,repo,head,output,accepted)
                            if accepted:
                                ok,errors,counts=run_suite(ROOT,run,deployment,output,
                                    accepted["stage"],"upgrade",accepted["fixture_prefix"])
                                diagnostics.extend(errors); stats.append({"phase":"upgrade",**counts})
                                if not ok and not errors:
                                    diagnostics.append({"contract":"Upgrade acceptance run failed"})
                            if not diagnostics:
                                ok,errors,counts=run_suite(ROOT,run,deployment,output,stage,"acceptance",task_id)
                                diagnostics.extend(errors); stats.append({"phase":"acceptance",**counts})
                                if not ok and not errors:
                                    diagnostics.append({"contract":"Acceptance run failed"})
                            if not diagnostics:
                                deployment.restart()
                                ok,errors,counts=run_suite(ROOT,run,deployment,output,stage,"postrestart",task_id)
                                diagnostics.extend(errors); stats.append({"phase":"postrestart",**counts})
                                if not ok and not errors:
                                    diagnostics.append({"contract":"Restart acceptance run failed"})
                        except RuntimeError as error:
                            # Launch errors attributable to submitted app; missing PM reports are infrastructure.
                            if "PM acceptance runner" in str(error):
                                raise
                            diagnostics.append({"contract":"Application launch/health or restart failed",
                                                "observed":str(error)})
                    passed=not diagnostics
                    ledger.event("validation_finished",success=passed,statistics=stats,**attrs)
                    write_json(output/"result.json",{
                        "accepted":passed,"commit":head,"tree":tree,
                        "attempt_wall_seconds":(ended["monotonic_ns"]-started[0]["monotonic_ns"])/1e9,
                        "requests":len(usage),"native_usage_complete":True,
                        "acceptance_statistics":stats,"diagnostics":diagnostics})
                    if passed:
                        ledger.event("task_accepted",commit=head,tree=tree,**attrs)
                        prior_commit=accepted["commit"] if accepted else manifest["provenance"]["starter_commit"]
                        included=git(repo,"rev-list",f"{prior_commit}..{head}").splitlines()
                        ledger.event("deployment_promoted",commit=head,tree=tree,
                                     prior_commit=prior_commit,included_commits=included,**attrs)
                        promoted=time.monotonic()
                        try:
                            while time.monotonic()-promoted<manifest["evidence_policy"]["post_deployment_window_seconds"]:
                                deployment.health()
                                time.sleep(.5)
                            ledger.event("post_deployment_checks_passed",commit=head,**attrs)
                        except RuntimeError as error:
                            ledger.event("incident_detected",observed=str(error),commit=head,**attrs)
                            raise
                        accepted={"stage":stage,"commit":head,"tree":tree,
                                  "sandbox":deployment.name,"database":str(deployment.database),
                                  "fixture_prefix":task_id}
                        state["accepted"][bid]=accepted
                        write_json(run/"state.json",state)
                        # Persist a clean database snapshot by stopping all app processes.
                        deployment.stop_process()
                        for suffix in ("","-wal","-shm"):
                            file=Path(str(deployment.database)+suffix)
                            if file.exists(): shutil.copy2(file,output/("accepted.sqlite"+suffix))
                        deployment.start()
                        log=deployment.source/".runtime/server.log"
                        if log.exists(): shutil.copy2(log,output/"server.log")
                        print(f"{task_id} {bid} ACCEPTED {attempt_id} requests={len(usage)}",flush=True)
                        break
                    if deployment: deployment.stop()
                    if accepted:
                        # Restore the prior live surrogate; unchanged revision is not a promotion.
                        invoke(["sbx","exec",accepted["sandbox"],"true"])
                        ledger.event("prior_deployment_resumed",commit=accepted["commit"],**attrs)
                    recovery={"decision":"correction_in_place","actor":"pm",
                              "pre_commit":head,"post_commit":head,"pre_tree":tree,"post_tree":tree,
                              "reason":"Return objective launch/behavior/submission evidence; preserve useful implementation",
                              "archive_checksums":index["checksums"],"diagnostics":diagnostics}
                    write_json(output/"feedback.json",{"task_id":task_id,"submission":head,
                        "status":"rejected","required":"Meet the unchanged cumulative requirements and submit committed source",
                        "observations":diagnostics})
                    ledger.event("attempt_rejected",**recovery,**attrs)
                    ledger.event("feedback_issued",**attrs)
                    feedback="\n\nFeedback on your previous submission:\n"+(output/"feedback.json").read_text()
                    fingerprint=digest_json(diagnostics)
                    consecutive=consecutive+1 if state.get("last_failure_fingerprint")==fingerprint else 1
                    state["last_failure_fingerprint"]=fingerprint
                    write_json(run/"state.json",state)
                    if consecutive%10==0:
                        ledger.event("unchanged_failure_notification",consecutive=consecutive,**attrs)
                        print(f"NOTICE {bid} {task_id}: {consecutive} unchanged failures; continuing measured retries",flush=True)
                    print(f"{task_id} {bid} REJECTED {attempt_id}: {json.dumps(diagnostics)[:900]}",flush=True)
            ledger.event("round_completed",task_id=task_id,stage=stage)
        state["status"]="completed"; state["completed_at"]=timestamp()
        write_json(run/"state.json",state)
        ledger.event("pilot_completed",accepted_tasks=len(state["accepted"])*3)
        print("PILOT COMPLETED: 18 builders, three rounds.",flush=True)
    except Exception as error:
        state["status"]="infrastructure_attention";state["last_error"]=str(error)
        write_json(run/"state.json",state)
        ledger.event("runner_interrupted",error=type(error).__name__,detail=str(error))
        raise
    finally:
        gateway.close()

if __name__=="__main__":
    main()
