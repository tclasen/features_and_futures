"""Verify exact positive/negative coverage while retaining failed irrelevant-fault preflight."""
import hashlib,json,shutil
from pathlib import Path
from datetime import datetime,timezone
base=Path('experiments/instruction-effects/revisions/research-v016/preflight');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(p.read_text());outputs=[];rows=[]
for number in ['001','002']:
 folders=list(base.glob('export017-role-focused'+number+'-check-*'));assert len(folders)==1;folder=folders[0];outputs.append(folder);source=base/('export017-role-focused'+number+'-fixture.mjs');inputs=base/('export017-role-focused'+number+'-inputs.json');i=read(inputs);assert i['controller_sha256']==sha(source)==sha(folder/'executed-controller.mjs')
 suite=base/'export017-role-suite';assert i['suite_files']=={str(f.relative_to(suite)):sha(f) for f in suite.rglob('*') if f.is_file()}
 group=read(folder/'progress.json');assert len(group)==(35 if number=='001' else 8)
 if number=='001':
  assert group[-1]['name']=='fault-button-export-wrong-archive' and group[-1]['exit']==0
  closure=read(folder/'input-closure-failed001.json');assert closure['terminal_exit']==1 and all(sha(folder/n)==h for n,h in closure['files'].items())
  group=group[:-1]
 else:assert read(folder/'verified.json')['verified']
 for row in group:
  result=folder/row['name']/'results.json';report=read(result);assert report['stats']==row['statistics'];stats=report['stats'];assert stats['skipped']==stats['flaky']==0
  positive=row['name'].startswith('positive-');assert stats['expected']==(2 if positive else 0) and stats['unexpected']==(0 if positive else 1) and (row['exit']==0)==positive
  rows.append({'group':number,'name':row['name'],'result_sha256':sha(result),'expected':stats['expected'],'unexpected':stats['unexpected']})
assert len(rows)==42 and len({r['name'] for r in rows})==42
positive={r['name'] for r in rows if r['name'].startswith('positive-')};assert positive=={'positive-'+role+'-'+mode for role in ['button','link'] for mode in ['form','fetch','async']}
faults=['wrong-export-filename','wrong-export-format','wrong-export-version','filtered-export','export-omits-deleted','export-reversed-order','export-foreign-tasks','export-trimmed-notes','export-loses-priority','export-loses-date','export-loses-completion','export-loses-deletion','export-mutates-notes','export-wrong-project-default','export-wrong-archive','archived-export-disabled','export-control-missing','export-control-duplicate'];assert {r['name'] for r in rows if r['name'].startswith('fault-')}=={'fault-'+role+'-'+f for role in ['button','link'] for f in faults}
proof={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'verifier_sha256':sha(Path(__file__)),'positive_variants':6,'positive_cases':12,'fault_variants':36,'total_discriminating_cases':48,'rows':rows,'retained_irrelevant_fault_observation':'Original001last row sets archived=false on active058 project; producer gate failed. Original observation and failure closure retained.002uses archived059for this actual fault. No original test/criteria edit or retroactive builder acceptance.','files':{str(f):sha(f) for folder in outputs for f in folder.rglob('*') if f.is_file()},'input_sources':{str(f):sha(f) for f in base.glob('export017-role-focused00*-*.mjs')},'scope':'Focused export roles/rendering and genuine faults only. Full cumulative role gates, other generic-action audit, phase lists/runtime/native launch still required before new run.'}
out=base/'export017-role-focused-combined001';assert not out.exists();out.mkdir();shutil.copy2(__file__,out/'executed-verifier.py');(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:proof[k] for k in ['verified','positive_cases','fault_variants','total_discriminating_cases']}))
