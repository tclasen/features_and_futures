import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from orchestrator.storage import require_space, retire_deployment
from orchestrator.prepare import InfrastructureError
from orchestrator.evidence import digest_bytes

class StorageTests(unittest.TestCase):
    def manifest(self):
        return {"run_id":"pilot-011","runtime":{"storage_policy":{"revision":"archive-before-remove-v1","minimum_free_bytes":100}}}
    def test_reserve_blocks_new_attempt(self):
        with patch("orchestrator.storage.shutil.disk_usage") as usage:
            usage.return_value.free=99
            with self.assertRaisesRegex(InfrastructureError,"No new model"):require_space(self.manifest(),".")
            usage.return_value.free=100
            require_space(self.manifest(),".")
    def test_historical_runs_unchanged(self):
        with patch("orchestrator.storage.checked") as command:
            retire_deployment({"runtime":{}},"unrelated",None,None)
        command.assert_not_called()
    def test_foreign_namespace_refused(self):
        with patch("orchestrator.storage.checked") as command:
            with self.assertRaises(InfrastructureError):retire_deployment(self.manifest(),"ff-other-app-b001",None,None)
        command.assert_not_called()
    def test_archive_mismatch_prevents_removal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/"history.bundle").write_bytes(b"corrupt")
            (root/"index.json").write_text(json.dumps({"run_id":"pilot-011","checksums":{"history.bundle":"wrong"}}))
            with patch("orchestrator.storage.checked") as command:
                with self.assertRaises(InfrastructureError):retire_deployment(self.manifest(),"ff-pilot-011-app-b001",root,root)
            command.assert_not_called()
    def test_backup_and_history_verified_before_exact_removal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/"history.bundle").write_bytes(b"bundle")
            (root/"index.json").write_text(json.dumps({"run_id":"pilot-011","checksums":{"history.bundle":digest_bytes(b"bundle")}}))
            with sqlite3.connect(root/"accepted.sqlite") as db:db.execute("create table sentinel(value)")
            with patch("orchestrator.storage.checked") as command:
                retire_deployment(self.manifest(),"ff-pilot-011-app-b001",root,root)
            self.assertEqual(command.call_args_list[-2].args[0],["sbx","stop","ff-pilot-011-app-b001"])
            self.assertEqual(command.call_args_list[-1].args[0],["sbx","rm","--force","ff-pilot-011-app-b001"])
            self.assertEqual(json.loads((root/"resource-retirement.json").read_text())["status"],"removed")
    def test_missing_data_prevents_removal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/"index.json").write_text(json.dumps({"run_id":"pilot-011","checksums":{}}))
            with patch("orchestrator.storage.checked") as command:
                with self.assertRaises(InfrastructureError):retire_deployment(self.manifest(),"ff-pilot-011-app-b001",root,root)
            self.assertEqual(command.call_count,1)
