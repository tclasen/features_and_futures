import unittest
from orchestrator.proposals.failure_fingerprint_v1 import notification_fingerprint


class FailureFingerprintTests(unittest.TestCase):
    def diagnostics(self, source, error):
        return [{'contract':'Generated tool arguments must be valid for the assigned harness','observed':f"error parsing tool call: raw='{source}', err={error}"}, {'contract':'Harness exited unsuccessfully','exit_code':1}]

    def test_source_variation_does_not_hide_identical_parser_failures(self):
        first = self.diagnostics('source one', "invalid character ']' after object key:value pair")
        other = self.diagnostics('source two', "invalid character ']' after object key:value pair")
        self.assertEqual(notification_fingerprint(first), notification_fingerprint(other))
        self.assertIn('source one', first[0]['observed'])

    def test_distinct_failures_and_exit_codes_remain_distinct(self):
        first = self.diagnostics('source', "invalid character ']'")
        other = self.diagnostics('source', 'unexpected end of JSON input')
        self.assertNotEqual(notification_fingerprint(first), notification_fingerprint(other))
        other = self.diagnostics('source', "invalid character ']'")
        other[1]['exit_code']=2
        self.assertNotEqual(notification_fingerprint(first), notification_fingerprint(other))


if __name__ == '__main__':
    unittest.main()
