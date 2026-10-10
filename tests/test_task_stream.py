import json
import shutil
import tempfile
import unittest
from pathlib import Path
from orchestrator.evidence import digest_bytes
from orchestrator.task_stream import freeze_round,task_stream,suite_for_stage,verify_replay,verify_discovery_recovery

class TaskStreamTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.run=self.root/'run';self.run.mkdir()
        folder=self.run/'tasks/task-001';folder.mkdir(parents=True);(folder/'packet.md').write_text('shared first task')
        manifest={'execution':{'task_stream_revision':'append-only-rounds-v1'},'tasks':[{'task_id':'task-001','stage':1,'packet_sha256':digest_bytes(b'shared first task'),'suite_hash':'base-suite'}]}
        (self.run/'manifest.json').write_text(json.dumps(manifest))
        self.suite=self.root/'suite';self.suite.mkdir();(self.suite/'playwright.config.mjs').write_text('trusted PM config');(self.suite/'checks.mjs').write_text('cumulative tests')
        self.counts={'acceptance':7,'postrestart':1,'upgrade':1}
    def test_append_preserves_original_manifest_and_shared_cumulative_packet(self):
        before=(self.run/'manifest.json').read_bytes()
        record=freeze_round(self.run,'shared second task',self.suite,self.counts)
        self.assertEqual(len(task_stream(self.run)),2)
        self.assertEqual(record['stage'],2)
        self.assertEqual(before,(self.run/'manifest.json').read_bytes())
        self.assertEqual((suite_for_stage(self.run,2)/'checks.mjs').read_text(),'cumulative tests')
        self.assertIn('shared first task',(self.run/'tasks/task-002/packet.md').read_text())
    def test_changed_packet_or_suite_rejected(self):
        freeze_round(self.run,'shared second task',self.suite,self.counts)
        (self.run/'tasks/task-002/suite/checks.mjs').write_text('weakened tests')
        with self.assertRaisesRegex(ValueError,'suite changed'):task_stream(self.run)
    def test_exact_replay_checks_every_packet_and_suite(self):
        freeze_round(self.run,'shared second task',self.suite,self.counts)
        replay=self.root/'replay';shutil.copytree(self.run,replay)
        self.assertTrue(verify_replay(self.run,replay)['verified'])
        (replay/'tasks/task-002/packet.md').write_text('tailored hint')
        with self.assertRaises(ValueError):verify_replay(self.run,replay)
    def test_unapproved_stream_and_missing_phases_rejected(self):
        with self.assertRaises(ValueError):freeze_round(self.run,'next',self.suite,{'acceptance':7})
        manifest=json.loads((self.run/'manifest.json').read_text());manifest['execution']={}
        (self.run/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError,'authorize'):freeze_round(self.run,'next',self.suite,self.counts)

    def test_discovery_recovery_extends_exact_prefix_but_confirmation_cannot(self):
        freeze_round(self.run,'shared second task',self.suite,self.counts)
        recovery=self.root/'recovery';shutil.copytree(self.run,recovery)
        freeze_round(recovery,'new third discovery task',self.suite,self.counts)
        result=verify_discovery_recovery(self.run,recovery)
        self.assertEqual(result['inherited_checkpoints'],2)
        self.assertEqual(result['new_discovery_checkpoints'],1)
        with self.assertRaisesRegex(ValueError,'omits or adds'):verify_replay(self.run,recovery)

    def test_discovery_recovery_refuses_changed_or_omitted_inherited_tasks(self):
        recovery=self.root/'recovery';shutil.copytree(self.run,recovery)
        freeze_round(self.run,'shared second task',self.suite,self.counts)
        with self.assertRaisesRegex(ValueError,'omits inherited'):verify_discovery_recovery(self.run,recovery)
        shutil.rmtree(recovery);shutil.copytree(self.run,recovery)
        (recovery/'tasks/task-002/suite/checks.mjs').write_text('weakened inherited suite')
        with self.assertRaisesRegex(ValueError,'suite changed'):verify_discovery_recovery(self.run,recovery)

class StreamSealTests(TaskStreamTests):
    def test_seal_cannot_truncate_or_extend_declared_pilot(self):
        from orchestrator.task_stream import seal_pilot_stream,stream_sealed
        manifest=json.loads((self.run/'manifest.json').read_text());manifest.update(purpose='engineering-longitudinal-pilot',evidence_policy={'minimum_frozen_tasks':2})
        (self.run/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):seal_pilot_stream(self.run)
        freeze_round(self.run,'second',self.suite,self.counts)
        seal_pilot_stream(self.run)
        self.assertTrue(stream_sealed(self.run))
        with self.assertRaises(ValueError):freeze_round(self.run,'third',self.suite,self.counts)
    def test_pilot_seal_cannot_claim_research_stopping(self):
        from orchestrator.task_stream import seal_pilot_stream
        manifest=json.loads((self.run/'manifest.json').read_text());manifest['purpose']='exploratory'
        (self.run/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError,'confirmation'):seal_pilot_stream(self.run)

    def test_numeric_task_order_survives_three_digit_boundary(self):
        folder=self.run/'tasks/task-998';folder.mkdir();(folder/'packet.md').write_text('prefix')
        manifest=json.loads((self.run/'manifest.json').read_text());manifest['tasks']=[{'task_id':'task-998','stage':998,'packet_sha256':digest_bytes(b'prefix'),'suite_hash':'base-suite'}]
        (self.run/'manifest.json').write_text(json.dumps(manifest))
        freeze_round(self.run,'task999',self.suite,self.counts)
        freeze_round(self.run,'task1000',self.suite,self.counts)
        self.assertEqual([t['stage'] for t in task_stream(self.run)],[998,999,1000])
