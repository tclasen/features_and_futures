"""Freeze the actual pilot inputs before dispatch."""
import argparse
import json
import platform
import os
import tempfile
import shutil
import subprocess
from pathlib import Path
from .adapters import invoke, price_snapshot
from .configurations import builder_configurations
from .evidence import digest_bytes, digest_json, timestamp

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "docker.io/library/features-and-futures-builder:pilot-v001"
IMAGE_DIGEST = "sha256:04ff7064a2620ad9a41a9941fe80527c69dd450a16f277d6fdd721e9b28585d0"

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, prefix=".pm-json-", delete=False) as stream:
        temporary=Path(stream.name)
        stream.write(json.dumps(value, indent=2) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary,path)

class InfrastructureError(RuntimeError):
    pass


def checked(command, **kwargs):
    result = invoke(command, **kwargs)
    if result.returncode:
        raise InfrastructureError(f"{command[:3]} failed: {result.stderr[-4000:]}")
    return result.stdout.strip()

def git(repo, *args):
    return checked(["git", "-C", str(repo), *args])

def file_hashes(path):
    return {str(f.relative_to(path)): digest_bytes(f.read_bytes())
            for f in sorted(path.rglob("*")) if f.is_file()}

def prepare():
    parser=argparse.ArgumentParser();parser.add_argument("--run",default="pilot-005");parser.add_argument("--project-revision",default="v004");parser.add_argument("--experiment-revision",default="pilot-v005");parser.add_argument("--source-run",default="pilot-004");parser.add_argument("--feedback-rendering",choices=("legacy-v1","native-parser-and-supplied-schemas-v2","native-and-visible-state-v3"),default="legacy-v1");parser.add_argument("--model-set",choices=("full","hosted"),default="hosted");parser.add_argument("--scheduling",choices=("sequential","parallel-rounds"),default="parallel-rounds");args=parser.parse_args()
    if not __import__("re").fullmatch(r"pilot-[0-9]{3}",args.run): raise ValueError("Invalid pilot run ID")
    run = ROOT / "runs/instruction-effects" / args.run
    if (run / "manifest.json").exists():
        raise RuntimeError("Manifest already frozen; resume the existing run.")
    if args.project_revision not in ("v003", "v004", "v005", "v006"): raise ValueError("Unsupported project revision")
    project = ROOT / "projects/workboard/revisions" / args.project_revision
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
    builders = builder_configurations(args.model_set)
    selected_models = {b["model"] for b in builders}
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
    prices = price_snapshot(run / "pricing", models=selected_models)
    write_json(frozen / "pricing-mappings.json", prices)
    from .workload import project_checkpoints, phase_expectations
    tasks = []
    for checkpoint in project_checkpoints(project):
        stage=checkpoint["stage"]
        task_id=checkpoint["task_id"]
        packet = contract + "\n\n" + (frozen / "project/SPEC.md").read_text()
        packet += "\n\nCumulative requirements through this task:\n"
        for prior in range(1, stage+1):
            packet += "\n" + (frozen / f"project/requirements/task-{prior:03d}.md").read_text()
        path = run / "tasks" / task_id
        path.mkdir(parents=True, exist_ok=True)
        (path / "packet.md").write_text(packet)
        tasks.append({"task_id":task_id,"stage":stage,
                      **({"expected_phase_checks":phase_expectations(checkpoint)} if "expected_phase_checks" in checkpoint else {}),
                      "packet_sha256":digest_bytes(packet.encode()),
                      "suite_hash":digest_json(file_hashes(frozen / "project/acceptance"))})
    local_runtime = {}
    if "gpt-oss:120b" in selected_models:
        from .local_provider import provenance
        local_provider=provenance()
        local_runtime["local_provider"]=local_provider
        write_json(frozen / "local-provider.json",local_provider)
    rotation = len(builders) // 3
    scheduling_order=(f"sequential; rotate by {rotation} builder positions per round" if args.scheduling=="sequential" else "parallel builders within each round; complete checkpoint barrier before next round")
    manifest = {
        "schema_version":1, "status":"running", "experiment_id":"instruction-effects",
        "experiment_revision":args.experiment_revision, "run_id":args.run, "purpose":"engineering-pilot",
        "project_id":"workboard","project_revision":args.project_revision,
        "lineage":{"source_run":args.source_run,"variation":f"{args.model_set} model matrix; unchanged {args.project_revision} public tasks; feedback {args.feedback_rendering}; strict native accounting"}, "frozen_at":timestamp(),
        "runtime":{**local_runtime,"builder_configurations":builders,"harness_versions":{"codex":"0.162.0","pi":"1.1.0"},
                   "image":IMAGE,"image_digest":IMAGE_DIGEST, "sbx_version":"0.47.0",
                   "node":"22.22.1","playwright":"1.64.0","chromium":"156.0.8078.4",
                   "resource_limits":{"cpus":4,"memory":"4g","deployment_memory":"512m"},
                   "host":{"platform":platform.platform(), "machine":platform.machine(),
                           "memory_bytes":int(checked(["sysctl","-n","hw.memsize"])),
                           "cpu":checked(["sysctl","-n","machdep.cpu.brand_string"])},
                   "context_policy":"fresh home/session for every instruction; private sandbox repository persists",
                   **({"harness_context":{
                       "codex":{"context_window":272000,"auto_compact_token_limit":255616,
                                "output_reserve":"Native Codex Responses behavior; no independent CLI output cap verified"},
                       "pi":{"context_window":272000,"max_output_tokens":16384,
                             "compaction":{"enabled":True,"reserveTokens":16384,"keepRecentTokens":20000}}}}
                      if args.feedback_rendering=="native-and-visible-state-v3" else {}),
                   "egress":"deny by default; only the PM leased inference gateway allowed",
                   "model_mappings":{**({"gpt-oss:120b":local_provider["model"]} if local_runtime else {}),
                       "gpt-6-luna":{"provider":"OpenAI subscription", "reasoning":"medium"},
                       "gpt-6.1-sol":{"provider":"OpenAI subscription", "reasoning":"medium"}},
                   "warmup":"Prior native model/harness file-edit checks retained; selected-model provenance recorded. No local inference required for hosted-only runs.",
                   "cache":"native provider caching; no shared source/context cache; report both price references"},
        "provenance":{"pm_commit":git(ROOT,"rev-parse","HEAD"),"starter_commit":starter_commit,
                      "starter_tree":git(seed,"rev-parse","HEAD^{tree}"),
                      "image_archive_sha256":"90450bd7619f4b0f1f2f246f7b6ae22d247490e2227602c6a690a3c657b8ea47",
                      "image_config_sha256":"0ce50460d98e8b9215f523c38ad4123aaf6cbfd44a81a61bb13141d0c9219275",
                      "definition_hashes":file_hashes(frozen)},
        "tasks":tasks,"pricing":prices,
        "execution":{"scheduling_seed":43,"order":scheduling_order,"scheduling":args.scheduling,"max_parallel_builders":len(builders) if args.scheduling=="parallel-rounds" else 1, "rotation_positions":rotation,
                     "retry_limit":None,"feedback_rendering":args.feedback_rendering,"unchanged_failure_notify_after":10,
                     **({"timing_revision":"harness-return-v2","recovery_policy":"uniform public assertions and visible snapshot on every rejection; preserve working tree"} if args.feedback_rendering=="native-and-visible-state-v3" else {})},
        "evidence_policy":{"purpose":"infrastructure readiness; no claim of instruction effect",
                           "stop":f"all {len(builders)} builders accepted all {len(tasks)} tasks with complete native usage",
                           "post_deployment_window_seconds":30 if args.feedback_rendering=="native-and-visible-state-v3" else 5,
                           **({"stability_revision":"behavior-and-restart-v2","post_deployment_interval_seconds":5,
                               "incident_policy":"One same-revision process restart; failed recovery halts cohort for archived diagnosis"}
                              if args.feedback_rendering=="native-and-visible-state-v3" else {}),
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
