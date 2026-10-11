"""PM-only unchanged-source search observer diagnostic; never builder feedback."""
import copy
import json
import shutil
import sqlite3
import subprocess
from pathlib import Path
from orchestrator.prepare import ROOT, write_json
from orchestrator.evidence import digest_bytes, timestamp
from orchestrator.validation import launch_deployment, run_suite

r = ROOT / 'runs/instruction-effects/eval-011'
out = r / 'preflight/search-readiness-full-replay-002'
assert not out.exists()
assert json.loads((r / 'state.json').read_text())['status'] == 'infrastructure_attention'
out.mkdir()
shutil.copy2(__file__, out / 'executed-controller.py')
ip = r / 'builders/b011/checkpoints/task-016-attempt-029/index.json'
idx = json.loads(ip.read_text())
for name, expected in idx['checksums'].items():
    assert digest_bytes((ip.parent / name).read_bytes()) == expected
shadow = ROOT / '.local/eval011-search-readiness-source002'
assert not shadow.exists()
deployment = None
results = []
try:
    subprocess.run(['git', 'clone', '--quiet', str(ip.parent / 'history.bundle'), str(shadow)], check=True, capture_output=True)
    subprocess.run(['git', '-C', str(shadow), 'checkout', '--detach', idx['source_commit']], check=True, capture_output=True)
    def git(*args):
        return subprocess.check_output(['git', '-C', str(shadow), *args], text=True).strip()
    assert git('rev-parse', 'HEAD^{tree}') == idx['source_tree']
    assert not git('status', '--porcelain')
    subprocess.run(['git', '-C', str(shadow), 'fsck', '--full', '--no-reflogs'], check=True, capture_output=True)
    archive = subprocess.check_output(['git', '-C', str(shadow), 'archive', '--format=tar', 'HEAD'])
    assert digest_bytes(archive) == idx['checksums']['committed-source.tar']
    for variant in ('original', 'settled'):
        suite = out / variant / 'definitions/project/acceptance'
        shutil.copytree(r / 'tasks/task-016/suite', suite)
        cfg = suite / 'playwright.config.mjs'
        if variant == 'original':
            cfg.write_text(cfg.read_text().replace("  testDir: '.',", "  testDir: '.',\n  grep: /051 /,"))
    test = out / 'settled/definitions/project/acceptance/search-whitespace.spec.mjs'
    text = test.read_text()
    old = "await createProject(page,'Whitespace unrelated sentinel');for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\\t saved']){await page.getByRole('textbox',{name:'Project search',exact:true}).fill('');await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,'Whitespace unrelated sentinel')).toBeVisible();"
    new = "await createProject(page,'Whitespace unrelated sentinel');let firstQuery=true;for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\\t saved']){if(!firstQuery){await page.getByRole('textbox',{name:'Project search',exact:true}).fill('');await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,'Whitespace unrelated sentinel')).toBeVisible();}firstQuery=false;"
    assert text.count(old) == 1
    test.write_text(text.replace(old, new))
    manifest = copy.deepcopy(json.loads((r / 'manifest.json').read_text()))
    manifest['run_id'] = 'diag-eval011-search-readiness002'
    manifest['paths']['deployments'] = str(ROOT / '.local/eval011-search-readiness-deployments002')
    prior = {'database': str(r / 'tasks/task-015/attempts/b011/attempt-007/accepted.sqlite')}
    deployment = launch_deployment(manifest, 'b011', 'task-016', 'attempt-029', shadow, idx['source_commit'], out, prior)
    write_json(out / 'resource.json', {'sandbox': deployment.name, 'status': 'active', 'model_calls': 0})
    for variant, stage, phase in [('original', 16, 'acceptance'), ('settled', 15, 'upgrade'), ('settled', 16, 'acceptance'), ('settled', 16, 'postrestart')]:
        if phase == 'postrestart':
            deployment.restart()
        ok, diagnostics, stats = run_suite(ROOT, out / variant, deployment,
            out / f'{variant}-{stage:03d}-{phase}', stage, phase, f'task-{stage:03d}')
        results.append({'variant': variant, 'stage': stage, 'phase': phase, 'success': ok,
            'diagnostics': diagnostics, 'statistics': stats})
        write_json(out / 'results.json', results)
    assert git('rev-parse', 'HEAD') == idx['source_commit']
    assert git('rev-parse', 'HEAD^{tree}') == idx['source_tree']
    assert not git('status', '--porcelain')
    write_json(out / 'observation.json', {'utc': timestamp(), 'source_commit': idx['source_commit'],
        'source_tree': idx['source_tree'], 'original_source_unchanged': True, 'model_calls': 0,
        'results': results, 'original_failed': sum(not x['success'] for x in results if x['variant'] == 'original'),
        'settled_passed': sum(x['success'] for x in results if x['variant'] == 'settled'),
        'scope': 'Diagnostic only: original051 plus corrected full56cumulative acceptance, own prior15 upgrade and actual process restart. Only redundant initial empty-query submission skipped; all public query/clear/name/order/archive/reload requirements preserved. Exact native source unchanged; no native outcome reassignment.'})
    print(json.dumps({'completed': True, 'results': results}))
finally:
    if deployment:
        deployment.stop()
        shutil.copy2(deployment.database, out / 'retired.sqlite')
        with sqlite3.connect(f'file:{(out / "retired.sqlite").resolve()}?mode=ro', uri=True) as db:
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert git('rev-parse', 'HEAD') == idx['source_commit']
        assert git('rev-parse', 'HEAD^{tree}') == idx['source_tree']
        subprocess.run(['sbx', 'stop', deployment.name], check=True, capture_output=True)
        subprocess.run(['sbx', 'rm', '--force', deployment.name], check=True, capture_output=True)
        write_json(out / 'resource.json', {'sandbox': deployment.name, 'status': 'removed',
            'utc': timestamp(), 'original_git_restored': True, 'source_commit': idx['source_commit'],
            'source_tree': idx['source_tree'], 'submission_sha256': digest_bytes((out / 'submission.tar').read_bytes()),
            'retired_sqlite_sha256': digest_bytes((out / 'retired.sqlite').read_bytes()), 'sqlite_integrity': 'ok'})
    if shadow.exists():
        shutil.rmtree(shadow)
