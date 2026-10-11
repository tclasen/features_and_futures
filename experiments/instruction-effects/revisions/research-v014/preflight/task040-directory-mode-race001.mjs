// PM-only deterministic reproduction of stale hidden state; no model calls.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
const base=resolve('experiments/instruction-effects/revisions/research-v014/preflight');
const out=base+'/task040-directory-mode-race001-check-'+Date.now();await mkdir(out);
await writeFile(out+'/executed-controller.mjs',await readFile(import.meta.filename));
const hash=x=>createHash('sha256').update(x).digest('hex');
const inputs={old:base+'/task040-broader002-fixture.mjs',corrected:base+'/task040-broader003-fixture.mjs'};
await writeFile(out+'/inputs.json',JSON.stringify({model_calls:0,source_sha256:Object.fromEntries(await Promise.all(Object.entries(inputs).map(async([k,p])=>[k,hash(await readFile(p))]))),controlled_timing:'500ms POST directory-filter delay, identical old and corrected mock; original failed assertion sequence retained'},null,2)+'\n');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.local/browsers');
const results=[];
for(const [variant,path] of Object.entries(inputs))for(let repeat=1;repeat<=3;repeat++){
 const folder=out+'/'+variant+'-'+repeat;await mkdir(folder);
 let source=(await readFile(path,'utf8')).split("await new Promise(r=>server.listen(0,'127.0.0.1',r));")[0];
 const needle='const server=http.createServer(async(req,res)=>{';assert.equal(source.split(needle).length,2);
 source=source.replace(needle,needle+"if(req.method==='POST'&&new URL(req.url,'http://fixture').pathname==='/directory/filters')await new Promise(r=>setTimeout(r,500));");
 source+="\nmode='async';reloadReset=true;seed();await new Promise(r=>server.listen(0,'127.0.0.1',r));console.log(JSON.stringify({origin:'http://127.0.0.1:'+server.address().port}));\n";
 const program=folder+'/fixture.mjs';await writeFile(program,source);
 const child=spawn('node',[program],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stderr.on('data',c=>stderr+=c);
 const origin=await new Promise((done,fail)=>{const timeout=setTimeout(()=>fail(new Error('Fixture startup timeout')),15000);child.stdout.on('data',c=>{stdout+=c;if(stdout.includes('\n')){clearTimeout(timeout);done(JSON.parse(stdout.trim()).origin);}});child.on('error',fail);child.on('exit',code=>{clearTimeout(timeout);if(!stdout.includes('\n'))fail(new Error('Fixture startup exit '+code));});});
 let browser,context;const requests=[];let observation;
 try{
  browser=await chromium.launch({headless:true});context=await browser.newContext();await context.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await context.newPage();page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/directory/'))requests.push({url:request.url(),parameters:Object.fromEntries(new URLSearchParams(request.postData()??''))});});
  await page.goto(origin);await page.getByRole('textbox',{name:'Project name',exact:true}).fill('Mode race owner');await page.getByRole('button',{name:'Create project',exact:true}).click();await page.getByTestId('project-row').filter({hasText:'Mode race owner'}).getByRole('button',{name:'Open project',exact:true}).click();
  const travel='DefaultRestart40 travelling-default40';await page.getByRole('textbox',{name:'Task title',exact:true}).fill(travel);await page.getByRole('button',{name:'Create task',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Complete '+travel,exact:true})).toBeVisible();
  await page.goto(origin);await page.getByRole('button',{name:'Task directory',exact:true}).click();const rows=page.getByTestId('directory-task-row').filter({visible:true});const status=page.getByRole('combobox',{name:'Directory search mode',exact:true});await expect(status.locator('option:checked')).toHaveText('Phrase');await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(travel);await page.getByRole('button',{name:'Search directory',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([travel]);
  await status.selectOption({label:'Starts with'});await page.getByRole('textbox',{name:'Directory search',exact:true}).fill('travelling-default40');await page.getByRole('button',{name:'Search directory',exact:true}).click();let failedAssertion=null;
  try{await expect(page.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(rows).toHaveCount(0);}catch(error){failedAssertion=String(error);}
  observation={variant,repeat,failedAssertion,selectedMode:await status.inputValue(),visibleTitles:await rows.getByTestId('directory-task-title').allTextContents(),requests};
  const submitted=requests.findLast(r=>r.url.endsWith('/directory/search'));assert.equal(submitted.parameters.directory_search_new,'travelling-default40');
  if(variant==='old'){assert.ok(failedAssertion);assert.equal(submitted.parameters.directory_mode,'Phrase');assert.deepEqual(observation.visibleTitles,[travel]);}
  else{assert.equal(failedAssertion,null);assert.equal(submitted.parameters.directory_mode,'Starts with');assert.equal(observation.selectedMode,'Starts with');assert.deepEqual(observation.visibleTitles,[]);}
  await context.tracing.stop({path:folder+'/trace.zip'});
 }finally{
  if(context)await context.close();if(browser)await browser.close();if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await writeFile(folder+'/stdout.log',stdout);await writeFile(folder+'/stderr.log',stderr);
 }
 await writeFile(folder+'/result.json',JSON.stringify(observation,null,2)+'\n');results.push(observation);await writeFile(out+'/progress.json',JSON.stringify(results,null,2)+'\n');
}
await writeFile(out+'/verified.json',JSON.stringify({verified:true,model_calls:0,results,scope:'Three old-fail/corrected-pass deterministic UI reproductions only; full corrected broader and actual native lifecycle still pending.'},null,2)+'\n');console.log(JSON.stringify({verified:true,evidence:out,repeats:3,model_calls:0}));
