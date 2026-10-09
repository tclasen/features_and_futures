"""PM-owned deterministic accounting and append-only observations."""
import hashlib
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

_LOCK = threading.Lock()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


def digest_json(value):
    return digest_bytes(canonical(value).encode())


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def append_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK, path.open("a", encoding="utf-8") as stream:
        stream.write(canonical(value) + "\n")
        stream.flush()
        os.fsync(stream.fileno())


class Ledger:
    def __init__(self, run_dir, identity):
        self.root = run_dir
        self.root.mkdir(parents=True, exist_ok=True)
        self.identity = identity
        self.clock_id = f"{os.uname().nodename}:pm-monotonic"

    def event(self, kind, **details):
        record = {
            "schema_version": 1, "event_id": str(uuid.uuid4()),
            **self.identity, "observer": "pm", "utc": timestamp(),
            "monotonic_ns": time.monotonic_ns(), "clock_id": self.clock_id,
            "kind": kind, **details,
        }
        append_json(self.root / "events.jsonl", record)
        return record


def native_counts(usage):
    """Return disjoint categories; hidden reasoning remains inside output."""
    if not isinstance(usage, dict):
        return None
    inputs = usage.get("input_tokens", usage.get("prompt_tokens"))
    outputs = usage.get("output_tokens", usage.get("completion_tokens"))
    if inputs is None or outputs is None:
        return None
    details = usage.get("input_tokens_details", usage.get("prompt_tokens_details")) or {}
    cached = details.get("cached_tokens", 0)
    for number in (inputs, outputs, cached):
        if not isinstance(number, int) or isinstance(number, bool) or number < 0:
            raise ValueError("Native token counters must be nonnegative integers.")
    if cached > inputs:
        raise ValueError("Cached inputs exceed total inputs.")
    output_details = usage.get(
        "output_tokens_details", usage.get("completion_tokens_details")
    ) or {}
    reasoning = output_details.get("reasoning_tokens")
    if reasoning is not None and (
        not isinstance(reasoning, int) or reasoning < 0 or reasoning > outputs
    ):
        raise ValueError("Reasoning tokens must be included in native output.")
    return {
        "input_tokens": inputs, "cached_input_tokens": cached,
        "uncached_input_tokens": inputs - cached, "output_tokens": outputs,
        "reasoning_tokens_included": reasoning,
    }


def price_counts(counts, pricing):
    if counts is None:
        return None
    selected = dict(pricing)
    for tier in sorted(pricing.get("overrides", []),
                       key=lambda item: item["min_prompt_tokens"]):
        if counts["input_tokens"] >= tier["min_prompt_tokens"]:
            selected.update(tier)
    prompt = Decimal(selected["prompt"])
    completion = Decimal(selected["completion"])
    cache = Decimal(selected.get("input_cache_read", selected["prompt"]))
    uncached = Decimal(counts["uncached_input_tokens"])
    cached = Decimal(counts["cached_input_tokens"])
    output = Decimal(counts["output_tokens"])
    # Snapshot API prices are USD per token, not per million.
    return {
        "cache_aware_usd": str(uncached * prompt + cached * cache + output * completion),
        "uncached_reference_usd": str((uncached + cached) * prompt + output * completion),
        "rounding": "none; decimal strings", "rate_unit": "USD/token",
    }


def read_jsonl(path):
    if not path.exists():
        return []
    with _LOCK:
        return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
