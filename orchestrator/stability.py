"""Equal post-promotion windows with factual incident and restart evidence."""
import time


def observe_window(check, seconds, interval, *, clock=time.monotonic, sleep=time.sleep):
    if seconds<=0 or interval<=0: raise ValueError('Positive observation duration and cadence required')
    start=clock()
    samples=[]
    while True:
        check()
        samples.append(clock()-start)
        remaining=seconds-(clock()-start)
        if remaining<=0: return samples
        sleep(min(interval,remaining))


def monitor_promotion(ledger, attrs, check, restart, seconds, interval):
    """One uniformly permitted same-revision process restart; no code repair."""
    active_incident=None
    for pass_number in (1,2):
        try:
            samples=observe_window(check,seconds,interval)
            if active_incident:
                ledger.event('incident_recovered',incident_id=active_incident['event_id'],
                             recovery_action='same_revision_process_restart',**attrs)
            ledger.event('post_deployment_checks_passed',observation_seconds=seconds,
                         interval_seconds=interval,sample_count=len(samples),**attrs)
            return
        except RuntimeError as error:
            if active_incident:
                ledger.event('incident_recovery_failed',incident_id=active_incident['event_id'],observed=str(error),**attrs)
                raise
            active_incident=ledger.event('incident_detected',observed=str(error),**attrs)
            ledger.event('incident_intervention_started',incident_id=active_incident['event_id'],
                         recovery_action='same_revision_process_restart',**attrs)
            try:
                restart()
            except RuntimeError as restart_error:
                ledger.event('incident_recovery_failed',incident_id=active_incident['event_id'],observed=str(restart_error),**attrs)
                raise
