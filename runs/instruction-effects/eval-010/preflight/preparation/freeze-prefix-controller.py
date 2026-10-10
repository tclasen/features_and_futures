import json,shutil
from pathlib import Path
from orchestrator.task_stream import task_stream,freeze_round
from orchestrator.prepare import file_hashes,write_json
r=Path('runs/instruction-effects/eval-010');v=Path('experiments/instruction-effects/revisions/research-v010');source=Path('runs/instruction-effects/eval-009');assert len(task_stream(r))==5 and not (r/'events.jsonl').exists()
original={t['stage']:t for t in task_stream(source)}
for stage in range(6,21):
 draft=v/f'decisions/frozen-prefix-drafts/task-{stage:03d}';t=freeze_round(r,(draft/'requirements.md').read_text(),draft/'suite',original[stage]['expected_phase_checks']);assert t['packet_sha256']==original[stage]['packet_sha256']
 for k in ['acceptance','upgrade','postrestart']:assert t['expected_phase_checks'][k]==original[stage]['expected_phase_checks'][k]
 if stage<15:assert t['suite_hash']==original[stage]['suite_hash']
 else:
  before=original[stage]['suite_files'];after=t['suite_files'];assert before.keys()==after.keys() and [x for x in before if before[x]!=after[x]]==['notes.spec.mjs']
write_json(r/'preflight/preparation/prefix-lineage.json',{'verified':True,'rounds':20,'all_public_packets_identical':True,'suites1through14_identical':True,'changed_suite_files_from15':['notes.spec.mjs'],'native_model_calls':0,'previous_run':'eval-009','original_source_inherited':False})
shutil.copy2(__file__,r/'preflight/preparation/freeze-prefix-controller.py')
notes=r/'decisions';notes.mkdir(exist_ok=True);(notes/'lessons-applied.md').write_text('L053 adopted: changed-result due-range barriers before clearing notes; unchanged original native source fails052 and passes corrected52 plus prior14 upgrade and actual15 restart. L051/L052 search observers inherited. L045 native accounting lifecycle, L026 cost bounds, and L044 archive-first own-checkpoint recovery unchanged.177 PM checks, native isolation and18 image blobs reverified. Future21–40 remain unfrozen until20 shared checkpoints, audit, first allowed inspection, and their full readiness gates. PM lessons stay outside builder contexts.\n')
print('Frozen20equalpublicpackets;052onlyobservercorrectionfrom15')
