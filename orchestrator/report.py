"""Recompute pilot accounting and readiness directly from immutable observations."""
from .retained_incidents import BOUNDED_REVISIONS
import argparse
import json
import tarfile
import tempfile
from collections import Counter
from decimal import Decimal
from pathlib import Path
from .evidence import digest_bytes,digest_json,price_counts,read_jsonl,native_counts
from .prepare import ROOT,checked,write_json,git
from .configurations import required_checkpoints, checkpoint_coverage

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--run",default="pilot-004");args=parser.parse_args()
    run=ROOT/"runs/instruction-effects"/args.run
    m=json.loads((run/"manifest.json").read_text())
    partial=m.get('experiment_revision') in BOUNDED_REVISIONS
    if partial:
        from .evaluation import validate_research_manifest
        validate_research_manifest(run)
    state=json.loads((run/"state.json").read_text())
    events=read_jsonl(run/"events.jsonl"); usage=read_jsonl(run/"usage.jsonl")
    problems=[]
    if partial:
        from .prepare import file_hashes
        if file_hashes(run/'definitions')!=m['provenance']['definition_hashes']:
            problems.append('Frozen definition hash mismatch')
    if digest_json(m)!=(run/"manifest.sha256").read_text().strip(): problems.append("manifest checksum mismatch")
    if m["execution"].get("task_stream_revision")=="append-only-rounds-v1":
        from .task_stream import task_stream, stream_input_hash
        m["tasks"]=task_stream(run,m)
    counts=Counter(e["kind"] for e in events)
    if len({u["request_id"] for u in usage})!=len(usage): problems.append("duplicate inference requests")
    costs={}
    instructions=json.loads((run/"definitions/instructions.json").read_text())
    delivered=set()
    configurations={b["builder_id"]:b for b in m["runtime"]["builder_configurations"]}
    for u in usage:
        if u["counts"] is None:
            problems.append("missing usage: "+u["request_id"])
            if not partial: continue
        elif native_counts(u["usage"])!=u["counts"]: problems.append("native usage normalization mismatch: "+u["request_id"])
        model=m["pricing"][u["model"]]
        if u['counts'] is not None and price_counts(u["counts"],model["pricing"])!=u["cost"]: problems.append("cost mismatch: "+u["request_id"])
        if u["pricing_snapshot_sha256"]!=model["snapshot_sha256"]:problems.append("price snapshot mismatch")
        raw=run/"tasks"/u["task_id"]/"attempts"/u["builder_id"]/u["attempt_id"]/"requests"
        for suffix,field in (("request.json","request_sha256"),("response.raw","response_sha256")):
            if digest_bytes((raw/(u["request_id"]+"."+suffix)).read_bytes())!=u[field]:
                problems.append("raw inference checksum mismatch: "+u["request_id"])
        if u["model"]=="gpt-oss:120b" and "local_provider" in m["runtime"]:
            nativefile=raw/(u["request_id"]+".native-usage.json")
            observations=json.loads(nativefile.read_text())
            if digest_json(observations)!=u["native_observations_sha256"]:
                problems.append("native observation checksum mismatch: "+u["request_id"])
            completed=[o for o in observations if o["kind"]=="native_generation_completed"]
            if len(completed)!=1 or any(native_counts(completed[0]["usage"])[k]!=u["counts"][k] for k in ("input_tokens","cached_input_tokens","output_tokens")):
                problems.append("native observer consistency failure: "+u["request_id"])
        identity=(u["builder_id"],u["task_id"],u["attempt_id"])
        if identity not in delivered:
            payload=json.loads((raw/(u["request_id"]+".request.json")).read_text())
            def strings(value):
                if isinstance(value,str): return [value]
                if isinstance(value,list): return [t for v in value for t in strings(v)]
                if isinstance(value,dict): return [t for v in value.values() for t in strings(v)]
                return []
            text="\n".join(strings(payload))
            packet=(run/"tasks"/u["task_id"]/"packet.md").read_text()
            profile=instructions["profiles"][configurations[u["builder_id"]]["profile"]]
            if packet not in text:problems.append("common packet missing: "+str(identity))
            if profile and profile not in text:problems.append("assigned profile missing: "+str(identity))
            delivered.add(identity)
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
                end_kind="harness_returned" if m["execution"].get("timing_revision")=="harness-return-v2" else "attempt_finished"
                end=next((e for e in ev if e["kind"]==end_kind and e["attempt_id"]==start["attempt_id"]),None)
                if end and end["clock_id"]==start["clock_id"]:
                    attempts.append({"attempt_id":start["attempt_id"],
                        "wall_nanoseconds":end["monotonic_ns"]-start["monotonic_ns"],
                        "wall_seconds":(end["monotonic_ns"]-start["monotonic_ns"])/1e9})
                else:problems.append("unfinished/cross-clock attempt: "+bid+"/"+task_id)
            requests=[u for u in usage if u["builder_id"]==bid and u["task_id"]==task_id]
            cost=sum((Decimal(u["cost"]["cache_aware_usd"]) for u in requests if u["cost"]),Decimal(0))
            uncached=sum((Decimal(u["cost"]["uncached_reference_usd"]) for u in requests if u["cost"]),Decimal(0))
            if not accept: problems.append("not accepted: "+bid+"/"+task_id)
            row={"builder_id":bid,"task_id":task_id,"accepted":bool(accept),"attempts":attempts,
                "builder_execution_nanoseconds":sum(a["wall_nanoseconds"] for a in attempts),
                "builder_execution_seconds":sum(a["wall_nanoseconds"] for a in attempts)/1e9,
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
                prior=next((r["accepted_commit"] for r in reversed(rows) if r["accepted"]),m["provenance"]["starter_commit"])
                changes=git(ROOT,"diff","--no-ext-diff","--no-textconv","--numstat","--no-renames",prior,accept["commit"]).splitlines()
                parsed=[line.split("\t",2) for line in changes if line]
                row["change_statistics"]={"files_changed":len(parsed),
                    "lines_added":sum(int(a) for a,d,name in parsed if a!="-"),
                    "lines_removed":sum(int(d) for a,d,name in parsed if d!="-"),
                    "binary_files_changed":sum(a=="-" for a,d,name in parsed),
                    "scope":"All committed file changes against prior accepted checkpoint; context, not quality."}
                output=run/"tasks"/task_id/"attempts"/bid/accept["attempt_id"]
                result=json.loads((output/"result.json").read_text())
                phases={p["phase"]:p for p in result["acceptance_statistics"]}
                from .workload import phase_expectations
                expected=phase_expectations(t)
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
                        and not any(part in {"test","tests","__tests__"} for part in Path(f.name).parts))
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
        recovered=[]
        for incident in incidents:
            recovery=next((e for e in ev if e["kind"]=="incident_recovered" and e.get("incident_id")==incident["event_id"]),None)
            if recovery:
                if recovery["clock_id"]!=incident["clock_id"] or recovery["monotonic_ns"]<incident["monotonic_ns"]:
                    problems.append("invalid recovery timing: "+incident["event_id"])
                else: recovered.append({"incident_id":incident["event_id"],"seconds":(recovery["monotonic_ns"]-incident["monotonic_ns"])/1e9})
        failed_promotions={(i.get("task_id"),i.get("attempt_id")) for i in incidents}
        builder_rows.append({**b,"tasks_accepted":sum(r["accepted"] for r in rows),
            "execution_nanoseconds":sum(r["builder_execution_nanoseconds"] for r in rows),
            "execution_seconds":active,"cache_aware_usd":str(sum((Decimal(r["cache_aware_usd"]) for r in rows),Decimal(0))),
            "uncached_reference_usd":str(sum((Decimal(r["uncached_reference_usd"]) for r in rows),Decimal(0))),
            "first_submission_acceptance":sum(r["first_submission_accepted"] for r in rows)/len(m["tasks"]),
            "dora":{"surrogate":("persistent sbx deployment; health and sentinel behavior; "+str(m["evidence_policy"]["post_deployment_window_seconds"])+"-second window" if m["evidence_policy"].get("stability_revision")=="behavior-and-restart-v2" else "persistent sbx deployment; five-second post-promotion health observation"),
                    "promotions":len(promotions),"incidents":len(incidents),"change_lead_times":lead,
                    "nominal_common_window_seconds":duration,
                    "promotions_per_nominal_day":len(promotions)/duration*86400 if duration else None,
                    "promotions_per_builder_active_hour":len(promotions)/active*3600 if active else None,
                    "change_failure_rate":len(failed_promotions)/len(promotions) if promotions else None,
                    "failed_deployment_recovery_seconds":recovered or None,
                    **({"unrecovered_incidents":len(incidents)-len(recovered)} if incidents else {}),
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
        with tempfile.TemporaryDirectory(prefix="ff-history-verify-") as directory:
            checked(["git","init","--bare",directory])
            checked(["git","-C",directory,"fetch",str(indexfile.parent/"history.bundle"),"+refs/*:refs/*"])
            restored=git(Path(directory),"rev-parse",index["source_commit"]+"^{tree}")
            if restored!=index["source_tree"]:problems.append("restored tree mismatch: "+str(indexfile))
        archive_count+=1
    problems.extend(checkpoint_coverage(m,events))
    expected_checkpoints=len(required_checkpoints(m))
    complete=(state["status"]=="completed" and not problems)
    extra={}
    if partial:
        from .partial_report import augment,artifact_hashes
        extra=augment(run,m,events,usage,tasks,builder_rows,problems,state)
        extra['checked_artifact_sha256']=artifact_hashes(run,usage)
        extra['bound_control_code_sha256']={name:digest_bytes(Path(__file__).with_name(name+'.py').read_bytes())
            for name in ('partial_report','retained_incidents','evidence_bounds','bounded_confirmation')}
    report={"schema_version":1,"readiness_passed":complete,"state":state["status"],
        **extra,
        "expected_checkpoints":expected_checkpoints,"manifest_sha256":digest_json(json.loads((run/"manifest.json").read_text())),
        **({"task_stream_input_sha256":stream_input_hash(run)} if m["execution"].get("task_stream_revision")=="append-only-rounds-v1" else {}),"analysis_code_sha256":digest_bytes(Path(__file__).read_bytes()),
        "inputs":{"events_sha256":digest_bytes((run/"events.jsonl").read_bytes()),
                  **({'state_sha256':digest_bytes((run/'state.json').read_bytes())} if partial else {}),
                  "usage_sha256":digest_bytes((run/"usage.jsonl").read_bytes())},
        "event_counts":dict(counts),"requests":len(usage),
        "native_count_coverage":sum(u["counts"] is not None for u in usage)/len(usage) if usage else None,
        "archive_checkpoints":archive_count,"problems":problems,"builders":builder_rows,"tasks":tasks,
        "limitations":["The frozen submission contract requires a clean tracked/untracked working tree; runtime artifacts must satisfy that contract.",
            f"One trajectory and {len(m['tasks'])} tasks per configuration do not establish instruction effects.",
            "Subscription models, host contention and native caches are not experimentally controlled.",
            "Native provider counters are observed; hidden/provider-added tokens cannot be independently reconstructed.",
            "PM conversation usage and invoice cost are unavailable; costs are frozen OpenRouter reference estimates.",
            f"The {m['evidence_policy']['post_deployment_window_seconds']}-second surrogate observation supplies bounded stability evidence; no recovery sample without incidents.",
            ("Native-return timing separates observer/gateway drain from builder execution." if m["execution"].get("timing_revision")=="harness-return-v2" else "Attempt wall time includes a small PM observer/gateway drain overhead after harness return."),
            ("The selected frozen bound-aware research plan requires independent repeated trajectories and two confirmation batches; this report is not evidence of an instruction effect." if partial else "The separate research-v001 plan requires independent repeated trajectories and two confirmation batches; this report is not evidence of an instruction effect.")]}
    if partial:
        report['limitations'].append('Unknown native expenditure has no point estimate; verified known sums are lower bounds. Analysis readiness does not establish complete token accounting.')
        report['limitations'].append('The primary v002 rejection outcome is the first observed PM assessment; first scheduled attempt acceptance remains separately labelled.')
    version=run/"reports"/("report-"+digest_json(report)[:16]+".json")
    write_json(version,report)
    write_json(run/"reports/latest.json",{"report":version.name,"sha256":digest_bytes(version.read_bytes())})
    print(json.dumps({"readiness_passed":complete,"accepted":counts["task_accepted"],"requests":len(usage),
                      **({k:extra[k] for k in ('analysis_ready','native_accounting_complete','analysis_problems')} if partial else {}),
                      "archive_checkpoints":archive_count,"problems":problems},indent=2))
    if not complete and not extra.get('analysis_ready',False): raise SystemExit(1)

if __name__=="__main__":
    main()
