"""Append-only hashed task rounds for continued development and exact replay."""
import json
import os
import shutil
import tempfile
from pathlib import Path
from .evidence import digest_bytes, digest_json, timestamp
from .prepare import file_hashes, write_json
from .workload import phase_expectations


def task_stream(run, manifest=None):
    run=Path(run)
    manifest=manifest or json.loads((run/'manifest.json').read_text())
    tasks=[dict(t) for t in manifest['tasks']]
    for task in tasks:
        path=run/'tasks'/task['task_id']/'packet.md'
        if digest_bytes(path.read_bytes())!=task['packet_sha256']:
            raise ValueError('Frozen base packet changed: '+task['task_id'])
    additions=sorted((run/'tasks').glob('task-*/round.json'),key=lambda p:int(p.parent.name.split('-')[-1]))
    previous=tasks[-1]
    for path in additions:
        record=json.loads(path.read_text())
        stage=previous['stage']+1
        if record['stage']!=stage or record['task_id']!=f'task-{stage:03d}':
            raise ValueError('Task stream gap or reordered checkpoint')
        if record['previous_packet_sha256']!=previous['packet_sha256']:
            raise ValueError('Task stream previous-packet chain mismatch')
        if file_hashes(path.parent/'suite')!=record['suite_files'] or digest_json(record['suite_files'])!=record['suite_hash']:
            raise ValueError('Frozen round suite changed')
        for name in ('packet.md','requirements.md'):
            if digest_bytes((path.parent/name).read_bytes())!=record['files'][name]:
                raise ValueError('Frozen round file changed: '+name)
        if record['packet_sha256']!=record['files']['packet.md']:
            raise ValueError('Packet hash mismatch')
        phase_expectations(record)
        tasks.append(record)
        previous=record
    return tasks


def freeze_round(run, requirements, suite, expected_phase_checks):
    run=Path(run)
    manifest=json.loads((run/'manifest.json').read_text())
    if manifest['execution'].get('task_stream_revision')!='append-only-rounds-v1':
        raise ValueError('Run did not authorize an append-only task stream')
    if (run/'stream-seal.json').exists():raise ValueError('Refusing to extend a sealed stream')
    tasks=task_stream(run,manifest)
    previous=tasks[-1]
    stage=previous['stage']+1
    task_id=f'task-{stage:03d}'
    target=run/'tasks'/task_id
    if target.exists():raise ValueError('Refusing to overwrite a frozen task')
    if not requirements.strip():raise ValueError('Public requirements cannot be empty')
    packet=(run/'tasks'/previous['task_id']/'packet.md').read_text()+'\n\n'+requirements.rstrip()+'\n'
    with tempfile.TemporaryDirectory(dir=run/'tasks',prefix='.pm-freeze-') as temp:
        staging=Path(temp)/'round';staging.mkdir()
        shutil.copytree(suite,staging/'suite')
        if not (staging/'suite'/'playwright.config.mjs').is_file():
            raise ValueError('Acceptance suite needs its launch configuration')
        (staging/'packet.md').write_text(packet)
        (staging/'requirements.md').write_text(requirements)
        suite_files=file_hashes(staging/'suite')
        record={'schema_version':1,'task_id':task_id,'stage':stage,'frozen_at':timestamp(),
                'packet_sha256':digest_bytes(packet.encode()),'previous_packet_sha256':previous['packet_sha256'],
                'suite_files':suite_files,'suite_hash':digest_json(suite_files),
                'files':{name:digest_bytes((staging/name).read_bytes()) for name in ('packet.md','requirements.md')},
                'expected_phase_checks':expected_phase_checks}
        phase_expectations(record)
        write_json(staging/'round.json',record)
        os.rename(staging,target)
    return record


def suite_for_stage(run, stage):
    tasks=task_stream(run)
    task=next((t for t in tasks if t['stage']==stage),None)
    if task is None:raise ValueError('Acceptance stage was never frozen')
    if 'suite_files' in task:
        return Path(run)/'tasks'/task['task_id']/'suite'
    return Path(run)/'definitions/project/acceptance'


def stream_input_hash(run):
    return digest_json([{k:t[k] for k in ('task_id','stage','packet_sha256','suite_hash')} for t in task_stream(run)])


def verify_replay(source, replay):
    left=task_stream(source);right=task_stream(replay)
    if len(left)!=len(right):raise ValueError('Replay omits or adds checkpoints')
    for original,copy in zip(left,right):
        if any(original[k]!=copy[k] for k in ('task_id','stage','packet_sha256','suite_hash')):
            raise ValueError('Replay differs from frozen source task/suite')
        if phase_expectations(original)!=phase_expectations(copy):
            raise ValueError('Replay changes cumulative phase counts')
    return {'verified':True,'checkpoints':len(left),'input_sha256':stream_input_hash(source)}


def effective_manifest(run):
    manifest=json.loads((Path(run)/'manifest.json').read_text())
    if manifest['execution'].get('task_stream_revision')=='append-only-rounds-v1':
        manifest['tasks']=task_stream(run,manifest)
    return manifest


def seal_pilot_stream(run):
    run=Path(run)
    manifest=effective_manifest(run)
    if manifest['purpose']!='engineering-longitudinal-pilot':
        raise ValueError('Research stopping requires independently verified confirmation evidence')
    minimum=manifest['evidence_policy']['minimum_frozen_tasks']
    if len(manifest['tasks'])<minimum:raise ValueError('Pilot extension gate not prepared')
    path=run/'stream-seal.json'
    if path.exists():raise ValueError('Stream seal already frozen')
    seal={'purpose':'engineering-pilot stop; no instruction-effect claim','frozen_at':timestamp(),
          'tasks':len(manifest['tasks']),'input_sha256':stream_input_hash(run)}
    write_json(path,seal)
    return seal


def stream_sealed(run):
    path=Path(run)/'stream-seal.json'
    if not path.exists():return False
    seal=json.loads(path.read_text())
    if seal['input_sha256']!=stream_input_hash(run) or seal['tasks']!=len(task_stream(run)):
        raise ValueError('Frozen stream seal no longer matches task inputs')
    return True
