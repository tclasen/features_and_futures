"""Deterministic matrix selection and manifest-scoped completion requirements."""
import itertools
import random

MODEL_SETS = {
    "full": ("gpt-oss:120b", "gpt-6-luna", "gpt-6.1-sol"),
    "hosted": ("gpt-6-luna", "gpt-6.1-sol"),
}

def builder_configurations(model_set, seed=43):
    configs = list(itertools.product(MODEL_SETS[model_set], ("codex", "pi"),
                                    ("none", "minimal", "maximum")))
    random.Random(seed).shuffle(configs)
    return [{"builder_id": f"b{i+1:03d}", "model": model, "harness": harness,
             "profile": profile, "reasoning": "medium"}
            for i, (model, harness, profile) in enumerate(configs)]

def required_checkpoints(manifest):
    return {(b["builder_id"], t["task_id"])
            for b in manifest["runtime"]["builder_configurations"] for t in manifest["tasks"]}

def checkpoint_coverage(manifest, events):
    required = required_checkpoints(manifest)
    failures = []
    for kind in ("task_accepted", "deployment_promoted", "post_deployment_checks_passed"):
        records = [(e.get("builder_id"), e.get("task_id")) for e in events if e["kind"] == kind]
        if len(records) != len(set(records)):
            failures.append(kind + ": duplicate checkpoint")
        if set(records) != required:
            failures.append(kind + ": missing or unexpected checkpoint")
    return failures
