import unittest
from orchestrator.audit_request_coverage import reconcile


class RequestCoverageTests(unittest.TestCase):
    def records(self):
        identity = {'request_id': 'one', 'builder_id': 'b001', 'task_id': 'task-001', 'attempt_id': 'attempt-001', 'clock_id': 'same', 'model': 'model', 'provider': 'provider'}
        start = dict(identity, kind='inference_request_started', monotonic_ns=10)
        usage = dict(identity, started_monotonic_ns=10, ended_monotonic_ns=20)
        finish = dict(identity, kind='inference_request_finished', monotonic_ns=21)
        return start, usage, finish

    def test_dispatched_call_cannot_disappear_in_terminal_run(self):
        start, usage, finish = self.records()
        result = reconcile([start], [], True)
        self.assertFalse(result['complete_run_request_coverage'])
        self.assertEqual(result['awaiting_usage_request_ids'], ['one'])
        self.assertTrue(result['problems'])

    def test_live_call_pending_is_unresolved_without_false_terminal_failure(self):
        start, usage, finish = self.records()
        result = reconcile([start], [], False)
        self.assertEqual(result['problems'], [])
        self.assertFalse(result['complete_run_request_coverage'])
        self.assertEqual(result['awaiting_usage_request_ids'], ['one'])
        self.assertTrue(reconcile([start, finish], [usage], True)['complete_run_request_coverage'])

    def test_identity_mismatch_and_duplicate_counters_block_coverage(self):
        start, usage, finish = self.records()
        usage['builder_id'] = 'b002'
        result = reconcile([start, finish], [usage, usage], True)
        self.assertFalse(result['complete_run_request_coverage'])
        self.assertTrue(any('duplicate' in p for p in result['problems']))
        self.assertTrue(any('attribution mismatch' in p for p in result['problems']))


if __name__ == '__main__':
    unittest.main()
