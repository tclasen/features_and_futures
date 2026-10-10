"""Observe every inference request while keeping real credentials on the PM host."""
import base64
import json
import secrets
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .evidence import append_json, canonical, digest_bytes, native_counts, price_counts


class InferenceGateway:
    def __init__(self, ledger, prices, port=0, local_endpoint="http://127.0.0.1:11434", native_usage_path=None,
                 observation_lifecycle="legacy-drain-30s-v1"):
        if observation_lifecycle not in ("legacy-drain-30s-v1", "drain-upstream-and-partial-response-v1"):
            raise ValueError("Unsupported inference observation lifecycle")
        self.retain_pending = observation_lifecycle == "drain-upstream-and-partial-response-v1"
        self.ledger = ledger
        self.prices = prices
        self.local_endpoint = local_endpoint
        self.native_usage_path = Path(native_usage_path) if native_usage_path else None
        self.active = None
        self.lock = threading.Lock()
        self.idle = threading.Condition()
        self.inflight = 0
        gateway = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                # Native Pi may initially attempt websocket; force SSE fallback.
                self.send_error(405, "Only metered inference POST requests are supported.")

            def do_POST(self):
                gateway.ledger.event("gateway_post_observed",route=self.path,content_length=self.headers.get("Content-Length"),content_encoding=self.headers.get("Content-Encoding"))
                with gateway.lock:
                    lease = dict(gateway.active) if gateway.active else None
                key = self.headers.get("Authorization", "").removeprefix("Bearer ")
                if not lease or not secrets.compare_digest(key, lease["key"]):
                    self.send_error(403, "Inactive or incorrect inference lease.")
                    return
                prefix="/attempts/" + __import__("hashlib").sha256(key.encode()).hexdigest()[:24]
                route=self.path.removeprefix(prefix)
                if route not in {"/v1/responses", "/codex/responses",
                                     "/v1/codex/responses", "/v1/chat/completions"}:
                    self.send_error(404, "Not an inference route.")
                    return
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 32 * 1024 * 1024:
                    self.send_error(413, "Invalid inference request size.")
                    return
                body = self.rfile.read(length)
                encoding = self.headers.get('Content-Encoding', '').lower()
                if encoding == 'zstd':
                    from compression import zstd
                    body = zstd.decompress(body)
                elif encoding == 'gzip':
                    import gzip
                    body = gzip.decompress(body)
                try:
                    payload = json.loads(body)
                except ValueError:
                    self.send_error(400, "Expected JSON.")
                    return
                if payload.get("model") != lease["model"]:
                    self.send_error(403, "Model differs from frozen builder configuration.")
                    return
                def allowed_tools(items):
                    return all(tool.get("type") in {"function", "custom", "namespace"}
                               and (tool.get("type") != "namespace" or allowed_tools(tool.get("tools", [])))
                               for tool in items)
                def external_content(value):
                    if isinstance(value, dict):
                        if value.get("type") in {"input_image", "input_file", "image_url", "file"}:
                            return True
                        return any(external_content(v) for v in value.values())
                    return isinstance(value, list) and any(external_content(v) for v in value)
                if not allowed_tools(payload.get("tools", [])) or external_content(payload.get("input", payload.get("messages", []))):
                    self.send_error(403, "Hosted tools and external file/image retrieval are not permitted.")
                    return
                with gateway.idle:
                    gateway.inflight += 1
                try:
                    gateway.relay(self, lease, payload, body)
                finally:
                    with gateway.idle:
                        gateway.inflight -= 1
                        gateway.idle.notify_all()

        # sbx's host proxy can reach a loopback listener via host.docker.internal.
        self.server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.server.daemon_threads = not self.retain_pending
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def port(self):
        return self.server.server_port

    def lease(self, model, builder_id, task_id, attempt_id, provider):
        if provider == "ollama" and self.local_endpoint is None:
            raise ValueError("Local inference is disabled for this run")
        claim = {"https://api.openai.com/auth": {
            "chatgpt_account_id": "pilot-local-lease"}, "nonce": secrets.token_hex(24)}
        encoded = base64.urlsafe_b64encode(canonical(claim).encode()).decode().rstrip("=")
        key = "e30." + encoded + "." + secrets.token_hex(24)
        with self.lock:
            self.active = {
                "key": key, "model": model, "builder_id": builder_id,
                "task_id": task_id, "attempt_id": attempt_id, "provider": provider,
            }
        return key

    def wait_idle(self, timeout=30):
        with self.idle:
            if not self.idle.wait_for(lambda: self.inflight == 0, timeout=timeout):
                raise RuntimeError('Inference observations have not settled.')

    def revoke(self):
        # A native harness can time out while its upstream stream is still live.
        # Keep observing that stream through its own transport timeout; a short
        # PM drain deadline must not discard its terminal accounting.
        if self.retain_pending:
            self.wait_idle(timeout=None)
        else:
            self.wait_idle()
        with self.lock:
            self.active = None

    def close(self):
        self.revoke()
        self.server.shutdown()
        self.server.server_close()

    def relay(self, handler, lease, payload, original):
        request_id = str(uuid.uuid4())
        identity = {k: lease[k] for k in (
            "model", "builder_id", "task_id", "attempt_id", "provider")}
        start = self.ledger.event("inference_request_started", request_id=request_id,
                                  payload_sha256=digest_bytes(original), **identity)
        raw_dir = (self.ledger.root / "tasks" / lease["task_id"] / "attempts" /
                   lease["builder_id"] / lease["attempt_id"] / "requests")
        raw_dir.mkdir(parents=True, exist_ok=True)
        (raw_dir / f"{request_id}.request.json").write_bytes(original)
        headers = {"Content-Type": "application/json", "Accept-Encoding": "identity"}
        if lease["provider"] == "subscription":
            credentials = json.loads(
                (Path.home() / ".pi" / "agent" / "auth.json").read_text()
            )["openai-codex"]
            headers["Authorization"] = "Bearer " + credentials["access"]
            headers["chatgpt-account-id"] = credentials["accountId"]
            headers["OpenAI-Beta"] = "responses=experimental"
            headers["originator"] = handler.headers.get("originator", "codex_cli_rs")
            headers["User-Agent"] = handler.headers.get("User-Agent", "features-and-futures")
            url = "https://chatgpt.com/backend-api/codex/responses"
        else:
            route = "/v1/chat/completions" if handler.path.endswith(
                "/chat/completions") else "/v1/responses"
            url = self.local_endpoint + route
            headers["X-FF-Request-ID"] = request_id
        usage = None
        response_id = None
        actual_model = None
        outcome = "missing-terminal-usage"
        status = None
        sent_headers = False
        raw = bytearray()
        partial_file = raw_dir / f"{request_id}.response.partial"
        partial = partial_file.open("wb") if self.retain_pending else None
        try:
            request = urllib.request.Request(url, original, headers, method="POST")
            with urllib.request.urlopen(request, timeout=1800) as upstream:
                status = upstream.status
                handler.send_response(status)
                handler.send_header("Content-Type", "text/event-stream" if payload.get("stream") else upstream.headers.get(
                    "Content-Type", "application/json"))
                handler.send_header("Cache-Control", "no-store")
                handler.send_header("Connection", "close")
                handler.end_headers()
                sent_headers = True
                handler.close_connection = True
                if payload.get("stream") or "event-stream" in upstream.headers.get("Content-Type", ""):
                    while True:
                        line = upstream.readline()
                        if not line:
                            break
                        raw.extend(line)
                        if partial is not None:
                            partial.write(line)
                            partial.flush()
                        try:
                            handler.wfile.write(line)
                            handler.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError):
                            # Finish observing upstream usage even if client disconnected.
                            pass
                        if line.startswith(b"data:"):
                            try:
                                item = json.loads(line[5:].strip())
                            except ValueError:
                                continue
                            response = item.get("response") or item
                            if response.get("usage"):
                                usage = response["usage"]
                                response_id = response.get("id", response_id)
                                actual_model = response.get("model", actual_model)
                                outcome = item.get("type", "terminal-usage")
                                if item.get("type") in {"response.completed", "response.done", "response.incomplete"} or "choices" in item:
                                    try:
                                        handler.wfile.write(bytes([10]))
                                        handler.wfile.flush()
                                    except (BrokenPipeError, ConnectionResetError):
                                        pass
                                    break
                else:
                    raw.extend(upstream.read())
                    item = json.loads(raw)
                    usage = item.get("usage")
                    response_id = item.get("id")
                    actual_model = item.get("model")
                    outcome = "terminal-json"
                    handler.wfile.write(raw)
        except urllib.error.HTTPError as error:
            status = error.code
            raw.extend(error.read())
            outcome = "upstream-http-error"
            if not sent_headers:
                handler.send_response(status)
                handler.send_header("Content-Type", "application/json")
                handler.send_header("Content-Length", str(len(raw)))
                handler.end_headers()
                handler.wfile.write(raw)
        except Exception as error:
            outcome = "gateway-error:" + type(error).__name__
            if not sent_headers:
                handler.send_error(502, "Inference gateway transport failed.")
        finally:
            if partial is not None:
                partial.close()
            response_file = raw_dir / f"{request_id}.response.raw"
            response_file.write_bytes(raw)
            if partial is not None:
                partial_file.unlink()
            native_observations = []
            parser_error = None
            usage_source = "compatible-api-terminal-counters"
            api_usage = usage
            if lease["provider"] == "ollama" and self.native_usage_path and self.native_usage_path.exists():
                for line in self.native_usage_path.read_text().splitlines():
                    try:
                        observed = json.loads(line)
                    except ValueError:
                        continue
                    if observed.get("request_id") == request_id:
                        native_observations.append(observed)
                completed = [e for e in native_observations if e["kind"] == "native_generation_completed"]
                errors = [e for e in native_observations if e["kind"] == "tool_parser_error"]
                if len(completed) == 1:
                    native = completed[0]["usage"]
                    if usage:
                        a, b = native_counts(usage), native_counts(native)
                        if any(a[k] != b[k] for k in ("input_tokens", "cached_input_tokens", "output_tokens")):
                            outcome += ":native-counter-mismatch"
                            usage = None
                        else:
                            usage_source = "compatible-api-verified-against-native-runner"
                    else:
                        usage = native
                        usage_source = "native-runner-before-compatible-api-tool-parsing"
                    if errors:
                        parser_error = errors[-1]["error"]
                        outcome = "builder-invalid-tool-call"
                else:
                    outcome += ":missing-or-duplicate-native-observation"
                (raw_dir / f"{request_id}.native-usage.json").write_text(canonical(native_observations)+"\n")
            try:
                counts = native_counts(usage)
                pricing = price_counts(counts, self.prices[lease["model"]]["pricing"])
            except (ValueError, KeyError):
                counts = pricing = None
                outcome += ":invalid-or-unmapped-usage"
            record = {
                "schema_version": 1, **self.ledger.identity, **identity,
                "request_id": request_id, "response_id": response_id,
                "actual_model": actual_model, "started_monotonic_ns": start["monotonic_ns"],
                "ended_monotonic_ns": time.monotonic_ns(), "clock_id": self.ledger.clock_id,
                "status": status, "outcome": outcome, "usage": usage,
                "api_usage": api_usage, "usage_source": usage_source,
                "tool_parser_error": parser_error,
                "native_observations_sha256": digest_bytes(canonical(native_observations).encode()) if native_observations else None,
                "counts": counts, "cost": pricing, "counting_method": "native-provider-counters",
                "request_sha256": digest_bytes(original),
                "response_sha256": digest_bytes(bytes(raw)),
                "pricing_snapshot_sha256": self.prices[lease["model"]]["snapshot_sha256"],
                "pricing_reference": self.prices[lease["model"]]["reference_id"],
            }
            append_json(self.ledger.root / "usage.jsonl", record)
            self.ledger.event("inference_request_finished", request_id=request_id,
                              counts_complete=counts is not None, outcome=outcome, **identity)
