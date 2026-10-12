"""Archive and independently restore two obsolete failed-launch apps before removal."""
import datetime, hashlib, importlib.util, json, shutil, sqlite3, subprocess, sys, tarfile, tempfile, uuid
from pathlib import Path
root = Path.cwd(); sys.path.insert(0, str(root))
from orchestrator.storage import retire_deployment
run = root / 'runs/instruction-effects/eval-016'
output = run / 'preflight/failed-launch-retirement001'
assert not output.exists()
manifest = json.loads((run / 'manifest.json').read_text())
state = json.loads((run / 'state.json').read_text())
active = {v['sandbox'] for v in state['accepted'].values()}
spec = importlib.util.spec_from_file_location('originals', root / 'scripts/verify-retained-originals.py')
originals = importlib.util.module_from_spec(spec); spec.loader.exec_module(originals)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
inventory = json.loads(subprocess.check_output(['sbx','ls','--json'], text=True))['sandboxes']
names = {x['name']: x for x in inventory}
targets = []
for attempt, name in [(1, 'ff-eval-016-app-b010-69cc5ef736894a5f'), (2, 'ff-eval-016-app-b010-fc672aef2544e502')]:
    folder = run / f'tasks/task-016/attempts/b010/attempt-{attempt:03d}'
    assert name in names and names[name]['status'] == 'stopped' and name not in active
    assert json.loads((folder / 'deployment-process.json').read_text())['sandbox'] == name
    assert not json.loads((folder / 'result.json').read_text())['accepted']
    assert not (folder / 'resource-retirement.json').exists()
    targets.append((attempt, name, folder))
output.mkdir(); shutil.copy2(__file__, output / 'executed-controller.py')
results = []
for attempt, name, folder in targets:
    out = output / f'attempt-{attempt:03d}'; out.mkdir()
    checkpoint = run / f'builders/b010/checkpoints/task-016-attempt-{attempt:03d}'
    index = json.loads((checkpoint / 'index.json').read_text())
    assert all(sha(checkpoint / f) == h for f, h in index['checksums'].items())
    originals.restore(checkpoint / 'history.bundle', index['source_commit'], index['source_tree'])
    native = json.loads((folder / 'native-git.json').read_text())
    originals.restore(folder / 'native-history.bundle', native['head'], native['tree'], folder / 'native-working-tree.tar.gz', native['dirty'])
    try:
        script = "import pathlib,tarfile,sys;p=pathlib.Path('/home/agent/app');t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz');[t.add(f,arcname=f.name) for f in sorted(p.iterdir())];t.close()"
        with (out / 'application-files.tar.gz').open('wb') as stream:
            subprocess.run(['sbx','exec',name,'python3','-c',script],stdout=stream,stderr=subprocess.PIPE,check=True)
        script = "import sqlite3,pathlib,sys;p=pathlib.Path('/tmp/ff-pm-retired.sqlite');s=sqlite3.connect('file:/home/agent/app/.runtime/app.sqlite?mode=ro',uri=True);d=sqlite3.connect(p);s.backup(d);d.close();s.close();sys.stdout.buffer.write(p.read_bytes());p.unlink()"
        with (out / 'retired.sqlite').open('wb') as stream:
            subprocess.run(['sbx','exec',name,'python3','-c',script],stdout=stream,stderr=subprocess.PIPE,check=True)
        with tempfile.TemporaryDirectory(prefix='eval016-launch-restore-', dir='/private/tmp') as temp:
            restored = Path(temp)
            with tarfile.open(out / 'application-files.tar.gz') as archive:
                members = archive.getmembers(); archive.extractall(restored, filter='data')
                hashes = {m.name: hashlib.sha256(archive.extractfile(m).read()).hexdigest() for m in members if m.isfile()}
            assert all(sha(restored / f) == h for f, h in hashes.items())
            db = restored / 'independent-retired.sqlite'; shutil.copy2(out / 'retired.sqlite', db)
            assert sha(db) == sha(out / 'retired.sqlite')
            with sqlite3.connect(f'file:{db}?mode=ro', uri=True) as connection:
                assert connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            log = restored / '.runtime/server.log'
            if log.exists(): shutil.copy2(log, out / 'recovered-server.log')
        proof = {'verified_before_removal': True, 'sandbox': name, 'archive_sha256': sha(out / 'application-files.tar.gz'),
                 'database_sha256': sha(out / 'retired.sqlite'), 'restored_application_files': hashes,
                 'source_index_sha256': sha(checkpoint / 'index.json'), 'original_result_sha256': sha(folder / 'result.json'),
                 'original_source_history_and_working_tree_restored': True, 'active_deployment': False}
        (out / 'archive-restoration.json').write_text(json.dumps(proof, indent=2) + '\n')
        retire_deployment(manifest, name, out, checkpoint)
        assert json.loads((out / 'resource-retirement.json').read_text())['status'] == 'removed'
        results.append(proof)
    finally:
        # A failed archive leaves the exact owned sandbox stopped and recoverable.
        current = json.loads(subprocess.check_output(['sbx','ls','--json'], text=True))['sandboxes']
        if any(x['name'] == name for x in current): subprocess.run(['sbx','stop',name],check=True,capture_output=True)
final = json.loads(subprocess.check_output(['sbx','ls','--json'],text=True))['sandboxes']
assert not ({name for _, name, _ in targets} & {x['name'] for x in final})
receipt = {'verified': True, 'removed': [name for _,name,_ in targets], 'results': results,
           'controller_sha256': sha(Path(__file__)), 'native_model_calls': 0,
           'scope': 'Retroactive removal of two obsolete stopped failed-launch apps after independent source/history/application/database restoration. Original failures and native measurement records unchanged; active and other-thread resources untouched.'}
(output / 'verified.json').write_text(json.dumps(receipt,indent=2)+'\n')
record = {'schema_version': 1, 'record_id': str(uuid.uuid4()), 'lesson_id': 'L060', 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'author': 'pm', 'status': 'verified', 'scope': 'eval016 task016 b010 failed-launch cleanup',
          'observation': 'Two launch-exception app sandboxes were stopped but not removed; original attempts had no retirement/database archive. Their source histories/working trees, private application archives and recovered SQLite backups independently restore, and both exact sandboxes are now removed.',
          'root_cause': 'The launch wrapper stops a partially created deployment then raises before the caller receives its object; normal caller retirement therefore does not run. Original launch failure cause remains unexamined pending recovered log inspection.',
          'prevention': 'Reconcile failed-launch records with owned inventory and archive/restore before exact removal. Prepare a future archive-first launch-exception control; do not silently change frozen native instrumentation or original assessments.',
          'verification': receipt['scope'], 'comparison_policy': 'PM resource cleanup only, with zero new inference or app source changes. Native startup failures retain original attribution and exposure.',
          'evidence': [str((output/'verified.json').relative_to(root)), 'orchestrator/validation.py']}
with (root/'lessons/records.jsonl').open('a') as journal: journal.write(json.dumps(record,sort_keys=True)+'\n')
with (run/'decisions/lessons-applied.md').open('a') as decisions: decisions.write('\nL060 failed-launch cleanup verified: two task016b010 stopped apps lacked removal. Original source/history/working tree, private app files and recovered SQLite backups independently restore; exact sandboxes stopped/rm--force and inventory absence verified. Future launch-exception cleanup control deferred; frozen native instrumentation and original assessments unchanged.\n')
print(json.dumps({'verified': True, 'removed_resources': 2, 'evidence': str(output.relative_to(root))}))
