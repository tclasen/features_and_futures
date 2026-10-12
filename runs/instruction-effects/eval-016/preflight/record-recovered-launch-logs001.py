"""Bind recovered startup diagnostics to the verified failed-launch archives."""
import datetime, hashlib, json, uuid
from pathlib import Path

run = Path('runs/instruction-effects/eval-016')
archive = run / 'preflight/failed-launch-retirement001'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
proof = json.loads((archive / 'verified.json').read_text())
assert proof['verified'] and len(proof['removed']) == 2
logs = []
ledger_path = Path('.local/eval016-native-owned-resource-ledger001.json')
ledger = json.loads(ledger_path.read_text())
for index, row in enumerate(proof['results'], 1):
    folder = archive / f'attempt-{index:03d}'
    log = folder / 'recovered-server.log'
    assert sha(log) == row['restored_application_files']['.runtime/server.log']
    assert 'Error: no such column: t.deleted' in log.read_text()
    retirement = json.loads((folder / 'resource-retirement.json').read_text())
    assert retirement['status'] == 'removed' and retirement['sandbox'] == row['sandbox']
    assert ledger['resources'][row['sandbox']]['present'] is False
    ledger['resources'][row['sandbox']].update(
        pm_retirement_verified=True,
        pm_retirement_evidence={'record': str(folder / 'resource-retirement.json'),
                                'sha256': sha(folder / 'resource-retirement.json'),
                                'restoration': str(folder / 'archive-restoration.json'),
                                'restoration_sha256': sha(folder / 'archive-restoration.json')})
    logs.append({'sandbox': row['sandbox'], 'log': str(log), 'sha256': sha(log)})
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L060',
          'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'author': 'pm',
          'status': 'observed', 'scope': 'eval016 task016 b010 attempts001 and002 startup diagnostics',
          'supersedes_assessment': '48dcc181-db8f-490c-9915-57e34a816cca root cause pending log inspection only',
          'observation': 'Both recovered server logs report SQLite no such column: t.deleted while preparing listProjects in server.js at line60. These startup failures are separate from the PM stop-only launch-exception cleanup defect.',
          'root_cause': 'The recovered application process failed preparing a query against its database schema. Exact schema/migration ordering cause and repair mechanism remain unexamined.',
          'prevention': 'Preserve and inspect private startup logs before attributing launch failures. Keep archive-first cleanup evidence separate from builder startup failure evidence.',
          'verification': {'archive': str(archive / 'verified.json'), 'logs': logs,
                           'controller_sha256': sha(Path(__file__))},
          'comparison_policy': 'Observation-only PM record; no source repairs, tailored feedback, tests, native instrumentation or recorded outcomes changed.',
          'evidence': [str(archive / 'verified.json')] + [x['log'] for x in logs] + [str(Path(__file__))]}
with Path('lessons/records.jsonl').open('a') as journal:
    journal.write(json.dumps(record, sort_keys=True) + '\n')
with (run / 'decisions/lessons-applied.md').open('a') as decisions:
    decisions.write('\nL060 recovered task016 b010 startup logs: both failed launches report SQLite `no such column: t.deleted` preparing listProjects. This supersedes only the earlier pending-log assessment; exact migration cause remains unexamined. PM stop-only cleanup is independently verified and distinct. No builder source, feedback, acceptance or instrumentation change. Evidence: preflight/failed-launch-retirement001 and record-recovered-launch-logs001.py.\n')
ledger_path.write_text(json.dumps(ledger, indent=2) + '\n')
print(json.dumps({'recorded': record['record_id'], 'logs': logs, 'native_model_calls': 0}))
