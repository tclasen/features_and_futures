import json,shutil
from pathlib import Path
from orchestrator.task_stream import task_stream,freeze_round
from orchestrator.prepare import file_hashes,write_json
r=Path('runs/instruction-effects/eval-009');v=Path('experiments/instruction-effects/revisions/research-v009');source=Path('runs/instruction-effects/eval-008');assert len(task_stream(r))==5 and not (r/'events.jsonl').exists()
original={t['stage']:t for t in task_stream(source)}
for stage in range(6,21):
 draft=v/f'decisions/frozen-prefix-drafts/task-{stage:03d}';t=freeze_round(r,(draft/'requirements.md').read_text(),draft/'suite',original[stage]['expected_phase_checks']);assert t['packet_sha256']==original[stage]['packet_sha256']
 for k in ['acceptance','upgrade','postrestart']:assert t['expected_phase_checks'][k]==original[stage]['expected_phase_checks'][k]
 if stage<14:assert t['suite_hash']==original[stage]['suite_hash']
 else:
  before=original[stage]['suite_files'];after=t['suite_files'];assert before.keys()==after.keys() and [x for x in before if before[x]!=after[x]]==['search-whitespace.spec.mjs']
write_json(r/'preflight/preparation/prefix-lineage.json',{'verified':True,'rounds':20,'all_public_packets_identical':True,'suites1through13_identical':True,'changed_suite_files_from14':['search-whitespace.spec.mjs'],'native_model_calls':0,'previous_run':'eval-008','original_source_inherited':False})
shutil.copy2(__file__,r/'preflight/preparation/freeze-prefix-controller.py')
notes=r/'decisions';notes.mkdir(exist_ok=True);(notes/'lessons-applied.md').write_text('L052 adopted: explicitly select Archived after reload before checking literal persisted names; no undisclosed view-state persistence requirement. Unchanged nativeoriginalb007001 reproduces051failure andpasses corrected50+upgrade13+actualrestart14;3correctsyntheticmodes+4genuinefaults verified. L051047knownresultbarriers inherited unchanged. L045observerlifecycle unchanged;176PMchecks, nativeisolation andall18imageblobs reverified. L026terminal unknowncostbounds preserved; L044archive-first owncheckpoint recovery unchanged. Future21–40selectedbeforecomparativeinspection andremainunfrozen; pending full99readiness and31/32behavioralchecks. L024081finalnotes barrier preparedonlyinunfrozendrafts. All12mustcomplete20/audit/firstallowedinspection beforeextending. PMlessons stayoutsidebuildercontexts.\n')
print('Frozen20equalpublicpackets;051onlyobservercorrectionfrom14')
