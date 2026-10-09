import unittest
from unittest.mock import Mock
from orchestrator.checkpoint_recovery import trailing_identical_failures,restore
from orchestrator.diagnostics import notification_fingerprint
from orchestrator.prepare import InfrastructureError

class CheckpointRecoveryTests(unittest.TestCase):
    def test_rule_counts_only_matching_own_task_and_survives_resume(self):
        diagnostics=[{'test':'archive restoration','errors':['Duplicate visible project rows']}]
        fingerprint=notification_fingerprint(diagnostics)
        events=[{'kind':'attempt_rejected','builder_id':'b001','task_id':'task-003','diagnostics':diagnostics} for _ in range(5)]
        events.append({'kind':'attempt_rejected','builder_id':'b002','task_id':'task-003','diagnostics':[{'test':'unrelated'}]})
        self.assertEqual(trailing_identical_failures(events,'b001','task-003',fingerprint),5)
        events.append({'kind':'attempt_rejected','builder_id':'b001','task_id':'task-003','diagnostics':[{'test':'new failure'}]})
        self.assertEqual(trailing_identical_failures(events,'b001','task-003',fingerprint),0)
    def test_foreign_workspace_is_refused_before_archival_or_reset(self):
        ledger=Mock();archive=Mock()
        with self.assertRaises(InfrastructureError):restore(None,{'run_id':'pilot-012'},'unrelated',None,'b001','task-003','attempt-005',None,'commit',ledger,archive)
        ledger.event.assert_not_called();archive.assert_not_called()
