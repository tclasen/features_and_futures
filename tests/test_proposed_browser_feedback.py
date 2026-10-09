import json
import unittest
from pathlib import Path
from orchestrator.proposals.browser_feedback_v1 import browser_diagnostics, public_message


class BrowserFeedbackTests(unittest.TestCase):
    def test_real_failure_preserves_expected_observed_and_removes_pm_source(self):
        root = Path(__file__).parents[1]
        original = json.loads((root/'runs/instruction-effects/pilot-005/tasks/task-001/attempts/b004/attempt-003/feedback.json').read_text())['observations']
        before = json.dumps(original)
        rendered = browser_diagnostics(original, root)
        message = rendered[0]['errors'][0]
        self.assertIn('Project name is required', message)
        self.assertIn('element(s) not found', message)
        self.assertIn("getByRole('alert')", message)
        self.assertNotIn('await page', message)
        self.assertNotIn('await expect', message)
        self.assertNotIn('workboard.spec.mjs', message)
        self.assertNotIn('\x1b', message)
        self.assertEqual(before, json.dumps(original))

    def test_non_browser_contracts_unchanged_and_paths_removed_without_frame(self):
        diagnostics = [{'contract': 'Committed source', 'observed_git_status': '?? server.js'}]
        self.assertEqual(browser_diagnostics(diagnostics, '/pm'), diagnostics)
        self.assertEqual(public_message('Runner error /pm/tests/spec.mjs:2:1', '/pm'), 'Runner error [PM evidence path]')


if __name__ == '__main__':
    unittest.main()
