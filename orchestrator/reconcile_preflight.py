"""Recover terminal native usage through append-only corrections, never rewrites."""
import json
import uuid
from pathlib import Path
from .adapters import price_snapshot
from .evidence import append_json,digest_bytes,digest_json,native_counts,price_counts,read_jsonl,timestamp
from .prepare import ROOT,write_json

def main():
    summaries=[]
    for run in sorted((ROOT/"runs/instruction-effects").glob("pilot-*")):
        if not (run/"manifest.json").exists():continue
        prices=json.loads((run/"manifest.json").read_text())["pricing"]
        observations=[]
        for usage_path in sorted(run.rglob("usage.jsonl")):
            correction_path=usage_path.with_name("usage-corrections.jsonl")
            corrected={c["supersedes_request_id"]:c for c in read_jsonl(correction_path)}
            for row in read_jsonl(usage_path):
                request_id=row["request_id"];counts=row["counts"];cost=row["cost"]
                if request_id in corrected:
                    counts=corrected[request_id]["counts"];cost=corrected[request_id]["cost"]
                if counts is None and row["status"]==200 and request_id not in corrected:
                    candidates=list(usage_path.parent.rglob(request_id+".response.raw"))
                    if len(candidates)==1:
                        raw=candidates[0].read_bytes()
                        if digest_bytes(raw)!=row["response_sha256"]:raise RuntimeError("Raw evidence hash mismatch")
                        terminal=None
                        for line in raw.splitlines():
                            if not line.startswith(b"data:"):continue
                            try:item=json.loads(line[5:])
                            except ValueError:continue
                            response=item.get("response") or item
                            if response.get("usage"):terminal=response["usage"]
                        counts=native_counts(terminal)
                        if counts is not None:
                            cost=price_counts(counts,prices[row["model"]]["pricing"])
                            correction={"schema_version":1,"correction_id":str(uuid.uuid4()),
                                "utc":timestamp(),"supersedes_request_id":request_id,
                                "original_observation_sha256":digest_json(row),
                                "reason":"Parser repair: recover complete native terminal usage from unchanged raw SSE",
                                "native_usage":terminal,"counts":counts,"cost":cost,
                                "response_sha256":row["response_sha256"],
                                "pricing_snapshot_sha256":prices[row["model"]]["snapshot_sha256"],
                                "builder_id":row["builder_id"],"task_id":row["task_id"],"attempt_id":row["attempt_id"]}
                            append_json(correction_path,correction)
                observations.append({"path":str(usage_path.relative_to(run)),"request_id":request_id,
                                     "model":row["model"],"counts":counts,"cost":cost,"status":row["status"]})
        from decimal import Decimal
        report={"run_id":run.name,"observed_forwarded_requests":len(observations),
            "complete_native_usage":sum(r["counts"] is not None for r in observations),
            "missing_native_usage":[r for r in observations if r["counts"] is None],
            "known_cache_aware_usd":str(sum((Decimal(r["cost"]["cache_aware_usd"]) for r in observations if r["cost"]),Decimal(0))),
            "known_uncached_reference_usd":str(sum((Decimal(r["cost"]["uncached_reference_usd"]) for r in observations if r["cost"]),Decimal(0))),
            "limitations":["Known totals exclude unavailable usage; missing is not zero.",
                "These are OpenRouter reference estimates, not subscription invoices.",
                "The stop-start failure in pilot-002 had harness output without an observed request; its cost is unavailable." if run.name=="pilot-002" else
                "PM conversation usage is unavailable."]}
        output=run/"reports"/("exposure-"+digest_json(report)[:16]+".json")
        write_json(output,report)
        summaries.append({k:report[k] for k in ("run_id","observed_forwarded_requests","complete_native_usage","known_cache_aware_usd")})
    print(json.dumps(summaries,indent=2))

if __name__=="__main__":main()
