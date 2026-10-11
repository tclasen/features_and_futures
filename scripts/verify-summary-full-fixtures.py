"""Independently verify the closed prospective eight-variant full030 fixture."""
import argparse,hashlib,json,sys
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from orchestrator.prepare import file_hashes
from orchestrator.summary_readiness import verify_summary_only_delta

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def specs(ss):
 for s in ss:
  yield from s.get('specs',[]);yield from specs(s.get('suites',[]))
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--batch',type=Path,required=True);args=parser.parse_args();batch=args.batch;base=batch.parent
 assert batch.name.startswith('task030-summary-full001-batch-') and base==Path('experiments/instruction-effects/revisions/research-v015/preflight')
 completed=json.loads((batch/'verified.json').read_text());assert completed['verified'] and completed['model_calls']==0
 out=Path(completed['evidence']);assert out.parent==base;destination=out/'independently-verified.json';assert not destination.exists()
 inputs=json.loads((batch/'inputs.json').read_text());prepared=base/'task030-summary-full001-inputs.json';assert sha(prepared)==inputs['prepared_sha256']
 prep=json.loads(prepared.read_text());assert sha(out/'executed-controller.mjs')==inputs['controller_sha256']==prep['controller_sha256']
 suite=base/'task030-summary-suite';assert file_hashes(suite)==prep['suite_files']==inputs['suite_files']
 original=Path('runs/instruction-effects/eval-014/tasks/task-030/suite');assert verify_summary_only_delta(original,suite)==['return-order.spec.mjs']
 closure_path=out/'input-closure.json';closure=json.loads(closure_path.read_text());assert closure['exit_code']==0 and closure['model_calls']==0 and sha(closure_path)==completed['input_closure_sha256']
 assert closure['batch_inputs_sha256']==sha(batch/'inputs.json') and closure['controller_sha256']==inputs['controller_sha256']
 assert file_hashes(out)==closure['files']|{'input-closure.json':sha(closure_path)}
 reference=Path('experiments/instruction-effects/revisions/research-v014/preflight/task030-full-check-1791723081556');ref=reference/'positive-async/results.json';ref_closure=json.loads((reference/'input-closure.json').read_text())
 assert ref_closure['verified'] and ref_closure['suite_files']==file_hashes(original)
 assert sha(ref)=='bb81906b2bf4c4a1e78079dcb953910d439e90ab74630bc773f2567e4bf3d854'
 reference_git_commit='24206f255ebe21a6f57539c6d714fd353fd83623'
 titles=sorted(s['title'] for s in specs(json.loads(ref.read_text())['suites']));assert len(titles)==len(set(titles))==99
 proof=json.loads((out/'verified.json').read_text());assert proof['verified'] and proof['model_calls']==0
 names={f'positive-{mode}{suffix}' for mode in ['async','form','fetch'] for suffix in ['', '-reload-reset']}|{'positive-form-restore-retain-archived','positive-form-reload-reset-restore-active'}
 expected=names|{name+'-'+phase for name in names for phase in ['postrestart','observation-30']};assert len(proof['results'])==24 and {r['name'] for r in proof['results']}==expected
 checks=[]
 for row in proof['results']:
  report_path=out/row['name']/'results.json';report=json.loads(report_path.read_text());ss=list(specs(report['suites']));stats=report['stats'];count=99 if row['phase']=='acceptance' else 1
  assert row['exit']==0 and row['statistics']==stats and not report['errors'] and stats['expected']==len(ss)==count and stats['unexpected']==stats['skipped']==stats['flaky']==0
  assert all(t['status']=='expected' and all(r['status']=='passed' and not r.get('errors') for r in t['results']) for s in ss for t in s['tests'])
  if row['phase']=='acceptance':assert sorted(s['title'] for s in ss)==titles
  else:assert row['phase'] in ['postrestart','observation-30']
  checks.append({'name':row['name'],'phase':row['phase'],'tests':count,'report_sha256':sha(report_path)})
 destination.write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'model_calls':0,'full99_variants':8,'process_local_probes':16,'checks':checks,'input_closure_sha256':sha(closure_path),'batch_inputs_sha256':sha(batch/'inputs.json'),'reference99_result_sha256':sha(ref),'reference_git_commit':reference_git_commit,'verifier_sha256':sha(Path(__file__)),'scope':'Prospective PM synthetic full030 only. Internal source-bound assertions require nonzero reset/restore/invalid-draft observations; their magnitudes are not separately emitted. Process-local probes do not verify actual process restart or model outcomes.'},indent=2)+'\n')
 print(json.dumps({'verified':True,'evidence':str(destination)}))
if __name__=='__main__':main()
