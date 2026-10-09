"""Prepared notification fingerprint; never changes original failure evidence."""
import copy
from orchestrator.evidence import digest_json


def notification_fingerprint(diagnostics):
    normalized = copy.deepcopy(diagnostics)
    for item in normalized:
        if item.get('contract') == 'Generated tool arguments must be valid for the assigned harness':
            original = item.get('observed', '')
            if ', err=' in original:
                item['observed'] = original.rsplit(', err=', 1)[-1]
    return digest_json(normalized)
