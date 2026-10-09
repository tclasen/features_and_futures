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

    def test_failed_initialization_does_not_clean_uncreated_sandbox(self):
        app=Deployment.__new__(Deployment);app.created=False
        with patch('orchestrator.validation.invoke') as command:
            app.stop()
        command.assert_not_called()

    def test_deployment_ids_are_bounded_and_do_not_alias_task1001(self):
        from orchestrator.validation import deployment_name
        manifest={'run_id':'pilot-010','runtime':{'deployment_lifecycle':'foreground-sbx-exec-v2'}}
        first=deployment_name(manifest,'b001','task-001','attempt-001')
        later=deployment_name(manifest,'b001','task-1001','attempt-001')
        self.assertNotEqual(first,later)
        self.assertLessEqual(len(later),63)
        legacy={'run_id':'pilot-009','runtime':{}}
        self.assertEqual(deployment_name(legacy,'b001','task-001','attempt-001'),'ff-pilot-009-app-b001-001-001')

    def test_partial_launch_cleanup_does_not_hide_original_failure(self):
        from orchestrator.validation import launch_deployment
        def broken_init(instance,*args):
            instance.created=True
            raise RuntimeError('original launch failure')
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)
            with patch.object(Deployment,'__init__',broken_init), patch.object(Deployment,'stop',side_effect=RuntimeError('cleanup also failed')) as stop:
                with self.assertRaisesRegex(RuntimeError,'original launch failure'):
                    launch_deployment({},'fixture','task-001','attempt-001',Path('/unused'),'commit',output,None)
            stop.assert_called_once()
            self.assertTrue((output/'launch-cleanup-failure.json').exists())
