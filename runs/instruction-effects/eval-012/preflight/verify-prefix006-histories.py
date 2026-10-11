"""Restore every closed original Git bundle and all refs; no source execution."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
from orchestrator.evidence import timestamp
r=Path('runs/instruction-effects/eval-012');stage=6
events_raw=(r/'events.jsonl').read_bytes();events=[json.loads(line) for line in events_raw.splitlines()]
for n in range(1,stage+1):
 task=f'task-{n:03d}'
 for kind in ['task_accepted','post_deployment_checks_passed']:
  selected=[e for e in events if e['kind']==kind and e.get('task_id')==task];assert len(selected)==12 and len({e['builder_id'] for e in selected})==12
 assert any(e['kind']=='round_completed' and e.get('task_id')==task for e in events)
out=r/'preflight/prefix-history-verification'/f'prefix-{stage:03d}';assert not out.exists();out.mkdir(parents=True)
(out/'events-snapshot.jsonl').write_bytes(events_raw)
rows=[];refs={}
def git(*a,cwd=None):return subprocess.check_output(['git',*a],cwd=cwd,text=True,stderr=subprocess.PIPE).strip()
for p in sorted((r/'builders').glob('*/checkpoints/*/index.json')):
 if int(p.parent.name.split('-')[1])>stage:continue
 d=json.loads(p.read_text());assert d['run_id']=='eval-012'
 for name,expected in d['checksums'].items():assert hashlib.sha256((p.parent/name).read_bytes()).hexdigest()==expected
 with tempfile.TemporaryDirectory(prefix='eval012-original-verify-',dir='/private/tmp') as tmp:
  restored=Path(tmp)/'original.git';git('clone','--mirror','--quiet',str((p.parent/'history.bundle').resolve()),str(restored));assert git('rev-parse','HEAD',cwd=restored)==d['source_commit'];assert git('rev-parse','HEAD^{tree}',cwd=restored)==d['source_tree'];git('fsck','--full','--no-reflogs',cwd=restored)
  source_refs={name:sha for name,sha in (line.rsplit(' ',1) for line in d['source_refs'])}
  for name,sha in source_refs.items():assert git('rev-parse',name,cwd=restored)==sha
  archived=subprocess.check_output(['git','-C',str(restored),'archive','--format=tar','HEAD']);assert hashlib.sha256(archived).hexdigest()==d['checksums']['committed-source.tar']
 for ref in d['github_refs']:
  expected=d['source_commit'] if ref.endswith('/head') else source_refs['refs/heads/'+ref.split('/branches/',1)[1]]
  assert git('rev-parse',ref)==expected;refs[ref]=expected
 rows.append({'index':str(p),'index_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source_commit':d['source_commit'],'source_tree':d['source_tree'],'all_source_refs_restored':len(source_refs),'snapshot_matches':True})
assert len(rows)>=12*stage and len(refs)>=len(rows)
(out/'verified.json').write_text(json.dumps({'utc':timestamp(),'verified':True,'archives':rows,'refs':refs,'closed_shared_stage':stage,'events_snapshot_sha256':hashlib.sha256(events_raw).hexdigest(),'scope':'All closed-prefix original checkpoints and native refs independently mirror-restored/fsck and committed tar hash verified; namespaced local refs checked. Temporary mirrors removed. No model call or source execution. Live later rounds excluded; original dirty files/data and publication independently required.','native_model_calls':0},indent=2)+'\n');print(json.dumps({'verified':True,'archives':len(rows),'refs':len(refs)}))
