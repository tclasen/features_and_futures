import unittest
from pathlib import Path
from orchestrator.workload import phase_expectations, project_checkpoints

class WorkloadTests(unittest.TestCase):
    def test_extended_workload_declares_all_phase_counts(self):
        tasks=project_checkpoints(Path('projects/workboard/revisions/v006'))
        self.assertEqual(len(tasks),4)
        self.assertEqual(phase_expectations(tasks[-1]),{'acceptance':14,'upgrade':1,'postrestart':1})
    def test_old_three_stage_definitions_keep_original_counts(self):
        self.assertEqual([phase_expectations(t)['acceptance'] for t in project_checkpoints(Path('projects/workboard/revisions/v004'))],[4,8,11])
    def test_undeclared_extension_and_skipped_phases_rejected(self):
        with self.assertRaises(ValueError):phase_expectations({'stage':4})
        with self.assertRaises(ValueError):phase_expectations({'stage':4,'expected_phase_checks':{'acceptance':14}})
