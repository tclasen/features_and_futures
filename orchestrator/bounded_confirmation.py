"""Prospective v002 contrasts; no v001 trajectory selects these calculations."""
from fractions import Fraction
from itertools import product
from .analysis import look_alpha
from .confirmation import FAMILY, MODELS, HARNESSES, PAIRS
from .evidence_bounds import (ordered_bounds, ratio_bounds, rejection_bounds,
                              difference_bounds, median_outer_interval, classify_bounds)

METHOD = 'native-cost-outer-bounds-v1'


def assigned_runs(assignments, batch, candidate_hash, plan_hash):
    """Validate a prospective cohort registry, including never-finished runs."""
    seen = set(); selected = []
    for record in assignments:
        if record['kind'] != 'confirmation_run_assigned':
            raise ValueError('Unknown cohort registry event')
        if record['run_id'] in seen:
            raise ValueError('A confirmation run may be assigned only once')
        seen.add(record['run_id'])
        if record['batch'] == batch:
            if (record['candidate_sha256'], record['plan_sha256']) != (candidate_hash, plan_hash):
                raise ValueError('A batch cannot change its frozen candidate or plan')
            selected.append(record['run_id'])
    if not selected:
        raise ValueError('Register confirmation runs before native dispatch')
    return selected


def trajectory_contrasts(configurations, rows, task_ids):
    if len(task_ids) != 10 or len(set(task_ids)) != 10:
        raise ValueError('The same ten-task window is required')
    groups = {}
    for config in configurations:
        key = config['model'], config['harness'], config['profile']
        if key in groups:
            raise ValueError('Duplicate configuration')
        selected = [row for row in rows if row['builder_id'] == config['builder_id']
                    and row['task_id'] in task_ids]
        if len(selected) != 10 or {r['task_id'] for r in selected} != set(task_ids):
            raise ValueError('Missing or duplicate task outcomes')
        if any(r['accepted'] is not True or type(r['builder_execution_nanoseconds']) is not int
               or r['builder_execution_nanoseconds'] <= 0 for r in selected):
            raise ValueError('Complete functional trajectory and measured timing required')
        cost_pairs = [ordered_bounds(r['uncached_reference_usd_bounds']) for r in selected]
        if any(low < 0 for low, _ in cost_pairs):
            raise ValueError('Nonnegative native cost bounds required')
        cost = {'lower': str(sum((low for low, _ in cost_pairs), Fraction(0))),
                'upper': None if any(high is None for _, high in cost_pairs)
                else str(sum((high for _, high in cost_pairs), Fraction(0)))}
        execution = str(sum(r['builder_execution_nanoseconds'] for r in selected))
        groups[key] = ({'lower': execution, 'upper': execution}, cost,
                       rejection_bounds([r['first_assessed_submission_accepted'] for r in selected]))
    if set(groups) != set(product(MODELS, HARNESSES, ('none', 'minimal', 'maximum'))):
        raise ValueError('All twelve hosted configurations required')
    contrasts = {}
    for model, harness, (stronger, weaker) in product(MODELS, HARNESSES, PAIRS):
        left, right = groups[model, harness, stronger], groups[model, harness, weaker]
        for index, outcome in enumerate(('execution', 'reference_cost', 'first_rejection')):
            key = '|'.join((model, harness, stronger, weaker, outcome))
            contrasts[key] = (difference_bounds(left[index], right[index]) if index == 2
                              else ratio_bounds(left[index], right[index]))
    return contrasts


def evaluate(replicates, look_number):
    if not replicates or len({r['run_id'] for r in replicates}) != len(replicates):
        raise ValueError('Distinct independent runs required')
    if any(set(r['contrasts']) != set(FAMILY) for r in replicates):
        raise ValueError('Complete primary family required for every run')
    results = {}
    for key in FAMILY:
        interval = median_outer_interval([r['contrasts'][key] for r in replicates],
                                         look_alpha(look_number, contrasts=36))
        margins = ('-0.10', '0.10') if key.endswith('|first_rejection') else ('0.8', '1.2')
        results[key] = {**interval, 'classification': classify_bounds(interval, *margins)}
    return results


def descriptive(contrasts):
    if set(contrasts) != set(FAMILY):
        raise ValueError('Complete descriptive family required')
    result = {}
    for key, value in contrasts.items():
        low, high = ordered_bounds(value)
        margins = ('-0.10', '0.10') if key.endswith('|first_rejection') else ('0.8', '1.2')
        result[key] = classify_bounds({**value, 'finite': high is not None}, *margins)
    return result


def candidate_agreement(previous, current):
    """Freeze a candidate only; unresolved costs remain unresolved findings."""
    if set(previous) != set(FAMILY) or set(current) != set(FAMILY):
        raise ValueError('Complete descriptive families required')
    allowed = {'improvement', 'regression', 'practical_equivalence', 'unresolved'}
    if any(value not in allowed for value in (*previous.values(), *current.values())):
        raise ValueError('Invalid descriptive classification')
    for key in FAMILY:
        left, right = previous[key], current[key]
        if key.endswith('|reference_cost'):
            if left != 'unresolved' and right != 'unresolved' and left != right:
                return False
        elif left == 'unresolved' or left != right:
            return False
    return True
