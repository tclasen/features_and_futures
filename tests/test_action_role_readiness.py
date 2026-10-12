import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from orchestrator.action_role_readiness import with_action_role_choices, verify_role_only_delta
from orchestrator.prepare_evaluation import research_inputs
from orchestrator.prepare import InfrastructureError
from orchestrator.retained_incidents import POLICY, OBSERVATION_LIFECYCLE
from orchestrator.bounded_confirmation import METHOD


class ActionRoleReadinessTests(unittest.TestCase):
    def test_explicit_buttons_remain_required_and_directory_task_open_is_scoped(self):
        source="const rows=p=>p.getByTestId('directory-task-row');await rows(page).first().getByRole('button',{name:'Open project',exact:true}).click();await owners(page).first().getByRole('button',{name:'Open project',exact:true}).click();await page.getByRole('button',{name:'Save notes',exact:true}).click();"
        result=with_action_role_choices(source,'directory-order.spec.mjs')
        self.assertIn("rows(page).first().getByRole('link',{name:'Open project',exact:true})",result)
        self.assertNotIn("owners(page).first().getByRole('link'",result)
        self.assertNotIn("getByRole('link',{name:'Save notes'",result)
        self.assertEqual(with_action_role_choices(source,'unrelated.spec.mjs'),source)

    def test_guard_rejects_behavior_changes_and_duplicate_suppression(self):
        with tempfile.TemporaryDirectory() as tmp:
            old,new=Path(tmp)/'old',Path(tmp)/'new';old.mkdir();new.mkdir()
            source="await page.getByRole('button',{name:'Download project',exact:true}).click();expect(download.suggestedFilename()).toBe('workboard-project.json');"
            (old/'export.spec.mjs').write_text(source)
            corrected=with_action_role_choices(source,'export.spec.mjs');(new/'export.spec.mjs').write_text(corrected)
            self.assertEqual(verify_role_only_delta(old,new),['export.spec.mjs'])
            for bad in [corrected.replace('workboard-project.json','wrong.json'),corrected.replace(')).click()',')).first().click()')]:
                self.assertNotEqual(bad,corrected)
                (new/'export.spec.mjs').write_text(bad)
                with self.assertRaises(ValueError):verify_role_only_delta(old,new)
            (new/'export.spec.mjs').write_text(corrected);(new/'extra.mjs').write_text('')
            with self.assertRaisesRegex(ValueError,'inventory'):verify_role_only_delta(old,new)

    def test_unfrozen_plan_and_changed_exact_replay_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'experiments/instruction-effects/revisions/research-v016/analysis-plan.json';path.parent.mkdir(parents=True)
            plan={'revision_id':'research-v016','status':'prepared-unfrozen','analysis_method':METHOD,'submission_outcome_definition':'first-observed-pm-assessment-v1','execution':{'provider_incident_policy':POLICY,'inference_observation_lifecycle':OBSERVATION_LIFECYCLE}}
            path.write_text(json.dumps(plan));source={'experiment_revision':'pilot-v015','execution':{}}
            with patch('orchestrator.prepare_evaluation.ROOT',root):
                with self.assertRaisesRegex(InfrastructureError,'Freeze'):research_inputs(source,'research-v016')
                plan['status']='frozen-before-main-dispatch';path.write_text(json.dumps(plan))
                revision,research,execution=research_inputs(source,'research-v016')
                self.assertEqual(execution['inference_observation_lifecycle'],OBSERVATION_LIFECYCLE)
                replay={'experiment_revision':revision,'research':research,'execution':execution}
                self.assertEqual(research_inputs(replay,replay=True),(revision,research,execution))
                with self.assertRaises(InfrastructureError):research_inputs(replay,'research-v015',replay=True)
