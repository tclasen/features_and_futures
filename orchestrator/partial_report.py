"""Additional v002 gates; strict native readiness remains separately visible."""
from .evidence_bounds import cost_bounds, first_assessed_submission
from .retained_incidents import terminal_attempt_evidence
from .audit_request_coverage import reconcile
from .evidence import digest_bytes
import json


def augment(run, manifest, events, usage, tasks, builders, problems, state):
    """Keep legacy problems; permit only independently verified missing counters.

    Shared report code has already checked packet/profile delivery, functional
    phases, exact commits and restored archives. This adds terminal receipt and
    incident linkage without treating accounting completeness as analysis readiness.
    """
    analysis_problems = list(problems)
    coverage = reconcile(events, usage, True)
    analysis_problems.extend(coverage['problems'])
    if not coverage['complete_run_request_coverage']:
        analysis_problems.append('Complete terminal request coverage required')
    grouped = {}
    for row in usage:
        key = tuple(row[k] for k in ('builder_id', 'task_id', 'attempt_id'))
        grouped.setdefault(key, []).append(row)
    incident_count = 0
    permitted_unknowns = set()
    for key, records in grouped.items():
        identity = dict(zip(('builder_id', 'task_id', 'attempt_id'), key))
        try:
            evidence = terminal_attempt_evidence(run, records, events, identity, manifest['pricing'])
            markers = [e for e in events if e['kind'] == 'infrastructure_attempt_retained'
                       and all(e.get(k) == v for k, v in identity.items())]
            if evidence['incident_request_ids']:
                if len(markers) != 1 or set(markers[0].get('request_ids', [])) != set(evidence['request_ids']):
                    raise ValueError('Original infrastructure incident must be recorded once with every attempt request')
                if any(e['kind'] in ('validation_started', 'attempt_rejected')
                       and all(e.get(k) == v for k, v in identity.items()) for e in events):
                    raise ValueError('Infrastructure-only attempt was classified as a builder assessment')
                observed = [e for e in events if e['kind'] == 'submission_observed'
                            and all(e.get(k) == v for k, v in identity.items())]
                if len(observed) != 1 or not observed[0].get('archive'):
                    raise ValueError('Incident source/history archive observation missing')
                folder=run/'tasks'/identity['task_id']/'attempts'/identity['builder_id']/identity['attempt_id']
                native_hashes=markers[0].get('native_export_sha256',{})
                if set(native_hashes)!=set(('native-history.bundle','native-working-tree.tar.gz','native-git.json')) or any(digest_bytes((folder/name).read_bytes())!=sha for name,sha in native_hashes.items()):
                    raise ValueError('Original native working tree/history changed or missing after recovery')
                incident_count += 1
                permitted_unknowns.update(evidence['unknown_native_request_ids'])
            elif markers:
                raise ValueError('Incident marker has no independently verified incident')
        except (ValueError, KeyError, OSError) as error:
            analysis_problems.append('terminal receipt gate: ' + repr(key) + ': ' + str(error))
    # Removing this one measurement problem does not remove any functional or
    # provenance problem; the strict report retains its original problem list.
    analysis_problems = [p for p in analysis_problems
                         if not any(p == 'missing usage: ' + rid for rid in permitted_unknowns)]
    for row in tasks:
        if row['builder_execution_nanoseconds'] <= 0 or any(a['wall_nanoseconds'] < 0 for a in row['attempts']):
            analysis_problems.append('Positive execution and nonnegative invocation timing required: ' + row['builder_id'] + '/' + row['task_id'])
        selected = [u for u in usage if u['builder_id'] == row['builder_id'] and u['task_id'] == row['task_id']]
        add_cost_fields(row, selected)
        row['first_scheduled_attempt_accepted'] = row['first_submission_accepted']
        try:
            assessment = first_assessed_submission(events, row['builder_id'], row['task_id'])
            row['first_assessed_submission_accepted'] = assessment['accepted']
            row['first_assessed_attempt_id'] = assessment['attempt_id']
        except ValueError as error:
            row['first_assessed_submission_accepted'] = None
            analysis_problems.append('assessment gate: ' + row['builder_id'] + '/' + row['task_id'] + ': ' + str(error))
        row['token_totals_known'] = row.pop('token_totals')
    for row in builders:
        selected = [u for u in usage if u['builder_id'] == row['builder_id']]
        add_cost_fields(row, selected)
        outcomes = [t['first_assessed_submission_accepted'] for t in tasks if t['builder_id'] == row['builder_id']]
        row['first_assessed_submission_acceptance'] = (sum(outcomes) / len(outcomes)
                                                      if outcomes and all(type(x) is bool for x in outcomes) else None)
    return {'analysis_method': manifest['research']['analysis_method'],
            'analysis_ready': state['status'] in ('completed', 'awaiting_frozen_round') and not analysis_problems,
            'analysis_problems': analysis_problems,
            'native_accounting_complete': bool(usage) and all(u['counts'] is not None for u in usage),
            'retained_infrastructure_attempts': incident_count,
            'unknown_native_request_ids': sorted(u['request_id'] for u in usage if u['counts'] is None)}


def add_cost_fields(row, requests):
    for field in ('uncached_reference_usd', 'cache_aware_usd'):
        bounds = cost_bounds([u['cost'][field] if u['counts'] is not None and u['cost'] is not None else None
                              for u in requests])
        row[field + '_bounds'] = bounds
        row['known_' + field] = bounds['lower']
        row[field] = bounds['point_estimate']
    row['native_accounting_complete'] = bool(requests) and all(u['counts'] is not None for u in requests)


def artifact_hashes(run, usage):
    """Bind checked originals so later analyses cannot trust changed archives."""
    paths=set()
    for row in usage:
        folder=run/'tasks'/row['task_id']/'attempts'/row['builder_id']/row['attempt_id']
        for suffix in ('request.json','response.raw'):
            paths.add(folder/'requests'/(row['request_id']+'.'+suffix))
        for name in ('submission.tar','result.json','infrastructure-incident.json','working-tree.tar.gz','working-tree-checksum.json','native-history.bundle','native-working-tree.tar.gz','native-git.json'):
            if (folder/name).exists(): paths.add(folder/name)
    for index in (run/'builders').glob('*/checkpoints/*/index.json'):
        paths.add(index)
        paths.update(index.parent/name for name in json.loads(index.read_text())['checksums'])
    return {str(path.relative_to(run)):digest_bytes(path.read_bytes()) for path in sorted(paths)}
