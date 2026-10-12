import hashlib,json,shutil
from pathlib import Path
from orchestrator.prepare import file_hashes
r=Path('runs/instruction-effects/eval-015');p=r/'preflight/export017-native-full001';out=p/'source-bound-verification001';assert not out.exists()
sha=lambda q:hashlib.sha256(q.read_bytes()).hexdigest()
x=json.loads((p/'inputs.json').read_text());closure=json.loads((p/'input-closure.json').read_text());resource=json.loads((p/'resource.json').read_text());results=json.loads((p/'results.json').read_text());assert closure['verified'] and resource['status']=='removed' and resource['inventory_absence_verified']
assert [(v['phase'],v['statistics']['expected'],v['success']) for v in results]==[('upgrade',1,True),('acceptance',58,True),('postrestart',1,True)]
assert all(not any(v['statistics'][k] for k in ['unexpected','skipped','flaky']) for v in results)
assert x['controller_sha256']==sha(p/'executed-controller.py') and closure['inputs_sha256']==sha(p/'inputs.json')
original=r/'tasks/task-017/suite';suite=p/'diagnostic-control/definitions/project/acceptance';a=file_hashes(original);b=file_hashes(suite);assert x['original_frozen_suite_files']==a and x['executed_variants']['diagnostic-control']==b
assert {n for n in a.keys()|b.keys() if a.get(n)!=b.get(n)}=={'export.spec.mjs'}
old="page.getByRole('button',{name:'Download project',exact:true})";new=old+".or(page.getByRole('link',{name:'Download project',exact:true}))";s=(original/'export.spec.mjs').read_text();assert s.count(old)==2 and s.replace(old,new)==(suite/'export.spec.mjs').read_text()
assert resource['source_commit']==x['source_commit'] and resource['source_tree']==x['source_tree'] and resource['original_git_restored'] and resource['sqlite_independently_restored']
inline=p/'independently-verified.json';i=json.loads(inline.read_text());assert i['verified'] and all(sha(p/n)==h for n,h in i['files'].items())
proof={'verified':True,'native_model_calls':0,'verifier_sha256':sha(Path(__file__)),'source_commit':x['source_commit'],'source_tree':x['source_tree'],'full_cumulative_checks':58,'own_prior_upgrade_passed':True,'actual_restart_passed':True,'source_unchanged':True,'resource_archived_restored_removed':True,'sole_suite_delta':'Two Download project locators accept one accessible button or link; every content/filename/state assertion and all other files unchanged.','files':{str(q.relative_to(p)):sha(q) for q in p.rglob('*') if q.is_file()},'scope':'Source-bound independent report/input/selector-delta verification. Original inline verification retained; synthetic positive and negative role gates pending. No native outcome reassignment.'}
out.mkdir();shutil.copy2(__file__,out/'executed-controller.py');(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'verified':True,'checks':58,'evidence':str(out/'verified.json')}))
