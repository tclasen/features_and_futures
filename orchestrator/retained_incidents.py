"""Prospective terminal-incident evidence gate, never an inference retry layer."""
import json
import uuid
from decimal import Decimal
from .audit_native_receipts import receipt, categories
from .audit_request_coverage import reconcile
from .evidence import digest_bytes
from .bounded_confirmation import METHOD

BOUNDED_REVISIONS = ('research-v002', 'research-v003', 'research-v004', 'research-v005', 'research-v006', 'research-v007')
OBSERVATION_LIFECYCLE = 'drain-upstream-and-partial-response-v1'
POLICY = 'retained-terminal-incidents-v1'
ASSESSMENT = 'first-observed-pm-assessment-v1'


def validate_policy(manifest, plan):
    policy = manifest['execution'].get('provider_incident_policy')
    method = manifest['research'].get('analysis_method')
    revision = manifest['experiment_revision']
    if revision == 'research-v001':
        if policy is not None or method not in (None, 'complete-native-point-v1'):
            raise ValueError('Frozen v001 cannot select prospective incident or bound rules')
        return False
    if revision not in BOUNDED_REVISIONS:
        raise ValueError('Unsupported research revision')
    if revision == 'research-v007' and (
            manifest['execution'].get('inference_observation_lifecycle') != OBSERVATION_LIFECYCLE
            or plan['execution'].get('inference_observation_lifecycle') != OBSERVATION_LIFECYCLE):
        raise ValueError('Frozen gateway observation lifecycle required')
    if (policy != POLICY or method != METHOD
            or plan.get('revision_id') != revision
            or plan.get('status') != 'frozen-before-main-dispatch'
            or plan['execution'].get('provider_incident_policy') != policy
            or plan.get('analysis_method') != method
            or plan.get('submission_outcome_definition') != ASSESSMENT):
        raise ValueError('Prospective incident, analysis and assessment rules must match the frozen plan')
    return True


def terminal_attempt_evidence(run, records, events, identity, pricing):
    """Validate original receipts and linkage before classifying an interruption.

    Caller must drain the lease and archive the submitted source/history first.
    A missing ledger record, finish event, raw file, or corrupt counter is a hard
    gate. An observed transport failure can leave expenditure unknown.
    """
    keys = ('builder_id', 'task_id', 'attempt_id')
    if not records or any(any(r.get(k) != identity[k] for k in keys) for r in records):
        raise ValueError('Nonempty, correctly attributed attempt receipts required')
    selected_events = [e for e in events if all(e.get(k) == identity[k] for k in keys)]
    coverage = reconcile(selected_events, records, True)
    if not coverage['complete_run_request_coverage']:
        raise ValueError('Incomplete terminal request coverage: ' + repr(coverage['problems']))
    unknown = []; incidents = []; costs = []; cache_costs = []
    hashes = {}
    for row in records:
        rid = row['request_id']
        if str(uuid.UUID(rid)) != rid:
            raise ValueError('Canonical request ID required')
        folder = run / 'tasks' / identity['task_id'] / 'attempts' / identity['builder_id'] / identity['attempt_id'] / 'requests'
        raw = (folder / (rid + '.response.raw')).read_bytes()
        payload = (folder / (rid + '.request.json')).read_bytes()
        hashes[rid] = {'request': digest_bytes(payload), 'response': digest_bytes(raw)}
        if hashes[rid] != {'request': row['request_sha256'], 'response': row['response_sha256']}:
            raise ValueError('Original receipt hash mismatch: ' + rid)
        if json.loads(payload).get('model') != row['model'] or row['provider'] != 'subscription':
            raise ValueError('Frozen hosted request attribution mismatch: ' + rid)
        price = pricing[row['model']]
        if row['pricing_snapshot_sha256'] != price['snapshot_sha256'] or row['pricing_reference'] != price['reference_id']:
            raise ValueError('Frozen price attribution mismatch: ' + rid)
        counters = receipt(raw)
        if counters != row.get('api_usage'):
            raise ValueError('Original API receipt differs from ledger: ' + rid)
        native = categories(counters)
        if native is None:
            if row['counts'] is not None or row['cost'] is not None:
                raise ValueError('Unsupported measured cost without native receipt: ' + rid)
            unknown.append(rid)
            costs.append(None); cache_costs.append(None)
        else:
            incoming, cached, outgoing = native
            recorded = row['counts'] or {}
            if (recorded.get('input_tokens'), recorded.get('cached_input_tokens'), recorded.get('output_tokens')) != native or recorded.get('uncached_input_tokens') != incoming - cached:
                raise ValueError('Native counter mismatch: ' + rid)
            rates = dict(price['pricing'])
            for tier in sorted(rates.get('overrides', []), key=lambda x: x['min_prompt_tokens']):
                if incoming >= tier['min_prompt_tokens']: rates.update(tier)
            reference = incoming * Decimal(rates['prompt']) + outgoing * Decimal(rates['completion'])
            cache = (incoming - cached) * Decimal(rates['prompt']) + cached * Decimal(rates.get('input_cache_read', rates['prompt'])) + outgoing * Decimal(rates['completion'])
            cost = row['cost'] or {}
            if cost.get('uncached_reference_usd') is None or cost.get('cache_aware_usd') is None or Decimal(cost['uncached_reference_usd']) != reference or Decimal(cost['cache_aware_usd']) != cache:
                raise ValueError('Independently recomputed cost mismatch: ' + rid)
            costs.append(str(reference)); cache_costs.append(str(cache))
        finish = next(e for e in selected_events if e['kind'] == 'inference_request_finished' and e['request_id'] == rid)
        if finish.get('counts_complete') != (native is not None) or finish.get('outcome') != row['outcome']:
            raise ValueError('Terminal receipt classification mismatch: ' + rid)
        if native is None or (row['status'] != 200 and row.get('outcome') != 'builder-invalid-tool-call'):
            incidents.append(rid)
    from .evidence_bounds import cost_bounds
    return {'terminal_request_coverage': coverage, 'raw_hashes': hashes,
            'request_ids': [r['request_id'] for r in records], 'incident_request_ids': incidents,
            'unknown_native_request_ids': unknown, 'native_accounting_complete': not unknown,
            'uncached_reference_usd_bounds': cost_bounds(costs),
            'cache_aware_usd_bounds': cost_bounds(cache_costs),
            'builder_assessment_performed': False}


