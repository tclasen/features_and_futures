#!/usr/bin/env python3
"""Independently verify one closed PM prospective focused fixture."""
import argparse
import ast
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def specs(suites):
    for suite in suites:
        yield from suite.get("specs", [])
        yield from specs(suite.get("suites", []))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", required=True, type=Path)
    parser.add_argument("--stage", required=True, type=int)
    args = parser.parse_args()
    batch = args.batch.resolve()
    assert batch.parent.name == "preflight" and batch.name.startswith("future031039-focused-batch-")
    inputs_path = batch / "inputs.json"
    inputs = json.loads(inputs_path.read_text())
    assert inputs["model_calls"] == 0
    assert sha(batch / "executed-controller.py") == inputs["runner_sha256"]
    record = next(x for x in json.loads((batch / "progress.json").read_text()) if x["stage"] == args.stage)
    assert record["exit_code"] == 0
    out = Path(record["evidence"]).resolve()
    assert out.parent == batch.parent and out.name.startswith(f"future{args.stage:03d}-focused-check-")
    destination = out / "independently-verified.json"
    if destination.exists():
        raise SystemExit("Refusing to overwrite existing independent evidence")
    item = next(x for x in inputs["manifest"]["controllers"] if x["stage"] == args.stage)
    controller = Path(item["controller"])
    assert sha(controller) == item["sha256"] == sha(out / "executed-controller.mjs")
    assert sha(Path(item["original"]["path"])) == item["original"]["sha256"]
    suite = batch.parent / "task040-full-prototype002-suite"
    assert {str(p.relative_to(suite)): sha(p) for p in sorted(suite.rglob("*")) if p.is_file()} == inputs["manifest"]["suite_files"]
    closure_path = out / "input-closure.json"
    closure = json.loads(closure_path.read_text())
    assert sha(closure_path) == record["input_closure_sha256"]
    assert closure["exit_code"] == 0 and closure["model_calls"] == 0
    assert closure["controller_sha256"] == item["sha256"]
    assert closure["batch_inputs_sha256"] == sha(inputs_path)
    assert all(sha(out / name) == digest for name, digest in closure["files"].items())
    assert {str(p.relative_to(out)) for p in out.rglob("*") if p.is_file()} == set(closure["files"]) | {"input-closure.json"}
    text = controller.read_text()
    pairs = ast.literal_eval(re.search(r"for\(const \[fault,id\] of (\[.*?\])\)\{", text).group(1))
    negatives = {f"negative-{fault}-{case}": case for fault, case in pairs}
    assert len(negatives) == len(pairs)
    positive_count = int(re.search(r"assert.equal\(r.statistics.expected,(\d+)\)", text).group(1))
    proof_path = out / "verified.json"
    assert sha(proof_path) == record["verified_sha256"]
    proof = json.loads(proof_path.read_text())
    assert proof["verified"] and proof["model_calls"] == 0
    assert len(proof["results"]) == 3 + len(negatives)
    checks, positive_titles = [], None
    positive_names, negative_names = set(), set()
    for result in proof["results"]:
        path = out / result["name"] / "results.json"
        report = json.loads(path.read_text())
        statistics = report["stats"]
        listed = list(specs(report["suites"]))
        assert statistics == result["statistics"] and statistics["skipped"] == statistics["flaky"] == 0
        if result["name"].startswith("positive-"):
            positive_names.add(result["name"])
            assert result["exit"] == 0 and statistics["expected"] == positive_count
            assert statistics["unexpected"] == 0 and len(listed) == positive_count
            titles = sorted(x["title"] for x in listed)
            positive_titles = positive_titles or titles
            assert positive_titles == titles
        else:
            negative_names.add(result["name"])
            assert result["name"] in negatives and result["exit"] != 0
            assert statistics["unexpected"] == 1 and statistics["expected"] == 0 and len(listed) == 1
            assert listed[0]["title"].startswith(negatives[result["name"]] + " ")
            assert any(r.get("errors") for test in listed[0]["tests"] for r in test["results"])
        checks.append({"name": result["name"], "result_sha256": sha(path)})
    assert positive_names == {"positive-form", "positive-async", "positive-fetch"}
    assert negative_names == set(negatives)
    assert set(negatives.values()) <= {re.match(r"^(\d+) ", title).group(1) for title in positive_titles}
    destination.write_text(json.dumps({
        "verified": True, "utc": datetime.now(timezone.utc).isoformat(), "model_calls": 0,
        "stage": args.stage, "positive_variants": 3, "cases_per_positive": positive_count,
        "genuine_fault_controls": len(negatives), "controller_sha256": item["sha256"],
        "batch_inputs_sha256": sha(inputs_path), "input_closure_sha256": sha(closure_path),
        "verifier_sha256": sha(Path(__file__)), "checks": checks, "positive_titles": positive_titles,
        "scope": "Closed focused stage only; remaining focused, broader and actual native lifecycle gates remain separate."
    }, indent=2) + "\n")
    print(json.dumps({"verified": True, "stage": args.stage, "evidence": str(destination)}))


if __name__ == "__main__":
    main()
