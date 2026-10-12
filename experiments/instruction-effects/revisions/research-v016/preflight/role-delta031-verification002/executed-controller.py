"""Bind prospective exact role-only suites and unchanged public/math inputs."""
import json,hashlib,shutil
from pathlib import Path
from datetime import datetime,timezone
from orchestrator.action_role_readiness import verify_role_only_delta
old=Path('experiments/instruction-effects/revisions/research-v015');new=Path('experiments/instruction-effects/revisions/research-v016');out=new/'preflight/role-delta031-verification002';assert not out.exists();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();checks=[];files={}
for stage in range(1,31):
 a=old/f'decisions/frozen-prefix-drafts/task-{stage:03d}';b=new/f'decisions/frozen-prefix-drafts/task-{stage:03d}';changes=verify_role_only_delta(a/'suite',b/'suite');assert stage>=17 or not changes
 for name in ['packet.md','requirements.md']:
  if (a/name).exists():assert (a/name).read_bytes()==(b/name).read_bytes();files[str(b/name)]=sha(b/name)
 for folder in [a/'suite',b/'suite']:
  files.update({str(p):sha(p) for p in folder.rglob('*') if p.is_file()})
 checks.append({'stage':stage,'changed_files':changes,'behavior_assertions_preserved':True,'file_inventory_preserved':True})
a=old/'preflight/task040-summary-suite';b=new/'preflight/task040-action-role-suite002';changes=verify_role_only_delta(a,b);checks.append({'stage':40,'changed_files':changes,'behavior_assertions_preserved':True,'file_inventory_preserved':True})
for folder in [a,b]:files.update({str(p):sha(p) for p in folder.rglob('*') if p.is_file()})
for stage in range(31,41):
 a=old/f'decisions/future031040-summary-preparation001/task-{stage:03d}/requirements.md';b=new/f'decisions/future031040-summary-preparation001/task-{stage:03d}/requirements.md';assert a.read_bytes()==b.read_bytes();files[str(b)]=sha(b)
p1=json.loads((old/'analysis-plan.json').read_text());p2=json.loads((new/'analysis-plan.json').read_text());allowed={'revision_id','status','lineage','adoption_evidence','frozen_at','pre_dispatch_gates'};changed={k for k in p1.keys()|p2.keys() if p1.get(k)!=p2.get(k)};assert changed<=allowed and p2['pre_dispatch_gates'][:-1]==p1['pre_dispatch_gates'];assert p2['status']=='prepared-unfrozen'
proof={'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'verifier_sha256':sha(Path(__file__)),'role_guard_sha256':sha(Path('orchestrator/action_role_readiness.py')),'checked_suites':31,'checks':checks,'files':files,'unchanged_public_packets_through':30,'unchanged_future_requirements':[31,40],'mathematical_and_stopping_fields_unchanged':True,'status':'prepared-unfrozen','scope':'Only exact named generic roles and scoped directory-task-row Open project union; no explicit button-role weakening, suite inventory or behavior assertion edits. Browser/runtime/adoption gates remain separate.'};out.mkdir();shutil.copy2(__file__,out/'executed-controller.py');(out/'verified.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'verified':True,'checked_suites':31,'math_stopping_unchanged':True}))
