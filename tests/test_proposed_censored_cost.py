from fractions import Fraction
import unittest
from orchestrator.analysis import median_interval
from orchestrator.proposals.censored_cost_v1 import cost_bounds, ratio_bounds, median_bounds, classify_bounds

class ProposedCostTests(unittest.TestCase):
    def test_unknown_receipt_has_no_point_estimate_or_finite_upper(self):
        result=cost_bounds(["0.1",None,"0.2"])
        self.assertEqual(result,{"lower":"0.3","upper":None,"missing_receipts":1,"point_estimate":None})
        exact=cost_bounds(["0.3"])
        self.assertEqual(ratio_bounds(result,exact),(Fraction(1),None))
        self.assertEqual(ratio_bounds(exact,result),(Fraction(0),Fraction(1)))

    def test_complete_bounds_equal_existing_exact_interval(self):
        result=median_bounds([(i,i) for i in range(20)],Fraction(1,20))
        existing=median_interval(range(20),Fraction(1,20))
        self.assertEqual((result["lower"],result["upper"]),(existing["lower"],existing["upper"]))

    def test_missing_costs_do_not_force_false_equivalence(self):
        result=median_bounds([(0,None)]*20,Fraction(1,20))
        self.assertEqual(classify_bounds(result),"unresolved")
        self.assertFalse(result["finite"])

    def test_minority_censoring_retains_all_runs_with_conservative_median(self):
        result=median_bounds([(1,1)]*19+[(0,None)],Fraction(1,20))
        self.assertEqual(result["independent_runs"],20)
        self.assertEqual(result["censored_runs"],1)
        self.assertEqual(classify_bounds(result),"practical_equivalence")

    def test_interval_contains_complete_data_interval_for_each_completion(self):
        bounds=[(i,i+2) for i in range(19)]+[(0,None)]
        observed=median_bounds(bounds,Fraction(1,20))
        for completion in (0,10,1000000):
            truth=median_interval(list(range(19))+[completion],Fraction(1,20))
            self.assertLessEqual(Fraction(observed["lower"]),Fraction(truth["lower"]))
            if observed["upper"] is not None:self.assertGreaterEqual(Fraction(observed["upper"]),Fraction(truth["upper"]))

    def test_zero_or_unknown_denominator_never_manufactures_ratio(self):
        with self.assertRaises(ValueError):ratio_bounds(cost_bounds(["1"]),cost_bounds([None]))
