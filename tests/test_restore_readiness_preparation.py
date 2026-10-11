import json
import shutil
import tempfile
import unittest
from pathlib import Path
from orchestrator.evidence import digest_bytes, digest_json
from orchestrator.prepare import file_hashes
from orchestrator.prepare_evaluation import verify_prepared_stream
from orchestrator.restore_readiness import with_restore_readiness


class RestorePreparationTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        self.source, self.prepared = root/'source', root/'prepared'
        suite = self.source/'definitions/project/acceptance'
        suite.mkdir(parents=True)
        (suite/'workboard.spec.mjs').write_text(
            "await projectRow(page, 'Archive lifecycle').getByRole('button', "
            "{ name: 'Restore project', exact: true }).click();\n"
            "await expect(taskRow(page, 'Retained task')).toBeVisible();\n")
        packet = self.source/'tasks/task-001/packet.md'
        packet.parent.mkdir(parents=True)
        packet.write_text('Identical public task')
        manifest = {'tasks': [{'task_id': 'task-001', 'stage': 1,
            'packet_sha256': digest_bytes(packet.read_bytes()),
            'suite_hash': digest_json(file_hashes(suite)),
            'expected_phase_checks': {'acceptance': 1, 'postrestart': 1}}]}
        (self.source/'manifest.json').write_text(json.dumps(manifest))
        shutil.copytree(self.source, self.prepared)
        self.spec = self.prepared/'definitions/project/acceptance/workboard.spec.mjs'
        self.spec.write_text(with_restore_readiness(self.spec.read_text()))
        self.update_suite_hash()

    def update_suite_hash(self):
        path = self.prepared/'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['tasks'][0]['suite_hash'] = digest_json(file_hashes(self.spec.parent))
        path.write_text(json.dumps(manifest))

    def test_fresh_declared_revision_passes_but_exact_repeat_rejects_changed_suite(self):
        result = verify_prepared_stream(self.source, self.prepared, 'research-v014')
        self.assertTrue(result['verified'])
        self.assertNotEqual(result['source_input_sha256'], result['prepared_input_sha256'])
        for revision, exact in [('research-v014', True), ('research-v013', False)]:
            with self.assertRaisesRegex(ValueError, 'Replay differs'):
                verify_prepared_stream(self.source, self.prepared, revision, exact)

    def test_fresh_revision_cannot_remove_assertions_even_with_updated_hash(self):
        self.spec.write_text(self.spec.read_text().replace(
            "await expect(taskRow(page, 'Retained task')).toBeVisible();\n", ''))
        self.update_suite_hash()
        with self.assertRaisesRegex(ValueError, 'Unexpected prospective observer delta'):
            verify_prepared_stream(self.source, self.prepared, 'research-v014')

    def test_fresh_revision_cannot_tailor_public_packets_even_with_updated_hash(self):
        packet = self.prepared/'tasks/task-001/packet.md'
        packet.write_text('Tailored task')
        path = self.prepared/'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['tasks'][0]['packet_sha256'] = digest_bytes(packet.read_bytes())
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'changes public task packets'):
            verify_prepared_stream(self.source, self.prepared, 'research-v014')

    def test_fresh_revision_rejects_stale_base_suite_metadata(self):
        path = self.prepared/'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['tasks'][0]['suite_hash'] = 'stale source suite hash'
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'base suite hash differs'):
            verify_prepared_stream(self.source, self.prepared, 'research-v014')
