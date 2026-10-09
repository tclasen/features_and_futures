import unittest
from orchestrator.recheck_corpus import verify_corpus

class CorpusChecks(unittest.TestCase):
    def test_partial_or_substituted_source_cannot_pass_full_corpus_gate(self):
        manifest={"runtime":{"builder_configurations":[{"builder_id":"a"}]},"tasks":[{"task_id":"one"},{"task_id":"two"}]}
        accepted={('a',task):{'commit':task+'-commit','tree':task+'-tree'} for task in ('one','two')}
        records=[{'builder_id':'a','task_id':task,'source_commit':task+'-commit','source_tree':task+'-tree','passed':True} for task in ('one','two')]
        self.assertEqual(verify_corpus(manifest,accepted,records),[])
        self.assertTrue(verify_corpus(manifest,accepted,records[:1]))
        self.assertTrue(verify_corpus(manifest,accepted,[records[0],records[0]]))
        records[0]['source_commit']='different-implementation'
        self.assertTrue(verify_corpus(manifest,accepted,records))
