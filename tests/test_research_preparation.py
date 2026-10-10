import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from orchestrator.prepare_evaluation import research_inputs, register_confirmation
from orchestrator.prepare import InfrastructureError, write_json
from orchestrator.evidence import digest_bytes, digest_json, read_jsonl
from orchestrator.retained_incidents import POLICY, ASSESSMENT
from orchestrator.bounded_confirmation import METHOD


class ResearchPreparationTests(unittest.TestCase):
    def plans(self, root):
        for revision in ('research-v001','research-v002','research-v003','research-v004','research-v005','research-v006'):
            plan={'revision_id':revision,'status':'frozen-before-main-dispatch','execution':{}}
            if revision in ('research-v002','research-v003','research-v004','research-v005','research-v006'):plan.update(analysis_method=METHOD,submission_outcome_definition=ASSESSMENT,execution={'provider_incident_policy':POLICY})
            write_json(root/'experiments/instruction-effects/revisions'/revision/'analysis-plan.json',plan)

    def test_new_revision_selects_bound_rules_while_default_and_replays_preserve_their_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.plans(root)
            source={'experiment_revision':'pilot-v015','execution':{'timing_revision':'harness-return-v2'}}
            with patch('orchestrator.prepare_evaluation.ROOT',root):
                revision,research,execution=research_inputs(source)
                self.assertEqual(revision,'research-v001');self.assertNotIn('provider_incident_policy',execution)
                revision,research,execution=research_inputs(source,'research-v002')
                self.assertEqual(execution['provider_incident_policy'],POLICY)
                self.assertEqual(research['analysis_method'],METHOD)
                discovery={'experiment_revision':revision,'research':research,'execution':execution}
                self.assertEqual(research_inputs(discovery,replay=True),(revision,research,execution))
                with self.assertRaises(InfrastructureError):research_inputs(discovery,'research-v001',replay=True)
                discovery['execution']['provider_incident_policy']='changed'
                with self.assertRaises(InfrastructureError):research_inputs(discovery,replay=True)

    def test_draft_plan_refused_before_any_files_or_repositories_created(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.plans(root)
            path=root/'experiments/instruction-effects/revisions/research-v002/analysis-plan.json'
            plan=json.loads(path.read_text());plan['status']='draft';write_json(path,plan)
            with patch('orchestrator.prepare_evaluation.ROOT',root):
                with self.assertRaises(InfrastructureError):research_inputs({'execution':{}},'research-v002')
            self.assertFalse((root/'runs').exists())

    def test_observer_revision_preserves_bounds_and_refuses_cross_revision_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.plans(root)
            source={'experiment_revision':'pilot-v015','execution':{'timing_revision':'harness-return-v2'}}
            with patch('orchestrator.prepare_evaluation.ROOT',root):
                revision,research,execution=research_inputs(source,'research-v003')
                self.assertEqual(revision,'research-v003')
                self.assertEqual(execution['provider_incident_policy'],POLICY)
                self.assertEqual(research['analysis_method'],METHOD)
                prepared={'experiment_revision':revision,'execution':execution,'research':research}
                self.assertEqual(research_inputs(prepared,replay=True),(revision,research,execution))
                with self.assertRaises(InfrastructureError):research_inputs(prepared,'research-v002',replay=True)
                path=root/research['analysis_plan']['path']
                plan=json.loads(path.read_text());plan['status']='draft';write_json(path,plan)
                with self.assertRaises(InfrastructureError):research_inputs(source,'research-v003')
                with self.assertRaises(InfrastructureError):research_inputs(source,'research-v007')

    def test_positive_anchor_revision_preserves_bounds_and_refuses_cross_revision_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.plans(root)
            source={'experiment_revision':'pilot-v015','execution':{'timing_revision':'harness-return-v2'}}
            with patch('orchestrator.prepare_evaluation.ROOT',root):
                revision,research,execution=research_inputs(source,'research-v004')
                self.assertEqual(revision,'research-v004')
                self.assertEqual(execution['provider_incident_policy'],POLICY)
                self.assertEqual(research['analysis_method'],METHOD)
                prepared={'experiment_revision':revision,'execution':execution,'research':research}
                self.assertEqual(research_inputs(prepared,replay=True),(revision,research,execution))
                with self.assertRaises(InfrastructureError):research_inputs(prepared,'research-v002',replay=True)
                path=root/research['analysis_plan']['path']
                plan=json.loads(path.read_text());plan['status']='draft';write_json(path,plan)
                with self.assertRaises(InfrastructureError):research_inputs(source,'research-v004')
                with self.assertRaises(InfrastructureError):research_inputs(source,'research-v007')

    def test_action_revision_requires_own_freeze_and_exact_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.plans(root)
            source={'experiment_revision':'pilot-v015','execution':{'timing_revision':'harness-return-v2'}}
            with patch('orchestrator.prepare_evaluation.ROOT',root):
                revision,research,execution=research_inputs(source,'research-v005')
                self.assertEqual(revision,'research-v005')
                self.assertEqual(execution['provider_incident_policy'],POLICY)
                self.assertEqual(research['analysis_method'],METHOD)
                prepared={'experiment_revision':revision,'execution':execution,'research':research}
                self.assertEqual(research_inputs(prepared,replay=True),(revision,research,execution))
                with self.assertRaises(InfrastructureError):research_inputs(prepared,'research-v004',replay=True)
                path=root/research['analysis_plan']['path']
                plan=json.loads(path.read_text());plan['status']='draft';write_json(path,plan)
                with self.assertRaises(InfrastructureError):research_inputs(source,'research-v005')

    def test_search_action_revision_requires_own_freeze_and_exact_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.plans(root)
            source={'experiment_revision':'pilot-v015','execution':{'timing_revision':'harness-return-v2'}}
            with patch('orchestrator.prepare_evaluation.ROOT',root):
                revision,research,execution=research_inputs(source,'research-v006')
                self.assertEqual(revision,'research-v006')
                self.assertEqual(execution['provider_incident_policy'],POLICY)
                self.assertEqual(research['analysis_method'],METHOD)
                prepared={'experiment_revision':revision,'execution':execution,'research':research}
                self.assertEqual(research_inputs(prepared,replay=True),(revision,research,execution))
                with self.assertRaises(InfrastructureError):research_inputs(prepared,'research-v005',replay=True)
                path=root/research['analysis_plan']['path']
                plan=json.loads(path.read_text());plan['status']='draft';write_json(path,plan)
                with self.assertRaises(InfrastructureError):research_inputs(source,'research-v006')

    def test_prepared_manifest_is_assigned_once_before_dispatch_with_exact_plan_and_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'discovery';run=root/'repeat'
            candidate={'purpose':'synthetic candidate fixture'};write_json(source/'analysis/candidate.json',candidate)
            manifest={'run_id':'eval-002-repeat-001','research':{'analysis_plan':{'sha256':'frozen-plan'}}};write_json(run/'manifest.json',manifest)
            register_confirmation(source,run,'first')
            record=read_jsonl(source/'analysis/confirmation-cohorts.jsonl')[0]
            self.assertEqual(record['manifest_sha256'],digest_json(manifest))
            self.assertEqual(record['candidate_sha256'],digest_bytes((source/'analysis/candidate.json').read_bytes()))
            with self.assertRaises(ValueError):register_confirmation(source,run,'second')
            self.assertEqual(len(read_jsonl(source/'analysis/confirmation-cohorts.jsonl')),1)
            with self.assertRaises(InfrastructureError):register_confirmation(source,run,None)
