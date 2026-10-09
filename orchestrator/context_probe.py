"""Isolated native compaction stress checks; never modify builder submissions."""
import argparse
import concurrent.futures
import hashlib
import json
import subprocess
import time
import tarfile
import uuid
from pathlib import Path
from .adapters import configure_attempt, invoke, sandbox_policy
from .evidence import Ledger, digest_bytes, read_jsonl
from .gateway import InferenceGateway
from .prepare import write_json


def probe(parent, manifest, model, harness):
    name = f"{harness}-{model}"
    root = parent / name
    root.mkdir()
    sandbox = 'ff-context-' + uuid.uuid4().hex[:10]
    ledger = Ledger(root, {'run_id': parent.name, 'experiment_id': 'pm-context-preflight'})
    gateway = InferenceGateway(ledger, manifest['pricing'], local_endpoint=None)
    marker = 'retain-' + hashlib.sha256(name.encode()).hexdigest()[:16]
    created_sandbox = False
    fixture = {}
    for i in range(1, 5):
        lines = [f'chunk={i};row={j};data=' + hashlib.sha256(f'{i}:{j}'.encode()).hexdigest()
                 for j in range(150)]
        if i == 1:
            lines.insert(0, 'REMEMBER_THIS_CANARY=' + marker)
        fixture[f'chunk-{i}.txt'] = '\n'.join(lines) + '\n'
    prompt = ('This is a PM-owned harness context stress fixture. Read chunk-1.txt through chunk-4.txt '
              'in numeric order using four separate tool calls, displaying the complete contents of each '
              'file without truncation. Do not use a program to read multiple files in one tool call. '
              'After the fourth read, write result.txt containing only the exact REMEMBER_THIS_CANARY '
              'value from chunk-1.txt and a newline. Preserve that value if context compaction occurs. '
              'Do not reread chunk-1.txt after reading chunk-4.txt. No other work is needed.')
    write_json(root/'fixture.json', {'files': fixture, 'prompt': prompt,
               'file_sha256': {k:digest_bytes(v.encode()) for k,v in fixture.items()},
               'purpose': 'stress variant; not pilot or main experimental outcomes'})
    try:
        created = invoke(['sbx','create','--name',sandbox,'--cpus','4','--memory','4g',
                          '--skills','off','--pull','never','-t',manifest['runtime']['image'],'shell'])
        (root/'sandbox-create.log').write_text(created.stdout + created.stderr)
        if created.returncode:
            raise RuntimeError('Sandbox creation failed')
        created_sandbox = True
        write_json(root/'network-policy.json', sandbox_policy(sandbox, gateway.port))
        setup = "import json,pathlib,sys; p=pathlib.Path('/home/agent/work'); p.mkdir(exist_ok=True); d=json.load(sys.stdin); [(p/k).write_text(v) for k,v in d.items()]"
        installed = invoke(['sbx','exec','-i',sandbox,'python3','-c',setup], stdin=json.dumps(fixture))
        if installed.returncode:
            raise RuntimeError('Fixture installation failed')
        key = gateway.lease(model,name,'context-stress','attempt-001','subscription')
        context_id = uuid.uuid4().hex
        command = configure_attempt(sandbox,harness,model,key,gateway.port,context_id)
        idx = command.index(sandbox)
        command[idx:idx] = ['-w','/home/agent/work']
        settings = {'context_window':32768,'reasoning':'medium','experimental_stress_variant':True}
        if harness == 'codex':
            command[-1:-1] = ['-c','model_context_window=32768', '-c','model_auto_compact_token_limit=16000']
            settings['auto_compact_token_limit'] = 16000
            stdin = prompt
        else:
            update = "import json,pathlib; p=pathlib.Path('/home/agent/.ff-context-CONTEXT'); m=json.loads((p/'models.json').read_text()); m['providers']['pilot']['models'][0]['contextWindow']=32768; (p/'models.json').write_text(json.dumps(m)); s=json.loads((p/'settings.json').read_text()); s['compaction']={'enabled':True,'reserveTokens':16384,'keepRecentTokens':2000}; (p/'settings.json').write_text(json.dumps(s))".replace('CONTEXT',context_id)
            updated = invoke(['sbx','exec',sandbox,'python3','-c',update])
            if updated.returncode:
                raise RuntimeError('Stress context configuration failed')
            command += [prompt]
            settings.update(reserve_tokens=16384,keep_recent_tokens=2000,max_output_tokens=16384)
            stdin = None
        write_json(root/'settings.json',settings)
        ledger.event('context_probe_started',model=model,harness=harness)
        start = time.monotonic_ns()
        try:
            result = invoke(command,stdin=stdin,timeout=600)
            returned = time.monotonic_ns()
            (root/'harness.stdout.jsonl').write_text(result.stdout.replace(key,'[REDACTED-LEASE]'))
            (root/'harness.stderr.log').write_text(result.stderr.replace(key,'[REDACTED-LEASE]'))
            exit_code = result.returncode
        except subprocess.TimeoutExpired as error:
            returned = time.monotonic_ns()
            for filename,value in [('harness.stdout.jsonl',error.stdout),('harness.stderr.log',error.stderr)]:
                if isinstance(value,bytes): value=value.decode(errors='replace')
                (root/filename).write_text((value or '').replace(key,'[REDACTED-LEASE]'))
            exit_code = None
            raise RuntimeError('Native context stress timed out; evidence retained')
        finally:
            gateway.revoke()
        ledger.event('context_probe_harness_returned',exit_code=exit_code,
                     invocation_duration_ns=returned-start,model=model,harness=harness)
        found = invoke(['sbx','exec',sandbox,'cat','/home/agent/work/result.txt'])
        stdout = (root/'harness.stdout.jsonl').read_text()
        native_events = []
        for line in stdout.splitlines():
            try: row=json.loads(line)
            except ValueError: continue
            if 'compact' in str(row.get('type','')).lower() or 'compact' in str(row.get('item',{}).get('type','')).lower():
                native_events.append(row)
        usage = read_jsonl(root/'usage.jsonl') if (root/'usage.jsonl').exists() else []
        summary = {'model':model,'harness':harness,'exit_code':exit_code,
                   'canary_preserved':found.returncode == 0 and found.stdout == marker+'\n',
                   'native_compaction_events':native_events,'native_request_count':len(usage),
                   'complete_usage':bool(usage) and all(r.get('counts') is not None for r in usage),
                   'limitation':'Compaction event and receipt audit required; canary alone does not verify compaction.'}
        write_json(root/'result.json',summary)
        return summary
    except Exception as error:
        write_json(root/'failure.json',{'type':type(error).__name__,'message':str(error)})
        return {'model':model,'harness':harness,'failed':True,'error_type':type(error).__name__}
    finally:
        gateway.close()
        if created_sandbox:
            try:
                retire_fixture(sandbox, root)
            except Exception as error:
                write_json(root/'cleanup-failure.json', {
                    'sandbox':sandbox, 'resource_retained':True,
                    'type':type(error).__name__, 'message':str(error)})
                invoke(['sbx','stop',sandbox])


