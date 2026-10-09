"""Prepared future analysis; never imported by an active pilot.

Keep every independent trajectory. Unknown cost has no invented point estimate.
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
        else:
            value = Decimal(str(cost))
            if not value.is_finite() or value < 0:
                raise ValueError("Costs must be nonnegative finite native-derived values.")
            known += value
    return {"lower": str(known), "upper": None if missing else str(known),
            "missing_receipts": missing, "point_estimate": None if missing else str(known)}


def ratio_bounds(numerator, denominator):
    nlow = Fraction(numerator["lower"])
    dlow = Fraction(denominator["lower"])
    nhigh = None if numerator["upper"] is None else Fraction(numerator["upper"])
    dhigh = None if denominator["upper"] is None else Fraction(denominator["upper"])
    if nlow < 0 or dlow <= 0 or (nhigh is not None and nhigh < nlow) or (dhigh is not None and dhigh < dlow):
        raise ValueError("Valid costs and a positive measured denominator lower bound are required; otherwise leave the contrast unresolved.")
    return (Fraction(0) if dhigh is None else nlow / dhigh,
            None if nhigh is None else nhigh / dlow)


def median_bounds(bounds, alpha):
    if not bounds or not 0 < alpha < 1:
        raise ValueError("Independent-run bounds and a probability are required.")
    low = []; high = []; censored = 0
    for lower, upper in bounds:
        lower = Fraction(lower)
        upper = None if upper is None else Fraction(upper)
        if lower < 0 or (upper is not None and upper < lower):
            raise ValueError("Nonnegative, ordered ratio bounds are required.")
        censored += upper is None or lower != upper
        low.append(lower)
        if upper is not None:
            high.append(upper)
    n = len(bounds); chosen = None
    for k in range(1, (n + 1) // 2 + 1):
        if Fraction(2 * sum(comb(n, i) for i in range(k)), 2 ** n) <= alpha:
            chosen = k
    lower = sorted(low)[chosen - 1] if chosen else None
    upper_index = n - chosen if chosen else None
    upper = sorted(high)[upper_index] if chosen and upper_index < len(high) else None
    return {"lower": None if lower is None else str(lower),
            "upper": None if upper is None else str(upper),
            "finite": lower is not None and upper is not None,
            "independent_runs": n, "alpha": str(alpha),
            "censored_runs": censored,
            "estimand": "population median of paired independent-run cost ratios",
            "assumptions": "IID latent run contrasts; no independence assumption for missingness"}


def classify_bounds(interval, left="0.8", right="1.2"):
    if not interval["finite"]:
        return "unresolved"
    low, high = Fraction(interval["lower"]), Fraction(interval["upper"])
    left, right = Fraction(left), Fraction(right)
    if high < left: return "improvement"
    if low > right: return "regression"
    if low >= left and high <= right: return "practical_equivalence"
    return "unresolved"
