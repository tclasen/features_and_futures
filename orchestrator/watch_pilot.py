"""Observe a live pilot for inactivity; never stop builders or change outcomes."""
import argparse
import json
import os
import time
from pathlib import Path
from .evidence import Ledger, digest_json, digest_bytes, read_jsonl
from .prepare import ROOT


def inactivity(events, now_ns, threshold_seconds):
    starts = [e for e in events if e['kind'] == 'attempt_started']
    if not starts:
        return None
    attempt = starts[-1]
    identity = {key: attempt[key] for key in ('builder_id', 'task_id', 'attempt_id')}
    related = [e for e in events if all(e.get(key) == value for key, value in identity.items())]
    if any(e['kind'] == 'attempt_finished' for e in related):
        return None
    requests = {e['request_id']: e for e in related if e['kind'] == 'inference_request_started'}
    finished = {e['request_id'] for e in related if e['kind'] == 'inference_request_finished'}
    open_requests = sorted(set(requests)-finished)
    progress = [e for e in related if e['kind'] in ('attempt_started', 'inference_request_started', 'inference_request_finished', 'commit_first_observed')]
    latest = max(progress, key=lambda e: e['monotonic_ns'])
    gap = (now_ns-latest['monotonic_ns'])/1e9
    if gap < threshold_seconds:
        return None
    return {**identity, 'observation': 'open inference request' if open_requests else 'no inference or commit activity',
            'open_request_ids': open_requests, 'last_progress_event_id': latest['event_id'],
            'last_progress_utc': latest.get('utc'), 'observed_idle_seconds': gap,
            'threshold_seconds': threshold_seconds,
            'attribution': 'liveness observation only; cause and failure attribution unproven'}


def active_inactivities(events,now_ns,threshold_seconds):
    observations=[]
    starts=[e for e in events if e['kind']=='attempt_started']
    for attempt in starts:
        identity={key:attempt[key] for key in ('builder_id','task_id','attempt_id')}
        related=[e for e in events if all(e.get(k)==v for k,v in identity.items())]
        observation=inactivity(related,now_ns,threshold_seconds)
        if observation:observations.append(observation)
    return observations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', default='pilot-005')
    parser.add_argument('--idle-seconds', type=float, default=300)
    parser.add_argument('--interval-seconds', type=float, default=15)
    args = parser.parse_args()
    if args.idle_seconds <= 0 or not 0 < args.interval_seconds <= 60:
        parser.error('Positive inactivity threshold and polling interval at most 60 seconds required')
    run = ROOT/'runs/instruction-effects'/args.run
    manifest = json.loads((run/'manifest.json').read_text())
    assert digest_json(manifest) == (run/'manifest.sha256').read_text().strip()
    identity = {k: manifest[k] for k in ('experiment_id','experiment_revision','project_id','project_revision','run_id')}
    identity['manifest_sha256'] = digest_json(manifest)
    # Separate observation journal: no change to frozen attempt/acceptance events.
    ledger = Ledger(run/'preflight/liveness', identity)
    seen = {e.get('last_progress_event_id') for e in read_jsonl(ledger.root/'events.jsonl') if e['kind'] == 'pm_inactivity_observed'}
    ledger.event('pm_liveness_monitor_started', process_id=os.getpid(), idle_seconds=args.idle_seconds, interval_seconds=args.interval_seconds,execution_module_sha256=digest_bytes(Path(__file__).read_bytes()))
    while True:
        try:
            events = read_jsonl(run/'events.jsonl')
            state = json.loads((run/'state.json').read_text())
        except json.JSONDecodeError:
            ledger.event('pm_liveness_poll_deferred',reason='Concurrent append or state update; no terminal inference')
            time.sleep(args.interval_seconds)
            continue
        if state['status'] != 'running':
            ledger.event('pm_liveness_monitor_finished', run_state=state['status'])
            print('Pilot state: '+state['status'], flush=True)
            return
        runner = next((e for e in reversed(events) if e['kind'] == 'runner_started'),None)
        if runner is None:
            time.sleep(args.interval_seconds)
            continue
        try:
            os.kill(runner['process_id'], 0)
        except ProcessLookupError:
            ledger.event('pm_runner_missing', runner_process_id=runner['process_id'])
            raise SystemExit('Pilot runner is missing; preserve evidence and diagnose before resuming')
        for observation in active_inactivities(events,time.monotonic_ns(),args.idle_seconds):
            if observation['last_progress_event_id'] not in seen:
                ledger.event('pm_inactivity_observed', **observation)
                seen.add(observation['last_progress_event_id'])
                print(json.dumps(observation), flush=True)
        time.sleep(args.interval_seconds)


if __name__ == '__main__':
    main()
