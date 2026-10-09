import copy,json,re,shutil,sys
from pathlib import Path
from orchestrator.prepare import ROOT,checked,git,write_json,file_hashes
from orchestrator.evidence import digest_json,timestamp
from orchestrator.task_stream import task_stream,verify_replay,stream_sealed
from orchestrator.storage import require_space
source_id,target_id=sys.argv[1:];assert re.fullmatch(r'pilot-[0-9]{3}',source_id) and re.fullmatch(r'pilot-[0-9]{3}',target_id) and source_id!=target_id
source=ROOT/'runs/instruction-effects'/source_id;target=source.parent/target_id
original=json.loads((source/'manifest.json').read_text());assert original['purpose']=='engineering-longitudinal-pilot';assert stream_sealed(source)
assert file_hashes(source/'definitions')==original['provenance']['definition_hashes'];require_space(original,ROOT)
assert not target.exists();sibling=Path('/Users/Shared/projects/features-and-futures-builders')/target_id;assert not sibling.exists()
target.mkdir();shutil.copytree(source/'definitions',target/'definitions');shutil.copytree(source/'pricing',target/'pricing')
for task in task_stream(source):
 old=source/'tasks'/task['task_id'];new=target/'tasks'/task['task_id'];new.mkdir(parents=True);shutil.copy2(old/'packet.md',new/'packet.md')
 if 'suite_files' in task:
  for name in ('requirements.md','round.json'):shutil.copy2(old/name,new/name)
  shutil.copytree(old/'suite',new/'suite')
shutil.copy2(source/'stream-seal.json',target/'stream-seal.json')
sibling.mkdir();seed=sibling/'starter';checked(['git','clone','--no-local',str(Path(original['paths']['builders'])/'starter'),str(seed)]);git(seed,'remote','remove','origin');git(seed,'config','core.hooksPath','/dev/null')
assert git(seed,'rev-parse','HEAD^{tree}')==original['provenance']['starter_tree'] and not git(seed,'status','--porcelain')
for b in original['runtime']['builder_configurations']:
 repo=sibling/b['builder_id'];checked(['git','clone','--no-local',str(seed),str(repo)]);git(repo,'remote','remove','origin');git(repo,'config','user.name','Experiment Builder');git(repo,'config','user.email','builder@experiment.invalid');assert not git(repo,'remote') and git(repo,'rev-parse','HEAD^{tree}')==original['provenance']['starter_tree']
m=copy.deepcopy(original);m.update(run_id=target_id,frozen_at=timestamp(),status='running');m['paths']={'builders':str(sibling),'deployments':'/Users/Shared/projects/features-and-futures-deployments/'+target_id};m['lineage']={'source_run':source_id,'variation':'Fresh independent exact engineering replay; same frozen tasks/suites/instructions/runtime/reference prices; original missing usage remains in source run'};m['provenance']['pm_commit']=git(ROOT,'rev-parse','HEAD');m['provenance']['starter_commit']=git(seed,'rev-parse','HEAD');write_json(target/'manifest.json',m);(target/'manifest.sha256').write_text(digest_json(m)+'\n');write_json(target/'state.json',{'status':'prepared','accepted':{},'last_error':None})
proof=verify_replay(source,target);proof.update(purpose='Preparation only; no builder code, prior histories or outcomes copied',runtime_identical=m['runtime']==original['runtime'],execution_identical=m['execution']==original['execution'],prices_identical=m['pricing']==original['pricing'],definition_hashes_identical=m['provenance']['definition_hashes']==original['provenance']['definition_hashes'],fresh_builder_repositories=len(m['runtime']['builder_configurations']))
pre=target/'preflight/preparation';pre.mkdir(parents=True);write_json(pre/'exact-replay-verification.json',proof);shutil.copy2('.local/prepare-pilot-repeat.py',pre/'prepare-exact-repeat.py')
(target/'decisions').mkdir();(target/'decisions/lessons-applied.md').write_text((source/'decisions/lessons-applied.md').read_text()+'\nThis is an independent exact replay of all five frozen014tasks from fresh starter repositories, with no implementations, histories, transcripts or outcomes copied. Retain014native accounting gaps separately; no missing costs are reset or imputed. All12builders run in parallel with the same full barriers. Preparation does not dispatch model calls.\n')
print(target,digest_json(m),proof)
