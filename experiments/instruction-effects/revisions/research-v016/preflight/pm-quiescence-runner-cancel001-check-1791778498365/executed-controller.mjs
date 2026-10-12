import {mkdir,writeFile,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';
const folder="experiments/instruction-effects/revisions/research-v016/preflight/pm-quiescence-runner-cancel001-check-"+Date.now();await mkdir(folder);await writeFile(folder+'/executed-controller.mjs',await readFile(import.meta.filename));
spawn("python3",["experiments/instruction-effects/revisions/research-v016/preflight/pm-owned-group-quiescence001-verification/worker.py",folder],{stdio:"inherit"});setInterval(()=>{},100);
