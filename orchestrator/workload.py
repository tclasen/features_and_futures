"""Validate frozen workload checkpoints and expected cumulative test phases."""
import json
from pathlib import Path


def phase_expectations(task):
    if 'expected_phase_checks' in task:
        expected=task['expected_phase_checks']
        required={'acceptance','postrestart'} | ({'upgrade'} if task['stage']>1 else set())
        if set(expected)!=required or any(type(n) is not int or n<1 for n in expected.values()):
            raise ValueError('Invalid expected cumulative phase counts')
        return dict(expected)
    if task['stage'] not in (1,2,3):
        raise ValueError('Extended workloads require explicit expected phase counts')
    return {'acceptance':{1:4,2:8,3:11}[task['stage']],'postrestart':1,
            **({'upgrade':1} if task['stage']>1 else {})}


def project_checkpoints(project):
    catalog=json.loads((project/'project.json').read_text())
    tasks=catalog.get('checkpoints',[{'task_id':f'task-{s:03d}','stage':s} for s in range(1,4)])
    if not tasks: raise ValueError('A workload needs checkpoints')
    for stage,task in enumerate(tasks,1):
        if task['stage']!=stage or task['task_id']!=f'task-{stage:03d}':
            raise ValueError('Workload checkpoints must be contiguous and ordered')
        phase_expectations(task)
    actual={p.name for p in (project/'requirements').glob('task-*.md')}
    if actual!={t['task_id']+'.md' for t in tasks}:
        raise ValueError('Requirement files and frozen checkpoint catalog differ')
    return tasks
