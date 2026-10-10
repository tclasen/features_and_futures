// PM-only synthetic browser fixture; never transfer this to builders.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('runs/instruction-effects/eval-001');
const suite=root+'/decisions/task-006-draft/suite/playwright.config.mjs';
const evidence=root+'/preflight/priority-fixtures/check-'+Date.now();
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let projects=[],nextId=1,mode='form',defect='none';
function seed() {
  nextId=3;
  projects=[{id:1,name:'task-005 Persistence renamed',archived:true,tasks:[{id:2,title:'Memory kept',completed:true}]}];
}
const options=(values,current)=>values.map(v=>`<option ${v===current?'selected':''}>${v}</option>`).join('');
const submit=()=>mode==='form'?'this.form.requestSubmit()':"fetch(this.form.action,{method:'POST',body:new URLSearchParams(new FormData(this.form))})";
const button=(text,action,fields='',disabled=false)=>`<form method="post" action="${action}"><fieldset ${disabled?'disabled':''}>${fields}<button>${text}</button></fieldset></form>`;
const input=(label,name,value='')=>`<label>${label}<input name="${name}" value="${esc(value)}"></label>`;
function detail(p,filter='All',alert='') {
 const disabled=p.archived?'disabled':'';
 return `<h1>${esc(p.name)}</h1>${button('Projects','/back')}${p.archived?'<p>Archived project</p>':''}${alert?`<div role="alert">${alert}</div>`:''}
 ${button('Rename project',`/projects/${p.id}/rename`,input('New project name','name'),p.archived)}
 ${button('Create task',`/projects/${p.id}/create-task`,input('Task title','title'),p.archived)}
 <form><label>Task filter<select name="filter" onchange="this.form.requestSubmit()">${options(['All','Open','Completed'],filter)}</select></label></form>
 ${p.tasks.filter(t=>filter==='All'||(filter==='Completed')===t.completed).map(t=>{
   const saved=t.priority??(defect==='wrong-default'?'Low':'Normal');
   return `<div data-testid="task-row">${esc(t.title)}
    <form method="post" action="/projects/${p.id}/tasks/${t.id}/complete"><input type="checkbox" aria-label="Complete ${esc(t.title)}" name="completed" value="1" ${t.completed?'checked':''} ${disabled} onchange="${submit()}"></form>
    ${button('Rename task',`/projects/${p.id}/tasks/${t.id}/rename`,input('New task title','title'),p.archived)}
    <form method="post" action="/projects/${p.id}/tasks/${t.id}/priority"><label>Task priority<select name="priority" ${defect==='enabled-archive'?'':disabled} onchange="${submit()}">${options(['Low','Normal','High'],saved)}</select></label></form></div>`;
 }).join('')}`;
}
function home(filter='Active',alert='') {
 return `<h1>Workboard</h1>${alert?`<div role="alert">${alert}</div>`:''}${button('Create project','/create',input('Project name','name'))}
 <form><label>Project filter<select name="filter" onchange="this.form.requestSubmit()">${options(['Active','Archived'],filter)}</select></label></form>
 ${projects.filter(p=>(filter==='Archived')===p.archived).map(p=>`<div data-testid="project-row">${esc(p.name)}<span data-testid="project-summary">${p.tasks.filter(t=>t.completed).length}/${p.tasks.length} completed</span>${button('Open project',`/projects/${p.id}/open`)}${button(p.archived?'Restore project':'Archive project',`/projects/${p.id}/${p.archived?'restore':'archive'}`)}</div>`).join('')}`;
}
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health') {res.setHeader('Content-Type','application/json');res.end('{"status":"ok"}');return;}
  const parts=url.pathname.split('/').filter(Boolean);
  let p=projects.find(p=>p.id===Number(parts[1]));
  let alert='',destination=p?`/projects/${p.id}`:'/';
  if(req.method==='POST') {
   let raw='';for await(const c of req) raw+=c;
   const data=new URLSearchParams(raw);
   await new Promise(r=>setTimeout(r,60));
   if(parts[0]==='create') {
    const name=(data.get('name')??'').trim();
    if(name) projects.push({id:nextId++,name,archived:false,tasks:[]});
    else alert='Project name is required';destination='/';
   } else if(parts[0]==='back') destination='/';
   else if(p) {
    const action=parts[2];
    if(action==='archive') {p.archived=true;destination='/';}
    else if(action==='restore') {p.archived=false;destination='/';}
    else if(action==='rename'&&!p.archived) {
     const name=(data.get('name')??'').trim();if(name)p.name=name;else alert='Project name is required';
    } else if(action==='create-task'&&!p.archived) {
     const title=(data.get('title')??'').trim();
     if(title)p.tasks.push({id:nextId++,title,completed:false});else alert='Task title is required';
    } else if(action==='tasks'&&!p.archived) {
     const t=p.tasks.find(t=>t.id===Number(parts[3]));
     if(t&&parts[4]==='complete') t.completed=data.get('completed')==='1';
     if(t&&parts[4]==='rename') {
      const title=(data.get('title')??'').trim();if(title)t.title=title;else alert='Task title is required';
      if(defect==='rename-resets')t.priority='Normal';
     }
     if(t&&parts[4]==='priority'&&defect!=='broken-save') {
      t.priority=data.get('priority');
      if(defect==='changes-completion')t.completed=!t.completed;
      if(defect==='cross-task')for(const other of p.tasks)other.priority=t.priority;
     }
    }
   }
   if(alert) {res.setHeader('Content-Type','text/html');res.end(p?detail(p,'All',alert):home('Active',alert));return;}
   res.writeHead(303,{Location:destination});res.end();return;
  }
  res.setHeader('Content-Type','text/html');res.end(p?detail(p,url.searchParams.get('filter')??'All'):home(url.searchParams.get('filter')??'Active'));
 } catch(e) {res.statusCode=500;res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
async function run(name,phase='acceptance',grep) {
 const out=evidence+'/'+name;await mkdir(out,{recursive:true});
 const env={...process.env,PLAYWRIGHT_BROWSERS_PATH:resolve('.local/browsers'),FF_STAGE:'6',FF_PHASE:phase,FF_FIXTURE_PREFIX:'task-006',FF_BASE_URL:origin,FF_RESULT:out+'/results.json',FF_OUTPUT:out+'/artifacts'};
 const args=['test','--config',suite];if(grep)args.push('--grep',grep);
 const child=spawn(resolve('node_modules/.bin/playwright'),args,{env,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
 const exit=await new Promise((r,j)=>{child.on('error',j);child.on('exit',r);});
 await writeFile(out+'/stdout.log',stdout);await writeFile(out+'/stderr.log',stderr);
 const result=JSON.parse(await readFile(out+'/results.json','utf8'));
 return {name,phase,exit,statistics:result.stats};
}
const results=[];
try {
 for(mode of ['form','fetch']) {
  defect='none';seed();
  const result=await run('positive-'+mode);results.push(result);assert.equal(result.exit,0,JSON.stringify(result));assert.equal(result.statistics.expected,21);
  const persisted=await run('sentinel-'+mode,'postrestart');results.push(persisted);assert.equal(persisted.exit,0,JSON.stringify(persisted));assert.equal(persisted.statistics.expected,1);
 }
 for(const [fault,test] of [['broken-save','019'],['wrong-default','022'],['changes-completion','020'],['enabled-archive','021'],['rename-resets','019'],['cross-task','019']]) {
  defect=fault;mode='form';seed();
  const result=await run('negative-'+fault,'acceptance',test+' ');results.push(result);assert.notEqual(result.exit,0,'Fixture failed to reject '+fault);assert.equal(result.statistics.unexpected,1,'Exactly one selected assertion must fail for '+fault);
 }
 await writeFile(evidence+'/verified.json',JSON.stringify({verified:true,model_calls:0,results,scope:'Synthetic public-UI fixtures only; sentinel phase is a reload observation, not a native process restart or SQLite migration proof'},null,2)+'\n');
 console.log(JSON.stringify({verified:true,variants:results.length,model_calls:0}));
} finally {await new Promise(r=>server.close(r));}
