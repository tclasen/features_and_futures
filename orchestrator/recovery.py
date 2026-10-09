"""Deliver a recorded operational recovery instruction in a fresh context."""
import json
from pathlib import Path


def append_recovery_instruction(feedback, previous_output, builder_id, task_id):
    path = Path(previous_output)/'recovery-instruction.json'
    if not path.exists():
        return feedback
    recovery = json.loads(path.read_text())
    if recovery.get('builder_id') != builder_id or recovery.get('task_id') != task_id:
        raise ValueError('Recovery instruction belongs to a different builder/task')
    if recovery.get('action') != 'restore-last-accepted-checkpoint' or not isinstance(recovery.get('message'), str):
        raise ValueError('Unsupported recovery instruction')
    return feedback+'\n\nRecorded PM recovery action:\n'+recovery['message']
