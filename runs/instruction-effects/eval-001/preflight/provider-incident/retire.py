"""Archive the interrupted eval-001 resources, then remove only exact owned names."""
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from orchestrator.prepare import checked,git,write_json
from orchestrator.private import export
from orchestrator.evidence import Ledger,digest_bytes,digest_json

run=Path('runs/instruction-effects/eval-001').resolve()
m=json.loads((run/'manifest.json').read_text())
state=json.loads((run/'state.json').read_text())
assert state['status']=='infrastructure_attention'
root=run/'preflight/provider-incident/preservation';root.mkdir(exist_ok=True)
for name in ('events.jsonl','usage.jsonl','state.json'):
    target=root/('original-'+name)
    if not target.exists():shutil.copy2(run/name,target)
resources=json.loads(checked(['sbx','ls','--json']))['sandboxes']
names=[x['name'] for x in resources if x['name'].startswith('ff-eval-001-')]
assert len(names)==24
write_json(root/'original-inventory.json',names)
proofs=[]
for b in m['runtime']['builder_configurations']:
    bid=b['builder_id'];name='ff-eval-001-'+bid;assert name in names
    out=root/'builders'/bid;out.mkdir(parents=True,exist_ok=True)
    shadow=Path(m['paths']['builders'])/bid
    checked(['sbx','stop',name])
    meta=export(name,shadow,out)
    with tempfile.TemporaryDirectory(prefix='eval001-history-restore-') as temp:
        bare=Path(temp)/'restored.git';checked(['git','init','--bare','-q',str(bare)])
        git(bare,'bundle','verify',str(out/'native-history.bundle'))
        git(bare,'fetch',str(out/'native-history.bundle'),'HEAD:refs/heads/restored')
        assert git(bare,'rev-parse','restored')==meta['head']
        assert git(bare,'rev-parse','restored^{tree}')==meta['tree']
    decoded=0
    with tarfile.open(out/'native-working-tree.tar.gz') as t:
        for member in t:
            if member.isfile():decoded+=len(t.extractfile(member).read())
    checkpoint='incident-terminal'
    checked(['python3','-B','scripts/archive-builder-history.py','--experiment','instruction-effects','--run','eval-001','--builder',bid,'--checkpoint',checkpoint,'--repository',str(shadow)])
    proof={'sandbox':name,'head':meta['head'],'tree':meta['tree'],'dirty':meta['dirty'],'bundle_sha256':digest_bytes((out/'native-history.bundle').read_bytes()),'working_tree_sha256':digest_bytes((out/'native-working-tree.tar.gz').read_bytes()),'decoded_working_bytes':decoded,'history_restored':True}
    proofs.append(proof);write_json(root/'verified-archives.json',proofs)
    checked(['sbx','stop',name]);checked(['sbx','rm','--force',name])
    print('Archived and removed '+name,flush=True)
for name in names:
    if not name.startswith('ff-eval-001-app-'):continue
    out=root/'apps'/name;out.mkdir(parents=True,exist_ok=True)
    backup="import sqlite3,pathlib; p=pathlib.Path('/home/agent/app/.runtime'); source=sqlite3.connect(str(p/'app.sqlite')); dest=sqlite3.connect(str(p/'incident-backup.sqlite')); source.backup(dest); assert dest.execute('pragma integrity_check').fetchone()[0]=='ok'; dest.close();source.close()"
    checked(['sbx','exec',name,'python3','-c',backup])
    archive=out/'private-app.tar.gz'
    script="import tarfile,sys;t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz');t.add('/home/agent/app',arcname='app');t.close()"
    with archive.open('wb') as f:
        result=subprocess.run(['sbx','exec',name,'python3','-c',script],stdout=f,stderr=subprocess.PIPE,check=True)
    decoded=0;backup_found=False
    with tarfile.open(archive) as t:
        for member in t:
            if member.isfile():
                data=t.extractfile(member).read();decoded+=len(data)
                if member.name=='app/.runtime/incident-backup.sqlite':
                    backup_found=True
                    import sqlite3
                    with tempfile.TemporaryDirectory(prefix='eval001-database-restore-') as temp:
                        db=Path(temp)/'app.sqlite';db.write_bytes(data)
                        con=sqlite3.connect(str(db));assert con.execute('pragma integrity_check').fetchone()[0]=='ok';con.close()
    assert backup_found
    proofs.append({'sandbox':name,'archive_sha256':digest_bytes(archive.read_bytes()),'decoded_bytes':decoded,'sqlite_backup_restored':True})
    write_json(root/'verified-archives.json',proofs)
    checked(['sbx','stop',name]);checked(['sbx','rm','--force',name]);print('Archived and removed '+name,flush=True)
remaining=[x['name'] for x in json.loads(checked(['sbx','ls','--json']))['sandboxes'] if x['name'].startswith('ff-eval-001-')]
assert not remaining
write_json(root/'final-inventory.json',{'remaining':remaining,'archived_and_removed':len(proofs)})
identity={k:m[k] for k in ('experiment_id','experiment_revision','project_id','project_revision','run_id')};identity['manifest_sha256']=digest_json(m)
Ledger(run,identity).event('incident_resources_retired',preserved_builder_sources=12,preserved_application_resources=12,original_unknown_cost_retained=True,archives=str(root/'verified-archives.json'),remaining_resources=remaining)
