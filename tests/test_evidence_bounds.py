import itertools
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path
from orchestrator.analysis import median_interval
from orchestrator.confirmation import FAMILY, MODELS, HARNESSES, record_look, confirmed_stop
from orchestrator.bounded_confirmation import trajectory_contrasts, evaluate, METHOD, candidate_agreement, assigned_runs
from orchestrator.evidence import read_jsonl
from orchestrator.evidence_bounds import (cost_bounds, ratio_bounds, first_assessed_submission,
                                          median_outer_interval, classify_bounds)


class EvidenceBoundsTests(unittest.TestCase):
    def test_unknown_cost_is_not_a_point_or_zero(self):
        bounds = cost_bounds(['1.25', None, '0.75'])
        self.assertEqual(bounds, {'lower': '2.00', 'upper': None,
                                 'missing_receipts': 1, 'point_estimate': None})
        self.assertEqual(cost_bounds(['1', '2'])['point_estimate'], '3')
        for cost in ('NaN', 'Infinity', '-1'):
            with self.assertRaises(ValueError): cost_bounds([cost])

    def test_ratio_retains_unbounded_cost_and_undefined_denominator(self):
        self.assertEqual(ratio_bounds(cost_bounds(['2']), cost_bounds(['1', None])),
                         {'lower': '0', 'upper': '2'})
        self.assertEqual(ratio_bounds(cost_bounds(['2', None]), cost_bounds(['1'])),
                         {'lower': '2', 'upper': None})
        self.assertEqual(ratio_bounds(cost_bounds(['2']), cost_bounds([None]))['upper'], None)

    def test_complete_median_matches_original_and_contains_every_completion(self):
        complete = [str(i) for i in range(-10, 10)]
        original = median_interval(complete, Fraction(1, 20))
        bounded = median_outer_interval([{'lower': x, 'upper': x} for x in complete], Fraction(1, 20))
        for key in ('lower', 'upper'):
            self.assertEqual(Fraction(original[key]), Fraction(bounded[key]))
        outer = median_outer_interval([{'lower': str(i), 'upper': str(i + 2)} for i in range(6)], Fraction(1, 2))
        for choice in itertools.product((0, 2), repeat=6):
            interval = median_interval([str(i + delta) for i, delta in enumerate(choice)], Fraction(1, 2))
            self.assertLessEqual(Fraction(outer['lower']), Fraction(interval['lower']))
            self.assertGreaterEqual(Fraction(outer['upper']), Fraction(interval['upper']))

    def test_unknowns_and_small_samples_remain_unresolved(self):
        for values in ([{'lower': '0', 'upper': None}] * 20,
                       [{'lower': '1', 'upper': '1'}]):
            self.assertEqual(classify_bounds(median_outer_interval(values, Fraction(1, 1440))), 'unresolved')

    def test_provider_incident_is_not_a_first_assessed_rejection(self):
        events = [{'kind': 'infrastructure_attempt_retained', 'attempt_id': 'attempt-001'},
                  {'kind': 'validation_started', 'attempt_id': 'attempt-002'},
                  {'kind': 'validation_finished', 'attempt_id': 'attempt-002', 'success': True}]
        for event in events: event.update(builder_id='b001', task_id='task-001')
        self.assertEqual(first_assessed_submission(events, 'b001', 'task-001'),
                         {'attempt_id': 'attempt-002', 'accepted': True})
        events[-1]['success'] = False
        self.assertFalse(first_assessed_submission(events, 'b001', 'task-001')['accepted'])
        with self.assertRaises(ValueError): first_assessed_submission(events[:-1], 'b001', 'task-001')
        with self.assertRaises(ValueError): first_assessed_submission(events + [events[-1]], 'b001', 'task-001')


