import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from orchestrator.evidence import digest_bytes,digest_json
from orchestrator.prepare import InfrastructureError,file_hashes
from orchestrator.prepare_evaluation import verify_recovery_source

class ResearchRecoveryTests(unittest.TestCase):
    def fixture(self,root):
        source=Path(root);(source/'definitions').mkdir()
        manifest={'purpose':'research-discovery','provenance':{'definition_hashes':file_hashes(source/'definitions')}}
        (source/'manifest.sha256').write_text(digest_json(manifest))
        (source/'state.json').write_text(json.dumps({'status':'infrastructure_attention'}))
        attrs={'builder_id':'b003','task_id':'task-003','attempt_id':'attempt-001'}
        self.events=[{'kind':'inference_request_started','request_id':'gap'}, {'kind':'inference_request_finished','request_id':'gap'}, {'kind':'attempt_started',**attrs},{'kind':'attempt_finished',**attrs},{'kind':'runner_interrupted'}]
        raw=source/'tasks/task-003/attempts/b003/attempt-001/requests/gap.response.raw';raw.parent.mkdir(parents=True);raw.write_bytes(b'original503')
        self.usage=[{'request_id':'gap','counts':None,'response_sha256':digest_bytes(raw.read_bytes()),**attrs}]
        return source,manifest,raw
    def verify(self,source,manifest):
        with patch('orchestrator.evaluation.validate_research_manifest',return_value=manifest),patch('orchestrator.prepare_evaluation.task_stream'),patch('orchestrator.prepare_evaluation.read_jsonl',side_effect=lambda p:self.events if p.name=='events.jsonl' else self.usage):
            return verify_recovery_source(source)
    def test_drained_original_gap_is_bound_without_imputation(self):
        with tempfile.TemporaryDirectory() as tmp:
            source,m,_=self.fixture(tmp)
            self.assertEqual(self.verify(source,m),{'original_requests':1,'unknown_native_receipts':1,'request_ids':['gap']})
    def test_live_request_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            source,m,_=self.fixture(tmp);self.events=[e for e in self.events if e['kind']!='inference_request_finished']
            with self.assertRaises(InfrastructureError):self.verify(source,m)
    def test_live_attempt_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            source,m,_=self.fixture(tmp);self.events=[e for e in self.events if e['kind']!='attempt_finished']
            with self.assertRaises(InfrastructureError):self.verify(source,m)
    def test_original_response_must_remain_exact(self):
        with tempfile.TemporaryDirectory() as tmp:
            source,m,raw=self.fixture(tmp);raw.write_bytes(b'replaced')
            with self.assertRaises(InfrastructureError):self.verify(source,m)
    def test_fully_counted_run_not_eligible_for_accounting_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            source,m,_=self.fixture(tmp);self.usage[0]['counts']={'input':1,'output':1}
            with self.assertRaises(InfrastructureError):self.verify(source,m)
    def test_running_state_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            source,m,_=self.fixture(tmp);(source/'state.json').write_text('{"status":"running"}')
            with self.assertRaises(InfrastructureError):self.verify(source,m)
