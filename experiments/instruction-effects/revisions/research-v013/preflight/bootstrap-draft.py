import copy,json,shutil,hashlib
from pathlib import Path
from orchestrator.prepare import write_json,file_hashes
from orchestrator.evidence import timestamp

source=Path('experiments/instruction-effects/revisions/research-v012')
v=Path('experiments/instruction-effects/revisions/research-v013')
assert not v.exists() and not Path('runs/instruction-effects/eval-013').exists()
v.mkdir(parents=True)
plan=copy.deepcopy(json.loads((source/'analysis-plan.json').read_text()))
plan.update(revision_id='research-v013',status='draft-before-main-dispatch',adoption_evidence=str(v/'preflight/adoption/verified.json'))
plan.pop('frozen_at',None)
plan['lineage']={'source_revision':'research-v012','source_run':'eval-012','reason':'Confirmed065 invalid-draft reset overconstraint. Exact original b002 task019 attempt001 passes corrected full65 cumulative, own18 upgrade and actual restart without source changes.','comparison_changes':'Remove only unsupported invalid draft reset assertion; identical public requirements, treatments and mathematical/stopping rules. Current stable runtime and all prospective controls pending.','original_evidence_retained':True}
write_json(v/'analysis-plan.json',plan)
old="await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2046-03-01');"
def correct(suite):
    p=suite/'directory.spec.mjs';text=p.read_text();assert text.count(old)==1
    p.write_text(text.replace(old,''))
rows=[]
for src in sorted((source/'decisions/frozen-prefix-drafts').glob('task-*')):
    stage=int(src.name.split('-')[1]);dest=v/'decisions/frozen-prefix-drafts'/src.name
    dest.mkdir(parents=True);shutil.copy2(src/'requirements.md',dest/'requirements.md');shutil.copytree(src/'suite',dest/'suite')
    if stage>=19:correct(dest/'suite')
    before=file_hashes(src/'suite');after=file_hashes(dest/'suite')
    assert before.keys()==after.keys()
    changed=[k for k in before if before[k]!=after[k]]
    assert changed==(['directory.spec.mjs'] if stage>=19 else [])
    assert (src/'requirements.md').read_bytes()==(dest/'requirements.md').read_bytes()
    rows.append({'stage':stage,'requirements_sha256':hashlib.sha256((dest/'requirements.md').read_bytes()).hexdigest(),'changed_suite_files':changed})
suite=v/'preflight/task020-executed-suite';shutil.copytree(source/'preflight/task020-executed-suite',suite);correct(suite)
controller=source/'preflight/task020-full01-fixture.mjs'
t=controller.read_text().replace('research-v012','research-v013')
needle="reloadReset=false,resetObservations=0;"
assert t.count(needle)==1;t=t.replace(needle,"reloadReset=false,resetObservations=0,retainInvalidDraft=true;")
needle="ordering='Original',visibleNotes=''){"
assert t.count(needle)==1;t=t.replace(needle,"ordering='Original',visibleNotes='',draftFrom=from,draftThrough=through){")
needle="input('Due from','due_from_new',from)+input('Due through','due_through_new',through)"
assert t.count(needle)==1;t=t.replace(needle,"input('Due from','due_from_new',draftFrom)+input('Due through','due_through_new',draftThrough)")
needle="fields.get('visible_notes')??'');res.end(resetScript()+body"
assert t.count(needle)==1;t=t.replace(needle,"fields.get('visible_notes')??'',retainInvalidDraft&&alert&&parts[1]==='due-range'?(fields.get('due_from_new')??''):from,retainInvalidDraft&&alert&&parts[1]==='due-range'?(fields.get('due_through_new')??''):through);res.end(resetScript()+body")
target=v/'preflight/task020-full01-fixture.mjs';target.write_text(t)
write_json(v/'preflight/task020-full01-inputs.json',{'prepared':True,'executed':False,'frozen':False,'native_model_calls':0,'controller_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'suite_files':file_hashes(suite),'ordinary_read_ms':50,'delayed_read_ms':300,'bulk_mutation_ms':500,'test_watchdog_seconds':20,'invalid_draft_policy':'retain invalid editable drafts; applied ranges remain separate','scope':'Derived PM prototype; no inherited v012 execution result claimed. Full18 baseline variants and directed065 permitted draft-policy/fault controls pending.'})
(v/'decisions/lessons-applied.md').write_text('# Research v013 prospective controls\n\nL059: remove only unsupported065 invalid draft reset assertion. Retain invalid-date alert, applied range/membership, all other filters, archived intersections and fresh-opening defaults. Exact unchanged b002 original passes corrected full65, own18 upgrade and restart in eval012; original outcomes unchanged. Verify both retained/reset drafts in all rendering modes and reject genuine applied-range defects before freeze.\n\nL058/L052: inherit exact corrected051 and057 observers; no new public UI persistence requirement.\n\nL026: preserve all native missing counters, original histories, dirty files and containing cost bounds. Eleven unknown012 counters stay unknown.\n\nL024: distinct diagnostic prefixes and original archives prevent fixture collisions. L054/L056: stage stable inputs/closed outputs only; exact committed secret scans before publication and exact own scan-clone cleanup. L057: native declared waits and request streams drain naturally.\n\nNo frozen run, native dispatch or comparative inspection. Current stable harness/runtime/image/accounting/isolation and full controls must pass before preparation. PM lessons stay outside builder context.\n')
write_json(v/'decisions/draft-lineage.json',{'utc':timestamp(),'frozen':False,'native_model_calls':0,'successor_run_not_created':True,'source_revision':'research-v012','superseded_run':'eval-012','requirements_identical':True,'drafts':rows,'changed_suite_from19':['directory.spec.mjs:remove unsupported invalid draft reset assertion only'],'native_original_evidence':'runs/instruction-effects/eval-012/preflight/directory065-full-replay-002/verified.json','pending':['Directed065 permitted draft-policy and genuine-fault controls','Full18 baseline variants','Current stable runtime/image/accounting/isolation and PM regressions','59 phase listings and20 identical frozen public packets','Fresh starter-only roots','Secret-scanned preparation publication before native dispatch']})
shutil.copy2(__file__,v/'preflight/bootstrap-draft.py')
print('Prepared unfrozen research-v013 draft inputs; no inherited proof or native dispatch')
