import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from '@playwright/test';
import {expectPersistedCompletion} from './helpers.mjs';
let completed=false, mode='form';
const server=http.createServer(async(req,res)=>{
 if(req.method==='POST') {
  let body='';for await(const chunk of req)body+=chunk;
  await new Promise(resolve=>setTimeout(resolve,60));
  if(mode!=='broken')completed=new URLSearchParams(body).get('completed')==='1';
  if(mode==='form'){res.writeHead(303,{Location:'/project'});res.end();}
  else{res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');}
  return;
 }
 res.setHeader('Content-Type','text/html');
 if(req.url==='/'){res.end('<div data-testid="project-row">Demo<button onclick="location.href=\'/project\'">Open project</button></div>');return;}
 const change=mode==='form'?'this.form.requestSubmit()':"fetch('/toggle',{method:'POST',body:new URLSearchParams(new FormData(this.form))})";
 res.end(`<h1>Demo</h1><label>Task filter<select><option>All</option><option>Open</option><option>Completed</option></select></label><div data-testid="task-row">Task one<form method="post" action="/toggle"><input aria-label="Complete Task one" type="checkbox" name="completed" value="1" ${completed?'checked':''} onchange="${change}"></form></div>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try {
 for(const treatment of ['form','fetch','broken']) {
  mode=treatment;completed=false;
  const context=await browser.newContext({baseURL:origin});const page=await context.newPage();
  await page.goto('/project');await page.getByRole('checkbox',{name:'Complete Task one',exact:true}).check();
  if(treatment==='broken')await assert.rejects(()=>expectPersistedCompletion(page,'Demo','Task one',true));
  else {
   await expectPersistedCompletion(page,'Demo','Task one',true);
   await page.getByRole('checkbox',{name:'Complete Task one',exact:true}).uncheck();
   await expectPersistedCompletion(page,'Demo','Task one',false);
   await page.reload();assert.equal(await page.getByRole('checkbox',{name:'Complete Task one',exact:true}).isChecked(),false);
  }
  await context.close();
 }
 console.log('Independent public UI accepts delayed native form and fetch persistence, and rejects a checkbox whose durable state never changes.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
