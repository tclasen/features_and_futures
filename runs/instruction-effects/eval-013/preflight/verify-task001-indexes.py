"""Restore every closed original Git bundle and all refs; no source execution."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
from orchestrator.evidence import timestamp
r=Path('runs/instruction-effects/eval-013');assert json.loads((r/'state.json').read_text())['status']=='running'
out=r/'preflight/task001-original-index-verification';assert not out.exists();out.mkdir()
rows=[];refs={}
def git(*a,cwd=None):return subprocess.check_output(['git',*a],cwd=cwd,text=True,stderr=subprocess.PIPE).strip()
for p in sorted((r/'builders').glob('*/checkpoints/task-001-*/index.json')):
 d=json.loads(p.read_text());assert d['run_id']=='eval-013'
 for name,expected in d['checksums'].items():assert hashlib.sha256((p.parent/name).read_bytes()).hexdigest()==expected
 with tempfile.TemporaryDirectory(prefix='eval013-original-verify-',dir='/private/tmp') as tmp:
  restored=Path(tmp)/'original.git';git('clone','--mirror','--quiet',str((p.parent/'history.bundle').resolve()),str(restored));assert git('rev-parse','HEAD',cwd=restored)==d['source_commit'];assert git('rev-parse','HEAD^{tree}',cwd=restored)==d['source_tree'];git('fsck','--full','--no-reflogs',cwd=restored)
  source_refs={name:sha for name,sha in (line.rsplit(' ',1) for line in d['source_refs'])}
  for name,sha in source_refs.items():assert git('rev-parse',name,cwd=restored)==sha
  archived=subprocess.check_output(['git','-C',str(restored),'archive','--format=tar','HEAD']);assert hashlib.sha256(archived).hexdigest()==d['checksums']['committed-source.tar']
 for ref in d['github_refs']:
  expected=d['source_commit'] if ref.endswith('/head') else source_refs['refs/heads/'+ref.split('/branches/',1)[1]]
  assert git('rev-parse',ref)==expected;refs[ref]=expected
 rows.append({'index':str(p),'index_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source_commit':d['source_commit'],'source_tree':d['source_tree'],'all_source_refs_restored':len(source_refs),'snapshot_matches':True})
events=[json.loads(line) for line in (r/'events.jsonl').read_text().splitlines()]
observed=[e for e in events if e['kind']=='submission_observed']
observed=[e for e in observed if e['task_id']=='task-001'];assert len(rows)==13 and len(observed)==13 and len(refs)==2*len(rows)
for e in observed:
 index=r/'builders'/e['builder_id']/'checkpoints'/(e['task_id']+'-'+e['attempt_id'])/'index.json'
 assert any(row['index']==str(index) for row in rows)
(out/'verified.json').write_text(json.dumps({'utc':timestamp(),'verified':True,'archives':rows,'refs':refs,'scope':'Thirteen closed task001 original checkpoints and all native refs independently mirror-restored/fsck and committed tar hash verified;All namespaced local refs checked. Temporary mirrors removed. No model call or source execution. Native dirty working files and app data separately retained in incident/recovery/terminal-preservation archives.','native_model_calls':0},indent=2)+'\n');print(json.dumps({'verified':True,'archives':len(rows),'refs':len(refs)}))
