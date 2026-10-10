"""Prospective partial-identification calculations; v001 remains point-only.

None denotes an unbounded upper endpoint, never a zero cost. Fractions keep
paired ratios and order statistics exact. Native evidence verification belongs
to the report gate, before these functions receive their inputs.
"""
from decimal import Decimal
from fractions import Fraction
from math import comb


def cost_bounds(costs):
    known = Decimal(0)
    missing = 0
    for cost in costs:
        if cost is None:
            missing += 1
            continue
        value = Decimal(str(cost))
        if not value.is_finite() or value < 0:
            raise ValueError('Native cost must be finite and nonnegative')
        known += value
    return {'lower': str(known), 'upper': None if missing else str(known),
            'missing_receipts': missing,
            'point_estimate': None if missing else str(known)}


def ordered_bounds(value):
    lower = Fraction(value['lower'])
    upper = None if value['upper'] is None else Fraction(value['upper'])
    if upper is not None and upper < lower:
        raise ValueError('Ordered bounds required')
    return lower, upper


def ratio_bounds(numerator, denominator):
    low, high = ordered_bounds(numerator)
    base, ceiling = ordered_bounds(denominator)
    if low < 0 or base < 0:
        raise ValueError('Nonnegative cost bounds required')
    if base == 0:
        # A zero measured lower bound cannot establish a defined denominator.
        return {'lower': '0', 'upper': None,
                'unidentified_reason': 'positive_denominator_not_established'}
    return {'lower': str(Fraction(0) if ceiling is None else low / ceiling),
            'upper': None if high is None else str(high / base)}


def rejection_bounds(outcomes):
    if not outcomes or any(type(x) is not bool and x is not None for x in outcomes):
        raise ValueError('Boolean or unknown assessment outcomes required')
    rejected = sum(x is False for x in outcomes)
    missing = sum(x is None for x in outcomes)
    return {'lower': str(Fraction(rejected, len(outcomes))),
            'upper': str(Fraction(rejected + missing, len(outcomes)))}


def difference_bounds(left, right):
    a, b = ordered_bounds(left)
    c, d = ordered_bounds(right)
    if b is None or d is None:
        raise ValueError('Finite difference bounds required')
    return {'lower': str(a - d), 'upper': str(b - c)}


def median_outer_interval(bounds, alpha):
    alpha = Fraction(alpha)
    if not bounds or not 0 < alpha < 1:
        raise ValueError('Independent-run bounds and a probability required')
    pairs = [ordered_bounds(value) for value in bounds]
    n = len(pairs)
    rank = None
    for k in range(1, (n + 1) // 2 + 1):
        if Fraction(2 * sum(comb(n, i) for i in range(k)), 2 ** n) <= alpha:
            rank = k
    lowers = sorted(left for left, _ in pairs)
    uppers = sorted(right for _, right in pairs if right is not None)
    low = lowers[rank - 1] if rank else None
    index = n - rank if rank else None
    high = uppers[index] if rank and index < len(uppers) else None
    return {'lower': None if low is None else str(low),
            'upper': None if high is None else str(high),
            'finite': low is not None and high is not None,
            'independent_runs': n, 'rank': rank, 'alpha': str(alpha),
            'partially_observed_runs': sum(b is None or a != b for a, b in pairs),
            'assumptions': 'IID latent independent-run contrasts; valid containing bounds; no missing-at-random assumption'}


def classify_bounds(interval, left='0.8', right='1.2'):
    if not interval['finite']:
        return 'unresolved'
    low, high = ordered_bounds(interval)
    left, right = Fraction(left), Fraction(right)
    if left > right:
        raise ValueError('Ordered practical margins required')
    if high < left:
        return 'improvement'
    if low > right:
        return 'regression'
    if low >= left and high <= right:
        return 'practical_equivalence'
    return 'unresolved'


def first_assessed_submission(events, builder_id, task_id):
    """Observed first PM assessment, excluding pre-assessment infrastructure.

    This prospective estimand is distinct from acceptance on attempt-001.
    An incomplete assessment is an evidence error, not a counterfactual result.
    """
    selected = [e for e in events if e.get('builder_id') == builder_id
                and e.get('task_id') == task_id]
    starts = [e for e in selected if e['kind'] == 'validation_started']
    finishes = [e for e in selected if e['kind'] == 'validation_finished']
    if len({e['attempt_id'] for e in starts}) != len(starts):
        raise ValueError('Duplicate assessment start')
    if len({e['attempt_id'] for e in finishes}) != len(finishes):
        raise ValueError('Duplicate assessment finish')
    if {e['attempt_id'] for e in starts} != {e['attempt_id'] for e in finishes}:
        raise ValueError('Unclosed or unmatched assessment')
    if not starts:
        raise ValueError('No observed submission assessment')
    first = starts[0]
    finish = next(e for e in finishes if e['attempt_id'] == first['attempt_id'])
    if selected.index(finish) <= selected.index(first) or type(finish.get('success')) is not bool:
        raise ValueError('Invalid assessment ordering or outcome')
    return {'attempt_id': first['attempt_id'], 'accepted': finish['success']}
