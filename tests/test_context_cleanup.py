import io
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from orchestrator.context_probe import retire_fixture

class ContextCleanupTests(unittest.TestCase):
    def fixture(self):
        output=io.BytesIO()
        with tarfile.open(fileobj=output,mode='w:gz') as archive:
            data=b'preserved canary\n'; member=tarfile.TarInfo('work/result.txt');member.size=len(data)
            archive.addfile(member,io.BytesIO(data))
        return output.getvalue()

    def test_verified_archive_precedes_exact_removal(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            def capture(command,**kwargs):
                kwargs['stdout'].write(self.fixture())
                return subprocess.CompletedProcess(command,0,b'',b'')
            def invoke(command):
                if command[1]=='rm':
                    self.assertTrue((root/'fixture-preservation.json').exists())
                    with tarfile.open(root/'original-fixture.tar.gz') as archive:
                        self.assertEqual(archive.extractfile('work/result.txt').read(),b'preserved canary\n')
                return subprocess.CompletedProcess(command,0,'','')
            with patch('orchestrator.context_probe.subprocess.run',side_effect=capture),patch('orchestrator.context_probe.invoke',side_effect=invoke) as calls:
                retire_fixture('ff-context-owned',root)
            self.assertEqual(calls.call_args_list[-1].args[0],['sbx','rm','--force','ff-context-owned'])
            self.assertTrue((root/'fixture-retirement.json').exists())

    def test_failed_capture_retains_resource_and_failure_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch('orchestrator.context_probe.invoke',return_value=subprocess.CompletedProcess([],0,'','')) as calls,patch('orchestrator.context_probe.subprocess.run',return_value=subprocess.CompletedProcess([],1,b'',b'capture failure')):
                with self.assertRaisesRegex(RuntimeError,'sandbox retained'):
                    retire_fixture('ff-context-owned',Path(directory))
            self.assertFalse(any(c.args[0][1]=='rm' for c in calls.call_args_list))
            self.assertEqual((Path(directory)/'fixture-capture.stderr.log').read_bytes(),b'capture failure')

    def test_unrelated_namespace_never_touched(self):
        with patch('orchestrator.context_probe.invoke') as calls:
            with self.assertRaises(ValueError):retire_fixture('another-thread',Path('/unused'))
        calls.assert_not_called()

if __name__=='__main__':unittest.main()
