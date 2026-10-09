"""Versioned host-space gate and archive-verified retirement of own deployments."""
import json
import shutil
import sqlite3
from pathlib import Path
from .evidence import digest_bytes, timestamp
from .prepare import InfrastructureError, checked, write_json

REVISION = "archive-before-remove-v1"

def require_space(manifest, path):
    policy = manifest["runtime"].get("storage_policy")
    if not policy:
        return
    if policy["revision"] != REVISION:
        raise InfrastructureError("Unknown storage policy")
    free = shutil.disk_usage(path).free
    minimum = policy["minimum_free_bytes"]
    if free < minimum:
        raise InfrastructureError(f"PM host disk reserve violated: {free} available; {minimum} required. No new model attempt permitted.")

def retire_deployment(manifest, name, output, checkpoint):
    """Delete only an exact owned sandbox after durable source/history/data verification."""
    if manifest["runtime"].get("storage_policy", {}).get("revision") != REVISION:
        return
    prefix = "ff-" + manifest["run_id"] + "-app-"
    if not name.startswith(prefix):
        raise InfrastructureError("Refusing retirement outside this run's application namespace")
    output, checkpoint = Path(output), Path(checkpoint)
    index = json.loads((checkpoint / "index.json").read_text())
    if index["run_id"] != manifest["run_id"]:
        raise InfrastructureError("Retirement archive belongs to another run")
    for relative, expected in index["checksums"].items():
        if digest_bytes((checkpoint / relative).read_bytes()) != expected:
            raise InfrastructureError("Retirement archive checksum mismatch")
    checked(["git", "bundle", "verify", str((checkpoint / "history.bundle").resolve())])
    raw = output / "cleanup.json"
    backups = [p for p in (output / "accepted.sqlite", output / "retired.sqlite") if p.exists()]
    if backups:
        for path in backups:
            with sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True) as db:
                if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise InfrastructureError("Retirement SQLite backup is corrupt")
    elif not raw.exists():
        raise InfrastructureError("Retirement requires a database backup or explicit raw cleanup record")
    evidence = {"schema_version": 1, "utc": timestamp(), "sandbox": name,
                "policy": REVISION, "checkpoint": str(checkpoint),
                "archive_checksums": index["checksums"],
                "data_checksums": {p.name: digest_bytes(p.read_bytes()) for p in backups},
                "status": "verified_before_removal"}
    write_json(output / "resource-retirement.json", evidence)
    checked(["sbx", "stop", name])
    checked(["sbx", "rm", "--force", name])
    evidence.update(status="removed", completed_utc=timestamp())
    write_json(output / "resource-retirement.json", evidence)
