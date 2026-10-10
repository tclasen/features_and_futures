import io
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

from orchestrator.evidence import Ledger, read_jsonl
from orchestrator.gateway import InferenceGateway


class Upstream(io.BytesIO):
    status = 200
    headers = {"Content-Type": "text/plain"}


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.ledger = Ledger(Path(self.temp.name), {"run_id": "fixture"})
        self.gateway = InferenceGateway(self.ledger, {
            "fixture-model": {
                "pricing": {"prompt": "0.000002", "completion": "0.00001"},
                "reference_id": "fixture/reference", "snapshot_sha256": "fixture-snapshot",
            }
        }, observation_lifecycle='drain-upstream-and-partial-response-v1')
        self.addCleanup(self.gateway.close)
        self.key = self.gateway.lease("fixture-model", "builder", "task", "attempt", "ollama")
        self.original_urlopen = urllib.request.urlopen
        self.base = f"http://127.0.0.1:{self.gateway.port}"

    def call(self, payload, key=None):
        return self.original_urlopen(urllib.request.Request(
            self.base + "/v1/responses", json.dumps(payload).encode(),
            {"Authorization": "Bearer " + (key if key is not None else self.key),
             "Content-Type": "application/json"}, method="POST"), timeout=10)

    def test_hosted_run_disables_local_inference_leases(self):
        self.gateway.local_endpoint=None
        with self.assertRaises(ValueError):
            self.gateway.lease("fixture-model","builder","task","attempt","ollama")
        self.assertIsInstance(self.gateway.lease("fixture-model","builder","task","attempt","subscription"),str)

    def test_legacy_lifecycle_keeps_frozen_drain_behavior(self):
        legacy = InferenceGateway(self.ledger, {}, local_endpoint=None)
        try:
            self.assertTrue(legacy.server.daemon_threads)
            with patch.object(legacy, 'wait_idle') as wait_idle:
                legacy.revoke()
                wait_idle.assert_called_once_with()
        finally:
            legacy.close()

    def test_incorrect_and_revoked_leases_cannot_infer(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.call({"model": "fixture-model"}, key="wrong")
        self.assertEqual(403, error.exception.code)
        self.gateway.revoke()
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.call({"model": "fixture-model"})
        self.assertEqual(403, error.exception.code)
        self.assertEqual([], read_jsonl(self.ledger.root / "usage.jsonl"))

    def test_other_models_are_not_available_through_the_gateway(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.call({"model": "other-model"})
        self.assertEqual(403, error.exception.code)

    def test_native_sse_usage_is_logged_even_with_plain_content_type(self):
        payload = {"model": "fixture-model", "stream": True, "input": "hello"}
        native = {"type": "response.completed", "response": {
            "id": "response-one", "model": "fixture-model",
            "usage": {"input_tokens": 3, "output_tokens": 2},
        }}
        response = b"event: response.completed\ndata: " + json.dumps(native).encode() + b"\n\n"
        def upstream(request, **kwargs):
            if request.full_url.startswith("http://127.0.0.1:11434"):
                self.assertEqual(payload, json.loads(request.data))
                return Upstream(response)
            return self.original_urlopen(request, **kwargs)
        with patch("orchestrator.gateway.urllib.request.urlopen", side_effect=upstream):
            with self.call(payload) as result:
                returned = result.read()
                self.assertIn(b"response.completed", returned)
            self.gateway.wait_idle()
        rows = read_jsonl(self.ledger.root / "usage.jsonl")
        self.assertEqual(1, len(rows))
        self.assertEqual(3, rows[0]["counts"]["input_tokens"])
        self.assertEqual(2, rows[0]["counts"]["output_tokens"])
        self.assertEqual("response-one", rows[0]["response_id"])
        self.assertEqual("fixture-snapshot", rows[0]["pricing_snapshot_sha256"])
        self.assertIsNotNone(rows[0]["cost"])

    def test_disconnected_client_retains_partial_stream_and_drains_terminal_usage(self):
        blocked = threading.Event()
        release = threading.Event()
        first = b'data: {"type":"response.created"}\n'
        terminal = b'data: {"type":"response.completed","response":{"id":"late","usage":{"input_tokens":17,"output_tokens":9}}}\n'

        class DelayedStream(Upstream):
            def __init__(self):
                super().__init__(first + terminal)
                self.lines = 0

            def readline(self, *args):
                self.lines += 1
                if self.lines == 2:
                    blocked.set()
                    if not release.wait(5):
                        raise TimeoutError('Synthetic upstream was not released')
                return super().readline(*args)

        def upstream(request, **kwargs):
            if request.full_url.startswith('http://127.0.0.1:11434'):
                return DelayedStream()
            return self.original_urlopen(request, **kwargs)

        errors = []
        def revoke():
            try:
                self.gateway.revoke()
            except BaseException as error:
                errors.append(error)

        with patch('orchestrator.gateway.urllib.request.urlopen', side_effect=upstream), \
                patch.object(self.gateway, 'wait_idle', wraps=self.gateway.wait_idle) as wait_idle:
            thread = None
            try:
                client = self.call({'model': 'fixture-model', 'stream': True})
                self.assertTrue(blocked.wait(2))
                client.close()
                partial = list(self.ledger.root.glob('tasks/**/requests/*.response.partial'))
                self.assertEqual(1, len(partial))
                self.assertEqual(first, partial[0].read_bytes())
                self.assertEqual([], read_jsonl(self.ledger.root / 'usage.jsonl'))
                thread = threading.Thread(target=revoke)
                thread.start()
                thread.join(.1)
                self.assertTrue(thread.is_alive())
                wait_idle.assert_called_once_with(timeout=None)
                self.assertFalse(self.gateway.server.daemon_threads)
            finally:
                release.set()
                if thread:
                    thread.join(3)
            self.assertFalse(thread.is_alive())
            self.assertEqual([], errors)
        rows = read_jsonl(self.ledger.root / 'usage.jsonl')
        self.assertEqual(1, len(rows))
        self.assertEqual(17, rows[0]['counts']['input_tokens'])
        self.assertEqual(9, rows[0]['counts']['output_tokens'])
        finished = [e for e in read_jsonl(self.ledger.root / 'events.jsonl')
                    if e['kind'] == 'inference_request_finished']
        self.assertEqual(1, len(finished))
        response = list(self.ledger.root.glob('tasks/**/requests/*.response.raw'))
        self.assertEqual(first + terminal, response[0].read_bytes())
        self.assertEqual([], list(self.ledger.root.glob('tasks/**/requests/*.response.partial')))
        self.assertIsNone(self.gateway.active)

    def test_failed_tool_parse_retains_native_consumption(self):
        sidecar=Path(self.temp.name)/"native.jsonl"
        self.gateway.native_usage_path=sidecar
        def upstream(request, **kwargs):
            if request.full_url.startswith("http://127.0.0.1:11434"):
                identity=request.headers["X-ff-request-id"]
                records=[{"kind":"native_generation_completed","request_id":identity,
                    "usage":{"input_tokens":31,"output_tokens":7}},
                    {"kind":"tool_parser_error","request_id":identity,"error":"invalid generated JSON"}]
                sidecar.write_text("\n".join(json.dumps(r) for r in records)+"\n")
                raise urllib.error.HTTPError(request.full_url,500,"invalid tool arguments",{},
                    io.BytesIO(b'{"error":"invalid generated JSON"}'))
            return self.original_urlopen(request,**kwargs)
        with patch("orchestrator.gateway.urllib.request.urlopen",side_effect=upstream):
            with self.assertRaises(urllib.error.HTTPError) as caught:
                self.call({"model":"fixture-model","input":"hello"})
            self.assertEqual(500,caught.exception.code)
            self.gateway.wait_idle()
        record=read_jsonl(self.ledger.root/"usage.jsonl")[0]
        self.assertEqual(31,record["counts"]["input_tokens"])
        self.assertEqual(7,record["counts"]["output_tokens"])
        self.assertEqual("builder-invalid-tool-call",record["outcome"])
        self.assertIsNotNone(record["cost"])
        self.assertIsNotNone(record["native_observations_sha256"])

    def test_native_counter_disagreement_is_missing_evidence(self):
        sidecar=Path(self.temp.name)/"native.jsonl"
        self.gateway.native_usage_path=sidecar
        def upstream(request,**kwargs):
            if request.full_url.startswith("http://127.0.0.1:11434"):
                sidecar.write_text(json.dumps({"kind":"native_generation_completed",
                    "request_id":request.headers["X-ff-request-id"],
                    "usage":{"input_tokens":99,"output_tokens":2}})+"\n")
                return Upstream(json.dumps({"usage":{"input_tokens":3,"output_tokens":2}}).encode())
            return self.original_urlopen(request,**kwargs)
        with patch("orchestrator.gateway.urllib.request.urlopen",side_effect=upstream):
            with self.call({"model":"fixture-model","input":"hello"}) as result:result.read()
            self.gateway.wait_idle()
        record=read_jsonl(self.ledger.root/"usage.jsonl")[0]
        self.assertIsNone(record["counts"])
        self.assertIsNone(record["cost"])
        self.assertIn("native-counter-mismatch",record["outcome"])

    def test_gateway_does_not_expose_arbitrary_host_urls(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.original_urlopen(self.base + "/api/tags", timeout=10)
        self.assertEqual(405, error.exception.code)


if __name__ == "__main__":
    unittest.main()