def retain_for_recovery(run, manifest, records, identity, output, index, head, ledger):
    """Archive-before-resume, using the same original requirement and clock.

    Return factual feedback for a new native invocation. Legacy manifests cannot
    enter this path. No builder implementation advice or inferred usage is added.
    """
    if (manifest.get('experiment_revision') not in BOUNDED_REVISIONS
            or manifest['execution'].get('provider_incident_policy') != POLICY
            or manifest['research'].get('analysis_method') != METHOD):
        raise ValueError('Prospective recovery requires its explicit frozen manifest policy')
    from .evidence import read_jsonl
    from .prepare import write_json
    evidence = terminal_attempt_evidence(run, records, read_jsonl(run / 'events.jsonl'),
                                         identity, manifest['pricing'])
    if not evidence['incident_request_ids']:
        raise ValueError('No independently observed infrastructure incident')
    checkpoint = run / 'builders' / identity['builder_id'] / 'checkpoints' / (identity['task_id'] + '-' + identity['attempt_id'])
    if not index.get('checksums') or any(digest_bytes((checkpoint / name).read_bytes()) != sha
                                        for name, sha in index['checksums'].items()):
        raise ValueError('Verified archived source/history required before incident recovery')
    native_files=('native-history.bundle','native-working-tree.tar.gz','native-git.json')
    native_hashes={name:digest_bytes((output/name).read_bytes()) for name in native_files}
    native=json.loads((output/'native-git.json').read_text())
    if native['head']!=head or native['head']!=index['source_commit'] or native['tree']!=index['source_tree']:
        raise ValueError('Native submitted commit/tree differs from preserved checkpoint')
    evidence.update(policy=POLICY, archive_checksums=index['checksums'], native_export_sha256=native_hashes, submission=head,
                    recovery='fresh native context; original task; own current repository; original task clock retained')
    write_json(output / 'infrastructure-incident.json', evidence)
    feedback = {'task_id': identity['task_id'], 'submission': head, 'status': 'infrastructure-interrupted',
                'required': 'Continue the unchanged original requirement from your own current repository and submit committed source.',
                'observations': [{'request_id': r['request_id'], 'status': r['status'], 'outcome': r['outcome'],
                                  'native_usage_available': r['counts'] is not None}
                                 for r in records if r['request_id'] in evidence['incident_request_ids']]}
    write_json(output / 'feedback.json', feedback)
    ledger.event('infrastructure_attempt_retained', request_ids=evidence['request_ids'],
                 unknown_native_request_ids=evidence['unknown_native_request_ids'],
                 archive_checksums=index['checksums'], native_export_sha256=native_hashes, policy=POLICY, **identity)
    ledger.event('feedback_issued', feedback_kind='infrastructure', **identity)
    return '\n\nInfrastructure interruption of the previous attempt:\n' + (output / 'feedback.json').read_text()
