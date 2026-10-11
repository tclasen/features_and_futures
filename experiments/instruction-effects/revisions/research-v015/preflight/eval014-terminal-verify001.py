"""Recheck closed terminal archives, attribution proof, clocks and cost limitations."""
import hashlib,importlib.util,json,sqlite3,subprocess,tarfile,tempfile
from pathlib import Path
from datetime import datetime,timezone
run=Path('runs/instruction-effects/eval-014');output=run/'preflight/terminal-preservation002'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
state=json.loads((run/'state.json').read_text());assert state['status']=='superseded'
proofs=json.loads((output/'verified-resources.json').read_text());assert len(proofs)==24 and len({r['sandbox'] for r in proofs})==24
spec=importlib.util.spec_from_file_location('restore','scripts/verify-retained-originals.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
checked=[]
for proof in proofs:
 assert proof['status']=='removed' and proof['restored_original_history']
 if proof['kind']=='builder':
  bid=proof['sandbox'].removeprefix('ff-eval-014-');folder=output/'builders'/bid
  meta=json.loads((folder/'native-git.json').read_text());assert meta['head']==proof['source_commit'] and meta['tree']==proof['source_tree'] and meta['dirty']==proof['source_dirty']
  assert sha(folder/'native-history.bundle')==proof['native_history_sha256'] and sha(folder/'native-working-tree.tar.gz')==proof['native_working_tree_sha256']
  module.restore(folder/'native-history.bundle',meta['head'],meta['tree'],folder/'native-working-tree.tar.gz',meta['dirty'])
  index=run/'builders'/bid/'checkpoints/terminal-closure/index.json';idx=json.loads(index.read_text());assert idx['source_commit']==meta['head'] and idx['source_tree']==meta['tree']
  for name,checksum in idx['checksums'].items():assert sha(index.parent/name)==checksum
 else:
  bid=proof['builder_id'];accepted=state['accepted'][bid];folder=output/'apps'/proof['sandbox'];assert accepted['sandbox']==proof['sandbox'] and accepted['stage']==proof['accepted_stage']
  index=Path(accepted['checkpoint_archive'])/'index.json';idx=json.loads(index.read_text());assert idx['source_commit']==proof['original_source_commit'] and idx['source_tree']==proof['original_source_tree']
  for name,checksum in idx['checksums'].items():assert sha(index.parent/name)==checksum
  module.restore(index.parent/'history.bundle',idx['source_commit'],idx['source_tree'])
  assert sha(folder/'private-app.tar.gz')==proof['archive_sha256']
  with tempfile.TemporaryDirectory(prefix='eval014-terminal-app-verify-',dir='/private/tmp') as temp:
   with tarfile.open(folder/'private-app.tar.gz') as archive:archive.extractall(temp,filter='data')
   for db in [Path(temp)/'app/.runtime/app.sqlite',folder/'consistent-app.sqlite']:
    with sqlite3.connect(f'file:{db.resolve()}?mode=ro',uri=True) as connection:assert connection.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 checked.append({'sandbox':proof['sandbox'],'kind':proof['kind'],'retirement_sha256':sha(folder/'retirement.json')})
current=json.loads(subprocess.check_output(['sbx','ls','--json'],text=True));assert not any(r['name'].startswith('ff-eval-014-') for r in current['sandboxes'])
coverage=run/'reports/request-coverage-014da40aa03f1a76.json';cv=json.loads(coverage.read_text());assert cv['complete_run_request_coverage'] and not cv['problems'] and cv['dispatched_requests']==3889
native=run/'reports/native-audit-cbc89576739cd047.json';nv=json.loads(native.read_text());assert not nv['problems'] and nv['recorded_finished_requests']==3889 and nv['verified_native_receipts']==3884 and nv['unknown_receipts']==5
originals=run/'preflight/originals-drained-through025-a3cb9633e4ba264f/verified.json';ov=json.loads(originals.read_text());assert ov['verified'] and len(ov['native_originals'])==380 and len(ov['isolation'])==300
attribution=Path('experiments/instruction-effects/revisions/research-v014/preflight/summary043-native-full-003/independently-verified.json');av=json.loads(attribution.read_text());assert av['verified'] and all(c['passed'] for c in av['checks'])
report=run/'reports/terminal-closure.json';assert not report.exists()
report.write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'run_id':'eval-014','status':'superseded','last_complete_shared_round':24,'accepted_checkpoints':299,'native_original_attempts':380,'terminal_resource_archives':24,'all_terminal_resources_independently_restored_and_removed':True,'checks':checked,'request_coverage_sha256':sha(coverage),'native_audit_sha256':sha(native),'originals_proof_sha256':sha(originals),'native_attribution_proof_sha256':sha(attribution),'verifier_sha256':sha(Path(__file__)),'native_requests':3889,'known_native_receipts':3884,'unknown_native_receipts':5,'known_uncached_reference_lower_bound_usd':nv['known_uncached_reference_lower_bound_usd'],'known_cache_aware_lower_bound_usd':nv['known_cache_aware_lower_bound_usd'],'cost_upper_bound':'unbounded','native_cost_point_estimate':None,'analysis_ready':False,'comparative_finding':False,'successor_revision':'research-v015','limitations':['Frozen summary reader caused confirmed false rejection of exact archived task025 b004 attempt010; superseding attribution preserves original result and exposure.','Other attempts are not assigned counterfactual acceptance.','Unknown counters remain unknown; five terminal costs cannot be reconstructed.','Native hosted model aliases and PM fixture overlap remain recorded confounds.','This superseded trajectory cannot complete the study; successor remains unfrozen until its gates pass.']},indent=2)+'\n')
print(json.dumps({'verified':True,'restored_terminal_resources':24,'evidence':str(report)}))
