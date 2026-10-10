import copy
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
from orchestrator.gateway import InferenceGateway
from orchestrator.evidence import Ledger, read_jsonl, digest_bytes
from orchestrator.retained_incidents import terminal_attempt_evidence, validate_policy, retain_for_recovery, POLICY, ASSESSMENT
from orchestrator.bounded_confirmation import METHOD


class Handler:
    headers = {}; path = '/v1/responses'
    def __init__(self): self.wfile = io.BytesIO()
    def send_response(self, status): self.status = status
    def send_header(self, *_args): pass
    def end_headers(self): pass
    def send_error(self, status, *_args): self.status = status


class RetainedIncidentTests(unittest.TestCase):
    def fixture(self, root):
        auth = root / '.pi/agent/auth.json'; auth.parent.mkdir(parents=True)
        auth.write_text(json.dumps({'openai-codex': {'access': 'synthetic-fixture-only', 'accountId': 'fixture'}}))
        run = root / 'run'
        gateway = object.__new__(InferenceGateway)
        gateway.ledger = Ledger(run, {'experiment_id': 'fixture', 'experiment_revision': 'research-v002',
                                     'project_id': 'workboard', 'project_revision': 'fixture', 'run_id': 'fixture'})
        prices = {'gpt-6-luna': {'pricing': {'prompt': '0.01', 'completion': '0.02', 'input_cache_read': '0.005'},
                               'snapshot_sha256': 'frozen-price-hash', 'reference_id': 'fixture-price'}}
        gateway.prices = prices
        lease = {'model': 'gpt-6-luna', 'builder_id': 'b001', 'task_id': 'task-001',
                 'attempt_id': 'attempt-001', 'provider': 'subscription'}
        body = json.dumps({'model': lease['model'], 'input': 'identical task packet and assigned profile'}).encode()
        error = urllib.error.HTTPError('https://fixture.invalid', 503, 'unavailable', {},
                                      io.BytesIO(b'original fixture upstream transport failure'))
        with patch('pathlib.Path.home', return_value=root), patch('urllib.request.urlopen', side_effect=error) as dispatch:
            gateway.relay(Handler(), lease, json.loads(body), body)
        error.close()
        self.assertEqual(dispatch.call_count, 1)  # Original observation, no hidden retry.
        return run, read_jsonl(run / 'usage.jsonl'), read_jsonl(run / 'events.jsonl'), lease, prices

    def evidence(self, fixture): return terminal_attempt_evidence(*fixture)

    def test_real_gateway_503_is_terminal_counted_preserved_and_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = self.fixture(Path(tmp)); evidence = self.evidence(fixture)
            self.assertTrue(evidence['terminal_request_coverage']['complete_run_request_coverage'])
            self.assertEqual(len(evidence['request_ids']), 1)
            self.assertEqual(evidence['unknown_native_request_ids'], evidence['request_ids'])
            self.assertFalse(evidence['native_accounting_complete'])
            self.assertFalse(evidence['builder_assessment_performed'])
            self.assertIsNone(evidence['uncached_reference_usd_bounds']['point_estimate'])
            self.assertEqual(evidence['uncached_reference_usd_bounds']['lower'], '0')

    def test_missing_finish_duplicate_dispatch_and_unsupported_zero_cost_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            run, records, events, identity, prices = self.fixture(Path(tmp))
            with self.assertRaises(ValueError): terminal_attempt_evidence(run, records, events[:-1], identity, prices)
            with self.assertRaises(ValueError): terminal_attempt_evidence(run, records, events + [events[0]], identity, prices)
            records[0]['cost'] = {'uncached_reference_usd': '0'}
            with self.assertRaises(ValueError): terminal_attempt_evidence(run, records, events, identity, prices)

    def test_altered_raw_request_response_and_price_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = self.fixture(Path(tmp)); run, records, events, identity, prices = fixture
            altered = copy.deepcopy(prices); altered['gpt-6-luna']['snapshot_sha256'] = 'different'
            with self.assertRaises(ValueError): terminal_attempt_evidence(run, records, events, identity, altered)
            folder = run / 'tasks/task-001/attempts/b001/attempt-001/requests'
            for suffix in ('request.json', 'response.raw'):
                path = folder / (records[0]['request_id'] + '.' + suffix)
                original = path.read_bytes(); path.write_bytes(original + b'altered')
                with self.assertRaises(ValueError): self.evidence(fixture)
                path.write_bytes(original)

    def test_known_receipt_recomputes_independently_and_cannot_be_imputed(self):
        with tempfile.TemporaryDirectory() as tmp:
            run, records, events, identity, prices = self.fixture(Path(tmp))
            row = records[0]; usage = {'input_tokens': 10, 'output_tokens': 2, 'input_tokens_details': {'cached_tokens': 4}}
            raw = json.dumps({'usage': usage}).encode()
            folder = run / 'tasks/task-001/attempts/b001/attempt-001/requests'
            (folder / (row['request_id'] + '.response.raw')).write_bytes(raw)
            row.update(response_sha256=digest_bytes(raw), api_usage=usage, status=200, outcome='terminal-json',
                       counts={'input_tokens': 10, 'cached_input_tokens': 4, 'uncached_input_tokens': 6, 'output_tokens': 2},
                       cost={'uncached_reference_usd': '0.14', 'cache_aware_usd': '0.12'})
            events[-1].update(counts_complete=True, outcome='terminal-json')
            evidence = terminal_attempt_evidence(run, records, events, identity, prices)
            self.assertTrue(evidence['native_accounting_complete'])
            self.assertEqual(evidence['uncached_reference_usd_bounds']['point_estimate'], '0.14')
            row['cost']['uncached_reference_usd'] = '0'
            with self.assertRaises(ValueError): terminal_attempt_evidence(run, records, events, identity, prices)

    def test_only_new_revision_can_select_the_bound_policy_and_plan_must_match(self):
        manifest = {'experiment_revision': 'research-v001', 'execution': {}, 'research': {}}
        self.assertFalse(validate_policy(manifest, {}))
        manifest['execution']['provider_incident_policy'] = POLICY
        with self.assertRaises(ValueError): validate_policy(manifest, {})
        manifest.update(experiment_revision='research-v002'); manifest['research']['analysis_method'] = METHOD
        plan = {'revision_id': 'research-v002', 'status': 'frozen-before-main-dispatch', 'execution': {'provider_incident_policy': POLICY},
                'analysis_method': METHOD, 'submission_outcome_definition': ASSESSMENT}
        self.assertTrue(validate_policy(manifest, plan))
        plan['status'] = 'draft'
        with self.assertRaises(ValueError): validate_policy(manifest, plan)
        plan['status'] = 'frozen-before-main-dispatch'
        plan['submission_outcome_definition'] = 'different'
        with self.assertRaises(ValueError): validate_policy(manifest, plan)

    def test_observer_revision_requires_its_own_frozen_plan_without_changing_policy(self):
        manifest = {'experiment_revision': 'research-v003', 'execution': {'provider_incident_policy': POLICY},
                    'research': {'analysis_method': METHOD}}
        plan = {'revision_id': 'research-v003', 'status': 'frozen-before-main-dispatch',
                'execution': {'provider_incident_policy': POLICY}, 'analysis_method': METHOD,
                'submission_outcome_definition': ASSESSMENT}
        self.assertTrue(validate_policy(manifest, plan))
        for field, value in [('revision_id', 'research-v002'), ('status', 'draft'),
                             ('analysis_method', 'complete-native-point-v1')]:
            changed = copy.deepcopy(plan); changed[field] = value
            with self.assertRaises(ValueError): validate_policy(manifest, changed)

    def test_positive_anchor_revision_requires_its_own_frozen_plan_without_changing_policy(self):
        manifest = {'experiment_revision': 'research-v004', 'execution': {'provider_incident_policy': POLICY},
                    'research': {'analysis_method': METHOD}}
        plan = {'revision_id': 'research-v004', 'status': 'frozen-before-main-dispatch',
                'execution': {'provider_incident_policy': POLICY}, 'analysis_method': METHOD,
                'submission_outcome_definition': ASSESSMENT}
        self.assertTrue(validate_policy(manifest, plan))
        for field, value in [('revision_id', 'research-v002'), ('status', 'draft'),
                             ('analysis_method', 'complete-native-point-v1')]:
            changed = copy.deepcopy(plan); changed[field] = value
            with self.assertRaises(ValueError): validate_policy(manifest, changed)

    def test_action_revision_cannot_reuse_prior_plan_or_change_missing_cost_rules(self):
        manifest = {'experiment_revision': 'research-v005', 'execution': {'provider_incident_policy': POLICY},
                    'research': {'analysis_method': METHOD}}
        plan = {'revision_id': 'research-v005', 'status': 'frozen-before-main-dispatch',
                'execution': {'provider_incident_policy': POLICY}, 'analysis_method': METHOD,
                'submission_outcome_definition': ASSESSMENT}
        self.assertTrue(validate_policy(manifest, plan))
        for field, value in [('revision_id', 'research-v004'), ('status', 'prepared-not-frozen'),
                             ('analysis_method', 'complete-native-point-v1')]:
            changed = copy.deepcopy(plan); changed[field] = value
            with self.assertRaises(ValueError): validate_policy(manifest, changed)

    def partial_fixture(self, root):
        from orchestrator.partial_report import augment
        run, records, events, identity, prices = self.fixture(root)
        folder=run/'tasks/task-001/attempts/b001/attempt-001'
        native_hashes={}
        for name in ('native-history.bundle','native-working-tree.tar.gz','native-git.json'):
            (folder/name).write_bytes(b'synthetic labelled native export fixture')
            native_hashes[name]=digest_bytes((folder/name).read_bytes())
        events.extend([{'kind': 'submission_observed', **identity, 'archive': {'history.bundle': 'fixture-history-hash'}},
                       {'kind': 'infrastructure_attempt_retained', **identity, 'request_ids': [records[0]['request_id']], 'native_export_sha256':native_hashes},
                       {'kind': 'validation_started', **identity, 'attempt_id': 'attempt-002'},
                       {'kind': 'validation_finished', **identity, 'attempt_id': 'attempt-002', 'success': True}])
        tasks = [{'builder_id': 'b001', 'task_id': 'task-001', 'builder_execution_nanoseconds': 123,
                  'attempts': [{'wall_nanoseconds': 123}], 'first_submission_accepted': False,
                  'token_totals': {'input_tokens': 0}, 'cache_aware_usd': '0', 'uncached_reference_usd': '0'}]
        builders = [{'builder_id': 'b001', 'cache_aware_usd': '0', 'uncached_reference_usd': '0'}]
        manifest = {'pricing': prices, 'research': {'analysis_method': METHOD}}
        problems = ['missing usage: ' + records[0]['request_id']]
        return augment, [run, manifest, events, records, tasks, builders, problems, {'status': 'awaiting_frozen_round'}]

    def test_partial_report_labels_unknown_cost_and_first_assessment_without_erasing_strict_problem(self):
        with tempfile.TemporaryDirectory() as tmp:
            augment, args = self.partial_fixture(Path(tmp)); result = augment(*args)
            self.assertTrue(result['analysis_ready'])
            self.assertFalse(result['native_accounting_complete'])
            self.assertEqual(len(args[6]), 1)  # Strict problem list is retained.
            row = args[4][0]
            self.assertIsNone(row['uncached_reference_usd'])
            self.assertEqual(row['known_uncached_reference_usd'], '0')
            self.assertTrue(row['first_assessed_submission_accepted'])
            self.assertFalse(row['first_scheduled_attempt_accepted'])
            self.assertIn('token_totals_known', row)

    def test_partial_report_cannot_relax_packet_source_or_functional_problems(self):
        for problem in ('common packet missing: fixture', 'archive checksum: fixture', 'not accepted: fixture'):
            with tempfile.TemporaryDirectory() as tmp:
                augment, args = self.partial_fixture(Path(tmp)); args[6].append(problem)
                result = augment(*args)
                self.assertFalse(result['analysis_ready'])
                self.assertIn(problem, result['analysis_problems'])

    def test_partial_report_unrecorded_incident_missing_request_or_validation_misclassification_blocks(self):
        for mutation in ('marker', 'dispatch', 'assessment'):
            with tempfile.TemporaryDirectory() as tmp:
                augment, args = self.partial_fixture(Path(tmp))
                if mutation == 'marker': args[2][:] = [e for e in args[2] if e['kind'] != 'infrastructure_attempt_retained']
                elif mutation == 'dispatch': args[2][:] = [e for e in args[2] if e['kind'] != 'inference_request_started']
                else: args[2].append({'kind': 'validation_started', 'builder_id': 'b001', 'task_id': 'task-001', 'attempt_id': 'attempt-001'})
                self.assertFalse(augment(*args)['analysis_ready'])

    def test_recovery_requires_archive_preserves_receipts_and_never_records_builder_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            run, records, events, identity, prices = self.fixture(Path(tmp))
            manifest = {'experiment_revision': 'research-v002', 'execution': {'provider_incident_policy': POLICY},
                        'research': {'analysis_method': METHOD}, 'pricing': prices}
            checkpoint = run / 'builders/b001/checkpoints/task-001-attempt-001'; checkpoint.mkdir(parents=True)
            file = checkpoint / 'synthetic-archive-checksum-fixture'; file.write_bytes(b'preserved fixture source')
            index = {'checksums': {file.name: digest_bytes(file.read_bytes())}}
            output = run / 'tasks/task-001/attempts/b001/attempt-001'
            index.update(source_commit='fixture-commit',source_tree='fixture-tree')
            (output/'native-history.bundle').write_bytes(b'synthetic labelled native history fixture')
            (output/'native-working-tree.tar.gz').write_bytes(b'synthetic labelled working tree fixture')
            (output/'native-git.json').write_text(json.dumps({'head':'fixture-commit','tree':'fixture-tree'}))
            ledger = Ledger(run, {})
            file.write_bytes(b'corrupted')
            with self.assertRaises(ValueError): retain_for_recovery(run, manifest, records, identity, output, index, 'fixture-commit', ledger)
            self.assertFalse((output / 'infrastructure-incident.json').exists())
            file.write_bytes(b'preserved fixture source')
            usage_before = (run / 'usage.jsonl').read_bytes()
            feedback = retain_for_recovery(run, manifest, records, identity, output, index, 'fixture-commit', ledger)
            self.assertIn('unchanged original requirement', feedback)
            self.assertEqual((run / 'usage.jsonl').read_bytes(), usage_before)
            kinds = [e['kind'] for e in read_jsonl(run / 'events.jsonl')]
            self.assertIn('infrastructure_attempt_retained', kinds)
            self.assertNotIn('attempt_rejected', kinds)
            self.assertNotIn('validation_started', kinds)
            manifest['experiment_revision'] = 'research-v001'
            with self.assertRaises(ValueError): retain_for_recovery(run, manifest, records, identity, output, index, 'fixture-commit', ledger)
