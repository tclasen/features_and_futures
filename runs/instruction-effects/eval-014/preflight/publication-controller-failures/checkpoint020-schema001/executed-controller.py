import pathlib,subprocess,json,shutil,hashlib
repo=pathlib.Path.cwd();target=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();clone=repo/'.local/eval014-checkpoint020-publication-snapshot';assert not clone.exists()
refs={};counts={}
for path in subprocess.check_output(['git','ls-tree','-r','--name-only',target,'runs/'],text=True).splitlines():
 if '/builders/' not in path or '/checkpoints/' not in path or not path.endswith('/index.json'):continue
 index=json.loads(subprocess.check_output(['git','show',target+':'+path],text=True));run=index['run_id'];counts[run]=counts.get(run,0)+1;source=dict(s.split(' ',1) for s in index['source_refs'])
 for ref in index['github_refs']:
  expected=index['source_commit'] if ref.endswith('/head') else source['refs/heads/'+ref.split('/branches/',1)[1]]
  assert subprocess.check_output(['git','rev-parse',ref],text=True).strip()==expected
  assert ref not in refs or refs[ref]==expected;refs[ref]=expected
assert counts['eval-014']==284
meta={'target':target,'refs':refs,'archive_counts':counts,'controller_sha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}
(repo/'.local/eval014-checkpoint020-publication-inputs.json').write_text(json.dumps(meta,indent=2)+'\n')
try:
 subprocess.run(['git','clone','--shared','--single-branch','--branch','main','--quiet',str(repo),str(clone)],check=True)
 assert subprocess.check_output(['git','-C',str(clone),'rev-parse','HEAD'],text=True).strip()==target
 subprocess.run(['git','-C',str(clone),'update-ref','--stdin'],input=''.join('update '+ref+' '+sha+'\n' for ref,sha in sorted(refs.items())),text=True,check=True,capture_output=True)
 with (repo/'.local/eval014-checkpoint020-publication-scan.json').open('w') as output:subprocess.run(['python3','-B',str(repo/'scripts/scan-publication.py'),'--repo',str(clone)],stdout=output,check=True)
 proof=json.loads((repo/'.local/eval014-checkpoint020-publication-scan.json').read_text());assert proof['status']=='passed' and proof['target_git_commit']==target
 print(json.dumps({'verified':True,'target':target,'original_refs_scanned':len(refs),'archive_counts':counts}))
finally:
 if clone.exists():shutil.rmtree(clone)
 (repo/'.local/eval014-checkpoint020-scan-cleanup.json').write_text(json.dumps({'snapshot_removed':not clone.exists(),'snapshot':str(clone),'target':target})+'\n')
