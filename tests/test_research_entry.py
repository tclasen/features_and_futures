import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from orchestrator.evaluation import validate_research_manifest, completion_ready
from orchestrator.prepare import InfrastructureError
from orchestrator.evidence import digest_bytes

class ResearchEntryTests(unittest.TestCase):
    def fixture(self, root, purpose='research-discovery'):
        plan=root/'plan.json';plan.write_text(json.dumps({'primary_family_size':36,'stopping':{'required_independent_batches':2}}))
        run=root/'eval-001';run.mkdir()
        manifest={'purpose':purpose,'execution':{'task_stream_revision':'append-only-rounds-v1'},'research':{'analysis_plan':{'path':'plan.json','sha256':digest_bytes(plan.read_bytes())}}}
        (run/'manifest.json').write_text(json.dumps(manifest))
        return run,plan
    def test_pilot_manifest_cannot_start_research(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);run,_=self.fixture(root,'engineering-longitudinal-pilot')
            with patch('orchestrator.evaluation.ROOT',root):
                with self.assertRaises(InfrastructureError):validate_research_manifest(run)
    def test_changed_plan_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);run,plan=self.fixture(root);plan.write_text('{}')
            with patch('orchestrator.evaluation.ROOT',root):
                with self.assertRaises(InfrastructureError):validate_research_manifest(run)
    def test_pilot_seal_cannot_stop_discovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);run,_=self.fixture(root);(run/'stream-seal.json').write_text('{}')
            with patch('orchestrator.evaluation.ROOT',root):self.assertFalse(completion_ready(run))
