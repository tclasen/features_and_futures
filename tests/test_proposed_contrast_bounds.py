from fractions import Fraction
from itertools import product
import unittest
from orchestrator.analysis import median_interval,look_alpha
from orchestrator.proposals.contrast_bounds_v1 import median_outer_interval,first_rejection_bounds,difference_bounds


class ProposedContrastBoundsTests(unittest.TestCase):
    def test_complete_signed_values_match_existing_interval(self):
        values=list(range(-10,10));alpha=Fraction(1,20)
        actual=median_outer_interval([(x,x) for x in values],alpha)
        exact=median_interval(values,alpha)
        self.assertEqual(Fraction(actual['lower']),Fraction(exact['lower']))
        self.assertEqual(Fraction(actual['upper']),Fraction(exact['upper']))

    def test_every_extreme_completion_interval_is_contained(self):
        bounds=[(-4,-1),(-3,3),(-1,2),(0,4),(2,5),(4,8)]
        alpha=Fraction(1,2);outer=median_outer_interval(bounds,alpha)
        for values in product(*bounds):
            exact=median_interval(values,alpha)
            self.assertLessEqual(Fraction(outer['lower']),Fraction(exact['lower']))
            self.assertGreaterEqual(Fraction(outer['upper']),Fraction(exact['upper']))

    def test_unbounded_unknowns_are_retained_and_can_prevent_classification(self):
        interval=median_outer_interval([(0,None)]*20,look_alpha(1,36))
        self.assertEqual(interval['independent_runs'],20)
        self.assertEqual(interval['partially_observed_runs'],20)
        self.assertFalse(interval['finite'])

    def test_small_sample_does_not_invent_finite_interval(self):
        interval=median_outer_interval([(1,1)]*5,look_alpha(1,36))
        self.assertFalse(interval['finite'])

    def test_unknown_first_submission_is_neither_acceptance_nor_rejection(self):
        left=first_rejection_bounds([True,False,None,None])
        right=first_rejection_bounds([False,True,True,True])
        self.assertEqual(left,(Fraction(1,4),Fraction(3,4)))
        self.assertEqual(difference_bounds(left,right),(Fraction(0),Fraction(1,2)))

    def test_invalid_outcomes_and_unordered_bounds_refused(self):
        with self.assertRaises(ValueError):first_rejection_bounds([1])
        with self.assertRaises(ValueError):median_outer_interval([(2,1)],Fraction(1,20))
