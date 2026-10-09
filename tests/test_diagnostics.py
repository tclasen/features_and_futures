import json
import tempfile
import unittest
from pathlib import Path
from orchestrator.diagnostics import tool_diagnostics

class DiagnosticsTests(unittest.TestCase):
    def test_feedback_retains_actual_error_and_exact_supplied_schema(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/"requests").mkdir()
            schema={"type":"object","properties":{"cmd":{"type":"string"}},"required":["cmd"]}
            (root/"requests/request.request.json").write_text(json.dumps({
                "tools":[{"type":"function","name":"exec_command","parameters":schema}]}))
            native={"outcome":"builder-invalid-tool-call","request_id":"request",
                "tool_parser_error":"error parsing tool call: raw='generated application source', err=invalid character ']' after object key:value pair"}
            result=tool_diagnostics([native],root)[0]
            self.assertEqual("invalid character ']' after object key:value pair",result["observed_parser_error"])
            self.assertEqual([{"name":"exec_command","parameters":schema}],result["supplied_tool_schemas"])
            self.assertNotIn("generated application source",json.dumps(result))
            self.assertIn("generated application source",native["tool_parser_error"])
    def test_successful_requests_do_not_produce_failure_feedback(self):
        self.assertEqual([],tool_diagnostics([{"outcome":"response.completed"}],Path("/unused")))
