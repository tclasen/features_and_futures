"""Verify stress-probe compaction, request coverage and original native receipts."""
import argparse
import json
from decimal import Decimal
from pathlib import Path
from .audit_native_receipts import categories, receipt, sha
from .evidence import read_jsonl
from .prepare import write_json


def compaction_metadata(payload):
    metadata=payload.get('client_metadata',{}).get('x-codex-turn-metadata')
    if not isinstance(metadata,str): return None
    try: parsed=json.loads(metadata)
    except ValueError: return None
    if parsed.get('request_kind') != 'compaction': return None
    return parsed.get('compaction')


def audit(root, prices):
    result=json.loads((root/'result.json').read_text())
    usage=read_jsonl(root/'usage.jsonl')
    events=read_jsonl(root/'events.jsonl')
    problems=[]
    ids=[r['request_id'] for r in usage]
    for kind in ('inference_request_started','inference_request_finished'):
        observed=[r['request_id'] for r in events if r['kind']==kind]
        if sorted(observed)!=sorted(ids) or len(set(observed))!=len(observed):
            problems.append('Request coverage mismatch: '+kind)
    if len(set(ids))!=len(ids): problems.append('Duplicate usage request IDs')
    cost=Decimal(0)
    compactions=[]
    request_hashes={}
    for record in usage:
        rid=record['request_id']
        folder=root/'tasks'/record['task_id']/'attempts'/record['builder_id']/record['attempt_id']/'requests'
        raw=(folder/(rid+'.response.raw')).read_bytes()
        request=(folder/(rid+'.request.json')).read_bytes()
        request_hashes[rid]={'request':sha(request),'response':sha(raw)}
        if sha(raw)!=record['response_sha256'] or sha(request)!=record['request_sha256']:
            problems.append(rid+': raw hash mismatch')
        payload=json.loads(request)
        metadata=compaction_metadata(payload)
        if metadata: compactions.append({'request_id':rid,'metadata':metadata})
        counter=receipt(raw)
        values=categories(counter)
        if values is None:
            problems.append(rid+': missing native counters'); continue
        incoming,cached,outgoing=values
        counts=record['counts'] or {}
        if counter!=record['api_usage'] or values!=(counts.get('input_tokens'),counts.get('cached_input_tokens'),counts.get('output_tokens')):
            problems.append(rid+': counters mismatch')
        rates=dict(prices[record['model']]['pricing'])
        for tier in sorted(rates.get('overrides',[]),key=lambda t:t['min_prompt_tokens']):
            if incoming>=tier['min_prompt_tokens']: rates.update(tier)
        reference=incoming*Decimal(rates['prompt'])+outgoing*Decimal(rates['completion'])
        cache=(incoming-cached)*Decimal(rates['prompt'])+cached*Decimal(rates.get('input_cache_read',rates['prompt']))+outgoing*Decimal(rates['completion'])
        if record['cost'] is None or Decimal(record['cost']['uncached_reference_usd'])!=reference or Decimal(record['cost']['cache_aware_usd'])!=cache:
            problems.append(rid+': cost arithmetic mismatch')
        cost+=reference
        if record['status']!=200: problems.append(rid+': unsuccessful request')
    successful_events=[e for e in result['native_compaction_events'] if e.get('type')=='compaction_end' and not e.get('aborted') and e.get('result')]
    if result['harness']=='codex':
        if not compactions: problems.append('No native compaction request metadata')
    elif not successful_events:
        problems.append('No successful native compaction end event')
    if result['exit_code']!=0 or not result['canary_preserved']:
        problems.append('Native continuation or canary check failed')
    return {'model':result['model'],'harness':result['harness'], 'verified':not problems,
            'request_count':len(usage),'compaction_requests':compactions,
            'successful_pi_compactions':len(successful_events),
            'uncached_reference_usd':str(cost),'problems':problems,'raw_hashes':request_hashes,
            'limitations':['Reduced thresholds verify native paths and accounting, not exhaustive long-context retention.',
                           'Tool display truncation occurred in Pi; full untruncated file fidelity is not established.']}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--evidence',required=True,type=Path)
    parser.add_argument('--manifest',required=True,type=Path)
    args=parser.parse_args()
    prices=json.loads(args.manifest.read_text())['pricing']
    pairs=[('gpt-6-luna','codex'),('gpt-6-luna','pi'),('gpt-6.1-sol','codex'),('gpt-6.1-sol','pi')]
    reports=[audit(args.evidence/(h+'-'+m),prices) for m,h in pairs]
    ids=[rid for report in reports for rid in report['raw_hashes']]
    report={'schema_version':1,'audit_code_sha256':sha(Path(__file__).read_bytes()),
            'source_manifest_sha256':sha(args.manifest.read_bytes()),'pairs':reports,
            'all_four_verified':all(r['verified'] for r in reports) and len(set(ids))==len(ids),
            'native_request_count':len(ids), 'uncached_reference_usd':str(sum((Decimal(r['uncached_reference_usd']) for r in reports),Decimal(0))),
            'purpose':'PM-only readiness fixtures; not builder comparison outcomes'}
    write_json(args.evidence/'independent-audit.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='pairs'}))
    if not report['all_four_verified']: raise SystemExit(1)

if __name__=='__main__': main()
