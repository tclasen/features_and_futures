import unittest
import json
import tempfile
from pathlib import Path
from orchestrator.adapters import price_snapshot
from orchestrator.configurations import builder_configurations, required_checkpoints, checkpoint_coverage

class ConfigurationTests(unittest.TestCase):
    def manifest(self, model_set):
        return {"runtime": {"builder_configurations": builder_configurations(model_set)},
                "tasks": [{"task_id": f"task-{i:03d}"} for i in range(1,4)]}

    def test_hosted_matrix_retains_every_instruction_harness_combination(self):
        builders = builder_configurations("hosted")
        self.assertEqual(len(builders),12)
        self.assertEqual({b["model"] for b in builders},{"gpt-6-luna","gpt-6.1-sol"})
        self.assertEqual(len({(b["model"],b["harness"],b["profile"]) for b in builders}),12)
        self.assertEqual(builders,builder_configurations("hosted"))
        self.assertEqual(len(required_checkpoints(self.manifest("hosted"))),36)
        self.assertEqual(len(required_checkpoints(self.manifest("full"))),54)

    def test_equal_count_with_duplicate_or_foreign_checkpoint_cannot_pass(self):
        manifest=self.manifest("hosted")
        records=[{"kind":kind,"builder_id":bid,"task_id":task}
                 for kind in ("task_accepted","deployment_promoted","post_deployment_checks_passed")
                 for bid,task in sorted(required_checkpoints(manifest))]
        self.assertEqual(checkpoint_coverage(manifest,records),[])
        records[0]=dict(records[1])
        self.assertTrue(checkpoint_coverage(manifest,records))
        records[0]={"kind":"task_accepted","builder_id":"foreign","task_id":"task-001"}
        self.assertTrue(checkpoint_coverage(manifest,records))

    def test_original_full_matrix_order_is_preserved(self):
        builders=builder_configurations("full")
        self.assertEqual((builders[0]["model"],builders[0]["harness"],builders[0]["profile"]),
                         ("gpt-6-luna","codex","maximum"))
        self.assertEqual((builders[3]["model"],builders[3]["harness"],builders[3]["profile"]),
                         ("gpt-oss:120b","codex","maximum"))

    def test_hosted_price_preparation_does_not_require_local_catalog_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/"openrouter-models.json").write_text(json.dumps({"data":[
                {"id":reference,"pricing":{"prompt":"0.1","completion":"0.2"}}
                for reference in ("openai/gpt-6-luna","openai/gpt-6.1-sol")]}))
            self.assertEqual(set(price_snapshot(root,models={"gpt-6-luna","gpt-6.1-sol"})),
                             {"gpt-6-luna","gpt-6.1-sol"})
