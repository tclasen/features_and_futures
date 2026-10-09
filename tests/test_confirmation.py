import tempfile
import unittest
from pathlib import Path
from orchestrator.confirmation import FAMILY, MODELS, HARNESSES, trajectory_contrasts, record_look, confirmed_stop
from orchestrator.evidence import read_jsonl

class ConfirmationLedgerTests(unittest.TestCase):
    def replicates(self, prefix, n=20):
        return [{'run_id':prefix+str(i),'contrasts':{key:'0' if key.endswith('|first_rejection') else '1' for key in FAMILY}} for i in range(n)]
    def test_complete_hosted_family_and_two_independent_batches(self):
        self.assertEqual(len(FAMILY),36)
        with tempfile.TemporaryDirectory() as tmp:
            journal=Path(tmp)/'looks.jsonl'
            record_look(journal,'first',self.replicates('a'),'candidate','plan')
            self.assertFalse(confirmed_stop(read_jsonl(journal))['confirmed'])
            record_look(journal,'second',self.replicates('b'),'candidate','plan')
            self.assertTrue(confirmed_stop(read_jsonl(journal))['confirmed'])
    def test_failure_consumes_look_and_run_reuse_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal=Path(tmp)/'looks.jsonl'
            record_look(journal,'first',self.replicates('a'),'candidate','plan')
            with self.assertRaises(ValueError):record_look(journal,'second',self.replicates('a'),'candidate','plan')
            record_look(journal,'second',self.replicates('b'),'candidate','plan')
            starts=[r for r in read_jsonl(journal) if r['kind']=='confirmation_look_started']
            self.assertEqual([r['look'] for r in starts],[1,2,3])
    def test_invalid_evidence_load_consumes_look_before_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal=Path(tmp)/'looks.jsonl'
            def missing():raise ValueError('Missing native counters')
            with self.assertRaises(ValueError):record_look(journal,'first',[{'run_id':'bad'}],'candidate','plan',evidence_loader=missing)
            record_look(journal,'first',self.replicates('a'),'candidate','plan')
            starts=[r for r in read_jsonl(journal) if r['kind']=='confirmation_look_started']
            self.assertEqual([r['look'] for r in starts],[1,2])

    def test_small_samples_never_stop(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal=Path(tmp)/'looks.jsonl'
            record_look(journal,'first',self.replicates('a',1),'candidate','plan')
            record_look(journal,'second',self.replicates('b',1),'candidate','plan')
            self.assertFalse(confirmed_stop(read_jsonl(journal))['confirmed'])
    def test_actual_run_aggregate_preserves_rejected_time_and_cost(self):
        configs=[];rows=[];task_ids=[f'task-{i:03d}' for i in range(21,31)]
        for model in MODELS:
            for harness in HARNESSES:
                for profile in ('none','minimal','maximum'):
                    bid=f'{model}-{harness}-{profile}';configs.append({'builder_id':bid,'model':model,'harness':harness,'profile':profile})
                    for task in task_ids:
                        rows.append({'builder_id':bid,'task_id':task,'accepted':True,'builder_execution_nanoseconds':200 if profile=='maximum' else 100,'uncached_reference_usd':'2' if profile=='maximum' else '1','first_submission_accepted':profile!='maximum'})
        results=trajectory_contrasts(configs,rows,task_ids)
        self.assertEqual(results['gpt-6-luna|pi|maximum|none|execution'],'2')
        self.assertEqual(results['gpt-6-luna|pi|maximum|none|reference_cost'],'2')
        self.assertEqual(results['gpt-6-luna|pi|maximum|none|first_rejection'],'1')
        with self.assertRaises(ValueError):trajectory_contrasts(configs,rows[:-1],task_ids)
