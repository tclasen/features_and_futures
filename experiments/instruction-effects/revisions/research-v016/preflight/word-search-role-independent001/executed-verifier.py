"""Verify corrected115 positives and genuine disabled-scope faults."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--folder', type=Path, required=True)
parser.add_argument('--batch', type=Path, required=True)
args = parser.parse_args()
base = Path('experiments/instruction-effects/revisions/research-v016/preflight')
out = base / 'word-search-role-independent001'
assert not out.exists()
assert args.folder.parent == args.batch.parent == base
assert args.folder.name.startswith('word-search-action-role-focused001-check-')
assert args.batch.name.startswith('word-search-action-role-focused001-batch-')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
load = lambda p: json.loads(p.read_text())
closure = load(args.folder / 'input-closure.json')
assert closure['exit_code'] == closure['model_calls'] == 0
for name, digest in closure['files'].items(): assert sha(args.folder / name) == digest
batch = load(args.batch / 'verified.json')
assert batch['verified'] and batch['native_model_calls'] == 0
assert batch['input_closure_sha256'] == sha(args.folder / 'input-closure.json')
assert batch['process_group_absence_verified']
assert closure['retirement_sha256'] == sha(args.batch / 'retirement.json')
controller = base / 'word-search-action-role-focused001-fixture.mjs'
inputs = load(base / 'word-search-action-role-focused001-inputs.json')
assert sha(controller) == inputs['controller_sha256'] == sha(args.folder / 'executed-controller.mjs')
assert load(args.batch / 'inputs.json')['prepared_sha256'] == sha(base / 'word-search-action-role-focused001-inputs.json')
suite = base / 'task040-action-role-suite003'
assert inputs['suite_files'] == {str(p.relative_to(suite)): sha(p) for p in suite.rglob('*') if p.is_file()}
producer = load(args.folder / 'verified.json')
assert producer['verified'] and producer['model_calls'] == 0
rows = producer['results']
assert rows == load(args.folder / 'progress.json')
assert {r['name'] for r in rows} == {'positive-button','positive-link','fault-button','fault-link'} and len(rows) == 4
def tests(suites):
    for suite in suites:
        for spec in suite.get('specs', []):
            for test in spec.get('tests', []): yield spec, test
        yield from tests(suite.get('suites', []))
for row in rows:
    report = load(args.folder / row['name'] / 'results.json')
    assert report['stats'] == row['statistics']
    stats = report['stats']; positive = row['name'].startswith('positive-')
    assert stats['expected'] == int(positive) and stats['unexpected'] == int(not positive)
    assert stats['skipped'] == stats['flaky'] == 0
    assert (row['exit'] == 0) == positive
    selected = list(tests(report['suites'])); assert len(selected) == 1
    spec, test = selected[0]
    assert spec['file'] == 'directory-word-search.spec.mjs' and spec['title'].startswith('115 ')
    if not positive:
        error = test['results'][0]['error']['message']
        assert 'toBeDisabled' in error and 'Expected: disabled' in error and 'Received: enabled' in error
out.mkdir()
shutil.copy2(__file__, out / 'executed-verifier.py')
(out / 'verified.json').write_text(json.dumps({'verified':True, 'native_model_calls':0,
    'positive_cases':2, 'genuine_fault_variants':2, 'skipped':0, 'flaky':0,
    'verifier_sha256':sha(Path(__file__)),
    'files':{str(p):sha(p) for folder in [args.folder,args.batch] for p in folder.rglob('*') if p.is_file()},
    'scope':'Corrected word-search115 disabled-scope role observer only; no actual restart or complete broader gate.'}, indent=2)+'\n')
print('Independently verified two115role positives and two genuinely enabled-protected-scope faults')