def retire_fixture(sandbox, root):
    """Retain PM fixture source before removing only its exact sandbox."""
    if not sandbox.startswith('ff-context-'):
        raise ValueError('Refusing cleanup outside context fixture namespace')
    stopped = invoke(['sbx', 'stop', sandbox])
    (root/'sandbox-stop.log').write_text(stopped.stdout+stopped.stderr)
    if stopped.returncode:
        raise RuntimeError('Could not stop context fixture')
    archive = root/'original-fixture.tar.gz'
    script = "import tarfile,sys;t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|gz');t.add('/home/agent/work',arcname='work');t.close()"
    with archive.open('wb') as stream:
        result = subprocess.run(['sbx','exec',sandbox,'python3','-c',script],
                                stdout=stream,stderr=subprocess.PIPE,timeout=180)
    (root/'fixture-capture.stderr.log').write_bytes(result.stderr)
    if result.returncode:
        raise RuntimeError('Fixture archival failed; sandbox retained')
    with tarfile.open(archive) as source:
        members = source.getmembers()
        for member in members:
            if member.isfile():
                with source.extractfile(member) as stream:
                    while stream.read(1048576): pass
    write_json(root/'fixture-preservation.json', {
        'sandbox':sandbox,'sha256':digest_bytes(archive.read_bytes()),
        'verified_members':len(members),'status':'verified_before_removal'})
    for command in (['sbx','stop',sandbox], ['sbx','rm','--force',sandbox]):
        result = invoke(command)
        if result.returncode:
            raise RuntimeError('Context fixture retirement failed')
    write_json(root/'fixture-retirement.json', {'sandbox':sandbox,'status':'removed'})


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--run',required=True,type=Path)
    args=parser.parse_args()
    manifest=json.loads((args.run/'manifest.json').read_text())
    parent=args.run/'preflight'/'context-stress'/str(time.time_ns())
    parent.mkdir(parents=True)
    write_json(parent/'provenance.json',{'source_manifest_sha256':digest_bytes((args.run/'manifest.json').read_bytes()),
                                       'probe_code_sha256':digest_bytes(Path(__file__).read_bytes()),
                                       'comparison':'Isolated lower-threshold fixtures; no pilot outcome changes'})
    pairs=[(model,harness) for model in ('gpt-6-luna','gpt-6.1-sol') for harness in ('codex','pi')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(probe,parent,manifest,*pair) for pair in pairs]
        results=[f.result() for f in futures]
    write_json(parent/'results.json',results)
    print(json.dumps({'evidence':str(parent),'results':results}))

if __name__=='__main__': main()
