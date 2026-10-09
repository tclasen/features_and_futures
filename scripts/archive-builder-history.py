#!/usr/bin/env python3
"""Archive one builder checkpoint and import its independent history into PM refs."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def git(repo, *args):
    return subprocess.check_output(
        ["git", "-C", str(repo), *args], text=True
    ).strip()


def identifier(value):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
        raise argparse.ArgumentTypeError("Use lowercase letters, numbers, and hyphens.")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment", required=True, type=identifier)
    parser.add_argument("--run", required=True, type=identifier)
    parser.add_argument("--builder", required=True, type=identifier)
    parser.add_argument("--checkpoint", required=True, type=identifier)
    parser.add_argument("--repository", required=True, type=Path)
    args = parser.parse_args()

    master = Path(__file__).resolve().parents[1]
    if Path(git(master, "rev-parse", "--show-toplevel")).resolve() != master:
        parser.error("This helper must live in the master repository.")
    source = args.repository.resolve()
    if Path(git(source, "rev-parse", "--show-toplevel")).resolve() != source:
        parser.error("--repository must identify the independent builder Git root.")
    if source == master or source in master.parents or master in source.parents:
        parser.error("Builder repositories must be independent of the master tree.")

    run_dir = master / "runs" / args.experiment / args.run
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    if (manifest.get("experiment_id"), manifest.get("run_id")) != (
        args.experiment, args.run
    ):
        parser.error("Run manifest identity does not match the requested run.")
    if manifest.get("status") not in {"running", "paused", "completed", "failed"}:
        parser.error("Only an actual started run may have builder checkpoints.")

    prefix = f"builders/{args.experiment}/{args.run}/{args.builder}/{args.checkpoint}"
    destination = run_dir / "builders" / args.builder / "checkpoints" / args.checkpoint
    if destination.exists():
        parser.error("Checkpoint archive already exists; choose a new checkpoint ID.")
    if git(master, "for-each-ref", "--format=%(refname)", f"refs/heads/{prefix}/"):
        parser.error("Checkpoint refs already exist; they must not be overwritten.")

    head = git(source, "rev-parse", "HEAD")
    tree = git(source, "rev-parse", "HEAD^{tree}")
    source_refs = git(source, "for-each-ref", "--format=%(refname) %(objectname)")
    heads = git(source, "for-each-ref", "--format=%(refname)", "refs/heads/")
    refspecs = [f"HEAD:refs/heads/{prefix}/head"]
    refspecs += [
        f"{ref}:refs/heads/{prefix}/branches/{ref.removeprefix('refs/heads/')}"
        for ref in heads.splitlines() if ref
    ]
    dirty = bool(git(source, "status", "--porcelain", "--untracked-files=normal"))

    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".archive-", dir=destination.parent) as tmp:
        staging = Path(tmp)
        bundle = staging / "history.bundle"
        snapshot = staging / "committed-source.tar"
        git(source, "bundle", "create", str(bundle), "--all", "HEAD")
        git(source, "bundle", "verify", str(bundle))
        git(source, "archive", "--format=tar", f"--output={snapshot}", head)
        if head != git(source, "rev-parse", "HEAD") or source_refs != git(
            source, "for-each-ref", "--format=%(refname) %(objectname)"
        ):
            parser.error("Builder refs changed during archival; stop it and retry.")
        index = {
            "schema_version": 1,
            "experiment_id": args.experiment,
            "run_id": args.run,
            "builder_id": args.builder,
            "checkpoint_id": args.checkpoint,
            "source_commit": head,
            "source_tree": tree,
            "source_refs": source_refs.splitlines(),
            "source_had_uncommitted_changes": dirty,
            "snapshot_scope": "committed-HEAD-only",
            "github_refs": [ref.split(":", 1)[1] for ref in refspecs],
            "checksums": {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in (bundle, snapshot)
            },
        }
        (staging / "index.json").write_text(
            json.dumps(index, indent=2) + "\n", encoding="utf-8"
        )
        shutil.copytree(staging, destination)

    # Fetch from the verified frozen bundle, never from a moving source checkout.
    # Unique checkpoint refs and atomic fetch prevent partial ref publication.
    git(master, "fetch", "--atomic", "--no-tags", "--no-write-fetch-head",
        str(destination / "history.bundle"), *refspecs)
    print(f"Archived checkpoint: {destination.relative_to(master)}")
    print("Publish these refs explicitly after committing the archive index on main:")
    print("git push origin " + " ".join(index["github_refs"]))
    if dirty:
        print("Uncommitted changes are not in this snapshot; archive them separately "
              "before any reversion.")


if __name__ == "__main__":
    main()
