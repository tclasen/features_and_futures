"""Distribution-free confirmation intervals for independent repeated trajectories.

Pilot configurations and dependent task rounds are never treated as replicates.
"""
from decimal import Decimal
from fractions import Fraction
from math import comb

CONTRASTS = 54  # 6 model/harness pairs * 3 instruction pairs * 3 primary outcomes.

def look_alpha(look_number, contrasts=CONTRASTS):
    if not isinstance(look_number, int) or look_number < 1:
        raise ValueError("Look numbers begin at one and must include every attempted look.")
    if type(contrasts) is not int or contrasts < 1:
        raise ValueError("A positive preregistered comparison family size is required.")
    return Fraction(1, 20 * contrasts * look_number * (look_number + 1))

def median_interval(values, alpha):
    values = sorted(Decimal(str(v)) for v in values)
    if not values or any(not v.is_finite() for v in values):
        raise ValueError("Complete finite independent-run observations are required.")
    if not 0 < alpha < 1:
        raise ValueError("Alpha must be a probability.")
    n = len(values)
    # Exact binomial tails, without approximate floating-point tail probabilities.
    chosen = None
    for k in range(1, (n + 1) // 2 + 1):
        tail = Fraction(2 * sum(comb(n, i) for i in range(k)), 2 ** n)
        if tail <= alpha:
            chosen = k
    return {
        "independent_runs": n, "alpha": str(alpha),
        "lower": str(values[chosen - 1]) if chosen else None,
        "upper": str(values[n - chosen]) if chosen else None,
        "finite": chosen is not None,
        "estimand": "population median of paired independent-run contrasts",
        "assumptions": "independent identically distributed run contrasts; ties conservative",
    }

def classify(interval, lower_margin, upper_margin):
    if not interval["finite"]:
        return "unresolved"
    low, high = Decimal(interval["lower"]), Decimal(interval["upper"])
    left, right = Decimal(str(lower_margin)), Decimal(str(upper_margin))
    if high < left:
        return "improvement"
    if low > right:
        return "regression"
    if low >= left and high <= right:
        return "practical_equivalence"
    return "unresolved"