class BoundedConfirmationTests(unittest.TestCase):
    def rows(self):
        configurations = []; rows = []; tasks = [f'task-{i:03d}' for i in range(21, 31)]
        for model, harness, profile in itertools.product(MODELS, HARNESSES, ('none', 'minimal', 'maximum')):
            bid = f'{model}-{harness}-{profile}'
            configurations.append({'builder_id': bid, 'model': model, 'harness': harness, 'profile': profile})
            for task in tasks:
                rows.append({'builder_id': bid, 'task_id': task, 'accepted': True,
                             'builder_execution_nanoseconds': 100,
                             'uncached_reference_usd_bounds': cost_bounds(['1']),
                             'first_assessed_submission_accepted': True})
        return configurations, rows, tasks

    def replicates(self, prefix, unknown=False):
        return [{'run_id': prefix + str(i), 'contrasts': {
            key: {'lower': '0' if key.endswith('|first_rejection') or unknown else '1',
                  'upper': '0' if key.endswith('|first_rejection') else None if unknown else '1'}
            for key in FAMILY}} for i in range(20)]

    def test_all_configurations_tasks_and_family_are_required(self):
        configs, rows, tasks = self.rows()
        results = trajectory_contrasts(configs, rows, tasks)
        self.assertEqual(set(results), set(FAMILY))
        with self.assertRaises(ValueError): trajectory_contrasts(configs, rows[:-1], tasks)
        with self.assertRaises(ValueError): trajectory_contrasts(configs[:-1], rows, tasks)
        with self.assertRaises(ValueError): trajectory_contrasts(configs + [configs[0]], rows, tasks)
        with self.assertRaises(ValueError): trajectory_contrasts(configs, rows + [rows[0]], tasks)

    def test_unknown_task_cost_is_retained_in_aggregate(self):
        configs, rows, tasks = self.rows()
        maximum = next(r for r in rows if r['builder_id'] == 'gpt-6-luna-pi-maximum')
        maximum['uncached_reference_usd_bounds'] = cost_bounds(['1', None])
        result = trajectory_contrasts(configs, rows, tasks)
        self.assertEqual(result['gpt-6-luna|pi|maximum|none|reference_cost'], {'lower': '1', 'upper': None})
        self.assertEqual(result['gpt-6-luna|pi|maximum|none|first_rejection'], {'lower': '0', 'upper': '0'})

    def test_complete_batches_can_confirm_but_unknown_cost_cannot(self):
        results = evaluate(self.replicates('unknown', True), 1)
        self.assertTrue(all(r['classification'] == 'unresolved' for k, r in results.items() if not k.endswith('|first_rejection')))
        with tempfile.TemporaryDirectory() as tmp:
            journal = Path(tmp) / 'looks.jsonl'
            record_look(journal, 'a', self.replicates('a'), 'candidate', 'plan', analysis_method=METHOD)
            record_look(journal, 'b', self.replicates('b'), 'candidate', 'plan', analysis_method=METHOD)
            self.assertTrue(confirmed_stop(read_jsonl(journal))['confirmed'])

    def test_omitting_assigned_runs_reusing_runs_or_switching_method_fails_and_consumes_look(self):
        with tempfile.TemporaryDirectory() as tmp:
            journal = Path(tmp) / 'looks.jsonl'
            runs = self.replicates('a')
            record_look(journal, 'a', runs, 'candidate', 'plan', analysis_method=METHOD)
            with self.assertRaises(ValueError): record_look(journal, 'a', runs[1:], 'candidate', 'plan', analysis_method=METHOD)
            with self.assertRaises(ValueError): record_look(journal, 'b', runs, 'candidate', 'plan', analysis_method=METHOD)
            with self.assertRaises(ValueError): record_look(journal, 'a', runs, 'candidate', 'plan')
            self.assertEqual(len([r for r in read_jsonl(journal) if r['kind'] == 'confirmation_look_started']), 4)

    def test_missing_family_member_is_not_dropped(self):
        runs = self.replicates('a')
        del runs[0]['contrasts'][FAMILY[0]]
        with self.assertRaises(ValueError): evaluate(runs, 1)

    def test_candidate_requires_identified_stable_execution_and_assessments_but_keeps_unknown_cost(self):
        previous = {key: 'practical_equivalence' for key in FAMILY}; current = dict(previous)
        cost = next(k for k in FAMILY if k.endswith('|reference_cost'))
        current[cost] = 'unresolved'
        self.assertTrue(candidate_agreement(previous, current))
        current[cost] = 'regression'
        self.assertFalse(candidate_agreement(previous, current))
        current = dict(previous)
        current[next(k for k in FAMILY if k.endswith('|execution'))] = 'unresolved'
        self.assertFalse(candidate_agreement(previous, current))
        current = dict(previous)
        current[next(k for k in FAMILY if k.endswith('|first_rejection'))] = 'unresolved'
        self.assertFalse(candidate_agreement(previous, current))

    def test_cohort_registry_retains_unfinished_assignments_and_refuses_reassignment(self):
        assignments = [{'kind': 'confirmation_run_assigned', 'run_id': rid, 'batch': 'first',
                        'candidate_sha256': 'candidate', 'plan_sha256': 'plan'} for rid in ('complete', 'unknown', 'unfinished')]
        self.assertEqual(assigned_runs(assignments, 'first', 'candidate', 'plan'), ['complete', 'unknown', 'unfinished'])
        with self.assertRaises(ValueError): assigned_runs(assignments, 'first', 'different', 'plan')
        with self.assertRaises(ValueError): assigned_runs(assignments, 'first', 'candidate', 'different')
        with self.assertRaises(ValueError): assigned_runs(assignments + [dict(assignments[0], batch='second')], 'first', 'candidate', 'plan')
        with self.assertRaises(ValueError): assigned_runs([], 'first', 'candidate', 'plan')
