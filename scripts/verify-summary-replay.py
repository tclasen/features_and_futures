"""Verify closed immutable-source summary-reader diagnostics and seal raw files."""
import argparse,hashlib,json
from pathlib import Path
from datetime import datetime,timezone
from orchestrator.prepare import file_hashes

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def specs(ss):
 for s in ss:
  yield from s.get('specs',[])
  yield from specs(s.get('suites',[]))
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--evidence',type=Path,required=True);parser.add_argument('--full',action='store_true');a=parser.parse_args()
 out=a.evidence;destination=out/'independently-verified.json';assert not destination.exists()
 run=Path('runs/instruction-effects/eval-014');inputs=json.loads((out/'inputs.json').read_text());resource=json.loads((out/'resource.json').read_text());closure=json.loads((out/'input-closure.json').read_text())
 assert closure['verified'] and resource['status']=='removed' and resource['original_git_restored'] and resource['sqlite_independently_restored'] and resource['inventory_absence_verified']
 assert inputs['native_model_calls']==resource.get('native_model_calls',0)==0
 index=run/'builders/b004/checkpoints/task-025-attempt-010/index.json';idx=json.loads(index.read_text())
 assert sha(index)==inputs['source_index_sha256'] and inputs['source_commit']==resource['source_commit']==idx['source_commit'] and inputs['source_tree']==resource['source_tree']==idx['source_tree']
 for name,checksum in idx['checksums'].items():assert sha(index.parent/name)==checksum
 assert sha(out/'submission.tar')==resource['submission_sha256']==idx['checksums']['committed-source.tar']
 assert sha(out/'retired.sqlite')==resource['retired_sqlite_sha256'] and sha(out/'executed-controller.py')==inputs['controller_sha256']
 original=run/'tasks/task-025/suite';assert file_hashes(original)==inputs['original_frozen_suite_files']
 for variant,checksums in inputs['executed_variants'].items():
  suite=out/variant/'definitions/project/acceptance';assert file_hashes(suite)==checksums
  assert set(checksums)==set(inputs['original_frozen_suite_files'])
  for relative in checksums:
   expected=(original/relative).read_bytes()
   if relative=='playwright.config.mjs' and not a.full:expected=expected.replace(b"  testDir: '.',",b"  testDir: '.',\n  grep: /043 |044 |045 /,")
   if relative=='return-order.spec.mjs' and variant=='diagnostic-text':expected=expected.replace(b'(await summary.innerText()).match(/\\d+/g).map(Number)',b'(await summary.textContent()).match(/\\d+/g).map(Number)')
   assert (suite/relative).read_bytes()==expected,(variant,relative)
 rows=json.loads((out/'results.json').read_text());checks=[]
 if a.full:
  assert len(rows)==3 and [r['phase'] for r in rows]==['upgrade','acceptance','postrestart']
  assert inputs['seed_database_sha256']==sha(run/'tasks/task-025/attempts/b004/attempt-010/retired.sqlite')
 else:assert len(rows)==6 and {(r['variant'],r['repeat']) for r in rows}=={(v,n) for v in ['original','diagnostic-text'] for n in [1,2,3]}
 for row in rows:
  folder=out/row['phase']/row['phase'] if a.full else out/f"{row['variant']}-{row['repeat']:03d}"/row['phase']
  report=json.loads((folder/'results.json').read_text());ss=list(specs(report['suites']));stats=report['stats'];assert stats==row['statistics'] and stats['skipped']==stats['flaky']==0 and not report['errors']
  passing=a.full or row['variant']=='diagnostic-text';count=(83 if row['phase']=='acceptance' else 1) if a.full else 3
  assert len(ss)==count and row['success']==passing and stats['expected']==(count if passing else 0) and stats['unexpected']==(0 if passing else count)
  for s in ss:
   if not a.full:assert s['title'].startswith(('043 ','044 ','045 '))
   for t in s['tests']:
    assert t['status']==('expected' if passing else 'unexpected')
    for result in t['results']:
     assert result['status']==('passed' if passing else 'failed')
     if passing:assert not result.get('errors')
     else:assert any("Cannot read properties of null (reading 'map')" in e['message'] for e in result['errors'])
  checks.append({'variant':row['variant'],'phase':row['phase'],'repeat':row.get('repeat'),'count':count,'passed':passing,'report_sha256':sha(folder/'results.json')})
 destination.write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'model_calls':0,'source_commit':idx['source_commit'],'source_tree':idx['source_tree'],'checks':checks,'verifier_sha256':sha(Path(__file__)),'files':file_hashes(out),'scope':'Immutable original-source diagnostic; no frozen native outcome reassignment. Full mode checks real process restart; directed mode does not establish cumulative readiness.'},indent=2)+'\n')
 print(json.dumps({'verified':True,'evidence':str(destination),'full':a.full}))
if __name__=='__main__':main()
