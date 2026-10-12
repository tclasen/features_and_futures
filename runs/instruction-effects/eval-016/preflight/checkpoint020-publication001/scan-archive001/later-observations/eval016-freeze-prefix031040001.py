"""Append preselected031040 only after checked common030 with no candidate."""
import hashlib, json, shutil
from pathlib import Path
from orchestrator.prepare import file_hashes, write_json
from orchestrator.task_stream import task_stream, freeze_round
from orchestrator.study import evidence
r=Path('runs/instruction-effects/eval-016');selection=Path('.local/eval016-next-prefix031040-selection003.json');controller=selection.with_suffix('.py');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
s=json.loads(selection.read_text());assert s['verified'] and s['prior_inspection_checkpoints']==[20] and not s['checkpoint030_inspection_exists'] and not s['dispatch_started']
assert sha(controller)==s['controller_sha256'] and all(sha(Path(p))==h for p,h in s['checked_prepared_paths'].items())
assert len(task_stream(r))==30
state=json.loads((r/'state.json').read_text());assert state['status']=='awaiting_frozen_round' and len(state['accepted'])==12 and all(x['stage']==30 for x in state['accepted'].values())
manifest,report,binding=evidence(r);assert report['analysis_ready'] and not report['analysis_problems'] and len(report['tasks'])==360
inspections=list(map(json.loads,(r/'analysis/inspections.jsonl').read_text().splitlines()));assert [x['checkpoint'] for x in inspections]==[20,30] and inspections[-1]['input_binding']==binding
assert not (r/'analysis/candidate.json').exists()
out=r/'preflight/next-prefix031040-freeze001';assert not out.exists();old=task_stream(r)
for row in s['selected_rounds']:
 draft=Path(row['draft']);suite=Path(row['suite']);assert file_hashes(draft)==row['prepared_files'] and file_hashes(suite)==row['suite_files']
 task=freeze_round(r,(draft/'requirements.md').read_text(),suite,row['expected_phase_checks']);assert task['stage']==row['stage'] and task['suite_files']==row['suite_files']
assert len(task_stream(r))==40 and task_stream(r)[:30]==old
out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
write_json(out/'verified.json',{'verified':True,'selection_sha256':sha(selection),'selection_controller_sha256':sha(controller),'controller_sha256':sha(Path(__file__)),'inspection_input_binding':binding,'prior_prefix_unchanged':True,'new_stages':list(range(31,41)),'native_model_calls':0,'native_dispatch_started':False,'scope':'Preselected031040 packets appended only after full checked common030 and scheduled inspection with no candidate; no prior evidence, observer, treatment, model/harness, prices or analysis mathematics changed.'})
print(json.dumps({'frozen_rounds':40,'appended_rounds':10,'evidence':str(out)}))
