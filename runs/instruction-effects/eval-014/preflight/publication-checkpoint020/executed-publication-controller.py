import pathlib,json,subprocess,hashlib
repo=pathlib.Path.cwd();inputs=json.loads((repo/'.local/eval014-checkpoint020-publication-inputs.json').read_text());scan=json.loads((repo/'.local/eval014-checkpoint020-publication-scan.json').read_text());target=inputs['target'];assert scan['status']=='passed' and not scan['findings'] and scan['target_git_commit']==target
assert json.loads((repo/'.local/eval014-checkpoint020-scan-cleanup.json').read_text())['snapshot_removed']
refs={ref:sha for ref,sha in inputs['refs'].items() if ref.startswith('refs/heads/builders/instruction-effects/eval-014/')};assert len(refs)==568
before=dict((ref,sha) for sha,ref in (line.split() for line in (repo/'.local/eval014-checkpoint020-remote-before.txt').read_text().splitlines()))
for ref,sha in refs.items():assert ref not in before or before[ref]==sha,'Ref already published at another commit: '+ref
assert subprocess.run(['git','merge-base','--is-ancestor',before['refs/heads/main'],target]).returncode==0
with (repo/'.local/eval014-checkpoint020-publication-push.log').open('w') as log:subprocess.run(['git','push','--atomic','origin',target+':refs/heads/main']+[sha+':'+ref for ref,sha in sorted(refs.items())],check=True,stdout=log,stderr=subprocess.STDOUT)
after=dict((ref,sha) for sha,ref in (line.split() for line in subprocess.check_output(['git','ls-remote','--heads','origin'],text=True).splitlines()));assert after['refs/heads/main']==target
for ref,sha in refs.items():assert after.get(ref)==sha,ref
for ref,sha in before.items():
 if ref!='refs/heads/main':assert after.get(ref)==sha,'Earlier remote ref changed: '+ref
proof={'verified':True,'target_git_commit':target,'remote_main':after['refs/heads/main'],'new_original_history_refs_verified':len(refs),'prior_remote_heads_unchanged':len(before)-1,'scan_sha256':hashlib.sha256((repo/'.local/eval014-checkpoint020-publication-scan.json').read_bytes()).hexdigest(),'scanner_sha256':scan['scanner_sha256'],'controller_sha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'scope':'Exact scanned checkpoint020snapshot and568 original eval014 histories; later PM preparations remain unpublished.'};(repo/'.local/eval014-checkpoint020-publication-verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
