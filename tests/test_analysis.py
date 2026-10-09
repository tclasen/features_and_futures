from decimal import Decimal
from fractions import Fraction
import unittest
from orchestrator.analysis import median_interval, look_alpha, classify

class ConfirmationTests(unittest.TestCase):
    def test_insufficient_replication_has_no_finite_claim(self):
        result=median_interval(["0.5"],look_alpha(1))
        self.assertFalse(result["finite"])
        self.assertEqual(classify(result,"0.8","1.2"),"unresolved")

    def test_known_exact_sign_test_interval(self):
        result=median_interval(range(20),Fraction(1,20))
        self.assertEqual((result["lower"],result["upper"]),("5","14"))

    def test_family_and_repeated_look_allocation(self):
        allocated=sum((look_alpha(j)*54 for j in range(1,101)),Fraction(0))
        self.assertEqual(allocated,Fraction(1,20)*Fraction(100,101))

    def test_hosted_family_preserves_global_error_allocation(self):
        allocated=sum((look_alpha(j,contrasts=36)*36 for j in range(1,101)),Fraction(0))
        self.assertEqual(allocated,Fraction(1,20)*Fraction(100,101))
        with self.assertRaises(ValueError):look_alpha(1,contrasts=0)

    def test_practical_findings_with_independent_replication(self):
        for value,expected in (("0.6","improvement"),("1","practical_equivalence"),("1.4","regression")):
            result=median_interval([value]*16,look_alpha(1))
            self.assertEqual(classify(result,"0.8","1.2"),expected)

    def test_missing_or_nonfinite_evidence_is_not_equivalence(self):
        for values in ([],["NaN"],["Infinity"]):
            with self.assertRaises(ValueError):median_interval(values,look_alpha(1))

if __name__=="__main__":unittest.main()
