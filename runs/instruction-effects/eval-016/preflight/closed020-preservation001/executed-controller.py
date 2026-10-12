"""Preserve independently verified closed020 evidence and preselected extension."""
import datetime, hashlib, json, shutil, subprocess
from pathlib import Path
r=Path('runs/instruction-effects/eval-016');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
audit=r/'reports/closed-rounds-020-4913781c1a52326c'; originals=r/'preflight/originals-closed-rounds-020-4913781c1a52326c'
a=json.loads((audit/'verified.json').read_text());o=json.loads((originals/'verified.json').read_text());assert a['verified'] and a['through']==20 and a['accepted_checkpoints']==240 and a['requests']==2738 and a['unknown_receipts']==3
assert o['verified'] and len(o['native_originals'])==len(o['deliveries'])==275 and len(o['isolation'])==240
pointer=json.loads((r/'reports/latest.json').read_text());rp=r/'reports'/pointer['report'];report=json.loads(rp.read_text());assert sha(rp)==pointer['sha256'] and report['analysis_ready'] and not report['analysis_problems'] and len(report['tasks'])==240
inspections=list(map(json.loads,(r/'analysis/inspections.jsonl').read_text().splitlines()));assert len(inspections)==1 and inspections[0]['checkpoint']==20 and not (r/'analysis/candidate.json').exists()
frozen=r/'preflight/next-prefix021030-freeze001/verified.json';assert json.loads(frozen.read_text())['verified']
state=json.loads((r/'state.json').read_text());assert state['status']=='awaiting_frozen_round' and all(v['stage']==20 for v in state['accepted'].values())
out=r/'preflight/closed020-preservation001';assert not out.exists();out.mkdir();shutil.copy2(__file__,out/'executed-controller.py')
paths=[str(r/'builders'),str(r/'events.jsonl'),str(r/'usage.jsonl'),str(r/'state.json'),str(r/'analysis'),str(r/'reports'),str(audit),str(originals),str(r/'decisions/lessons-applied.md'),str(out),str(r/'preflight/next-prefix021030-freeze001'),str(r/'preflight/resource-reconciliation-20261012T195007849572Z'),str(r/'preflight/retired-resources-20261012T195013407352Z')]
paths += [str(r/f'tasks/task-{i:03d}') for i in range(1,31)]
proof={'verified':True,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'original_attempts':275,'source_checkpoints':len(list((r/'builders').glob('*/checkpoints/*/index.json'))),'accepted_deployed':240,'isolation_probes':240,'audit_sha256':sha(audit/'verified.json'),'originals_sha256':sha(originals/'verified.json'),'report':str(rp),'report_sha256':sha(rp),'inspection_sha256':sha(r/'analysis/inspections.jsonl'),'extension_sha256':sha(frozen),'controller_sha256':sha(Path(__file__)),'staged_paths':paths,'native_model_calls':0,'scope':'Verified closed020 originals and first descriptive inspection plus unchanged preselected021030 frozen packets. No candidate or confirmed finding; unknown usage counters and unbounded total cost retained.'}
(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n')
with (r/'decisions/lessons-applied.md').open('a') as f:f.write('\nClosed020 checkpoint: all240 accepted/deployed; independently restored275 native originals and deliveries,240 isolation probes. Report analysis_ready with no analysis problems; native accounting remains incomplete for3 retained provider failures. First scheduled inspection produced no candidate. Preselected021030 frozen after checked inspection with960-blob pre-dispatch selection binding; no observer/treatment/accounting change. Verified258 native retired databases plus2 separately restored failed-launch apps;24 active resources retained. Evidence: preflight/closed020-preservation001, originals-closed-rounds-020-4913781c1a52326c and next-prefix021030-freeze001.\n')
subprocess.run(['git','add','--',*paths],check=True)
print(json.dumps({'preserved':True,'source_checkpoints':proof['source_checkpoints'],'staged_path_count':len(paths)}))
