"""Freeze the actual pilot inputs before dispatch."""
import argparse
import itertools
import json
import platform
import random
import shutil
import subprocess
from pathlib import Path
from .adapters import invoke, price_snapshot
from .evidence import digest_bytes, digest_json, timestamp

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "docker.io/library/features-and-futures-builder:pilot-v001"
IMAGE_DIGEST = "sha256:04ff7064a2620ad9a41a9941fe80527c69dd450a16f277d6fdd721e9b28585d0"

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")

def checked(command, **kwargs):
    result = invoke(command, **kwargs)
    if result.returncode:
        raise RuntimeError(f"{command[:3]} failed: {result.stderr[-4000:]}")
    return result.stdout.strip()

def git(repo, *args):
    return checked(["git", "-C", str(repo), *args])

def file_hashes(path):
    return {str(f.relative_to(path)): digest_bytes(f.read_bytes())
            for f in sorted(path.rglob("*")) if f.is_file()}

def prepare():
    parser=argparse.ArgumentParser();parser.add_argument("--run",default="pilot-002");args=parser.parse_args()
    if not __import__("re").fullmatch(r"pilot-[0-9]{3}",args.run): raise ValueError("Invalid pilot run ID")
    run = ROOT / "runs/instruction-effects" / args.run
    if (run / "manifest.json").exists():
        raise RuntimeError("Manifest already frozen; resume the existing run.")
    project = ROOT / "projects/workboard/revisions/v001"
    frozen = run / "definitions"
    shutil.copytree(project, frozen / "project", ignore=shutil.ignore_patterns(".local"))
    profiles_text = (ROOT / "docs/builder-instructions.md").read_text()
    def quotes(section):
        text = profiles_text.split("## " + section + "\n", 1)[1].split("\n## ", 1)[0]
        return "\n\n".join(line[2:] for line in text.splitlines() if line.startswith("> ")).strip()
    profiles = {"none": "", "minimal": quotes("Minimal SWE guidance"),
                "maximum": quotes("Maximum SWE guidance")}
    contract = quotes("Shared operational contract")
    write_json(frozen / "instructions.json", {"contract": contract, "profiles": profiles})
    configs = list(itertools.product(
        ["gpt-oss:120b", "gpt-6-luna", "gpt-6.1-sol"], ["codex", "pi"],
        ["none", "minimal", "maximum"]))
    random.Random(43).shuffle(configs)
    builders = [{"builder_id": f"b{i+1:03d}", "model": m, "harness": h, "profile": p,
                 "reasoning": "medium"} for i, (m,h,p) in enumerate(configs)]
    sibling = Path("/Users/Shared/projects/features-and-futures-builders") / args.run
    seed = sibling / "starter"
    seed.mkdir(parents=True)
    shutil.copytree(frozen / "project/starter", seed, dirs_exist_ok=True)
    git(seed, "init", "-b", "main")
    git(seed, "config", "user.name", "Experiment Builder")
    git(seed, "config", "user.email", "builder@experiment.invalid")
    git(seed, "add", ".")
    git(seed, "commit", "-m", "Identical pilot starter")
    starter_commit = git(seed, "rev-parse", "HEAD")
    for b in builders:
        repo = sibling / b["builder_id"]
        checked(["git", "clone", "--no-local", str(seed), str(repo)])
        git(repo, "remote", "remove", "origin")
        git(repo, "config", "user.name", "Experiment Builder")
        git(repo, "config", "user.email", "builder@experiment.invalid")
    prices = price_snapshot(run / "pricing")
    write_json(frozen / "pricing-mappings.json", prices)
    tasks = []
    for stage in range(1,4):
        task_id = f"task-{stage:03d}"
        packet = contract + "\n\n" + (frozen / "project/SPEC.md").read_text()
        packet += "\n\nCumulative requirements through this task:\n"
        for prior in range(1, stage+1):
            packet += "\n" + (frozen / f"project/requirements/task-{prior:03d}.md").read_text()
        path = run / "tasks" / task_id
        path.mkdir(parents=True, exist_ok=True)
        (path / "packet.md").write_text(packet)
        tasks.append({"task_id":task_id,"stage":stage,"packet_sha256":digest_bytes(packet.encode()),
                      "suite_hash":digest_json(file_hashes(frozen / "project/acceptance"))})
    ollama = json.loads(checked(["curl", "-fsS", "http://127.0.0.1:11434/api/tags"]))
    selected = next(m for m in ollama["models"] if m["name"] == "gpt-oss:120b" and m.get("details",{}).get("format") == "gguf")
    # Keep all resolver candidates too; serving aliases can share a public name.
    write_json(frozen / "ollama-tags.json", ollama)
    manifest = {
        "schema_version":1, "status":"running", "experiment_id":"instruction-effects",
        "experiment_revision":"pilot-v002", "run_id":args.run, "purpose":"engineering-pilot",
        "project_id":"workboard","project_revision":"v001", "frozen_at":timestamp(),
        "runtime":{"builder_configurations":builders,"harness_versions":{"codex":"0.162.0","pi":"1.1.0"},
                   "image":IMAGE,"image_digest":IMAGE_DIGEST, "sbx_version":"0.47.0",
                   "node":"22.22.1","playwright":"1.64.0","chromium":"156.0.8078.4",
                   "resource_limits":{"cpus":4,"memory":"4g","deployment_memory":"512m"},
                   "host":{"platform":platform.platform(), "machine":platform.machine(),
                           "memory_bytes":int(checked(["sysctl","-n","hw.memsize"])),
                           "cpu":checked(["sysctl","-n","machdep.cpu.brand_string"])},
                   "context_policy":"fresh home/session for every instruction; private sandbox repository persists",
                   "egress":"deny by default; only the PM leased inference gateway allowed",
                   "model_mappings":{"gpt-oss:120b":selected,
                       "gpt-6-luna":{"provider":"OpenAI subscription", "reasoning":"medium"},
                       "gpt-6.1-sol":{"provider":"OpenAI subscription", "reasoning":"medium"}},
                   "warmup":"six smoke and six file-edit checks completed before task dispatch",
                   "cache":"native provider caching; no shared source/context cache; report both price references"},
        "provenance":{"pm_commit":git(ROOT,"rev-parse","HEAD"),"starter_commit":starter_commit,
                      "starter_tree":git(seed,"rev-parse","HEAD^{tree}"),
                      "image_archive_sha256":"90450bd7619f4b0f1f2f246f7b6ae22d247490e2227602c6a690a3c657b8ea47",
                      "image_config_sha256":"0ce50460d98e8b9215f523c38ad4123aaf6cbfd44a81a61bb13141d0c9219275",
                      "definition_hashes":file_hashes(frozen)},
        "tasks":tasks,"pricing":prices,
        "execution":{"scheduling_seed":43,"order":"sequential; rotate by six builder positions per round",
                     "retry_limit":None,"unchanged_failure_notify_after":10},
        "evidence_policy":{"purpose":"infrastructure readiness; no claim of instruction effect",
                           "stop":"all 18 builders accepted all three tasks with complete native usage",
                           "post_deployment_window_seconds":5,
                           "main_run":"not started by this pilot command",
                           "pm_conversation_tokens":"unavailable; not included in builder cost"},
        "paths":{"builders":str(sibling),
                 "deployments":"/Users/Shared/projects/features-and-futures-deployments/"+args.run},
    }
    write_json(run / "manifest.json", manifest)
    (run / "manifest.sha256").write_text(digest_json(manifest)+"\n")
    write_json(run / "state.json", {"status":"prepared","accepted":{}, "last_error":None})
    print("Prepared", run, digest_json(manifest), flush=True)

if __name__ == "__main__":
    prepare()
