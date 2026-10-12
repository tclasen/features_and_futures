"""Quiescence control for trusted PM fixture groups, not builder execution."""
import os
import signal
import subprocess
import time


def group_exists(group):
    try:
        os.killpg(group, 0)
        return True
    except ProcessLookupError:
        return False


def retire_owned_group(child, grace_seconds=10):
    """Terminate the new-session group owned by child and wait before inventory.

    The caller must have created child with start_new_session=True and retained
    its identity. Never use this helper for a group discovered by name/search.
    Waiting for the coordinator alone does not prove descendant cleanup ended.
    """
    group = child.pid
    assert group > 1 and group != os.getpgrp()
    if group_exists(group):
        os.killpg(group, signal.SIGTERM)
    try:
        code = child.wait(timeout=grace_seconds)
    except subprocess.TimeoutExpired:
        if group_exists(group):
            os.killpg(group, signal.SIGKILL)
        code = child.wait(timeout=grace_seconds)
    deadline = time.monotonic() + grace_seconds
    while group_exists(group) and time.monotonic() < deadline:
        time.sleep(0.05)
    if group_exists(group):
        os.killpg(group, signal.SIGKILL)
        deadline = time.monotonic() + grace_seconds
        while group_exists(group) and time.monotonic() < deadline:
            time.sleep(0.05)
    if group_exists(group):
        raise RuntimeError('Owned PM fixture group remains live; do not seal its inventory')
    return {'exit_code': code, 'owned_process_group': group,
            'process_group_absence_verified': True}
