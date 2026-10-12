"""Verify pre-dispatch prepared031040 inputs before checkpoint030 inspection."""
import datetime, hashlib, json, subprocess
from pathlib import Path
from orchestrator.prepare import file_hashes
from orchestrator.task_stream import task_stream
r=Path('runs/instruction-effects/eval-016');rev=Path('experiments/instruction-effects/revisions/research-v016');out=Path('.local/eval016-next-prefix031040-selection003.json');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert not out.exists() and len(task_stream(r))==30
inspections=list(map(json.loads,(r/'analysis/inspections.jsonl').read_text().splitlines()));assert len(inspections)==1 and inspections[0]['checkpoint']==20
assert not (r/'analysis/candidate.json').exists()
initial='f3e4bddd42a351b8554fffe5bded76599976b640';current=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
ph=rev/'preflight/future031040-role-phase-listing003/verified.json';phases=json.loads(ph.read_text());assert phases['verified'] and len(phases['phase_listings'])==40
full=rev/'preflight/full040-action-role-independent002/verified.json';gate=json.loads(full.read_text());assert gate['verified'] and gate['cumulative_variants']==10 and gate['cumulative_cases']==1400 and gate['process_local_probe_cases']==20
assert all(sha(Path(p))==h for p,h in gate['files'].items())
paths={str(ph):sha(ph),str(full):sha(full)};rows=[]
for stage in range(31,41):
 draft=rev/f'decisions/future031040-role-preparation003/task-{stage:03d}';meta=json.loads((draft/'inputs.json').read_text());suite=Path(meta['suite'])
 assert meta['prepared_unfrozen'] and meta['no_native_dispatch'] and meta['stage']==stage
 assert sha(draft/'requirements.md')==meta['requirements_sha256'] and file_hashes(suite)==meta['suite_files']
 expected=meta['expected_phase_checks'];assert set(expected)=={'acceptance','upgrade','postrestart'}
 for phase,count in expected.items():
  found=[x for x in phases['phase_listings'] if x['target_stage']==stage and x['phase']==phase];assert len(found)==1 and found[0]['expected']==found[0]['listed']==count
  tested=stage-1 if phase=='upgrade' else stage
  assert found[0]['tested_stage']==tested
  if tested==30:
   prior=r/'tasks/task-030';expected_suite=file_hashes(prior/'suite');expected_requirement=sha(prior/'requirements.md')
  else:
   prior=rev/f'decisions/future031040-role-preparation003/task-{tested:03d}';expected_suite=json.loads((prior/'inputs.json').read_text())['suite_files'];expected_requirement=sha(prior/'requirements.md')
  assert found[0]['suite_files']==expected_suite and found[0]['requirement_sha256']==meta['requirements_sha256']
 hashes=file_hashes(draft)
 for name,h in hashes.items():paths[str(draft/name)]=h
 for name,h in meta['suite_files'].items():paths[str(suite/name)]=h
 rows.append({'stage':stage,'draft':str(draft),'prepared_files':hashes,'suite':str(suite),'suite_files':meta['suite_files'],'expected_phase_checks':expected})
items=[(commit+':'+p,h) for commit in (initial,current) for p,h in sorted(paths.items())]
raw=subprocess.check_output(['git','cat-file','--batch'],input=''.join(q+'\n' for q,h in items).encode());cursor=0
for query,h in items:
 end=raw.index(b'\n',cursor);header=raw[cursor:end].split();assert len(header)==3 and header[1]==b'blob';size=int(header[2]);cursor=end+1;blob=raw[cursor:cursor+size];assert len(blob)==size and hashlib.sha256(blob).hexdigest()==h;cursor+=size;assert raw[cursor:cursor+1]==b'\n';cursor+=1
assert cursor==len(raw)
result={'verified':True,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'controller_sha256':sha(Path(__file__)),'source_commit_before_native_dispatch':initial,'current_publication_target':current,'prior_inspection_checkpoints':[20],'checkpoint030_inspection_exists':False,'git_blobs_checked':len(items),'independent_full040_gate':str(full),'independent_full040_gate_sha256':sha(full),'phase_inventory':str(ph),'phase_inventory_sha256':sha(ph),'selected_rounds':rows,'checked_prepared_paths':paths,'native_model_calls':0,'dispatch_started':False,'active_stream_unchanged':True,'scope':'Current031040 public requirements, generic role suite and phase inventories are byte-identical to initial native dispatch commit and current committed target; full040 independent synthetic readiness hashes rechecked. Selection retained before030 inspection; no task freeze or dispatch. Synthetic process-local probes are not native restart evidence.'}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'verified':True,'git_blobs_checked':len(items),'rounds':10,'phase_counts':{x['stage']:x['expected_phase_checks']['acceptance'] for x in rows},'evidence':str(out)}))
