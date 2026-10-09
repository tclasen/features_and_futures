import unittest
from orchestrator.watch_pilot import inactivity, active_inactivities


class LivenessTests(unittest.TestCase):
    def event(self, kind, when, **extra):
        return {'kind': kind, 'monotonic_ns': when*10**9, 'builder_id': 'b001', 'task_id': 'task-001', 'attempt_id': 'attempt-001', 'event_id': kind, **extra}

    def test_foreground_tool_gap_is_observed_without_failure_attribution(self):
        events = [self.event('attempt_started', 0), self.event('inference_request_started', 1, request_id='one'), self.event('inference_request_finished', 5, request_id='one')]
        alert = inactivity(events, 400*10**9, 300)
        self.assertEqual(alert['observation'], 'no inference or commit activity')
        self.assertEqual(alert['open_request_ids'], [])
        self.assertIn('unproven', alert['attribution'])
        self.assertIsNone(inactivity(events, 100*10**9, 300))

    def test_open_provider_request_distinct_and_commit_progress_resets_gap(self):
        events = [self.event('attempt_started', 0), self.event('inference_request_started', 1, request_id='one')]
        self.assertEqual(inactivity(events, 400*10**9, 300)['observation'], 'open inference request')
        events.append(self.event('commit_first_observed', 399))
        self.assertIsNone(inactivity(events, 400*10**9, 300))

    def test_parallel_monitor_keeps_stalled_builder_visible_after_another_finishes(self):
        events=[self.event('attempt_started',0),self.event('attempt_started',350,builder_id='b002'),
                self.event('attempt_finished',399,builder_id='b002')]
        alerts=active_inactivities(events,400*10**9,300)
        self.assertEqual([a['builder_id'] for a in alerts],['b001'])

    def test_terminal_attempt_not_alerted_and_other_builder_events_do_not_reset(self):
        events = [self.event('attempt_started', 0), self.event('inference_request_finished', 350, builder_id='b002', request_id='other')]
        self.assertIsNotNone(inactivity(events, 400*10**9, 300))
        events.append(self.event('attempt_finished', 399))
        self.assertIsNone(inactivity(events, 400*10**9, 300))


if __name__ == '__main__':
    unittest.main()
