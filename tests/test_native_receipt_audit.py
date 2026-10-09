import unittest
from orchestrator.audit_native_receipts import receipt, categories


class NativeReceiptTests(unittest.TestCase):
    def test_multiline_sse_terminal_not_client_estimate(self):
        raw = b'event: response.completed\r\ndata: {"type":"response.completed",\r\ndata: "response":{"usage":{"input_tokens":12,"output_tokens":8,"input_tokens_details":{"cached_tokens":3}}}}\r\n\r\ndata: [DONE]\r\n\r\n'
        self.assertEqual(categories(receipt(raw)), (12, 3, 8))

    def test_truncated_stream_does_not_invent_receipt(self):
        self.assertIsNone(receipt(b'data: {"type":"response.output_text.delta","delta":"hello"}\n\ndata: {"type":"response.completed"'))
        self.assertIsNone(categories(None))

    def test_json_failure_and_invalid_categories(self):
        self.assertIsNone(receipt(b'{"error":{"message":"invalid generated arguments"}}'))
        with self.assertRaises(ValueError):
            categories({'prompt_tokens': 2, 'completion_tokens': 3, 'prompt_tokens_details': {'cached_tokens': 4}})
        with self.assertRaises(ValueError):
            categories({'input_tokens': True, 'output_tokens': 1})


if __name__ == '__main__':
    unittest.main()
