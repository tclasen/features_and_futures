"""Independently bind closed layout-skipping reader positives and genuine faults."""
import json,hashlib
from pathlib import Path
b=Path('experiments/instruction-effects/revisions/research-v014/preflight')
out=b/'summary043-focused-fixture001-check-1791753702472'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def specs(ss):
 for s in ss:
  yield from s.get('specs',[]);yield from specs(s.get('suites',[]))
inputs=b/'summary043-focused-fixture001-inputs.json';prepared=json.loads(inputs.read_text())
assert sha(out/'executed-controller.mjs')==prepared['controller_sha256']==sha(b/'summary043-focused-fixture001.mjs')
suite=b/'summary043-focused-fixture001-suite';assert prepared['suite_files']=={str(p.relative_to(suite)):sha(p) for p in suite.rglob('*') if p.is_file()}
proof=json.loads((out/'verified.json').read_text());assert proof['verified'] and proof['model_calls']==0
expected={'positive-form','positive-async','positive-fetch','negative-always-append-return','negative-per-project-position-reset','negative-stale-return-fields'}
assert len(proof['results'])==6 and {r['name'] for r in proof['results']}==expected
for row in proof['results']:
 report=json.loads((out/row['name']/'results.json').read_text());ss=list(specs(report['suites']));stats=report['stats'];positive=row['name'].startswith('positive-');count=3 if positive else 1
 assert stats==row['statistics'] and not report['errors'] and stats['skipped']==stats['flaky']==0 and row['exit']==(0 if positive else 1)
 assert len(ss)==count and stats['expected']==(3 if positive else 0) and stats['unexpected']==(0 if positive else 1)
 for s in ss:
  assert s['title'].startswith(('043 ','044 ','045 ') if positive else ('043 ',))
  for t in s['tests']:
   assert t['status']==('expected' if positive else 'unexpected')
   for result in t['results']:
    assert result['status']==('passed' if positive else 'failed')
    assert (not result.get('errors')) if positive else bool(result.get('errors'))
destination=out/'independently-verified.json';assert not destination.exists()
destination.write_text(json.dumps({'verified':True,'native_model_calls':0,'controller_sha256':prepared['controller_sha256'],'preparation_sha256':sha(inputs),'verifier_sha256':sha(Path(__file__)),'positive_modes':3,'positive_cases_per_mode':3,'genuine_faults':3,'files':{str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file()},'scope':'Prospective reader controls only. Frozen native suites and assessments unchanged; full native83/upgrade/restart proof remains a separate gate.'},indent=2)+'\n')
print(json.dumps({'verified':True,'evidence':str(destination)}))
