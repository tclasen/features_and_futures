"""Actual six-combination access/accounting smoke tests, separate from builder tasks."""
import json
from pathlib import Path

from .adapters import execute_attempt, isolation_probe, price_snapshot, sandbox_policy
from .evidence import Ledger, digest_json, read_jsonl
from .gateway import InferenceGateway


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--capability", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    run = root / "runs" / "instruction-effects" / "pilot-001"
    preflight_root = run / "preflight"
    preflight_root.mkdir(parents=True, exist_ok=True)
    ordinal = 1 + len(list(preflight_root.glob("check-*")))
    preflight = preflight_root / f"check-{ordinal:03d}"
    prices = price_snapshot(run / "pricing")
    ledger = Ledger(preflight, {
        "experiment_id": "instruction-effects", "experiment_revision": "v001",
        "project_id": "workboard", "project_revision": "v001", "run_id": "pilot-001",
        "phase": "preflight", "configuration_sha256": digest_json(prices),
    })
    gateway = InferenceGateway(ledger, prices)
    try:
        policy = sandbox_policy("ff-pilot-nodocker", gateway.port)
        (preflight / "network-policy.json").write_text(json.dumps(policy, indent=2) + "\n")
        probe = isolation_probe(
            "ff-pilot-nodocker",
            "/Users/Shared/projects/features-and-futures-builders/pilot-001/preflight/canary.txt",
            "/Users/Shared/projects/competition/AGENTS.md", gateway.port,
        )
        (preflight / "isolation.json").write_text(json.dumps(probe, indent=2) + "\n")
        print("ISOLATION", json.dumps(probe), flush=True)
        for model in ["gpt-6-luna", "gpt-6.1-sol", "gpt-oss:120b"]:
            for harness in ["codex", "pi"]:
                builder = model.replace(":", "-").replace(".", "-") + "-" + harness
                provider = "ollama" if model == "gpt-oss:120b" else "subscription"
                attempt = "smoke-001"
                output = preflight / "tasks" / "smoke" / "attempts" / builder / attempt
                capability = Path("/Users/Shared/projects/features-and-futures-builders/pilot-001/preflight/capability.txt")
                if args.capability and capability.exists():
                    capability.unlink()
                key = gateway.lease(model, builder, "smoke", attempt, provider)
                ledger.event("smoke_started", builder_id=builder, model=model, harness=harness)
                result = execute_attempt(
                    "ff-pilot-nodocker", harness, model, key, gateway.port,
                    ("Create capability.txt in your working directory containing exactly READY followed by a newline. Use your file or shell tools. Do not read or change other files. Then report completion." if args.capability else "Reply with READY. Do not use tools or read or modify any files."),
                    output, timeout=1800, smoke=not args.capability,
                )
                gateway.revoke()
                rows = [row for row in read_jsonl(preflight / "usage.jsonl")
                        if row["builder_id"] == builder]
                complete = result.returncode == 0 and rows and all(
                    row["counts"] is not None and row["status"] == 200 for row in rows)
                file_edit_ok = capability.exists() and capability.read_text() == "READY\n"
                if args.capability:
                    complete = complete and file_edit_ok
                    (output / "capability-result.json").write_text(json.dumps({
                        "file_edit_ok": file_edit_ok,
                        "observed_bytes": capability.read_text() if capability.exists() else None,
                    }, indent=2) + "\n")
                (output / "result.json").write_text(json.dumps({
                    "exit_code": result.returncode, "requests": len(rows),
                    "native_usage_complete": bool(complete),
                }, indent=2) + "\n")
                ledger.event("smoke_finished", builder_id=builder,
                             success=bool(complete), exit_code=result.returncode)
                print(builder, "PASS" if complete else "FAIL",
                      "requests", len(rows), flush=True)
                if not complete:
                    print("Inspect", output.relative_to(root), flush=True)
        print("PREFLIGHT FINISHED", flush=True)
    finally:
        gateway.close()


if __name__ == "__main__":
    main()
