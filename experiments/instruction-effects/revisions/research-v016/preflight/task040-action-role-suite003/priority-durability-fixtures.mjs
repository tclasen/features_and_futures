import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from '@playwright/test';
import {expectPersistedPriority} from './helpers.mjs';

let priority='Normal', mode='form';
const server=http.createServer(async(req,res)=>{
  if(req.method==='POST') {
    let body=''; for await(const chunk of req) body+=chunk;
    await new Promise(resolve=>setTimeout(resolve,60));
    if(mode!=='broken') priority=new URLSearchParams(body).get('priority');
    if(mode==='form') {res.writeHead(303,{Location:'/project'});res.end();}
    else {res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');}
    return;
  }
  res.setHeader('Content-Type','text/html');
  if(req.url==='/') {res.end('<div data-testid="project-row">Demo<button onclick="location.href=\'/project\'">Open project</button></div>');return;}
  const change=mode==='form'?'this.form.requestSubmit()':"fetch('/priority',{method:'POST',body:new URLSearchParams(new FormData(this.form))})";
  res.end(`<h1>Demo</h1><label>Task filter<select><option>All</option><option>Open</option><option>Completed</option></select></label><div data-testid="task-row">Task one<form method="post" action="/priority"><label>Task priority<select name="priority" onchange="${change}">${['Low','Normal','High'].map(p=>`<option ${p===priority?'selected':''}>${p}</option>`).join('')}</select></label></form></div>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const results=[];
try {
  for(const treatment of ['form','fetch','broken']) {
    mode=treatment;priority='Normal';
    const context=await browser.newContext({baseURL:origin});const page=await context.newPage();
    await page.goto('/project');
    await page.getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});
    if(treatment==='broken') await assert.rejects(()=>expectPersistedPriority(page,'Demo','Task one','High'));
    else {
      await expectPersistedPriority(page,'Demo','Task one','High');
      await page.getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'Low'});
      await expectPersistedPriority(page,'Demo','Task one','Low');
      await page.reload();
      assert.equal(await page.getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked').textContent(),'Low');
    }
    results.push({mode:treatment,expected:treatment==='broken'?'rejected':'accepted',verified:true});
    await context.close();
  }
  console.log(JSON.stringify({fixture:'priority public-UI durability',results,model_calls:0}));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
