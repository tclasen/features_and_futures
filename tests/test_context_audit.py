import json
import tempfile
import unittest
from pathlib import Path
from orchestrator.audit_context import audit, compaction_metadata
from orchestrator.audit_native_receipts import sha


class ContextAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.prices={'model':{'pricing':{'prompt':'0.000001','completion':'0.000002'}}}
        request=json.dumps({'client_metadata':{'x-codex-turn-metadata':json.dumps({'request_kind':'compaction','compaction':{'trigger':'auto'}})}}).encode()
        usage={'input_tokens':100,'output_tokens':20}
        raw=json.dumps({'usage':usage}).encode()
        folder=self.root/'tasks/context/attempts/b001/a001/requests'
        folder.mkdir(parents=True)
        (folder/'request.request.json').write_bytes(request)
        (folder/'request.response.raw').write_bytes(raw)
        self.record={'request_id':'request','task_id':'context','builder_id':'b001','attempt_id':'a001',
                     'response_sha256':sha(raw),'request_sha256':sha(request),'api_usage':usage,'model':'model',
                     'counts':{'input_tokens':100,'cached_input_tokens':0,'output_tokens':20},
                     'cost':{'uncached_reference_usd':'0.000140','cache_aware_usd':'0.000140'},'status':200}
        (self.root/'result.json').write_text(json.dumps({'harness':'codex','model':'model','exit_code':0,'canary_preserved':True,'native_compaction_events':[]}))
        self.events=[{'kind':k,'request_id':'request'} for k in ('inference_request_started','inference_request_finished')]
        self.save()

    def save(self):
        (self.root/'usage.jsonl').write_text(json.dumps(self.record)+'\n')
        (self.root/'events.jsonl').write_text(''.join(json.dumps(e)+'\n' for e in self.events))

    def test_native_compaction_receipt_and_cost_verified(self):
        result=audit(self.root,self.prices)
        self.assertTrue(result['verified'])
        self.assertEqual(len(result['compaction_requests']),1)

    def test_missing_finished_request_rejected(self):
        self.events.pop()
        self.save()
        self.assertFalse(audit(self.root,self.prices)['verified'])

    def test_compaction_cost_cannot_be_omitted(self):
        self.record['cost']['uncached_reference_usd']='0'
        self.save()
        self.assertFalse(audit(self.root,self.prices)['verified'])

    def test_plain_turn_does_not_prove_compaction(self):
        self.assertIsNone(compaction_metadata({'client_metadata':{'x-codex-turn-metadata':json.dumps({'request_kind':'turn','compaction':{'trigger':'auto'}})}}))
        self.assertIsNone(compaction_metadata({'client_metadata':{'x-codex-turn-metadata':'invalid'}}))

if __name__=='__main__': unittest.main()
