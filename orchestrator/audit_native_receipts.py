"""Independently check archived terminal receipts and reference arithmetic.

A live-run snapshot covers recorded finished requests, never future/in-flight usage.
"""
import argparse
import hashlib
import json
from decimal import Decimal
from pathlib import Path
from .prepare import ROOT, write_json


def sha(data):
    return hashlib.sha256(data).hexdigest()


def receipt(raw):
    values = []
    try:
        item = json.loads(raw)
        if isinstance(item, dict):
            values.append(item)
    except (ValueError, UnicodeError):
        for block in raw.replace(b'\r\n', b'\n').split(b'\n\n'):
            data = b'\n'.join(line[5:].lstrip(b' ') for line in block.splitlines() if line.startswith(b'data:'))
            try:
                item = json.loads(data)
                if isinstance(item, dict):
                    values.append(item)
            except (ValueError, UnicodeError):
                continue
    counters = None
    for item in values:
        response = item.get('response') or item
        usage = response.get('usage')
        if usage:
            counters = usage
    return counters


def categories(usage):
    if usage is None:
        return None
    incoming = usage.get('input_tokens', usage.get('prompt_tokens'))
    outgoing = usage.get('output_tokens', usage.get('completion_tokens'))
    details = usage.get('input_tokens_details', usage.get('prompt_tokens_details')) or {}
    cached = details.get('cached_tokens', 0)
    if any(type(n) is not int or n < 0 for n in (incoming, outgoing, cached)) or cached > incoming:
        raise ValueError('Invalid receipt counters')
    return incoming, cached, outgoing


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', default='pilot-005')
    args = parser.parse_args()
    run = ROOT/'runs/instruction-effects'/args.run
    manifest = json.loads((run/'manifest.json').read_text())
    usage_bytes = (run/'usage.jsonl').read_bytes()
    records = [json.loads(line) for line in usage_bytes.splitlines() if line]
    problems = []
    known = Decimal(0)
    cache_known = Decimal(0)
    raw_hashes = {}
    verified = 0
    unknown = 0
    for entry in records:
        rid = entry['request_id']
        folder = run/'tasks'/entry['task_id']/'attempts'/entry['builder_id']/entry['attempt_id']/'requests'
        raw = (folder/(rid+'.response.raw')).read_bytes()
        payload = (folder/(rid+'.request.json')).read_bytes()
        raw_hashes[rid] = {'response': sha(raw), 'request': sha(payload)}
        if sha(raw) != entry['response_sha256'] or sha(payload) != entry['request_sha256']:
            problems.append(rid+': raw hash mismatch')
        api = receipt(raw)
        if api != entry.get('api_usage'):
            problems.append(rid+': archived API receipt differs from ledger')
        authoritative = api
        if entry['provider'] == 'ollama':
            observation_bytes = (folder/(rid+'.native-usage.json')).read_bytes()
            observations = json.loads(observation_bytes)
            completed = [o for o in observations if o['kind'] == 'native_generation_completed']
            if len(completed) != 1:
                problems.append(rid+': no unique native completion receipt')
                authoritative = None
            else:
                authoritative = completed[0]['usage']
                if api is not None and categories(api) != categories(authoritative):
                    problems.append(rid+': API/native counter disagreement')
            raw_hashes[rid]['native_observations_file'] = sha(observation_bytes)
        values = categories(authoritative)
        if values is None:
            unknown += 1
            if entry['counts'] is not None or entry['cost'] is not None:
                problems.append(rid+': unsupported counts or cost without a receipt')
            continue
        incoming, cached, outgoing = values
        recorded = entry['counts'] or {}
        if (recorded.get('input_tokens'), recorded.get('cached_input_tokens'), recorded.get('output_tokens')) != values or recorded.get('uncached_input_tokens') != incoming-cached:
            problems.append(rid+': normalized counters differ from receipt')
        rates = dict(manifest['pricing'][entry['model']]['pricing'])
        tiers = sorted(rates.get('overrides', []), key=lambda tier: tier['min_prompt_tokens'])
        for tier in tiers:
            if incoming >= tier['min_prompt_tokens']:
                rates.update(tier)
        reference = incoming*Decimal(rates['prompt']) + outgoing*Decimal(rates['completion'])
        cache_aware = (incoming-cached)*Decimal(rates['prompt']) + cached*Decimal(rates.get('input_cache_read', rates['prompt'])) + outgoing*Decimal(rates['completion'])
        cost = entry['cost'] or {}
        if cost.get('uncached_reference_usd') is None or Decimal(cost['uncached_reference_usd']) != reference or cost.get('cache_aware_usd') is None or Decimal(cost['cache_aware_usd']) != cache_aware:
            problems.append(rid+': reference arithmetic differs')
        known += reference
        cache_known += cache_aware
        verified += 1
    if len(set(entry['request_id'] for entry in records)) != len(records):
        problems.append('Duplicate request IDs')
    report = {
        'schema_version': 1, 'purpose': 'independent archived-receipt audit; no run outcomes changed',
        'audit_module_sha256': sha(Path(__file__).read_bytes()), 'usage_snapshot_sha256': sha(usage_bytes),
        'manifest_file_sha256': sha((run/'manifest.json').read_bytes()), 'raw_hashes': raw_hashes,
        'recorded_finished_requests': len(records), 'verified_native_receipts': verified,
        'unknown_receipts': unknown, 'known_uncached_reference_lower_bound_usd': str(known),
        'known_cache_aware_lower_bound_usd': str(cache_known),
        'recorded_requests_uncached_reference_usd': str(known) if unknown == 0 and not problems else None,
        'problems': problems, 'all_recorded_receipts_verified': not problems and unknown == 0 and bool(records),
        'limitations': ['A live snapshot excludes requests not yet recorded; it is not complete-run readiness.', 'Native counters cannot prove hidden tokens by independently reconstructing model inference.'],
    }
    encoded = json.dumps(report, sort_keys=True, separators=(',', ':')).encode()
    output = run/'reports'/('native-audit-'+sha(encoded)[:16]+'.json')
    write_json(output, report)
    print(json.dumps({k: report[k] for k in ('recorded_finished_requests','verified_native_receipts','unknown_receipts','all_recorded_receipts_verified','problems')}))
    print(str(output))
    if not report['all_recorded_receipts_verified']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
