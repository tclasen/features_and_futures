"""Unadopted outer intervals for signed partially observed run contrasts.

No active evaluation imports this module. Bounds retain every independent run.
"""
from fractions import Fraction
from math import comb


def median_outer_interval(bounds, alpha):
    if not bounds or not 0 < alpha < 1:
        raise ValueError('Independent-run bounds and a probability are required')
    lower=[];upper=[];partial=0
    for left,right in bounds:
        left=Fraction(left);right=None if right is None else Fraction(right)
        if right is not None and right<left:raise ValueError('Ordered contrast bounds required')
        lower.append(left)
        if right is not None:upper.append(right)
        partial+=right is None or left!=right
    n=len(bounds);rank=None
    for k in range(1,(n+1)//2+1):
        if Fraction(2*sum(comb(n,i) for i in range(k)),2**n)<=alpha:rank=k
    left=sorted(lower)[rank-1] if rank else None
    index=n-rank if rank else None
    right=sorted(upper)[index] if rank and index<len(upper) else None
    return {'lower':None if left is None else str(left),'upper':None if right is None else str(right),'finite':left is not None and right is not None,'independent_runs':n,'partially_observed_runs':partial,'alpha':str(alpha),'rank':rank,'assumptions':'IID latent independent-run contrasts; each recorded bound contains its latent value; no missing-at-random assumption'}


def first_rejection_bounds(outcomes):
    """One Boolean first-submission outcome per task; None stays unidentified."""
    if not outcomes or any(type(x) is not bool and x is not None for x in outcomes):
        raise ValueError('Boolean or unknown first-submission outcomes required')
    known=sum(x is False for x in outcomes);unknown=sum(x is None for x in outcomes)
    return Fraction(known,len(outcomes)),Fraction(known+unknown,len(outcomes))


def difference_bounds(left,right):
    a,b=map(Fraction,left);c,d=map(Fraction,right)
    if a>b or c>d:raise ValueError('Ordered finite difference bounds required')
    return a-d,b-c
