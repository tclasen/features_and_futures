import json,shutil
from pathlib import Path
from orchestrator.task_stream import task_stream,freeze_round,suite_for_stage
from orchestrator.prepare import file_hashes,write_json
r=Path('runs/instruction-effects/eval-014');v=Path('experiments/instruction-effects/revisions/research-v014');source=Path('runs/instruction-effects/eval-013');assert len(task_stream(r))==5 and not (r/'events.jsonl').exists()
original={t['stage']:t for t in task_stream(source)}
for stage in range(1,6):assert file_hashes(suite_for_stage(r,stage))==file_hashes(v/f'decisions/frozen-prefix-drafts/task-{stage:03d}/suite')
for stage in range(6,21):
 draft=v/f'decisions/frozen-prefix-drafts/task-{stage:03d}';t=freeze_round(r,(draft/'requirements.md').read_text(),draft/'suite',original[stage]['expected_phase_checks']);assert t['packet_sha256']==original[stage]['packet_sha256']
for task in task_stream(r):
 stage=task['stage'];assert task['packet_sha256']==original[stage]['packet_sha256'];a=file_hashes(suite_for_stage(source,stage));b=file_hashes(suite_for_stage(r,stage));assert a.keys()==b.keys() and [k for k in a if a[k]!=b[k]]==['workboard.spec.mjs'];assert b==file_hashes(v/f'decisions/frozen-prefix-drafts/task-{stage:03d}/suite')
write_json(r/'preflight/preparation/prefix-lineage.json',{'verified':True,'rounds':20,'all_public_packets_identical':True,'changed_suite_file':'workboard.spec.mjs','behavior_change_guarded_from3':'Two restore-completion waits in008/009; no original assertions removed','native_model_calls':0,'previous_run':'eval-013','original_developed_source_inherited':False})
shutil.copy2(__file__,r/'preflight/preparation/freeze-prefix-controller.py');notes=r/'decisions';notes.mkdir(exist_ok=True);shutil.copy2(v/'decisions/lessons-applied.md',notes/'lessons-applied.md');print('Frozen20equalpublicpackets_with_declared_restore_readiness')
