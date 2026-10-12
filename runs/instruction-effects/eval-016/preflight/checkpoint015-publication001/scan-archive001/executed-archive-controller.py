"""Preserve completed exact-target publication and queued observations after success."""
import datetime, hashlib, json, shutil, uuid
from pathlib import Path
r = Path('runs/instruction-effects/eval-016')
out = r / 'preflight/checkpoint015-publication001/scan-archive001'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
scan = Path('.local/eval016-checkpoint015-publication001-scan.json')
binding = Path('.local/eval016-checkpoint015-publication001-binding.json')
receipt = r / 'reports/publication-checkpoint015001.json'
s = json.loads(scan.read_text()); b = json.loads(binding.read_text()); p = json.loads(receipt.read_text())
assert p['verified'] and p['target_git_commit'] == p['remote_main'] == b['target'] == s['target_git_commit']
assert s['status'] == 'passed' and not s['findings']
assert sha(scan) == b['scan_sha256'] == p['scan_sha256']
assert sha(r / 'preflight/checkpoint015-publication001/controller.py') == b['controller_sha256']
assert sha(Path('scripts/scan-publication.py')) == s['scanner_sha256']
assert p['eval016_original_refs_verified'] == 404 and p['eval016_source_checkpoints'] == 202
assert p['all_scanned_original_refs'] == len(b['all_scanned_history_refs'])
assert not Path('.local/eval016-checkpoint015-publication001-snapshot').exists()
pending = Path('.local/eval016-task017-pending-lessons001.jsonl')
records = list(map(json.loads, pending.read_text().splitlines()))
journal = Path('lessons/records.jsonl')
existing = {x['record_id'] for x in map(json.loads, journal.read_text().splitlines())}
assert len({x['record_id'] for x in records}) == len(records) and all(x['record_id'] not in existing for x in records)
assert not out.exists()
out.mkdir()
pairs = [(scan,'scan.json'), (binding,'binding.json'), (r/'preflight/checkpoint015-publication001/controller.py','executed-controller.py'),
         (Path('scripts/scan-publication.py'),'executed-scanner.py'), (Path(__file__),'executed-archive-controller.py'), (pending,'pending-lessons-original.jsonl')]
for source, name in pairs: shutil.copy2(source, out / name)
late = out / 'later-observations'; late.mkdir()
names = ('eval016-task017-date-recurrence001.json','eval016-task017-date-recurrence-producer001.py',
         'eval016-task017-b004-acceptance001.json','eval016-next-prefix-selection001.json',
         'eval016-next-prefix-selection002.json','eval016-next-prefix-selection-verifier002.py')
aliases = {}
for name in names:
    source = Path('.local') / name
    shutil.copy2(source, late / name)
    assert sha(source) == sha(late / name)
    aliases[str(source)] = {'archived': str(late / name), 'sha256': sha(source)}
(out / 'verified.json').write_text(json.dumps({'verified': True, 'target': b['target'],
    'published_original_refs': 404, 'published_source_checkpoints': 202, 'all_scanned_original_refs': len(b['all_scanned_history_refs']),
    'publication_receipt_sha256': sha(receipt), 'source_aliases_for_later_observations': aliases,
    'files': {str(x.relative_to(out)): sha(x) for x in out.rglob('*') if x.is_file()},
    'scope': 'Completed exact-target scan/publication archive. Later observations copied separately and are outside the scanned published target. Acceptance001and selection001were inline producers; their executed source is not claimed.'}, indent=2) + '\n')
with journal.open('a') as f:
    for x in records: f.write(json.dumps(x, sort_keys=True) + '\n')
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L062',
    'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm', 'status': 'verified',
    'scope': 'eval016 checkpoint015 exact original publication',
    'observation': f"Closed015 evidence and404original refs published and remotely verified after zero-finding scan of{len(b['all_scanned_history_refs'])}indexed retained refs. All prior remote heads unchanged; temporary snapshot removed.",
    'prevention': 'Bind publication to an exact commit, canonical indexed histories and independently verified prefix; preserve scan/controller hashes and avoid extending its scope to later outputs.',
    'verification': {'source_checkpoints': 202, 'original_refs': 404, 'inspection_units': s['inspection_units'], 'prior_remote_heads_unchanged': p['prior_remote_heads_unchanged']},
    'comparison_policy': 'Publication and append-only evidence preservation only; native run continues and no comparative finding claimed.',
    'evidence': [str(out/'verified.json'), str(receipt)]}
with journal.open('a') as f: f.write(json.dumps(record, sort_keys=True) + '\n')
with (r/'decisions/lessons-applied.md').open('a') as f:
    f.write('\nCheckpoint015 exact publication verified:202source checkpoints and404original refs, full secret scan, prior remote heads unchanged, snapshot removed. Queued task017 recurrence and measured acceptance appended once; causal timing-race resolution remains unestablished. Later observations/source-bound next-prefix selection are retained outside the scanned target.\n')
q = Path('.local/eval016-execution-state.json'); d = json.loads(q.read_text())
d.update(checkpoint015_publish_terminal=True, checkpoint015_publish_exit_code=0, checkpoint015_remote_verified=True,
         checkpoint015_publication_receipt=str(receipt), checkpoint015_scan_archived=str(out/'verified.json'),
         checkpoint015_pending_lessons_appended=len(records), publication_head_freeze_active=False,
         next='Commit completed publication archive and later PM observations. Continue native64630; full common020 audit/report and first inspection before appending selected021through030.')
q.write_text(json.dumps(d, indent=2) + '\n')
print(json.dumps({'archived': True, 'publication_verified': True, 'pending_lessons_appended': len(records)}))
