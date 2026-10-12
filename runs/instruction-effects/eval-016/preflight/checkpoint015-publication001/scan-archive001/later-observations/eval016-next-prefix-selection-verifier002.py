"""Source-bound recheck of the prepared future selection; no freeze or dispatch."""
import hashlib, json, subprocess, datetime
from pathlib import Path
source = Path('.local/eval016-next-prefix-selection001.json')
out = Path('.local/eval016-next-prefix-selection002.json')
assert not out.exists()
data = json.loads(source.read_text())
assert data['verified'] and not data['dispatch_started']
assert [r['stage'] for r in data['selected_rounds']] == list(range(21, 31))
assert not Path('runs/instruction-effects/eval-016/analysis/inspections.jsonl').exists()
revision = Path('experiments/instruction-effects/revisions/research-v016')
items = []
for row in data['selected_rounds']:
    for name, checksum in row['prepared_files'].items():
        p = revision / f"decisions/frozen-prefix-drafts/task-{row['stage']:03d}" / name
        assert hashlib.sha256(p.read_bytes()).hexdigest() == checksum
        for commit in (data['source_commit_before_native_dispatch'], data['current_publication_target']):
            items.append((commit + ':' + str(p), checksum))
raw = subprocess.check_output(['git', 'cat-file', '--batch'], input=''.join(x[0] + '\n' for x in items).encode())
cursor = 0
for query, expected in items:
    end = raw.index(b'\n', cursor)
    header = raw[cursor:end].split()
    assert len(header) == 3 and header[1] == b'blob'
    size = int(header[2]); cursor = end + 1
    blob = raw[cursor:cursor + size]
    assert len(blob) == size and hashlib.sha256(blob).hexdigest() == expected
    cursor += size
    assert raw[cursor:cursor + 1] == b'\n'; cursor += 1
assert cursor == len(raw)
phase_source = revision / 'preflight/prefix-phase-listing001/verified.json'
assert hashlib.sha256(phase_source.read_bytes()).hexdigest() == data['phase_inventory_sha256']
phases = json.loads(phase_source.read_text())['phase_listings']
for row in data['selected_rounds']:
    assert row['expected_phase_checks'] == {x['phase']: x['expected'] for x in phases if x['target_stage'] == row['stage']}
out.write_text(json.dumps({'verified': True, 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                          'controller_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                          'selection_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                          'git_blobs_checked': len(items), 'native_model_calls': 0,
                          'scope': 'Source-bound independent recheck of committed pre-dispatch021through030 definitions and phase counts. Original001was an inline producer; no original executed file is claimed. Neither this check nor001appends tasks or dispatches builders.'}, indent=2) + '\n')
print(json.dumps({'verified': True, 'git_blobs_checked': len(items), 'evidence': str(out)}))
