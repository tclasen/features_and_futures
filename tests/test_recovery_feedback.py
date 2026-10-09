import json
import tempfile
import unittest
from pathlib import Path
from orchestrator.recovery import append_recovery_instruction


class RecoveryFeedbackTests(unittest.TestCase):
    def write(self, root, **changes):
        recovery={'builder_id':'b008','task_id':'task-002','action':'restore-last-accepted-checkpoint','message':'The PM restored your own last accepted checkpoint. Reimplement the unchanged task.'}
        recovery.update(changes)
        (root/'recovery-instruction.json').write_text(json.dumps(recovery))

    def test_recorded_own_recovery_is_appended_without_rewriting_original_feedback(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); original='Original factual failure evidence'
            self.write(root)
            result=append_recovery_instruction(original,root,'b008','task-002')
            self.assertTrue(result.startswith(original))
            self.assertIn('restored your own last accepted checkpoint',result)
            self.assertEqual(original,'Original factual failure evidence')

    def test_cross_builder_or_task_recovery_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); self.write(root,builder_id='b007')
            with self.assertRaises(ValueError):
                append_recovery_instruction('',root,'b008','task-002')
            self.write(root,task_id='task-003')
            with self.assertRaises(ValueError):
                append_recovery_instruction('',root,'b008','task-002')

    def test_correction_keeps_preserved_working_tree(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); self.write(root,action='continue-preserved-working-tree')
            self.assertIn('Recorded PM recovery action',append_recovery_instruction('failure',root,'b008','task-002'))

    def test_no_recovery_leaves_feedback_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(append_recovery_instruction('same',folder,'b008','task-002'),'same')


if __name__ == '__main__':
    unittest.main()
