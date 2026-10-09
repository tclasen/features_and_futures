"""Exercise original-history preservation without GitHub or live builders."""

import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


HELPER = Path(__file__).resolve().parents[1] / "scripts" / "archive-builder-history.py"


def command(*args, cwd=None, check=True):
    return subprocess.run(
        args, cwd=cwd, check=check, text=True, capture_output=True
    )


class BuilderHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.master = self.base / "master"
        self.master.mkdir()
        (self.master / "scripts").mkdir()
        shutil.copy(HELPER, self.master / "scripts" / HELPER.name)
        self.git(self.master, "init", "-b", "main")
        self.configure(self.master)
        self.git(self.master, "add", ".")
        self.git(self.master, "commit", "-m", "PM root")
        self.sources = []
        for number in range(2):
            repo = self.base / f"source-{number}"
            repo.mkdir()
            self.git(repo, "init", "-b", "main")
            self.configure(repo)
            (repo / "app.txt").write_text(f"builder {number}\n")
            self.git(repo, "add", ".")
            self.git(repo, "commit", "-m", f"Builder {number} root")
            self.git(repo, "branch", "feature/shared")
            self.sources.append(repo)
        self.make_run("run-one")

    def git(self, repo, *args):
        return command("git", "-C", str(repo), *args).stdout.strip()

    def configure(self, repo):
        self.git(repo, "config", "user.name", "Fixture")
        self.git(repo, "config", "user.email", "fixture@example.invalid")
        self.git(repo, "config", "commit.gpgsign", "false")

    def make_run(self, run):
        path = self.master / "runs" / "fixture" / run
        path.mkdir(parents=True)
        (path / "manifest.json").write_text(json.dumps({
            "experiment_id": "fixture", "run_id": run, "status": "running"
        }))

    def archive(self, source, builder="builder-one", checkpoint="task-one",
                run="run-one", check=True):
        return command(
            "python3", str(self.master / "scripts" / HELPER.name),
            "--experiment", "fixture", "--run", run, "--builder", builder,
            "--checkpoint", checkpoint, "--repository", str(source), check=check
        )

    def ref(self, builder="builder-one", checkpoint="task-one", run="run-one"):
        return f"refs/heads/builders/fixture/{run}/{builder}/{checkpoint}"

    def test_independent_roots_and_identical_branch_names(self):
        main = self.git(self.master, "rev-parse", "main")
        for number, source in enumerate(self.sources):
            builder = f"builder-{number}"
            head = self.git(source, "rev-parse", "HEAD")
            self.archive(source, builder=builder)
            prefix = self.ref(builder=builder)
            self.assertEqual(head, self.git(self.master, "rev-parse", prefix + "/head"))
            self.assertEqual(head, self.git(
                self.master, "rev-parse", prefix + "/branches/feature/shared"
            ))
            self.assertEqual(head, self.git(source, "rev-parse", "HEAD"))
        self.assertEqual(main, self.git(self.master, "rev-parse", "main"))

    def test_archive_restores_history_after_source_reset(self):
        source = self.sources[0]
        first = self.git(source, "rev-parse", "HEAD")
        (source / "app.txt").write_text("later implementation\n")
        self.git(source, "commit", "-am", "Later change")
        second = self.git(source, "rev-parse", "HEAD")
        self.archive(source)
        checkpoint = (self.master / "runs/fixture/run-one/builders/"
                      "builder-one/checkpoints/task-one")
        index = json.loads((checkpoint / "index.json").read_text())
        for name, checksum in index["checksums"].items():
            self.assertEqual(checksum, hashlib.sha256(
                (checkpoint / name).read_bytes()
            ).hexdigest())
        self.git(source, "reset", "--hard", first)
        self.assertEqual(second, self.git(
            self.master, "rev-parse", self.ref() + "/head"
        ))
        restore = self.base / "restored"
        command("git", "clone", "-b", "main",
                str(checkpoint / "history.bundle"), str(restore))
        self.assertEqual(second, self.git(restore, "rev-parse", "HEAD"))
        self.assertEqual(2, int(self.git(restore, "rev-list", "--count", "HEAD")))

    def test_existing_checkpoint_is_not_overwritten(self):
        self.archive(self.sources[0])
        before = self.git(self.master, "rev-parse", self.ref() + "/head")
        rejected = self.archive(self.sources[1], check=False)
        self.assertNotEqual(0, rejected.returncode)
        self.assertEqual(before, self.git(
            self.master, "rev-parse", self.ref() + "/head"
        ))

    def test_repeats_use_separate_namespaces(self):
        self.make_run("run-two")
        self.archive(self.sources[0])
        self.archive(self.sources[1], run="run-two")
        for run, source in zip(("run-one", "run-two"), self.sources):
            self.assertEqual(self.git(source, "rev-parse", "HEAD"), self.git(
                self.master, "rev-parse", self.ref(run=run) + "/head"
            ))

    def test_dirty_source_is_preserved_and_scope_is_explicit(self):
        source = self.sources[0]
        (source / "app.txt").write_text("uncommitted work\n")
        (source / "extra.txt").write_text("untracked work\n")
        before = self.git(source, "status", "--porcelain")
        result = self.archive(source)
        self.assertEqual(before, self.git(source, "status", "--porcelain"))
        index_path = (self.master / "runs/fixture/run-one/builders/"
                      "builder-one/checkpoints/task-one/index.json")
        index = json.loads(index_path.read_text())
        self.assertTrue(index["source_had_uncommitted_changes"])
        self.assertEqual("committed-HEAD-only", index["snapshot_scope"])
        self.assertIn("archive them separately", result.stdout)

    def test_missing_run_does_not_import_refs(self):
        rejected = self.archive(self.sources[0], run="missing", check=False)
        self.assertNotEqual(0, rejected.returncode)
        self.assertEqual("", self.git(
            self.master, "for-each-ref", "--format=%(refname)", "refs/heads/builders/"
        ))


if __name__ == "__main__":
    unittest.main()
