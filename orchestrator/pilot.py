"""Resume synchronized measured engineering pilots; never start a main run."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
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
from .prepare import ROOT, checked, file_hashes, git, write_json, InfrastructureError
from .validation import Deployment, run_suite, launch_deployment
from .private import WORK, sandbox_git, initialize, export
from .diagnostics import tool_diagnostics
from .recovery import append_recovery_instruction

class CommitObserver:
    def __init__(self, sandbox, ledger, identity):
        self.repo,self.ledger,self.identity=sandbox,ledger,identity
        self.seen=set(sandbox_git(sandbox,"rev-list","--all").splitlines())
        self.stop_event=threading.Event()
        self.thread=threading.Thread(target=self.watch,daemon=True)
    def observe(self):
        try:
            current=set(sandbox_git(self.repo,"rev-list","--all").splitlines())
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
            ("github","github_api","raw_source","mirror","generic_internet","direct_ollama","no_proxy_github","no_proxy_local_provider","no_proxy_direct_ip"))
        and probe["gateway"].get("status")==405)

def archive(run, repo, builder, checkpoint, output):
    checked(["python3","-B",str(ROOT/"scripts/archive-builder-history.py"),
             "--experiment",run.parent.name,"--run",run.name,
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

def record_round_completion(ledger,state,builders,task):
    if any(state["accepted"].get(b["builder_id"],{}).get("stage",0)<task["stage"] for b in builders):
        raise InfrastructureError("Cannot release next requirements before every accepted checkpoint")
    existing=[e for e in read_jsonl(ledger.root/"events.jsonl") if e["kind"]=="round_completed" and e["task_id"]==task["task_id"]]
    if len(existing)>1:
        raise InfrastructureError("Duplicate original round completion evidence")
    if not existing:
        ledger.event("round_completed",task_id=task["task_id"],stage=task["stage"])


def execute_round(builders,max_workers,work,stop_event):
    """Wait for every builder before allowing the caller to release the next task."""
    with ThreadPoolExecutor(max_workers=max_workers,thread_name_prefix="builder") as pool:
        futures=[pool.submit(work,builder) for builder in builders]
        try:
            for future in as_completed(futures):
                future.result()
        except BaseException:
            stop_event.set()
            raise


def run_builder_task(run,manifest,instructions,state,ledger,builder,task,state_lock,stop_event,provider_args):
    if stop_event.is_set():
        raise InfrastructureError("Round interrupted before dispatch")
    gateway=InferenceGateway(ledger,manifest["pricing"],**provider_args)
    try:
        return _run_builder_task(run,manifest,instructions,state,ledger,builder,task,state_lock,stop_event,gateway)
    finally:
        gateway.close()


def _run_builder_task(run,manifest,instructions,state,ledger,builder,task,state_lock,stop_event,gateway):
    task_id=task["task_id"];stage=task["stage"]
    bid=builder["builder_id"]; accepted=state["accepted"].get(bid)
    if accepted and accepted["stage"]>=stage:
        return
    from .storage import require_space, retire_deployment
    require_space(manifest, run)
    repo=Path(manifest["paths"]["builders"])/bid
    sandbox="ff-"+run.name+"-"+bid
    known=invoke(["sbx","inspect",sandbox,"--json"])
    if known.returncode:
        checked(["sbx","create","--name",sandbox,"--cpus","4","--memory","4g",
                 "--skills","off","--pull","never","-t",manifest["runtime"]["image"],
                 "shell"])
        initialize(sandbox,repo)
    # sbx exec starts a stopped sandbox; policy applies before any harness call.
    policy=sandbox_policy(sandbox,gateway.port)
    probe=isolation_probe(sandbox,WORK,
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
            prior_feedback=json.loads(last.read_text())
            prior_usage=[u for u in read_jsonl(run/"usage.jsonl")
                if u.get("builder_id")==bid and u.get("task_id")==task_id
                and u.get("attempt_id")==previous[-1].name]
            concise=(tool_diagnostics(prior_usage,previous[-1])
                if manifest["execution"].get("feedback_rendering")in ("native-parser-and-supplied-schemas-v2","native-and-visible-state-v3") else [])
            if concise:
                revised=dict(prior_feedback)
                revised["observations"]=concise+[o for o in prior_feedback["observations"]
                    if o.get("contract")!="Generated tool arguments must be valid for the assigned harness"]
                revised["feedback_rendering_revision"]="native-parser-and-supplied-schemas-v2"
                supplement=previous[-1]/"feedback-rendering-v2.json"
                if not supplement.exists():
                    write_json(supplement,revised)
                    ledger.event("feedback_rendering_superseded",
                        attempt_id=previous[-1].name,
                        original_feedback_sha256=digest_bytes(last.read_bytes()),
                        revised_feedback_sha256=digest_bytes(supplement.read_bytes()),
                        change="Return exact parser error and supplied schemas; original evidence retained",
                        **task_identity)
                feedback="\n\nFeedback on your previous submission:\n"+supplement.read_text()
            else:
                feedback="\n\nFeedback on your previous submission:\n"+last.read_text()
        else:
            ledger.event("interrupted_attempt_retained",attempt_id=previous[-1].name,**task_identity)
            feedback="\n\nThe PM runner was interrupted. Continue the same task from your own current repository and submit a committed implementation."
    if previous:
        feedback=append_recovery_instruction(feedback,previous[-1],bid,task_id)
    consecutive=0
    previous_fingerprint=state.get("last_failure_fingerprints",{}).get(bid)
    while True:
        if stop_event.is_set():
            raise InfrastructureError("Round interrupted; prior attempt evidence retained")
        number=len(list(attempt_root.glob("attempt-*")))+1 if attempt_root.exists() else 1
        attempt_id=f"attempt-{number:03d}"
        output=attempt_root/attempt_id; output.mkdir(parents=True)
        attrs={**task_identity,"attempt_id":attempt_id}
        pre_head=sandbox_git(sandbox,"rev-parse","HEAD")
        # Contention is a covariate, not an exclusion.
        write_json(output/"host-contention.json",{"load_average":os.getloadavg(),
            "vm_stat":checked(["vm_stat"]),"observed_at":timestamp()})
        provider="ollama" if builder["model"]=="gpt-oss:120b" else "subscription"
        key=gateway.lease(builder["model"],bid,task_id,attempt_id,provider)
        started=[]
        require_space(manifest, run)
        def on_start():
            started.append(ledger.event("attempt_started",pre_commit=pre_head,**attrs))
        observer=CommitObserver(sandbox,ledger,attrs); observer.start()
        print(f"{task_id} {bid} {builder['model']} {builder['harness']} {builder['profile']} {attempt_id} START",flush=True)
        result=None
        returned=[]
        def on_return(exit_code):
            returned.append(ledger.event("harness_returned",exit_code=exit_code,**attrs))
        timing_v2=manifest["execution"].get("timing_revision")=="harness-return-v2"
        try:
            result=execute_attempt(sandbox,builder["harness"],builder["model"],key,
                gateway.port,packet+feedback,output,instructions["profiles"][builder["profile"]],
                on_start=on_start,workdir=WORK,
                on_return=on_return if timing_v2 else None,
                context_settings=manifest["runtime"].get("harness_context",{}).get(builder["harness"]))
        finally:
            observer.stop()
            gateway.revoke()
            ended=ledger.event("attempt_finished",
                exit_code=result.returncode if result else None,**attrs)
        native=export(sandbox,repo,output)
        checked(["sbx","stop",sandbox])
        head=native["head"]
        tree=native["tree"]
        dirty=native["dirty"]
        checkpoint=f"{task_id}-{attempt_id}"
        index=archive(run,repo,bid,checkpoint,output)
        ledger.event("submission_observed",commit=head,tree=tree,
            working_tree_clean=not bool(dirty),archive=index["checksums"],**attrs)
        usage=[u for u in read_jsonl(run/"usage.jsonl") if
               all(u.get(k)==attrs[k] for k in ("builder_id","task_id","attempt_id"))]
        if not usage or any(u["counts"] is None for u in usage):
            raise RuntimeError(f"{bid} {attempt_id}: incomplete native accounting; preserve and diagnose before retrying")
        if any(u["status"]!=200 and u.get("outcome")!="builder-invalid-tool-call" for u in usage):
            raise RuntimeError(f"{bid} {attempt_id}: provider failure; preserve and diagnose")
        diagnostics=(tool_diagnostics(usage,output)
            if manifest["execution"].get("feedback_rendering")in ("native-parser-and-supplied-schemas-v2","native-and-visible-state-v3") else
            [{"contract":"Generated tool arguments must be valid for the assigned harness",
              "observed":u["tool_parser_error"]} for u in usage
             if u.get("outcome")=="builder-invalid-tool-call"])
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
            try:
                deployment=launch_deployment(manifest,bid,task_id,attempt_id,repo,head,output,accepted)
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
                if not diagnostics:
                    deployment.capture()
            except RuntimeError as error:
                # Launch errors attributable to submitted app; missing PM reports are infrastructure.
                if isinstance(error, InfrastructureError) or "PM acceptance runner" in str(error):
                    raise
                diagnostics.append({"contract":"Application launch/health or restart failed",
                                    "observed":str(error)})
        passed=not diagnostics
        ledger.event("validation_finished",success=passed,statistics=stats,**attrs)
        write_json(output/"result.json",{
            "accepted":passed,"commit":head,"tree":tree,
            "attempt_wall_seconds":((returned[0] if returned else ended)["monotonic_ns"]-started[0]["monotonic_ns"])/1e9,
            **({"observer_drain_seconds":(ended["monotonic_ns"]-returned[0]["monotonic_ns"])/1e9} if returned else {}),
            "requests":len(usage),"native_usage_complete":True,
            "acceptance_statistics":stats,"diagnostics":diagnostics})
        if passed:
            ledger.event("task_accepted",commit=head,tree=tree,**attrs)
            prior_commit=accepted["commit"] if accepted else manifest["provenance"]["starter_commit"]
            included=git(repo,"rev-list",f"{prior_commit}..{head}").splitlines()
            if accepted:
                checked(["sbx","stop",accepted["sandbox"]])
            ledger.event("deployment_promoted",commit=head,tree=tree,
                         prior_commit=prior_commit,included_commits=included,**attrs)
            promoted=time.monotonic()
            if manifest["evidence_policy"].get("stability_revision")=="behavior-and-restart-v2":
                from .stability import monitor_promotion
                observation_number=[0]
                def check_promotion():
                    deployment.probe_health()
                    observation_number[0]+=1
                    phase=f"observation-{observation_number[0]:03d}"
                    ok,errors,counts=run_suite(ROOT,run,deployment,output,stage,phase,task_id)
                    ledger.event("post_deployment_sample",commit=head,success=ok,statistics=counts,**attrs)
                    if not ok or errors or counts.get("expected")!=1 or counts.get("skipped",0):
                        raise RuntimeError("Post-promotion behavioral check failed: "+json.dumps(errors))
                monitor_promotion(ledger,{"commit":head,**attrs},check_promotion,deployment.restart,
                                  manifest["evidence_policy"]["post_deployment_window_seconds"],
                                  manifest["evidence_policy"]["post_deployment_interval_seconds"])
            else:
                try:
                    while time.monotonic()-promoted<manifest["evidence_policy"]["post_deployment_window_seconds"]:
                        deployment.health()
                        time.sleep(.5)
                    ledger.event("post_deployment_checks_passed",commit=head,**attrs)
                except RuntimeError as error:
                    ledger.event("incident_detected",observed=str(error),commit=head,**attrs)
                    raise
            accepted_prior=accepted
            accepted={"stage":stage,"commit":head,"tree":tree,
                      "sandbox":deployment.name,"database":str(deployment.database),
                      "fixture_prefix":task_id, "archive_output":str(output),
                      "checkpoint_archive":str(run/"builders"/bid/"checkpoints"/(task_id+"-"+attempt_id))}
            with state_lock:
                state["accepted"][bid]=accepted
                write_json(run/"state.json",state)
            # Persist a clean database snapshot by stopping all app processes.
            deployment.capture()
            for suffix in ("","-wal","-shm"):
                file=Path(str(deployment.database)+suffix)
                if file.exists(): shutil.copy2(file,output/("accepted.sqlite"+suffix))
            log=deployment.source/".runtime/server.log"
            if log.exists(): shutil.copy2(log,output/"server.log")
            if accepted_prior and manifest["runtime"].get("storage_policy"):
                retire_deployment(manifest, accepted_prior["sandbox"], accepted_prior["archive_output"], accepted_prior["checkpoint_archive"])
            print(f"{task_id} {bid} ACCEPTED {attempt_id} requests={len(usage)}",flush=True)
            break
        if deployment:
            deployment.stop()
            if deployment.database.exists() and not (output/"cleanup.json").exists():
                shutil.copy2(deployment.database, output/"retired.sqlite")
            retire_deployment(manifest, deployment.name, output, run/"builders"/bid/"checkpoints"/(task_id+"-"+attempt_id))
        if accepted:
            ledger.event("prior_deployment_preserved",commit=accepted["commit"],**attrs)
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
        from .diagnostics import notification_fingerprint
        fingerprint=(notification_fingerprint(diagnostics) if manifest["execution"].get("feedback_rendering")=="native-and-visible-state-v3" else digest_json(diagnostics))
        consecutive=consecutive+1 if previous_fingerprint==fingerprint else 1
        previous_fingerprint=fingerprint
        with state_lock:
            state.setdefault("last_failure_fingerprints",{})[bid]=fingerprint
            write_json(run/"state.json",state)
        if consecutive%10==0:
            ledger.event("unchanged_failure_notification",consecutive=consecutive,**attrs)
            print(f"NOTICE {bid} {task_id}: {consecutive} unchanged failures; continuing measured retries",flush=True)
        print(f"{task_id} {bid} REJECTED {attempt_id}: {json.dumps(diagnostics)[:900]}",flush=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--run",default="pilot-004");args=parser.parse_args()
    run=ROOT/"runs/instruction-effects"/args.run
    manifest=json.loads((run/"manifest.json").read_text())
    manifest_hash=digest_json(manifest)
    assert manifest_hash==(run/"manifest.sha256").read_text().strip()
    assert file_hashes(run/"definitions")==manifest["provenance"]["definition_hashes"]
    if manifest["purpose"] not in ("engineering-pilot","engineering-longitudinal-pilot"):
        raise InfrastructureError("This command only dispatches authorized engineering pilots")
    streaming=manifest["execution"].get("task_stream_revision")=="append-only-rounds-v1"
    if streaming:
        from .task_stream import task_stream, stream_sealed
        manifest["tasks"]=task_stream(run,manifest)
    instructions=json.loads((run/"definitions/instructions.json").read_text())
    state=json.loads((run/"state.json").read_text())
    if state["status"]=="completed":
        print("Pilot already completed. Run orchestrator.report to verify.",flush=True)
        return
    if state["status"] in ("superseded", "aborted"):
        raise InfrastructureError("This run is closed; prepare a new run instead of resuming it")
    identity={k:manifest[k] for k in ("experiment_id","experiment_revision","project_id","project_revision","run_id")}
    identity["manifest_sha256"]=manifest_hash
    ledger=Ledger(run,identity)
    provider_args = {"local_endpoint": None}
    if "local_provider" in manifest["runtime"]:
        from .local_provider import provenance
        provider=provenance()
        frozen_provider=manifest["runtime"]["local_provider"]
        for key in ("binary_sha256","runner_binary_sha256","instrumentation_sha256","model","settings"):
            if provider[key]!=frozen_provider[key]:
                raise InfrastructureError(f"Local provider provenance changed: {key}")
        provider_args = {"local_endpoint": provider["endpoint"], "native_usage_path": provider["native_usage_file"]}
    state_lock=threading.RLock()
    stop_event=threading.Event()
    state["status"]="running"; state["last_error"]=None
    write_json(run/"state.json",state)
    ledger.event("runner_started",process_id=os.getpid(),
        feedback_rendering_revision=manifest["execution"].get("feedback_rendering", "legacy-v1"),
        execution_code_commit=git(ROOT,"rev-parse","HEAD"))
    builders=manifest["runtime"]["builder_configurations"]
    try:
        for task in manifest["tasks"]:
            task_id=task["task_id"]; stage=task["stage"]
            offset=((stage-1)*manifest["execution"].get("rotation_positions",6)) % len(builders)
            order=builders[offset:]+builders[:offset]
            execute_round(order,manifest["execution"].get("max_parallel_builders",1),
                lambda builder: run_builder_task(run,manifest,instructions,state,ledger,builder,task,state_lock,stop_event,provider_args),
                stop_event)
            record_round_completion(ledger,state,builders,task)
        if streaming and not stream_sealed(run):
            state["status"]="awaiting_frozen_round"
            write_json(run/"state.json",state)
            ledger.event("task_stream_waiting",completed_rounds=len(manifest["tasks"]))
            print("Awaiting next frozen round; current checkpoint barrier complete.",flush=True)
        else:
            state["status"]="completed"; state["completed_at"]=timestamp()
            write_json(run/"state.json",state)
            ledger.event("pilot_completed",accepted_tasks=len(builders)*len(manifest["tasks"]))
            print(f"PILOT COMPLETED: {len(builders)} builders, {len(manifest['tasks'])} rounds.",flush=True)
    except BaseException as error:
        state["status"]="infrastructure_attention";state["last_error"]=str(error)
        write_json(run/"state.json",state)
        ledger.event("runner_interrupted",error=type(error).__name__,detail=str(error))
        raise

if __name__=="__main__":
    main()
