"""Preserve a terminal failed PM gate without promoting partial results."""
import hashlib
import json
import os
import shutil
from pathlib import Path

base = Path('experiments/instruction-effects/revisions/research-v016/preflight')
folder = base / 'task040-action-role-broader002-check-1791775222091'
batch = base / 'task040-action-role-broader002-batch-1791775222054501000'
output = base / 'broader002-failure001-independent'
assert not output.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
closure = json.loads((folder / 'input-closure.json').read_text())
assert closure['exit_code'] == 1 and closure['model_calls'] == 0
assert closure['controller_sha256'] == sha(folder / 'executed-controller.mjs')
assert closure['batch_inputs_sha256'] == sha(batch / 'inputs.json')
for name, digest in closure['files'].items():
    assert sha(folder / name) == digest, name
failure = json.loads((batch / 'failure.json').read_text())
assert failure['exit_code'] == 1 and failure['retained']
process = json.loads((batch / 'process.json').read_text())
try:
    os.killpg(process['owned_process_group'], 0)
except ProcessLookupError:
    pass
else:
    raise AssertionError('Owned failed-fixture group is still present')
rows = json.loads((folder / 'progress.json').read_text())
assert len(rows) == 16
assert all(r['exit'] == 0 for r in rows[:-1])
assert rows[-1]['statistics'] == {**rows[-1]['statistics'], 'expected': 139, 'unexpected': 1, 'skipped': 0, 'flaky': 0}
report_path = folder / 'positive-link-form-reload-reset/results.json'
report = json.loads(report_path.read_text())
failed = []
def collect(suites):
    for suite in suites:
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []):
                if test['status'] == 'unexpected':
                    failed.append((spec, test))
        collect(suite.get('suites', []))
collect(report['suites'])
assert len(failed) == 1
spec, test = failed[0]
assert spec['file'] == 'directory-word-search.spec.mjs' and spec['title'].startswith('115 ')
error = test['results'][0]['error']
assert "getByRole('button', { name: 'Complete visible tasks', exact: true })" in error['message']
assert error['location']['line'] == 37
for attachment in test['results'][0]['attachments']:
    assert Path(attachment['path']).is_file()
output.mkdir()
shutil.copy2(__file__, output / 'executed-controller.py')
proof = {'verified': True, 'complete_full_gate': False, 'exit_code': 1,
    'native_model_calls': 0, 'owned_process_group_absent': True,
    'verified_retained_files': len(closure['files']), 'successful_complete_variants': 5,
    'passing_cases_in_partial_gate': sum(r['statistics']['expected'] for r in rows),
    'failed_cases': 1, 'failure': {'file': spec['file'], 'title': spec['title'],
        'message': error['message'], 'location': error['location']},
    'controller_sha256': sha(Path(__file__)),
    'files': {str(p): sha(p) for p in [folder / 'input-closure.json', batch / 'inputs.json',
        batch / 'failure.json', batch / 'process.json', report_path]},
    'scope': 'Terminal PM synthetic gate failure; original source/results retained. No builder defect or complete gate pass claimed.'}
(output / 'verified.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({k: proof[k] for k in ['verified', 'complete_full_gate', 'passing_cases_in_partial_gate', 'failed_cases']}))
