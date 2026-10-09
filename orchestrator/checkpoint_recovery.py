"""Uniform, archive-first restoration after an explicitly frozen repeated-failure rule."""
import json
import shutil
from pathlib import Path
from .prepare import checked, write_json, InfrastructureError
from .private import export, sandbox_git
from .evidence import digest_bytes
from .diagnostics import notification_fingerprint

def trailing_identical_failures(events, builder, task, fingerprint):
    count=0
    rejected=[e for e in events if e['kind']=='attempt_rejected' and e.get('builder_id')==builder and e.get('task_id')==task]
    for record in reversed(rejected):
        if notification_fingerprint(record['diagnostics'])!=fingerprint:break
        count+=1
    return count

def restore(run, manifest, sandbox, repo, builder, task, attempt, output, commit, ledger, archive):
    if sandbox!='ff-'+manifest['run_id']+'-'+builder:
        raise InfrastructureError('Refusing restoration of another sandbox')
    attrs={'builder_id':builder,'task_id':task,'attempt_id':attempt}
    started=ledger.event('repository_recovery_started',action='restore-last-accepted-checkpoint',**attrs)
    checked(['sbx','stop',sandbox])
    evidence=output/'recovery-before-restore';evidence.mkdir()
    before=export(sandbox,repo,evidence)
    checkpoint=task+'-'+attempt+'-before-restore'
    index=archive(run,repo,builder,checkpoint,evidence)
    checkpoint_path=run/'builders'/builder/'checkpoints'/checkpoint
    for name,sha in index['checksums'].items():
        if digest_bytes((checkpoint_path/name).read_bytes())!=sha:raise InfrastructureError('Recovery archive checksum mismatch')
    checked(['git','-C',str(repo),'bundle','verify',str(checkpoint_path/'history.bundle')])
    # Preserve the rejected tip in the native repository as well as the PM bundle.
    sandbox_git(sandbox,'update-ref','refs/pm-retained/'+checkpoint,before['head'])
    sandbox_git(sandbox,'reset','--hard',commit)
    sandbox_git(sandbox,'clean','-fd')
    after={'head':sandbox_git(sandbox,'rev-parse','HEAD'),'tree':sandbox_git(sandbox,'rev-parse','HEAD^{tree}'),'dirty':sandbox_git(sandbox,'status','--porcelain')}
    if after['head']!=commit or after['dirty']:raise InfrastructureError('Own checkpoint restoration did not verify')
    write_json(output/'recovery-instruction.json',{'builder_id':builder,'task_id':task,'action':'restore-last-accepted-checkpoint',
        'message':'The PM restored your repository to your own last accepted requirements checkpoint '+commit+'. Your rejected working files and complete history were archived. Implement the same current task again from this checkpoint using the unchanged requirements. All earlier attempts remain in this task timing and cost.'})
    record={'action':'restore-last-accepted-checkpoint','actor':'pm','pre_commit':before['head'],'post_commit':after['head'],
            'pre_tree':before['tree'],'post_tree':after['tree'],'archive_checksums':index['checksums'],
            'native_working_tree_sha256':digest_bytes((evidence/'native-working-tree.tar.gz').read_bytes()),'recovery_started_event_id':started['event_id']}
    write_json(output/'repository-recovery.json',record)
    ledger.event('repository_recovery_finished',**record,**attrs)
    return record
