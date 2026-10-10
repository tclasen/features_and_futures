from pathlib import Path
import json,shutil,hashlib
r=Path('experiments/instruction-effects/revisions/research-v007');out=r/'preflight/prospective-phase-listing';expected={21:72,22:74,23:76,24:80,25:83,26:86,27:89,28:92,29:95,30:99};rows=[]
for stage,count in expected.items():
 for phase in ['acceptance','postrestart','upgrade','observation-30']:
  p=out/f'{stage:03d}-{phase}.stdout.log';doc=json.loads(p.read_text());assert not doc['errors'];assert doc['stats']['unexpected']==0
  def specs(x):return sum(len(s['tests']) for s in x.get('specs',[]))+sum(specs(s) for s in x.get('suites',[]))
  actual=specs(doc);assert actual==(count if phase=='acceptance' else 1),(stage,phase,actual)
  rows.append({'stage':stage,'phase':phase,'discovered_tests':actual,'stdout_sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
shutil.copy2(__file__,out/'executed-verifier.py');shutil.copytree(r/'decisions/task-030-draft/suite',out/'listed-suite');shutil.copy2(r/'decisions/task-030-draft/requirements.md',out/'listed-requirements.md')
(out/'parsed-verified.json').write_text(json.dumps({'verified':True,'frozen':False,'listings':rows,'supersedes_summary_field':'observed.json total_line was the final JSON closing brace, not a count. Actual JSON suite discovery independently parsed here.','scope':'Listings only, with exact prospective input copy. No model/browser/server execution or future-round readiness claimed.'},indent=2)+'\n');print(json.dumps({'listings':len(rows),'acceptance_counts':expected}))
