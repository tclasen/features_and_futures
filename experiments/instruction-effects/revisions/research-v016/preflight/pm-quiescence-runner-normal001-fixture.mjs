import {mkdir,writeFile,readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';
const folder="experiments/instruction-effects/revisions/research-v016/preflight/pm-quiescence-runner-normal001-check-"+Date.now();await mkdir(folder);await writeFile(folder+'/executed-controller.mjs',await readFile(import.meta.filename));
await writeFile(folder+'/verified.json',JSON.stringify({verified:true,model_calls:0,scope:'PM runner control only'}));
