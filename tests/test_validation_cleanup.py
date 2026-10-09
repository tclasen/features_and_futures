import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from orchestrator.validation import Deployment

class CleanupTests(unittest.TestCase):
    def deployment(self, directory):
        app=Deployment.__new__(Deployment)
        app.name="own-rejected-app"; app.private_root="/home/agent/app"
        app.output=Path(directory); app.stop_process=Mock()
        return app

    def test_invalid_database_is_preserved_and_vm_stopped(self):
        with tempfile.TemporaryDirectory() as directory:
            app=self.deployment(directory)
            app.capture=Mock(side_effect=RuntimeError("file is not a database"))
            with patch("orchestrator.validation.subprocess.run",return_value=subprocess.CompletedProcess([],0,b"raw invalid data",b"")), patch("orchestrator.validation.invoke",return_value=subprocess.CompletedProcess([],0,"","")) as stop:
                app.stop()
            self.assertEqual((app.output/"rejected-raw-app.sqlite").read_bytes(),b"raw invalid data")
            stop.assert_called_once_with(["sbx","stop",app.name])

    def test_vm_stops_even_when_process_cleanup_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            app=self.deployment(directory); app.stop_process.side_effect=RuntimeError("process cleanup failed")
            with patch("orchestrator.validation.invoke",return_value=subprocess.CompletedProcess([],0,"","")) as stop:
                with self.assertRaisesRegex(RuntimeError,"process cleanup failed"):app.stop()
            stop.assert_called_once_with(["sbx","stop",app.name])
