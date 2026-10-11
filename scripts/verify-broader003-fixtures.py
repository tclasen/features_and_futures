#!/usr/bin/env python3
"""Independently restore bindings and verify a closed prospective broader fixture."""
import argparse
import hashlib
import json
from datetime import datetime,timezone
from pathlib import Path


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def specs(suites):
    for suite in suites:
        yield from suite.get('specs', [])
        yield from specs(suite.get('suites', []))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch',required=True,type=Path)
    args=parser.parse_args();batch=args.batch.resolve();base=batch.parent
    assert base.name=='preflight' and batch.name.startswith('task040-broader003-batch-')
    completed=json.loads((batch/'verified.json').read_text());assert completed['verified']
    out=Path(completed['evidence']).resolve();assert out.parent==base
    destination=out/'independently-verified.json'
    if destination.exists():raise SystemExit('Refusing to overwrite independent evidence')
    inputs_path=batch/'inputs.json';inputs=json.loads(inputs_path.read_text());assert inputs['native_model_calls']==0
    preparation=base/'task040-broader003-inputs.json';assert sha(preparation)==inputs['prepared_sha256']
    prepared=json.loads(preparation.read_text());assert prepared['controller']['sha256']==inputs['controller_sha256']==sha(out/'executed-controller.mjs')
    suite=base/'task040-full-prototype002-suite'
    assert inputs['suite_files']==prepared['suite_files']=={str(p.relative_to(suite)):sha(p) for p in suite.rglob('*') if p.is_file()}
    focused=base/'future031039-focused-batch-1791743915226876000'
    assert sha(focused/'verified.json')==inputs['focused_batch_sha256']
    assert len(inputs['focused_independent_proofs'])==9
    for path,checksum in inputs['focused_independent_proofs'].items():
        p=Path(path);assert sha(p)==checksum and json.loads(p.read_text())['verified']
    closure_path=out/'input-closure.json';closure=json.loads(closure_path.read_text())
    assert sha(closure_path)==completed['input_closure_sha256'] and closure['exit_code']==0 and closure['native_model_calls']==0
    assert closure['controller_sha256']==inputs['controller_sha256'] and closure['batch_inputs_sha256']==sha(inputs_path)
    assert all(sha(out/name)==checksum for name,checksum in closure['files'].items())
    assert {str(p.relative_to(out)) for p in out.rglob('*') if p.is_file()}==set(closure['files'])|{'input-closure.json'}
    proof=json.loads((out/'verified.json').read_text());assert proof['verified'] and proof['model_calls']==0
    expected_names={'positive-form-reload-reset','positive-async-reload-reset','positive-fetch-reload-reset','positive-form-restore-retain-archived','positive-form-reload-reset-restore-active'}
    reference=base/'task040-full-prototype002-check-1791739214033'
    reference_closure=json.loads((reference/'input-closure.json').read_text())
    reference_result=reference/'positive-form/results.json'
    assert sha(reference_result)==reference_closure['files']['positive-form/results.json']
    titles=sorted(s['title'] for s in specs(json.loads(reference_result.read_text())['suites']));assert len(titles)==140 and len(set(titles))==140
    full=set();probes=set();checks=[]
    for row in proof['results']:
        name=row['name'];path=out/name/'results.json';report=json.loads(path.read_text());listed=list(specs(report['suites']));stats=report['stats']
        assert row['exit']==0 and stats==row['statistics'] and stats['unexpected']==stats['skipped']==stats['flaky']==0 and not report['errors']
        assert all(test['status']=='expected' and all(r['status']=='passed' and not r.get('errors') for r in test['results']) for spec in listed for test in spec['tests'])
        if row['phase']=='acceptance':
            assert name in expected_names and stats['expected']==len(listed)==140
            assert sorted(s['title'] for s in listed)==titles
            if '-reload-reset' in name:assert row['resetObservations']>0
            if '-restore-' in name:assert row['asyncRestoreObservations']>0
            full.add(name)
        else:
            assert row['phase'] in ('postrestart','observation-40') and stats['expected']==len(listed)==1
            assert name.removesuffix('-'+row['phase']) in expected_names
            assert 'no real restart' in row['scope']
            probes.add(name)
        checks.append({'name':name,'results_sha256':sha(path),'phase':row['phase'],'tests':len(listed)})
    assert full==expected_names and probes=={n+'-'+phase for n in expected_names for phase in ('postrestart','observation-40')}
    assert len(proof['results'])==len(checks)==15
    destination.write_text(json.dumps({'verified':True,'utc':datetime.now(timezone.utc).isoformat(),'native_model_calls':0,'full140_variants':5,'process_local_assertion_probes':10,'checks':checks,'input_closure_sha256':sha(closure_path),'batch_inputs_sha256':sha(inputs_path),'reference140_result_sha256':sha(reference_result),'verifier_sha256':sha(Path(__file__)),'scope':'Prospective PM fixture only. Process-local assertion probes do not verify actual native process restarts, upgrades, or model outcomes.'},indent=2)+'\n')
    print(json.dumps({'verified':True,'evidence':str(destination)}))


if __name__=='__main__':main()
