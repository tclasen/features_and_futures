import unittest
from orchestrator.audit_scheduling import audit

class SchedulingAuditTests(unittest.TestCase):
    def fixture(self):
        manifest={"runtime":{"builder_configurations":[{"builder_id":"a"},{"builder_id":"b"}]},"tasks":[{"task_id":"one"},{"task_id":"two"}]}
        events=[]
        def add(kind,when,task="one",builder=None):
            event={"kind":kind,"monotonic_ns":when,"task_id":task}
            if builder:event.update(builder_id=builder,attempt_id="attempt-001")
            events.append(event)
        for i,bid in enumerate(("a","b")):add("task_dispatched",i,builder=bid);add("attempt_started",2+i,builder=bid)
        for i,bid in enumerate(("a","b")):add("attempt_finished",4+i,builder=bid);add("post_deployment_checks_passed",6+i,builder=bid)
        add("round_completed",8)
        events.sort(key=lambda e:e["monotonic_ns"])
        return manifest,events

    def test_live_parallel_overlap_does_not_claim_terminal_completion(self):
        manifest,events=self.fixture();report=audit(manifest,events)
        self.assertEqual(report["problems"],[]);self.assertEqual(report["peak_active_attempts"],2)
        self.assertFalse(report["terminal_scheduling_verified"])
        self.assertTrue(audit(manifest,events,True)["problems"])

    def test_early_next_requirement_and_incomplete_barrier_are_detected(self):
        manifest,events=self.fixture()
        events.append({"kind":"task_dispatched","monotonic_ns":7,"task_id":"two","builder_id":"a"})
        self.assertTrue(any("before preceding" in p for p in audit(manifest,events)["problems"]))
        events=[e for e in events if not(e["kind"]=="post_deployment_checks_passed" and e["builder_id"]=="b")]
        self.assertTrue(any("barrier before every" in p for p in audit(manifest,events)["problems"]))

    def test_same_builder_cannot_have_two_active_development_tasks(self):
        manifest,events=self.fixture()
        events.insert(3,{"kind":"attempt_started","monotonic_ns":3,"task_id":"two","attempt_id":"attempt-002","builder_id":"a"})
        self.assertTrue(any("overlapping" in p for p in audit(manifest,events)["problems"]))
