"""Independently verify one task per builder and lock-step parallel task release."""
import argparse
import json
from collections import Counter
from pathlib import Path
from .evidence import digest_bytes,digest_json
from .prepare import ROOT,write_json


def audit(manifest,events,terminal=False):
    builders={b["builder_id"] for b in manifest["runtime"]["builder_configurations"]}
    tasks=manifest["tasks"]
    problems=[]
    rounds={}
    peak=0;active={}
    for event in events:
        kind=event["kind"]
        if kind=="attempt_started":
            bid=event["builder_id"]
            if bid in active:problems.append(bid+": overlapping development attempts")
            active[bid]=(event["task_id"],event["attempt_id"])
            peak=max(peak,len(active))
        elif kind=="attempt_finished":
            bid=event["builder_id"]
            if active.get(bid)!=(event["task_id"],event["attempt_id"]):
                problems.append(bid+": attempt finish does not match active task")
            active.pop(bid,None)
        elif kind=="round_completed":
            tid=event["task_id"]
            if tid in rounds:problems.append(tid+": duplicate round barrier")
            checked={e["builder_id"] for e in events if e["kind"]=="post_deployment_checks_passed" and e["task_id"]==tid and e["monotonic_ns"]<event["monotonic_ns"]}
            if checked!=builders:problems.append(tid+": barrier before every configured builder passed deployment checks")
            rounds[tid]=event
    for position,task in enumerate(tasks):
        dispatched=[e for e in events if e["kind"]=="task_dispatched" and e["task_id"]==task["task_id"]]
        counts=Counter(e["builder_id"] for e in dispatched)
        if any(n!=1 for n in counts.values()) or not set(counts)<=builders:
            problems.append(task["task_id"]+": duplicate or unknown dispatch identity")
        if terminal and set(counts)!=builders:problems.append(task["task_id"]+": incomplete terminal round dispatch")
        if terminal and task["task_id"] not in rounds:problems.append(task["task_id"]+": missing terminal round barrier")
        if position and dispatched:
            previous=rounds.get(tasks[position-1]["task_id"])
            if previous is None or any(e["monotonic_ns"]<=previous["monotonic_ns"] for e in dispatched):
                problems.append(task["task_id"]+": next requirements released before preceding complete round barrier")
    if terminal and active:problems.append("terminal run has unfinished attempts")
    return {"problems":problems,"peak_active_attempts":peak,"open_builder_attempts":active,"completed_round_barriers":sorted(rounds),"terminal_scheduling_verified":terminal and not problems}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--run",default="pilot-008");args=parser.parse_args()
    run=ROOT/"runs/instruction-effects"/args.run
    for _ in range(10):
        data=(run/"events.jsonl").read_bytes();state_data=(run/"state.json").read_bytes()
        if data==(run/"events.jsonl").read_bytes() and state_data==(run/"state.json").read_bytes():break
    else:raise RuntimeError("Evidence is still changing; retry audit without restarting builders")
    manifest=json.loads((run/"manifest.json").read_text());state=json.loads(state_data)
    if manifest['execution'].get('task_stream_revision')=='append-only-rounds-v1':
        from .task_stream import task_stream
        manifest['tasks']=task_stream(run,manifest)
    events=[json.loads(line) for line in data.splitlines() if line]
    report=audit(manifest,events,state["status"]=="completed")
    report.update({"schema_version":1,"state":state["status"],"inputs":{"events_sha256":digest_bytes(data),"state_sha256":digest_bytes(state_data),"manifest_sha256":digest_json(manifest)},"audit_module_sha256":digest_bytes(Path(__file__).read_bytes()),"limitations":["Live audit excludes future events; open attempts remain unresolved.","Attempt intervals include harness and observer drain; peak overlap does not imply peak provider concurrency."]})
    output=run/"reports"/("scheduling-audit-"+digest_json(report)[:16]+".json");write_json(output,report)
    print(json.dumps(report));print(output)
    if report["problems"]:raise SystemExit(1)


if __name__=="__main__":main()
