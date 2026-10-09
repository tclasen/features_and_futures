import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from orchestrator.pilot import execute_round,record_round_completion
from orchestrator.evidence import Ledger,read_jsonl
from orchestrator.gateway import InferenceGateway
from orchestrator.audit_request_coverage import reconcile

class Upstream(io.BytesIO):
    status=200
    headers={"Content-Type":"text/event-stream"}

class ParallelRoundTests(unittest.TestCase):
    def test_resume_preserves_one_original_round_barrier_and_rejects_missing_builder(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger=Ledger(Path(directory),{"run_id":"fixture"})
            builders=[{"builder_id":"a"},{"builder_id":"b"}]
            task={"task_id":"one","stage":1}
            state={"accepted":{"a":{"stage":1}}}
            with self.assertRaises(RuntimeError):record_round_completion(ledger,state,builders,task)
            state["accepted"]["b"]={"stage":1}
            record_round_completion(ledger,state,builders,task)
            record_round_completion(ledger,state,builders,task)
            self.assertEqual(len(read_jsonl(ledger.root/"events.jsonl")),1)

    def test_workers_overlap_but_next_requirement_waits_for_slowest(self):
        first_round=threading.Barrier(2)
        release=threading.Event();fast_finished=threading.Event();next_round=threading.Event()
        errors=[]
        def work(builder):
            first_round.wait(timeout=5)
            if builder=="slow":
                if not release.wait(5):raise RuntimeError("Fixture release missing")
            else:fast_finished.set()
        def coordinator():
            try:
                execute_round(["slow","fast"],2,work,threading.Event())
                execute_round(["slow","fast"],2,lambda b:next_round.set(),threading.Event())
            except BaseException as error:errors.append(error)
        thread=threading.Thread(target=coordinator);thread.start()
        try:
            self.assertTrue(fast_finished.wait(5));self.assertFalse(next_round.is_set())
        finally:release.set();thread.join(5)
        self.assertFalse(thread.is_alive());self.assertEqual(errors,[]);self.assertTrue(next_round.is_set())

    def test_worker_failure_blocks_next_round_and_signals_other_workers(self):
        stop=threading.Event()
        def broken(builder):raise RuntimeError("original infrastructure failure")
        with self.assertRaisesRegex(RuntimeError,"original infrastructure failure"):
            execute_round(["one"],1,broken,stop)
        self.assertTrue(stop.is_set())

    def test_twelve_simultaneous_gateways_keep_lease_and_accounting_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger=Ledger(Path(directory),{"run_id":"parallel-fixture"})
            prices={"fixture-model":{"pricing":{"prompt":"0.000002","completion":"0.00001"},"reference_id":"fixture/reference","snapshot_sha256":"fixture-snapshot"}}
            gateways=[InferenceGateway(ledger,prices) for i in range(12)]
            keys=[g.lease("fixture-model",f"b{i:03d}","task-001","attempt-001","ollama") for i,g in enumerate(gateways)]
            original=urllib.request.urlopen;barrier=threading.Barrier(12)
            def upstream(request,**kwargs):
                if request.full_url.startswith("http://127.0.0.1:11434"):
                    payload=json.loads(request.data);barrier.wait(timeout=10)
                    native={"type":"response.completed","response":{"id":f"response-{payload['fixture_index']}","model":"fixture-model","usage":{"input_tokens":payload["fixture_index"]+10,"output_tokens":2}}}
                    return Upstream(b"data: "+json.dumps(native).encode()+b"\n\n")
                return original(request,**kwargs)
            def call(i,key=None):
                request=urllib.request.Request(f"http://127.0.0.1:{gateways[i].port}/v1/responses",json.dumps({"model":"fixture-model","stream":True,"fixture_index":i}).encode(),{"Authorization":"Bearer "+(keys[i] if key is None else key),"Content-Type":"application/json"},method="POST")
                with original(request,timeout=15) as response:return response.read()
            try:
                with self.assertRaises(urllib.error.HTTPError) as error:call(0,key=keys[1])
                self.assertEqual(error.exception.code,403)
                with patch("orchestrator.gateway.urllib.request.urlopen",side_effect=upstream):
                    with ThreadPoolExecutor(max_workers=12) as pool:
                        self.assertTrue(all(pool.map(call,range(12))))
                for g in gateways:g.wait_idle()
                rows=read_jsonl(ledger.root/"usage.jsonl")
                self.assertEqual(len(rows),12)
                self.assertEqual({r["builder_id"]:r["counts"]["input_tokens"] for r in rows},{f"b{i:03d}":i+10 for i in range(12)})
                self.assertTrue(reconcile(read_jsonl(ledger.root/"events.jsonl"),rows,True)["complete_run_request_coverage"])
                gateways[0].revoke()
                self.assertIsNotNone(gateways[1].active)
                with self.assertRaises(urllib.error.HTTPError) as error:call(0)
                self.assertEqual(error.exception.code,403)
            finally:
                for g in gateways:g.close()
