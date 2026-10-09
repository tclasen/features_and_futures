"""Recompute pilot accounting and readiness directly from immutable observations."""
import json
import tarfile
from collections import Counter
from decimal import Decimal
from pathlib import Path
from .evidence import digest_bytes,digest_json,price_counts,read_jsonl
from .prepare import ROOT,checked,write_json,git

def main():
    run=ROOT/"runs/instruction-effects/pilot-001"
    m=json.loads((run/"manifest.json").read_text())
    state=json.loads((run/"state.json").read_text())
    events=read_jsonl(run/"events.jsonl"); usage=read_jsonl(run/"usage.jsonl")
    problems=[]
    if digest_json(m)!=(run/"manifest.sha256").read_text().strip(): problems.append("manifest checksum mismatch")
    counts=Counter(e["kind"] for e in events)
    if len({u["request_id"] for u in usage})!=len(usage): problems.append("duplicate inference requests")
    costs={}
    for u in usage:
        if u["counts"] is None:
            problems.append("missing usage: "+u["request_id"]);continue
        model=m["pricing"][u["model"]]
        if price_counts(u["counts"],model["pricing"])!=u["cost"]: problems.append("cost mismatch: "+u["request_id"])
        if u["pricing_snapshot_sha256"]!=model["snapshot_sha256"]:problems.append("price snapshot mismatch")
        raw=run/"tasks"/u["task_id"]/"attempts"/u["builder_id"]/u["attempt_id"]/"requests"
        for suffix,field in (("request.json","request_sha256"),("response.raw","response_sha256")):
            if digest_bytes((raw/(u["request_id"]+"."+suffix)).read_bytes())!=u[field]:
                problems.append("raw inference checksum mismatch: "+u["request_id"])
    tasks=[];builder_rows=[]
    for b in m["runtime"]["builder_configurations"]:
        bid=b["builder_id"];rows=[]
        for t in m["tasks"]:
            task_id=t["task_id"]
            ev=[e for e in events if e.get("builder_id")==bid and e.get("task_id")==task_id]
            dispatch=next((e for e in ev if e["kind"]=="task_dispatched"),None)
            accept=next((e for e in ev if e["kind"]=="task_accepted"),None)
            promotion=next((e for e in ev if e["kind"]=="deployment_promoted"),None)
            attempts=[]
            for start in [e for e in ev if e["kind"]=="attempt_started"]:
                end=next((e for e in ev if e["kind"]=="attempt_finished" and e["attempt_id"]==start["attempt_id"]),None)
                if end and end["clock_id"]==start["clock_id"]:
                    attempts.append({"attempt_id":start["attempt_id"],
                        "wall_seconds":(end["monotonic_ns"]-start["monotonic_ns"])/1e9})
                else:problems.append("unfinished/cross-clock attempt: "+bid+"/"+task_id)
            requests=[u for u in usage if u["builder_id"]==bid and u["task_id"]==task_id]
            cost=sum((Decimal(u["cost"]["cache_aware_usd"]) for u in requests if u["cost"]),Decimal(0))
            uncached=sum((Decimal(u["cost"]["uncached_reference_usd"]) for u in requests if u["cost"]),Decimal(0))
            if not accept: problems.append("not accepted: "+bid+"/"+task_id)
            row={"builder_id":bid,"task_id":task_id,"accepted":bool(accept),"attempts":attempts,
                "builder_execution_seconds":sum(a["wall_seconds"] for a in attempts),
                "time_to_acceptance_seconds":(accept["monotonic_ns"]-dispatch["monotonic_ns"])/1e9 if accept and dispatch else None,
                "time_to_deployment_seconds":(promotion["monotonic_ns"]-dispatch["monotonic_ns"])/1e9 if promotion and dispatch else None,
                "first_submission_accepted":bool(accept and accept["attempt_id"]=="attempt-001"),
                "rejected_attempts":sum(e["kind"]=="attempt_rejected" for e in ev),
                "request_count":len(requests),"cache_aware_usd":str(cost),"uncached_reference_usd":str(uncached),
                "token_totals":{k:sum(u["counts"][k] for u in requests if u["counts"]) for k in
                    ("input_tokens","cached_input_tokens","uncached_input_tokens","output_tokens")},
                "validation_seconds":sum((finish["monotonic_ns"]-start["monotonic_ns"])/1e9
                    for start in ev if start["kind"]=="validation_started"
                    for finish in ev if finish["kind"]=="validation_finished" and finish["attempt_id"]==start["attempt_id"]),
                "accepted_commit":accept["commit"] if accept else None,
                "accepted_tree":accept["tree"] if accept else None}
            if accept:
                output=run/"tasks"/task_id/"attempts"/bid/accept["attempt_id"]
                result=json.loads((output/"result.json").read_text())
                phases={p["phase"]:p for p in result["acceptance_statistics"]}
                expected={"acceptance":4 if t["stage"]==1 else 8 if t["stage"]==2 else 11,"postrestart":1}
                if t["stage"]>1: expected["upgrade"]=1
                for phase,n in expected.items():
                    if phase not in phases or phases[phase].get("expected")!=n or phases[phase].get("unexpected",0)>0:
                        problems.append("incomplete suite: "+bid+"/"+task_id+"/"+phase)
                row["acceptance_phases"]=phases
                with tarfile.open(output/"submission.tar") as archive:
                    entries=[f for f in archive.getmembers() if f.isfile()]
                    row["committed_files"]=len(entries)
                    row["production_source_lines"]=sum(
                        len(archive.extractfile(f).read().splitlines()) for f in entries
                        if Path(f.name).suffix in {".js",".mjs",".html",".css"}
                        and not any(part in {"test","tests","__tests__"} for part in Path(f.name).parts)
            rows.append(row);tasks.append(row)
        ev=[e for e in events if e.get("builder_id")==bid]
        promotions=[e for e in ev if e["kind"]=="deployment_promoted"]
        incidents=[e for e in ev if e["kind"]=="incident_detected"]
        lead=[]
        for p in promotions:
            for commit in p["included_commits"]:
                seen=next((e for e in ev if e["kind"]=="commit_first_observed" and e["commit"]==commit),None)
                lead.append({"commit":commit,"seconds":(p["monotonic_ns"]-seen["monotonic_ns"])/1e9 if seen else None,
                             "observation_uncertainty_seconds":1})
        all_dispatch=[e for e in events if e["kind"]=="task_dispatched"]
        post_checks=[e for e in events if e["kind"]=="post_deployment_checks_passed"]
        duration=(max(e["monotonic_ns"] for e in post_checks)-min(e["monotonic_ns"] for e in all_dispatch))/1e9 if all_dispatch and post_checks else None
        active=sum(r["builder_execution_seconds"] for r in rows)
        builder_rows.append({**b,"tasks_accepted":sum(r["accepted"] for r in rows),
            "execution_seconds":active,"cache_aware_usd":str(sum((Decimal(r["cache_aware_usd"]) for r in rows),Decimal(0))),
            "uncached_reference_usd":str(sum((Decimal(r["uncached_reference_usd"]) for r in rows),Decimal(0))),
            "first_submission_acceptance":sum(r["first_submission_accepted"] for r in rows)/3,
            "dora":{"surrogate":"persistent sbx deployment; five-second post-promotion health observation",
                    "promotions":len(promotions),"incidents":len(incidents),"change_lead_times":lead,
                    "nominal_common_window_seconds":duration,
                    "promotions_per_nominal_day":len(promotions)/duration*86400 if duration else None,
                    "promotions_per_builder_active_hour":len(promotions)/active*3600 if active else None,
                    "change_failure_rate":len(incidents)/len(promotions) if promotions else None,
                    "failed_deployment_recovery_seconds":None,
                    "deployment_rework_rate":sum(e["kind"]=="incident_repair_promoted" for e in ev)/len(promotions) if promotions else None}})
    archive_count=0
    for indexfile in sorted((run/"builders").glob("*/checkpoints/*/index.json")):
        index=json.loads(indexfile.read_text())
        for name,sha in index["checksums"].items():
            if digest_bytes((indexfile.parent/name).read_bytes())!=sha: problems.append("archive checksum: "+str(indexfile))
        checked(["git","-C",str(ROOT),"bundle","verify",str(indexfile.parent/"history.bundle")])
        for ref in index["github_refs"]:
            if git(ROOT,"rev-parse",ref)!=index["source_commit"] and ref.endswith("/head"):
                problems.append("checkpoint ref mismatch: "+ref)
        archive_count+=1
    complete=(state["status"]=="completed" and not problems and counts["task_accepted"]==54
              and counts["post_deployment_checks_passed"]==54 and counts["deployment_promoted"]==54)
    report={"schema_version":1,"readiness_passed":complete,"state":state["status"],
        "manifest_sha256":digest_json(m),"analysis_code_sha256":digest_bytes(Path(__file__).read_bytes()),
        "inputs":{"events_sha256":digest_bytes((run/"events.jsonl").read_bytes()),
                  "usage_sha256":digest_bytes((run/"usage.jsonl").read_bytes())},
        "event_counts":dict(counts),"requests":len(usage),
        "native_count_coverage":sum(u["counts"] is not None for u in usage)/len(usage) if usage else None,
        "archive_checkpoints":archive_count,"problems":problems,"builders":builder_rows,"tasks":tasks,
        "limitations":["One trajectory and three tasks per configuration do not establish instruction effects.",
            "Subscription models, host contention and native caches are not experimentally controlled.",
            "Native provider counters are observed; hidden/provider-added tokens cannot be independently reconstructed.",
            "PM conversation usage and invoice cost are unavailable; costs are frozen OpenRouter reference estimates.",
            "Five-second health checks supply narrow stability evidence; no recovery sample when no incidents.",
            "Main-run sequential statistical stopping and independent replication still require preregistration."]}
    version=run/"reports"/("report-"+digest_json(report)[:16]+".json")
    write_json(version,report)
    write_json(run/"reports/latest.json",{"report":version.name,"sha256":digest_bytes(version.read_bytes())})
    print(json.dumps({"readiness_passed":complete,"accepted":counts["task_accepted"],"requests":len(usage),
                      "archive_checkpoints":archive_count,"problems":problems},indent=2))
    if not complete: raise SystemExit(1)

if __name__=="__main__":
    main()
