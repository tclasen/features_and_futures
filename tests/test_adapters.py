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
