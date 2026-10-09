import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from orchestrator.evidence import Ledger, native_counts, price_counts, read_jsonl


class AccountingTests(unittest.TestCase):
    def test_cached_inputs_and_hidden_reasoning_are_not_double_counted(self):
        counts = native_counts({
            "input_tokens": 10, "output_tokens": 5,
            "input_tokens_details": {"cached_tokens": 3},
            "output_tokens_details": {"reasoning_tokens": 2},
        })
        prices = {"prompt": "0.000002", "completion": "0.00001",
                  "input_cache_read": "0.0000001"}
        result = price_counts(counts, prices)
        self.assertEqual(Decimal("0.0000643"), Decimal(result["cache_aware_usd"]))
        self.assertEqual(Decimal("0.00007"), Decimal(result["uncached_reference_usd"]))
        self.assertEqual(5, counts["output_tokens"])

    def test_chat_completions_and_responses_counts_are_equivalent(self):
        a = native_counts({"input_tokens": 12, "output_tokens": 6})
        b = native_counts({"prompt_tokens": 12, "completion_tokens": 6})
        self.assertEqual(a, b)

    def test_context_tier_uses_native_total_input(self):
        counts = native_counts({
            "input_tokens": 272000, "output_tokens": 1,
            "input_tokens_details": {"cached_tokens": 200000},
        })
        result = price_counts(counts, {
            "prompt": "0.000002", "completion": "0.00001",
            "overrides": [{"min_prompt_tokens": 272000, "prompt": "0.000004",
                           "completion": "0.000015", "input_cache_read": "0.0000002"}],
        })
        self.assertEqual(Decimal("0.328015"), Decimal(result["cache_aware_usd"]))

    def test_missing_native_usage_is_unavailable(self):
        self.assertIsNone(native_counts(None))
        self.assertIsNone(native_counts({"input_tokens": 2}))
        self.assertIsNone(price_counts(None, {"prompt": "1", "completion": "1"}))

    def test_zero_usage_is_measurable(self):
        counts = native_counts({"input_tokens": 0, "output_tokens": 0})
        self.assertEqual("0", price_counts(counts, {
            "prompt": "1", "completion": "1"
        })["cache_aware_usd"])

    def test_invalid_disjoint_categories_are_rejected(self):
        for usage in [
            {"input_tokens": -1, "output_tokens": 1},
            {"input_tokens": 2, "output_tokens": True},
            {"input_tokens": 2, "output_tokens": 1,
             "input_tokens_details": {"cached_tokens": 3}},
            {"input_tokens": 2, "output_tokens": 1,
             "output_tokens_details": {"reasoning_tokens": 2}},
        ]:
            with self.assertRaises(ValueError):
                native_counts(usage)

    def test_events_are_append_only_and_use_one_observer_clock(self):
        with tempfile.TemporaryDirectory() as temp:
            ledger = Ledger(Path(temp), {"run_id": "fixture"})
            a = ledger.event("attempt_started", builder_id="one", task_id="task-one")
            b = ledger.event("attempt_failed", builder_id="one", task_id="task-one")
            records = read_jsonl(Path(temp) / "events.jsonl")
            self.assertEqual([a, b], records)
            self.assertLessEqual(a["monotonic_ns"], b["monotonic_ns"])
            self.assertEqual(a["clock_id"], b["clock_id"])
            self.assertNotEqual(a["event_id"], b["event_id"])


if __name__ == "__main__":
    unittest.main()
