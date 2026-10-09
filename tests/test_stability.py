import tempfile
import time
import unittest
from pathlib import Path
from orchestrator.evidence import Ledger, read_jsonl
from orchestrator.stability import monitor_promotion, observe_window

class StabilityTests(unittest.TestCase):
    def test_full_window_and_last_sample_are_required(self):
        clock=[0]
        samples=observe_window(lambda:None,12,5,clock=lambda:clock[0],sleep=lambda n:clock.__setitem__(0,clock[0]+n))
        self.assertEqual(samples,[0,5,10,12])
    def test_detected_incident_recovers_without_new_promotion(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger=Ledger(Path(directory),{'run_id':'trusted-stability-fixture'})
            healthy=[False]
            def check():
                if not healthy[0]: raise RuntimeError('Observed persistence sentinel unavailable')
            monitor_promotion(ledger,{'builder_id':'fixture','commit':'same'},check,lambda:healthy.__setitem__(0,True),.01,.005)
            records=read_jsonl(ledger.root/'events.jsonl')
            self.assertEqual([r['kind'] for r in records],['incident_detected','incident_intervention_started','incident_recovered','post_deployment_checks_passed'])
            self.assertEqual(records[0]['event_id'],records[2]['incident_id'])
            self.assertGreaterEqual(records[2]['monotonic_ns'],records[0]['monotonic_ns'])
    def test_failed_recovery_retained_and_does_not_report_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger=Ledger(Path(directory),{'run_id':'trusted-stability-fixture'})
            def broken():raise RuntimeError('Original observed outage')
            with self.assertRaisesRegex(RuntimeError,'Original observed outage'):
                monitor_promotion(ledger,{},broken,lambda:None,.01,.005)
            kinds=[r['kind'] for r in read_jsonl(ledger.root/'events.jsonl')]
            self.assertIn('incident_recovery_failed',kinds)
            self.assertNotIn('post_deployment_checks_passed',kinds)
