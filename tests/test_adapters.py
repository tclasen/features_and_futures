import json
import subprocess
import unittest
from unittest.mock import patch
from orchestrator.adapters import sandbox_policy

class PolicyTests(unittest.TestCase):
    def test_resume_removes_only_own_obsolete_gateway_rules(self):
        def rule(identity,scope,resource):
            return {"id":identity,"scope":scope,"resource_type":"network",
                "decision":"allow","editable":True,"resources":[resource]}
        rules=[rule("old","sandbox:mine","host.docker.internal:1000"),
            rule("old-local","sandbox:mine","localhost:1000"),
            rule("current","sandbox:mine","localhost:2000"),
            rule("global","global","localhost:1000"),
            rule("other","sandbox:other","localhost:1000"),
            rule("domain","sandbox:mine","example.org")]
        calls=[]
        def invoke(command,**kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(command,0,json.dumps({"rules":rules}),"")
        with patch("orchestrator.adapters.invoke",side_effect=invoke):
            sandbox_policy("mine",2000)
        removals=[c for c in calls if c[2:4]==["rm","network"]]
        self.assertEqual(["old","old-local"],[c[c.index("--id")+1] for c in removals])
        self.assertTrue(all(c[c.index("--sandbox")+1]=="mine" for c in removals))

class HarnessExecutionTests(unittest.TestCase):
    def test_harness_return_observed_before_transcript_writes(self):
        import tempfile
        from pathlib import Path
        from orchestrator.adapters import execute_attempt
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)
            observed=[]
            def returned(code):
                observed.append(code)
                self.assertFalse((output/'harness.stdout.jsonl').exists())
            with patch('orchestrator.adapters.configure_attempt',return_value=['native','-']), patch('orchestrator.adapters.invoke',return_value=subprocess.CompletedProcess([],0,'public','')):
                execute_attempt('fixture','codex','model','lease',1000,'prompt',output,on_return=returned)
            self.assertEqual(observed,[0])
    def test_exception_still_records_harness_terminal_observation(self):
        import tempfile
        from pathlib import Path
        from orchestrator.adapters import execute_attempt
        observed=[]
        with tempfile.TemporaryDirectory() as directory:
            with patch('orchestrator.adapters.configure_attempt',return_value=['native','-']), patch('orchestrator.adapters.invoke',side_effect=subprocess.TimeoutExpired('native',1)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    execute_attempt('fixture','codex','model','lease',1000,'prompt',Path(directory),on_return=observed.append)
        self.assertEqual(observed,[None])
    def test_context_policy_applies_without_treatment_changes(self):
        from orchestrator.adapters import configure_attempt
        calls=[]
        def setup(command,**kwargs):
            calls.append(json.loads(kwargs['stdin']))
            return subprocess.CompletedProcess(command,0,'','')
        with patch('orchestrator.adapters.invoke',side_effect=setup):
            command=configure_attempt('fixture','codex','model','lease',1000,'context',context_settings={'context_window':272000,'auto_compact_token_limit':255616})
            self.assertIn('model_context_window=272000',command)
            self.assertIn('model_auto_compact_token_limit=255616',command)
            configure_attempt('fixture','pi','model','lease',1000,'context',context_settings={'context_window':272000,'max_output_tokens':16384,'compaction':{'enabled':True,'reserveTokens':16384,'keepRecentTokens':20000}})
        files=calls[-1]['files']
        self.assertEqual(json.loads(files['settings.json'])['compaction']['reserveTokens'],16384)
        self.assertEqual(files['treatment.txt'],'')
