"""Real Git archive/report pipeline with explicitly synthetic native observations.

No builder, deployment, provider, or Playwright execution is claimed by this
fixture. It verifies the PM evidence gates against twelve independently restored
histories, phase records, packet/profile delivery and original raw receipts.
"""
import contextlib
import io
import json
import shutil
import subprocess
import tempfile
import tarfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from orchestrator import report, study
from orchestrator.configurations import builder_configurations
from orchestrator.evidence import Ledger, append_json, digest_bytes, digest_json, native_counts, price_counts, read_jsonl
from orchestrator.prepare import write_json, file_hashes, InfrastructureError
from orchestrator.retained_incidents import POLICY, ASSESSMENT, retain_for_recovery
from orchestrator.bounded_confirmation import METHOD
from orchestrator.prepare_evaluation import prepare
from orchestrator.evaluation import validate_research_manifest
from orchestrator.task_stream import stream_input_hash

HELPER=Path(__file__).resolve().parents[1]/'scripts/archive-builder-history.py'


def command(*args):
    return subprocess.run(args,check=True,text=True,capture_output=True).stdout.strip()


class PartialReportPipelineTests(unittest.TestCase):
    def git(self, repo, *args): return command('git','-C',str(repo),*args)

    def repository(self, path):
        path.mkdir(); self.git(path,'init','-b','main')
        self.git(path,'config','user.name','Synthetic PM fixture')
        self.git(path,'config','user.email','fixture@experiment.invalid')
        self.git(path,'config','commit.gpgsign','false')

    def fixture(self, base, unknown=True):
        master=base/'master';self.repository(master)
        (master/'scripts').mkdir();shutil.copy2(HELPER,master/'scripts'/HELPER.name)
        self.git(master,'add','.');self.git(master,'commit','-qm','PM fixture root')
        run=master/'runs/instruction-effects/eval-002';run.mkdir(parents=True)
        definitions=run/'definitions';definitions.mkdir()
        instructions={'profiles':{'none':'','minimal':'Synthetic minimal fixture profile','maximum':'Synthetic maximum fixture profile'}}
        write_json(definitions/'instructions.json',instructions)
        (definitions/'project/acceptance').mkdir(parents=True)
        (definitions/'project/acceptance/checks.mjs').write_text('// synthetic PM fixture suite bytes\n')
        packet=b'Synthetic identical PM pipeline task; no native builder execution.'
        task_dir=run/'tasks/task-001';task_dir.mkdir(parents=True);(task_dir/'packet.md').write_bytes(packet)
        plan={'revision_id':'research-v002','status':'frozen-before-main-dispatch','primary_family_size':36,
              'analysis_method':METHOD,'submission_outcome_definition':ASSESSMENT,
              'execution':{'provider_incident_policy':POLICY},'stopping':{'required_independent_batches':2}}
        plan_path=Path('experiments/instruction-effects/revisions/research-v002/analysis-plan.json')
        write_json(master/plan_path,plan)
        starter=base/'starter';self.repository(starter)
        (starter/'app.mjs').write_text('// synthetic starter\n')
        self.git(starter,'add','.');self.git(starter,'commit','-qm','Fixture starter')
        configs=builder_configurations('hosted')
        prices={model:{'pricing':{'prompt':'0.001','completion':'0.002'},'snapshot_sha256':'fixture-price-snapshot','reference_id':'fixture-price'}
                for model in {b['model'] for b in configs}}
        manifest={'experiment_id':'instruction-effects','run_id':'eval-002','experiment_revision':'research-v002',
                  'purpose':'research-discovery','status':'running','project_id':'workboard','project_revision':'fixture',
                  'runtime':{'builder_configurations':configs,'harness_versions':{'codex':'0.162.1','pi':'1.1.0'},'image':'synthetic-no-runtime-fixture','image_digest':'fixture-image'},'execution':{'task_stream_revision':'append-only-rounds-v1','timing_revision':'harness-return-v2','provider_incident_policy':POLICY},
                  'research':{'analysis_method':METHOD,'analysis_plan':{'path':str(plan_path),'sha256':digest_bytes((master/plan_path).read_bytes())}},
                  'paths':{'builders':str(base),'deployments':str(base/'synthetic-deployments')},
                  'pricing':prices,'provenance':{'starter_commit':self.git(starter,'rev-parse','HEAD'),'starter_tree':self.git(starter,'rev-parse','HEAD^{tree}'),'definition_hashes':file_hashes(definitions)},
                  'evidence_policy':{'post_deployment_window_seconds':30,'stability_revision':'behavior-and-restart-v2'},
                  'tasks':[{'task_id':'task-001','stage':1,'packet_sha256':digest_bytes(packet),'suite_hash':digest_json(file_hashes(definitions/'project/acceptance'))}]}
        write_json(run/'manifest.json',manifest);(run/'manifest.sha256').write_text(digest_json(manifest))
        write_json(run/'pricing/fixture-snapshot.json',prices)
        write_json(run/'state.json',{'status':'completed'})
        ledger=Ledger(run,{k:manifest[k] for k in ('experiment_id','run_id','experiment_revision','project_id','project_revision')})
        for position,builder in enumerate(configs):
            bid=builder['builder_id'];repo=base/bid
            command('git','clone','--no-local',str(starter),str(repo));self.git(repo,'remote','remove','origin')
            self.git(repo,'config','user.name','Synthetic PM fixture');self.git(repo,'config','user.email','fixture@experiment.invalid')
            attrs={'builder_id':bid,'task_id':'task-001'}
            ledger.event('task_dispatched',**attrs)
            if position==0 and unknown:
                attempt={**attrs,'attempt_id':'attempt-001'}
                ledger.event('attempt_started',**attempt)
                usage=self.request(run,ledger,manifest,builder,attempt,packet.decode(),instructions,unknown=True)
                ledger.event('harness_returned',**attempt);ledger.event('attempt_finished',**attempt)
                output,index=self.archive(master,run,repo,bid,'attempt-001')
                ledger.event('submission_observed',archive=index['checksums'],**attempt)
                retain_for_recovery(run,manifest,[usage],attempt,output,index,index['source_commit'],ledger)
            attempt_id='attempt-002' if position==0 and unknown else 'attempt-001'
            attempt={**attrs,'attempt_id':attempt_id}
            ledger.event('attempt_started',**attempt)
            self.request(run,ledger,manifest,builder,attempt,packet.decode(),instructions)
            (repo/'app.mjs').write_text('// synthetic accepted source '+bid+'\n')
            self.git(repo,'commit','-qam','Synthetic submitted source')
            head=self.git(repo,'rev-parse','HEAD');tree=self.git(repo,'rev-parse','HEAD^{tree}')
            ledger.event('commit_first_observed',commit=head,**attempt)
            ledger.event('harness_returned',**attempt);ledger.event('attempt_finished',**attempt)
            output,index=self.archive(master,run,repo,bid,attempt_id)
            ledger.event('submission_observed',archive=index['checksums'],**attempt)
            ledger.event('validation_started',**attempt);ledger.event('validation_finished',success=True,**attempt)
            write_json(output/'result.json',{'acceptance_statistics':[{'phase':'acceptance','expected':4,'unexpected':0},{'phase':'postrestart','expected':1,'unexpected':0}]})
            ledger.event('task_accepted',commit=head,tree=tree,**attempt)
            ledger.event('deployment_promoted',included_commits=[head],**attempt)
            ledger.event('post_deployment_checks_passed',**attempt)
        return master,run,manifest

    def archive(self,master,run,repo,bid,attempt):
        checkpoint='task-001-'+attempt
        command('python3',str(master/'scripts'/HELPER.name),'--experiment','instruction-effects','--run','eval-002','--builder',bid,'--checkpoint',checkpoint,'--repository',str(repo))
        output=run/'tasks/task-001/attempts'/bid/attempt;output.mkdir(parents=True,exist_ok=True)
        self.git(repo,'archive','--format=tar','--output='+str(output/'submission.tar'),'HEAD')
        index=json.loads((run/'builders'/bid/'checkpoints'/checkpoint/'index.json').read_text())
        source=run/'builders'/bid/'checkpoints'/checkpoint
        shutil.copy2(source/'history.bundle',output/'native-history.bundle')
        write_json(output/'native-git.json',{'head':index['source_commit'],'tree':index['source_tree'],'dirty':self.git(repo,'status','--porcelain')})
        with tarfile.open(output/'native-working-tree.tar.gz','w:gz') as archive:
            for path in sorted(repo.iterdir()):
                if path.name!='.git':archive.add(path,arcname=path.name)
        return output,index

    def request(self,run,ledger,manifest,builder,attempt,packet,instructions,unknown=False):
        identity={**attempt,'model':builder['model'],'provider':'subscription'};rid=str(uuid.uuid4())
        payload=json.dumps({'model':builder['model'],'input':packet+'\n'+instructions['profiles'][builder['profile']]}).encode()
        start=ledger.event('inference_request_started',request_id=rid,payload_sha256=digest_bytes(payload),**identity)
        usage=None if unknown else {'input_tokens':1,'output_tokens':2}
        raw=b'original synthetic fixture503; no counters' if unknown else json.dumps({'usage':usage}).encode()
        folder=run/'tasks/task-001/attempts'/builder['builder_id']/attempt['attempt_id']/'requests';folder.mkdir(parents=True,exist_ok=True)
        (folder/(rid+'.request.json')).write_bytes(payload);(folder/(rid+'.response.raw')).write_bytes(raw)
        counts=native_counts(usage)
        row={**ledger.identity,**identity,'request_id':rid,'clock_id':ledger.clock_id,'started_monotonic_ns':start['monotonic_ns'],
             'ended_monotonic_ns':start['monotonic_ns'],'counts':counts,'usage':usage,'api_usage':usage,
             'cost':None if unknown else price_counts(counts,manifest['pricing'][builder['model']]['pricing']),
             'status':503 if unknown else 200,'outcome':'upstream-http-error' if unknown else 'terminal-json',
             'request_sha256':digest_bytes(payload),'response_sha256':digest_bytes(raw),
             'pricing_snapshot_sha256':'fixture-price-snapshot','pricing_reference':'fixture-price'}
        append_json(run/'usage.jsonl',row)
        ledger.event('inference_request_finished',request_id=rid,counts_complete=not unknown,outcome=row['outcome'],**identity)
        return row

    def generate(self,master,run):
        with patch('orchestrator.report.ROOT',master),patch('orchestrator.evaluation.ROOT',master),patch('sys.argv',['report','--run','eval-002']),contextlib.redirect_stdout(io.StringIO()):
            try: report.main()
            except SystemExit as error: self.assertEqual(error.code,1)
        pointer=json.loads((run/'reports/latest.json').read_text())
        return json.loads((run/'reports'/pointer['report']).read_text())

    def test_twelve_real_histories_partial_readiness_and_hard_gates(self):
        with tempfile.TemporaryDirectory() as tmp:
            master,run,manifest=self.fixture(Path(tmp))
            result=self.generate(master,run)
            self.assertTrue(result['analysis_ready'],result['analysis_problems'])
            self.assertFalse(result['readiness_passed']);self.assertFalse(result['native_accounting_complete'])
            self.assertEqual(result['requests'],13);self.assertEqual(result['archive_checkpoints'],13)
            self.assertEqual(result['retained_infrastructure_attempts'],1)
            self.assertEqual(result['expected_checkpoints'],12)
            affected=next(r for r in result['tasks'] if r['builder_id']=='b001')
            self.assertEqual(affected['known_uncached_reference_usd'],'0.005')
            self.assertIsNone(affected['uncached_reference_usd'])
            self.assertTrue(affected['first_assessed_submission_accepted']);self.assertFalse(affected['first_scheduled_attempt_accepted'])
            with patch('orchestrator.evaluation.ROOT',master):
                self.assertTrue(study.evidence(run)[1]['analysis_ready'])
                artifact=next((run/'builders').glob('*/checkpoints/*/committed-source.tar'))
                original=artifact.read_bytes();artifact.write_bytes(original+b'changed after report')
                with self.assertRaises(InfrastructureError): study.evidence(run)
                artifact.write_bytes(original)
            # Each mutation is restored; original failure reports remain immutable.
            packet=run/'tasks/task-001/packet.md';original=packet.read_bytes();packet.write_bytes(b'altered')
            with self.assertRaises(ValueError): self.generate(master,run)
            packet.write_bytes(original)
            path=run/'definitions/instructions.json';original=path.read_bytes();changed=json.loads(original);changed['profiles']['maximum']='undelivered profile';write_json(path,changed)
            result=self.generate(master,run);self.assertFalse(result['analysis_ready'])
            self.assertTrue(any('assigned profile missing' in p for p in result['analysis_problems']))
            path.write_bytes(original)
            rows=read_jsonl(run/'usage.jsonl');path=run/'usage.jsonl';original=path.read_bytes()
            next(r for r in rows if r['counts'] is not None)['cost']['uncached_reference_usd']='0'
            path.write_text(''.join(json.dumps(r)+'\n' for r in rows))
            result=self.generate(master,run);self.assertFalse(result['analysis_ready'])
            self.assertTrue(any('cost mismatch' in p for p in result['analysis_problems']))
            path.write_bytes(original)
            result_path=run/'tasks/task-001/attempts/b001/attempt-002/result.json';original=result_path.read_bytes()
            phases=json.loads(original);phases['acceptance_statistics'][1]['expected']=0;write_json(result_path,phases)
            result=self.generate(master,run);self.assertFalse(result['analysis_ready'])
            self.assertTrue(any('incomplete suite' in p for p in result['analysis_problems']))
            result_path.write_bytes(original)
            bundle=next((run/'builders').glob('*/checkpoints/*/history.bundle'));original=bundle.read_bytes();bundle.write_bytes(original+b'corrupt')
            with self.assertRaises(InfrastructureError): self.generate(master,run)
            bundle.write_bytes(original)

    def test_complete_native_report_retains_point_costs_and_strict_readiness(self):
        with tempfile.TemporaryDirectory() as tmp:
            master,run,_=self.fixture(Path(tmp),unknown=False)
            result=self.generate(master,run)
            self.assertTrue(result['readiness_passed'],result['problems'])
            self.assertTrue(result['analysis_ready']);self.assertTrue(result['native_accounting_complete'])
            self.assertTrue(all(r['uncached_reference_usd']=='0.005' for r in result['tasks']))
            self.assertEqual(result['archive_checkpoints'],12)

    def test_real_fresh_preparation_and_confirmation_assignment_preserve_only_starter_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp);master,source,original=self.fixture(base,unknown=False)
            self.generate(master,source)
            builders=base/'prepared-builders';builders.mkdir()
            write_json(source/'analysis/candidate.json',{'purpose':'synthetic candidate fixture','task_stream_input_sha256':stream_input_hash(source),'plan_sha256':original['research']['analysis_plan']['sha256']})
            from orchestrator.prepare import checked as actual_checked
            def latest_checked(command,**kwargs):
                if command[:2]==['npm','view']:return '0.162.1' if command[2]=='@openai/codex' else '1.1.0'
                return actual_checked(command,**kwargs)
            with patch('orchestrator.prepare_evaluation.ROOT',master),patch('orchestrator.evaluation.ROOT',master),patch('orchestrator.prepare_evaluation.BUILDERS_ROOT',builders),patch('orchestrator.prepare_evaluation.checked',side_effect=latest_checked),patch('orchestrator.prepare_evaluation.price_snapshot',return_value=original['pricing']):
                fresh=prepare('eval-003','eval-002',revision='research-v002')
                manifest=validate_research_manifest(fresh)
                self.assertEqual(manifest['research']['analysis_method'],METHOD)
                self.assertEqual(manifest['execution']['provider_incident_policy'],POLICY)
                for builder in original['runtime']['builder_configurations']:
                    repo=builders/'eval-003'/builder['builder_id']
                    self.assertEqual(self.git(repo,'rev-parse','HEAD'),original['provenance']['starter_commit'])
                    self.assertEqual(self.git(repo,'rev-list','--count','HEAD'),'1')
                    self.assertEqual(self.git(repo,'remote'),'')
                # Source controls must match real prepared research execution/evidence rules.
                source_manifest=json.loads((source/'manifest.json').read_text())
                source_manifest['evidence_policy']=manifest['evidence_policy']
                write_json(source/'manifest.json',source_manifest);(source/'manifest.sha256').write_text(digest_json(source_manifest))
                self.generate(master,source)
                repeated=prepare('eval-002-repeat-001','eval-002',confirmation=True,batch='first')
                self.assertEqual(validate_research_manifest(repeated)['research']['confirmation_batch'],'first')
                registry=source/'analysis/confirmation-cohorts.jsonl';recorded=registry.read_bytes()
                registry.unlink()
                with self.assertRaises(InfrastructureError):validate_research_manifest(repeated)
                registry.write_bytes(recorded)
                manifest_path=repeated/'manifest.json';before=manifest_path.read_bytes();changed=json.loads(before);changed['research']['confirmation_batch']='second';write_json(manifest_path,changed)
                with self.assertRaises(InfrastructureError):validate_research_manifest(repeated)
                manifest_path.write_bytes(before)
