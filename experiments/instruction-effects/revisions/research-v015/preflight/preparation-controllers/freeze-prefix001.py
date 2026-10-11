"""Freeze the inherited first20 rounds after fresh starter-only preparation.
This prospective controller does not dispatch builders.
"""
import json,shutil
from pathlib import Path
from orchestrator.task_stream import task_stream,freeze_round,suite_for_stage
from orchestrator.prepare import file_hashes,write_json
from orchestrator.summary_readiness import verify_summary_only_delta
r=Path('runs/instruction-effects/eval-015');v=Path('experiments/instruction-effects/revisions/research-v015');source=Path('runs/instruction-effects/eval-014')
assert json.loads((v/'analysis-plan.json').read_text())['status']=='frozen-before-main-dispatch'
assert len(task_stream(r))==5 and not (r/'events.jsonl').exists()
original={t['stage']:t for t in task_stream(source)}
for stage in range(1,6):
 assert file_hashes(suite_for_stage(r,stage))==file_hashes(v/f'decisions/frozen-prefix-drafts/task-{stage:03d}/suite')
 assert (r/f'tasks/task-{stage:03d}/packet.md').read_bytes()==(source/f'tasks/task-{stage:03d}/packet.md').read_bytes()
for stage in range(6,21):
 draft=v/f'decisions/frozen-prefix-drafts/task-{stage:03d}'
 t=freeze_round(r,(draft/'requirements.md').read_text(),draft/'suite',original[stage]['expected_phase_checks'])
 assert t['packet_sha256']==original[stage]['packet_sha256']
for t in task_stream(r):
 stage=t['stage'];assert t['packet_sha256']==original[stage]['packet_sha256']
 delta=verify_summary_only_delta(suite_for_stage(source,stage),suite_for_stage(r,stage))
 assert delta==([] if stage<12 else ['return-order.spec.mjs'])
 assert file_hashes(suite_for_stage(r,stage))==file_hashes(v/f'decisions/frozen-prefix-drafts/task-{stage:03d}/suite')
write_json(r/'preflight/preparation/prefix-lineage.json',{'verified':True,'rounds':20,'all_public_packets_identical':True,'changed_suite_files':'Only summary extraction innerText to textContent in return-order.spec.mjs from12; original assertions preserved','native_model_calls':0,'previous_run':'eval-014','original_developed_source_inherited':False,'first_comparative_inspection_checkpoint':20,'later21through40_not_yet_frozen':True})
shutil.copy2(__file__,r/'preflight/preparation/freeze-prefix-controller.py');notes=r/'decisions';notes.mkdir(exist_ok=True);shutil.copy2(v/'decisions/lessons-applied.md',notes/'lessons-applied.md')
print('Frozen20 inherited public packets with only declared summary-reader correction')
