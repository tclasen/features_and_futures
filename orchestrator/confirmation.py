"""Hosted instruction contrasts and append-only independent-confirmation looks."""
from decimal import Decimal
from itertools import product
from pathlib import Path
import json
import uuid
from .analysis import look_alpha, median_interval, classify
from .evidence import append_json, digest_json, read_jsonl, timestamp

MODELS = ('gpt-6-luna', 'gpt-6.1-sol')
HARNESSES = ('codex', 'pi')
PAIRS = (('maximum', 'none'), ('minimal', 'none'), ('maximum', 'minimal'))
OUTCOMES = ('execution', 'reference_cost', 'first_rejection')
FAMILY = tuple('|'.join((model, harness, stronger, weaker, outcome))
               for model, harness, (stronger, weaker), outcome in product(MODELS, HARNESSES, PAIRS, OUTCOMES))

def trajectory_contrasts(configurations, rows, task_ids):
    """Use run-level paired aggregates, never dependent tasks as repetitions."""
    if len(task_ids) != 10 or len(set(task_ids)) != 10:
        raise ValueError('Confirmation requires the same ten-task window')
    groups = {}
    for config in configurations:
        key = config['model'], config['harness'], config['profile']
        if key in groups: raise ValueError('Duplicate configuration')
        selected = [row for row in rows if row['builder_id'] == config['builder_id'] and row['task_id'] in task_ids]
        if len(selected) != 10 or {row['task_id'] for row in selected} != set(task_ids):
            raise ValueError('Missing or duplicate task outcomes')
        if any(not row['accepted'] or row['builder_execution_nanoseconds'] <= 0 for row in selected):
            raise ValueError('Incomplete trajectory cannot establish equivalence')
        costs = [Decimal(row['uncached_reference_usd']) for row in selected]
        if any(not cost.is_finite() or cost <= 0 for cost in costs):
            raise ValueError('Complete positive native reference costs required')
        if any(type(row['first_submission_accepted']) is not bool for row in selected):
            raise ValueError('Missing first-submission outcome')
        groups[key] = (Decimal(sum(row['builder_execution_nanoseconds'] for row in selected)),
                       sum(costs), Decimal(sum(not row['first_submission_accepted'] for row in selected)) / 10)
    expected = set(product(MODELS, HARNESSES, ('none', 'minimal', 'maximum')))
    if set(groups) != expected: raise ValueError('All twelve hosted configurations required')
    values = {}
    for model, harness, (stronger, weaker) in product(MODELS, HARNESSES, PAIRS):
        left, right = groups[model, harness, stronger], groups[model, harness, weaker]
        for index, outcome in enumerate(OUTCOMES):
            key = '|'.join((model, harness, stronger, weaker, outcome))
            values[key] = str(left[index] - right[index] if outcome == 'first_rejection' else left[index] / right[index])
    return values

def evaluate(replicates, look_number):
    if not replicates or len({r['run_id'] for r in replicates}) != len(replicates):
        raise ValueError('Distinct independent runs are required')
    results = {}
    for replicate in replicates:
        if set(replicate['contrasts']) != set(FAMILY): raise ValueError('Incomplete primary family')
    for key in FAMILY:
        interval = median_interval([r['contrasts'][key] for r in replicates], look_alpha(look_number, contrasts=36))
        margins = ('-0.10', '0.10') if key.endswith('|first_rejection') else ('0.8', '1.2')
        results[key] = {**interval, 'classification': classify(interval, *margins)}
    return results

def record_look(journal, batch, replicates, candidate_hash, plan_hash, evidence_loader=None,
                analysis_method='complete-native-point-v1'):
    """Reserve j before validation, so failed and inconclusive analyses consume looks."""
    journal = Path(journal)
    previous = read_jsonl(journal) if journal.exists() else []
    starts = [record for record in previous if record['kind'] == 'confirmation_look_started']
    j = len(starts) + 1
    record_id = str(uuid.uuid4())
    binding = {'look': j, 'batch': batch, 'candidate_sha256': candidate_hash, 'plan_sha256': plan_hash,
               'record_id': record_id, 'input_sha256': digest_json(replicates),
               'run_ids': [r['run_id'] for r in replicates], 'analysis_method': analysis_method}
    append_json(journal, {'kind': 'confirmation_look_started', 'utc': timestamp(), **binding})
    try:
        for prior in starts:
            if prior.get('analysis_method', 'complete-native-point-v1') != analysis_method:
                raise ValueError('Analysis method changed; create a new study journal')
            if prior['batch'] != batch and set(prior['run_ids']) & set(binding['run_ids']):
                raise ValueError('Independent confirmation batches cannot reuse runs')
            if prior['plan_sha256'] != plan_hash:
                raise ValueError('Plan changed; create a new study journal')
            if analysis_method == 'native-cost-outer-bounds-v1' and prior['batch'] == batch and not set(prior['run_ids']).issubset(binding['run_ids']):
                raise ValueError('Retain every run assigned to this confirmation batch')
        if evidence_loader is not None:
            replicates = evidence_loader()
            if [r['run_id'] for r in replicates] != binding['run_ids']:
                raise ValueError('Evidence loader changed planned run identities')
        if analysis_method == 'complete-native-point-v1':
            results = evaluate(replicates, j)
        elif analysis_method == 'native-cost-outer-bounds-v1':
            from .bounded_confirmation import evaluate as evaluate_bounds
            results = evaluate_bounds(replicates, j)
        else:
            raise ValueError('Unsupported analysis method')
        append_json(journal, {'kind': 'confirmation_look_finished', 'utc': timestamp(), **binding,
                             'analysis_inputs_sha256': digest_json(replicates), 'replicates': replicates,
                             'results': results, 'all_classified': all(r['classification'] != 'unresolved' for r in results.values())})
        return results
    except Exception as error:
        append_json(journal, {'kind': 'confirmation_look_failed', 'utc': timestamp(), **binding, 'error': str(error)})
        raise

def confirmed_stop(records):
    """Require two matching, disjoint confirmation batches for the same candidate."""
    complete = [r for r in records if r['kind'] == 'confirmation_look_finished' and r['all_classified']]
    for i, left in enumerate(complete):
        for right in complete[i + 1:]:
            if left['batch'] == right['batch'] or set(left['run_ids']) & set(right['run_ids']): continue
            if (left['plan_sha256'], left['candidate_sha256']) != (right['plan_sha256'], right['candidate_sha256']): continue
            if set(left['results']) != set(FAMILY) or set(right['results']) != set(FAMILY): continue
            if any(left['results'][key]['classification'] not in ('improvement', 'regression', 'practical_equivalence') or left['results'][key]['classification'] != right['results'][key]['classification'] for key in FAMILY): continue
            return {'confirmed': True, 'look_ids': [left['record_id'], right['record_id']],
                    'plan_sha256': left['plan_sha256'], 'candidate_sha256': left['candidate_sha256']}
    return {'confirmed': False}
