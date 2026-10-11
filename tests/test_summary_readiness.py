import shutil
import tempfile
import unittest
from pathlib import Path

from orchestrator.summary_readiness import (
    OLD_READER, NEW_READER, with_summary_text, verify_summary_only_delta,
    verify_restore_and_summary_delta,
)


class SummaryReadinessTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.original = Path(temporary.name) / 'original'
        self.original.mkdir()
        (self.original / 'return-order.spec.mjs').write_text(
            'await expect(summary).toHaveText(/^\\d+\\/\\d+ completed$/);'
            f'const [done,total]={OLD_READER};'
            'await expect(sourceSummary).toBe(expectedSummary);')
        (self.original / 'helpers.mjs').write_text('Shared unchanged helpers')
        self.prospective = Path(temporary.name) / 'prospective'
        shutil.copytree(self.original, self.prospective)
        self.case = self.prospective / 'return-order.spec.mjs'
        self.case.write_text(with_summary_text(self.case.read_text()))

    def test_exact_reader_change_preserves_assertions_and_is_idempotent(self):
        self.assertEqual(verify_summary_only_delta(self.original, self.prospective),
                         ['return-order.spec.mjs'])
        self.assertIn(NEW_READER, self.case.read_text())
        self.assertEqual(with_summary_text(self.case.read_text()), self.case.read_text())

    def test_removed_behavior_assertion_is_rejected(self):
        self.case.write_text(self.case.read_text().replace(
            'await expect(sourceSummary).toBe(expectedSummary);', ''))
        with self.assertRaisesRegex(ValueError, 'Unexpected prospective'):
            verify_summary_only_delta(self.original, self.prospective)

    def test_changed_helper_and_added_file_are_rejected(self):
        helper = self.prospective / 'helpers.mjs'
        helper.write_text('Tailored helper')
        with self.assertRaisesRegex(ValueError, 'Unexpected prospective'):
            verify_summary_only_delta(self.original, self.prospective)
        helper.write_bytes((self.original / 'helpers.mjs').read_bytes())
        (self.prospective / 'extra.mjs').write_text('Additional assertion')
        with self.assertRaisesRegex(ValueError, 'file inventory'):
            verify_summary_only_delta(self.original, self.prospective)

    def test_duplicate_reader_requires_explicit_review(self):
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            with_summary_text(OLD_READER + OLD_READER)

    def test_earlier_suite_without_reader_remains_identical(self):
        self.case.write_bytes((self.original / 'return-order.spec.mjs').read_bytes())
        (self.original / 'return-order.spec.mjs').unlink()
        self.case.unlink()
        self.assertEqual(verify_summary_only_delta(self.original, self.prospective), [])

    def test_pilot_preparation_requires_inherited_restore_guard_as_well(self):
        from orchestrator.restore_readiness import with_restore_readiness
        original = self.original / 'return-order.spec.mjs'
        original.write_text(original.read_text() +
            "await projectRow(page,'Restored').getByRole('button',"
            "{name:'Restore project',exact:true}).click();")
        self.case.write_text(with_summary_text(original.read_text()))
        with self.assertRaisesRegex(ValueError, 'Unexpected prospective'):
            verify_restore_and_summary_delta(self.original, self.prospective)
        self.case.write_text(with_restore_readiness(self.case.read_text()))
        self.assertEqual(verify_restore_and_summary_delta(self.original, self.prospective),
                         ['return-order.spec.mjs'])
