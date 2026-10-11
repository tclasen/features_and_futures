#!/usr/bin/env python3
"""PM-only prospective controls; never include in builder packets."""
import hashlib
import json
import subprocess
import time
from pathlib import Path

ROOT = Path("experiments/instruction-effects/revisions/research-v014/preflight")
PREP = ROOT / "future031039-focused-preparation"
SUITE = ROOT / "task040-full-prototype002-suite"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")

manifest = json.loads((PREP / "prepared.json").read_text())
assert json.loads((PREP / "syntax.json").read_text())["syntax_passed"]
assert json.loads((PREP / "case-bindings.json").read_text())["verified"]
assert {str(p.relative_to(SUITE)): sha(p) for p in sorted(SUITE.rglob("*")) if p.is_file()} == manifest["suite_files"]
for item in manifest["controllers"]:
    assert sha(Path(item["controller"])) == item["sha256"]

out = ROOT / ("future031039-focused-batch-" + str(time.time_ns()))
out.mkdir()
(out / "executed-controller.py").write_bytes(Path(__file__).read_bytes())
write(out / "inputs.json", {"model_calls": 0, "manifest_sha256": sha(PREP / "prepared.json"), "syntax_sha256": sha(PREP / "syntax.json"), "bindings_sha256": sha(PREP / "case-bindings.json"), "runner_sha256": sha(Path(__file__)), "manifest": manifest})
results = []
for item in manifest["controllers"]:
    stage = item["stage"]
    prefix = "future" + str(stage).zfill(3) + "-focused-check-"
    before = set(ROOT.glob(prefix + "*"))
    with (out / (str(stage) + "-stdout.log")).open("wb") as stdout, (out / (str(stage) + "-stderr.log")).open("wb") as stderr:
        proc = subprocess.run(["node", item["controller"]], stdout=stdout, stderr=stderr)
    created = set(ROOT.glob(prefix + "*")) - before
    assert len(created) == 1, sorted(str(p) for p in created)
    result_dir = created.pop()
    result = {"stage": stage, "exit_code": proc.returncode, "evidence": str(result_dir), "controller_sha256": item["sha256"]}
    assert sha(result_dir / "executed-controller.mjs") == item["sha256"]
    if proc.returncode == 0:
        proof = json.loads((result_dir / "verified.json").read_text())
        assert proof["verified"] and proof["model_calls"] == 0
        result["verified_sha256"] = sha(result_dir / "verified.json")
    closure = {"controller_sha256": item["sha256"], "batch_inputs_sha256": sha(out / "inputs.json"), "files": {str(p.relative_to(result_dir)): sha(p) for p in sorted(result_dir.rglob("*")) if p.is_file()}, "model_calls": 0, "exit_code": proc.returncode, "scope": "Focused prospective controls only; no full reload/restore or actual native lifecycle claim."}
    write(result_dir / "input-closure.json", closure)
    result["input_closure_sha256"] = sha(result_dir / "input-closure.json")
    results.append(result)
    write(out / "progress.json", results)
    if proc.returncode != 0:
        write(out / "failure.json", {"retained": True, "results": results, "model_calls": 0})
        raise SystemExit(proc.returncode)
write(out / "verified.json", {"verified": True, "results": results, "model_calls": 0, "scope": "Nine focused prospective fixtures only; broader and actual native lifecycle readiness remain separate gates."})
print(json.dumps({"verified": True, "stages": len(results), "evidence": str(out), "model_calls": 0}))
