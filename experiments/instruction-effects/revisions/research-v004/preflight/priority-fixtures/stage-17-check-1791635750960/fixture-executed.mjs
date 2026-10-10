// PM-only synthetic browser fixture; never transfer this to builders.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('experiments/instruction-effects/revisions/research-v004');
const stage=17;
assert.ok([17].includes(stage));
const suite=root+'/decisions/task-017-draft/suite/playwright.config.mjs';
const evidence=root+'/preflight/priority-fixtures/stage-'+stage+'-check-'+Date.now();
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let projects=[],nextId=1,mode='form',defect='none',rowDelay=100;
function seed() {
  nextId=27;
  projects=[{id:1,name:'task-005 Persistence renamed',archived:true,tasks:[{id:2,title:'Memory kept',completed:true}]},{id:3,name:'task-007 Persistence renamed',archived:true,tasks:[{id:4,title:'Memory kept',completed:true,priority:'High'}]},{id:5,name:'task-008 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:6,title:'Memory kept',completed:true,priority:'High'}]},{id:7,name:'task-009 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:8,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:9,name:'task-010 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:10,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:11,name:'task-011 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:12,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:21,name:'task-012 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:22,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:13,name:'task-012 Position first owner',archived:false,tasks:[{id:14,title:'First existing',completed:false},{id:15,title:'Position travelling',completed:false},{id:16,title:'First later',completed:false},{id:17,title:'First newly created',completed:false}]},{id:23,name:'task-013 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:24,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:18,name:'task-012 Position second owner',archived:false,tasks:[{id:19,title:'Second existing',completed:false},{id:20,title:'Second newly created',completed:false}]}];
  projects.push({id:25,name:'task-014 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:26,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]});
  projects.push({id:29,name:'task-016 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:30,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]});
  projects.push({id:27,name:'task-015 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:28,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]});if(defect==='wrong-upgrade-deletion')projects.find(p=>p.id===27).tasks[0].deleted=true;
  projects.push({id:1001,name:'task-012 Search Mixed first',archived:false,tasks:[]},{id:1002,name:'task-012 Search mixed last',archived:false,tasks:[]},{id:1003,name:'task-012 Search MIXED archived',archived:true,tasks:[]},{id:1004,name:'task-012 Search  double gap',archived:false,tasks:[]},{id:1005,name:'task-012 Whitespace   Saved first',archived:false,tasks:[]});nextId=1100;
  for(const p of projects){p.nextTaskOrder=p.tasks.length;for(const [i,t] of p.tasks.entries())t.positionMap={[p.id]:i};}
  projects.find(p=>p.id===13).tasks.find(t=>t.id===15).positionMap={13:1,18:1};projects.find(p=>p.id===18).tasks[1].positionMap={18:2};projects.find(p=>p.id===18).nextTaskOrder=3;
}
const destinations=p=>{let rows=projects.filter(other=>(other.id!==p.id||defect==='self-destination')&&(!other.archived||defect==='archived-destination'));return defect==='reversed-destinations'?rows.toReversed():rows;};
const options=(values,current)=>values.map(v=>`<option ${v===current?'selected':''}>${v}</option>`).join('');
const submit=()=>mode==='form'?'this.form.requestSubmit()':"fetch(this.form.action,{method:'POST',body:new URLSearchParams(new FormData(this.form))}).then(r=>r.text()).then(t=>document.documentElement.innerHTML=t)";
const button=(text,action,fields='',disabled=false)=>`<form method="post" action="${action}"><fieldset ${disabled?'disabled':''}>${fields}<button>${text}</button></fieldset></form>`;
const input=(label,name,value='')=>`<label>${label}<input name="${name}" value="${esc(value)}"></label>`;
const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
const dateValue=t=>t.dueDate??(defect==='wrong-date-default'?'2030-01-01':'');
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const leap=y%4===0&&(y%100!==0||y%400===0);return y>=1&&y<=9999&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];}
const defaultValue=p=>p.defaultPriority??(defect==='wrong-project-default'?'Low':'Normal');
const priorityValue=t=>t.priority??(defect==='wrong-default'?'Low':'Normal');
const searchMatch=(value,query,kind='task')=>{const fold=s=>defect==='case-sensitive-search'?s:s.replace(/[A-Z]/g,c=>c.toLowerCase());const q=defect==='untrimmed-search'?query:query.trim();const normal=defect==='uncollapsed-search-spaces'?s=>s:s=>s.replace(/[ \t]+/g,' ');return normal(fold(value)).includes(normal(fold(q)));};
const notesValue=t=>t.notes??(defect==='wrong-notes-default'?'Unexpected default':'');
function matches(t,filter,priorityFilter,dueFrom='',dueThrough='',query='') {
 const live=defect==='live-includes-deleted'||!t.deleted;const member=filter==='Deleted'?Boolean(t.deleted):live;const complete=member&&(filter==='Deleted'||filter==='All'||(filter==='Completed')===t.completed);
 const priority=(filter==='Deleted'&&defect==='deleted-ignores-priority')||priorityFilter==='All'||priorityValue(t)===priorityFilter;
 const date=dateValue(t);
 const dateMatch=(filter==='Deleted'&&defect==='deleted-ignores-date')||(defect==='range-includes-undated'&&!date)||(!dueFrom&&!dueThrough)||((date||defect==='range-includes-undated')&&(!dueFrom||(defect==='exclusive-range'?date>dueFrom:date>=dueFrom))&&(!dueThrough||(defect==='exclusive-range'?date<dueThrough:date<=dueThrough)));
 const search=(filter==='Deleted'&&defect==='deleted-ignores-search')||searchMatch(t.title,query)||(defect==='notes-match-search'&&query.trim()!==''&&searchMatch(notesValue(t),query));if(defect==='search-union')return search||(complete&&priority&&dateMatch);if(!search)return false;
 return defect==='range-union'?(complete&&priority||dateMatch):defect==='union-filters'?(complete||priority)&&dateMatch:complete&&priority&&dateMatch;
}
function detail(p,filter='All',alert='',priorityFilter='All',forcedId=0,dueFrom='',dueThrough='',taskQuery='') {
 const disabled=p.archived?'disabled':'';
 const datesState=hidden('due_from',dueFrom)+hidden('due_through',dueThrough)+hidden('task_search',taskQuery);
 const state=hidden('filter',filter)+hidden('priority_filter',priorityFilter)+datesState;
 let rows=p.tasks.filter(t=>matches(t,filter,priorityFilter,dueFrom,dueThrough,taskQuery)||(defect==='no-live-membership'&&t.id===forcedId));
 if(defect==='reversed-order')rows=rows.toReversed();
 const filterDisabled=p.archived&&defect==='archived-filters-disabled'?'disabled':'';
 return `<h1>${esc(p.name)}</h1>${button('Download project',`/projects/${p.id}/export`,state,p.archived&&defect==='archived-export-disabled')}${button('Projects','/back',state+hidden('project_id',p.id))}${p.archived?'<p>Archived project</p>':''}${alert?`<div role="alert">${alert}</div>`:''}
 ${stage>=13?button('Search tasks',`/projects/${p.id}/task-search`,input('Task search','task_search',taskQuery)+hidden('filter',filter)+hidden('priority_filter',priorityFilter)+hidden('due_from',dueFrom)+hidden('due_through',dueThrough),p.archived&&defect==='archived-search-disabled'):''}
 ${stage>=10?button('Apply due range',`/projects/${p.id}/due-range`,input('Due from','due_from',dueFrom)+input('Due through','due_through',dueThrough)+hidden('filter',filter)+hidden('priority_filter',priorityFilter)+hidden('task_search',taskQuery)+hidden('old_from',dueFrom)+hidden('old_through',dueThrough),p.archived&&defect==='archived-range-disabled'):''}
 ${button('Rename project',`/projects/${p.id}/rename`,input('New project name','name')+state,p.archived)}
 ${stage>=8?`<form method="post" action="/projects/${p.id}/default-priority">${state}<label>Default task priority<select name="priority" ${defect==='enabled-default-archive'?'':disabled} onchange="${submit()}">${options(['Low','Normal','High'],defaultValue(p))}</select></label></form>`:''}
 ${button('Create task',`/projects/${p.id}/create-task`,input('Task title','title')+state,p.archived)}
 <form>${datesState}${hidden('priority_filter',priorityFilter)}<label>Task filter<select name="filter" ${filterDisabled} onchange="this.form.requestSubmit()">${options(['All','Open','Completed','Deleted'],filter)}</select></label></form>
 ${stage>=7?`<form>${datesState}${hidden('filter',filter)}<label>Priority filter<select name="priority_filter" ${filterDisabled} onchange="this.form.requestSubmit()">${options(['All','Low','Normal','High'],priorityFilter)}</select></label></form>`:''}
 ${rows.map(t=>`<div data-testid="task-row">${esc(t.title)}${button(t.deleted?'Restore task':'Delete task',`/projects/${p.id}/tasks/${t.id}/${t.deleted?'restore-task':'delete-task'}`,state,p.archived&&defect!=='enabled-archive-deletion')}
    <form method="post" action="/projects/${p.id}/tasks/${t.id}/complete">${state}<input type="checkbox" aria-label="Complete ${esc(t.title)}" name="completed" value="1" ${t.completed?'checked':''} ${p.archived||(t.deleted&&defect!=='enabled-deleted-controls')?'disabled':''} onchange="${submit()}"></form>
    ${stage>=15?button('Save notes',`/projects/${p.id}/tasks/${t.id}/notes`,`<label>Task notes<textarea name="notes">${defect==='raw-notes-markup'?notesValue(t):esc(notesValue(t))}</textarea></label>`+state,(p.archived&&defect!=='enabled-notes-archive')||(t.deleted&&defect!=='enabled-deleted-controls')):''}
    ${stage>=9?button('Save due date',`/projects/${p.id}/tasks/${t.id}/due-date`,input('Task due date','date',dateValue(t))+state,(p.archived&&defect!=='enabled-date-archive')||(t.deleted&&defect!=='enabled-deleted-controls')):''}
    ${stage>=11?`<form method="post" action="/projects/${p.id}/tasks/${t.id}/move">${state}<fieldset ${(p.archived&&defect!=='enabled-archive-move')||(t.deleted&&defect!=='enabled-deleted-controls')||!destinations(p).length?'disabled':''}><label>Destination project<select name="destination">${destinations(p).map(other=>`<option value="${other.id}">${esc(other.name)}</option>`).join('')}</select></label><button>Move task</button></fieldset></form>`:''}
    ${button('Rename task',`/projects/${p.id}/tasks/${t.id}/rename`,input('New task title','title')+state,p.archived||(t.deleted&&defect!=='enabled-deleted-controls'))}
    <form method="post" action="/projects/${p.id}/tasks/${t.id}/priority">${state}<label>Task priority<select name="priority" ${(p.archived&&defect!=='enabled-archive')||(t.deleted&&defect!=='enabled-deleted-controls')?'disabled':''} onchange="${submit()}">${options(['Low','Normal','High'],priorityValue(t))}</select></label></form></div>`).join('')}`;
}
function home(filter='Active',alert='',summary,query='') {
 return `<h1>Workboard</h1>${alert?`<div role="alert">${alert}</div>`:''}${button('Create project','/create',input('Project name','name'))}
 ${stage>=13?button('Search projects','/search-projects',input('Project search','project_search',query)+hidden('filter',filter)):''}
 <form>${hidden('project_search',query)}<label>Project filter<select name="filter" onchange="this.form.requestSubmit()">${options(['Active','Archived'],filter)}</select></label></form>
 ${projects.filter(p=>(filter==='Archived')===p.archived&&searchMatch(p.name,query,'project')).map(p=>{
    const allTasks=p.tasks.filter(t=>defect==='deleted-in-summary'||!t.deleted);const tasks=defect==='filtered-summary'&&summary&&Number(summary.get('summary_project'))===p.id?p.tasks.filter(t=>matches(t,summary.get('summary_filter'),summary.get('summary_priority'))):allTasks;
    return `<div data-testid="project-row">${esc(p.name)}<span data-testid="project-summary">${tasks.filter(t=>t.completed).length}/${tasks.length} completed</span>${button('Open project',`/projects/${p.id}/open`)}${button(p.archived?'Restore project':'Archive project',`/projects/${p.id}/${p.archived?'restore':'archive'}`)}</div>`;
 }).join('')}`;
}
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health') {res.setHeader('Content-Type','application/json');res.end('{"status":"ok"}');return;}
  const parts=url.pathname.split('/').filter(Boolean);
  let p=projects.find(p=>p.id===Number(parts[1]));
  if(p&&parts[2]==='export'){if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;for(const [key,value] of new URLSearchParams(raw))url.searchParams.set(key,value);}
   const listed=defect==='filtered-export'?p.tasks.filter(t=>matches(t,url.searchParams.get('filter')??'All',url.searchParams.get('priority_filter')??'All',url.searchParams.get('due_from')??'',url.searchParams.get('due_through')??'',url.searchParams.get('task_search')??'')):defect==='export-omits-deleted'?p.tasks.filter(t=>!t.deleted):p.tasks;
   const exported={format:defect==='wrong-export-format'?'other':'workboard-project',version:defect==='wrong-export-version'?2:1,project:{name:p.name,archived:p.archived,defaultPriority:defaultValue(p),tasks:(defect==='export-reversed-order'?listed.toReversed():listed).map(t=>({title:t.title,completed:t.completed,priority:priorityValue(t),dueDate:dateValue(t),notes:defect==='export-normalized-notes'?notesValue(t).trim():notesValue(t),deleted:Boolean(t.deleted)}))}};
   if(defect==='export-foreign-tasks')exported.project.tasks.push({title:'Must not export'});if(defect==='export-loses-priority')for(const t of exported.project.tasks)t.priority='Normal';if(defect==='export-loses-date')for(const t of exported.project.tasks)t.dueDate='';if(defect==='export-loses-completion')for(const t of exported.project.tasks)t.completed=false;if(defect==='export-loses-deletion')for(const t of exported.project.tasks)t.deleted=false;if(defect==='export-wrong-project-default')exported.project.defaultPriority='High';if(defect==='export-wrong-archive')exported.project.archived=false;
   if(defect==='export-mutates-notes')for(const t of p.tasks)t.notes='';res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="'+(defect==='wrong-export-filename'?'wrong.json':'workboard-project.json')+'"');res.end(JSON.stringify(exported));return;
  }
  let rangeError=false;let alert='',destination=p?`/projects/${p.id}`:'/';
  if(req.method==='POST') {
   let raw='';for await(const c of req) raw+=c;
   const data=new URLSearchParams(raw);
   await new Promise(r=>setTimeout(r,60));
   if(parts[0]==='search-projects'){if(defect==='normalized-stored-projects')for(const owner of projects)owner.name=owner.name.replace(/[ \t]+/g,' ');destination='/?'+new URLSearchParams({filter:data.get('filter')??'Active',project_search:(defect==='untrimmed-search'?(data.get('project_search')??''):(data.get('project_search')??'').trim())});}
   else if(parts[0]==='create') {
    const name=(data.get('name')??'').trim();
    if(name) projects.push({id:nextId++,name,archived:false,tasks:[]});
    else alert='Project name is required';destination='/';
   } else if(parts[0]==='back') {destination='/';if(defect==='filtered-summary')destination='/?'+new URLSearchParams({summary_project:data.get('project_id'),summary_filter:data.get('filter'),summary_priority:data.get('priority_filter')});}
   else if(p) {
    const action=parts[2];
    if((action==='rename'&&defect==='rename-return-reset')||(action==='archive'&&defect==='archive-return-reset')){for(const owner of projects)for(const t of owner.tasks)if(t.positionMap)delete t.positionMap[p.id];}
    if(action==='due-range') {
     let a=(data.get('due_from')??'').trim(),b=(data.get('due_through')??'').trim();
     if((a&&!validDate(a))||(b&&!validDate(b)))alert='Due range must use valid YYYY-MM-DD dates';
     else if(a&&b&&a>b)alert='Due from must not be after Due through';
     if(alert&&defect==='invalid-range-allowed')alert='';
     if(alert)rangeError=true;
     if(rangeError&&defect==='invalid-range-clears') {data.set('old_from','');data.set('old_through','');}
     if(defect==='range-resets-completion')data.set('filter','All');
     if(defect==='range-resets-priority')data.set('priority_filter','All');
     data.set('due_from',a);data.set('due_through',b);
    }
    else if(action==='archive') {p.archived=true;destination='/';}
    else if(action==='restore') {p.archived=false;if(defect==='project-restore-undeletes')for(const t of p.tasks)t.deleted=false;if(defect==='restore-default-reset')p.defaultPriority='Normal';destination='/';}
    else if(action==='default-priority'&&!p.archived) {
     if(defect!=='broken-default-save')p.defaultPriority=data.get('priority');
     if(defect==='retroactive-default')for(const t of p.tasks)t.priority=p.defaultPriority;
     if(defect==='global-default')for(const other of projects)other.defaultPriority=p.defaultPriority;
     const selected=new URLSearchParams({filter:data.get('filter')??'All',priority_filter:data.get('priority_filter')??'All',due_from:data.get('due_from')??'',due_through:data.get('due_through')??'',task_search:(defect==='untrimmed-search'?(data.get('task_search')??''):(data.get('task_search')??'').trim())});
     if(defect==='search-resets-filters'&&parts[2]==='task-search'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('due_from','');selected.set('due_through','');}
    if(defect==='rename-resets-search'&&parts[4]==='rename')selected.set('task_search','');
    if(defect==='delete-resets-filters'&&parts[4]==='delete-task'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('task_search','');selected.set('due_from','');selected.set('due_through','');}if(defect==='restore-resets-filter'&&parts[4]==='restore-task')selected.set('filter','All');if(defect==='notes-reset-search'&&parts[4]==='notes')selected.set('task_search','');if(defect==='notes-reset-filters'&&parts[4]==='notes'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('due_from','');selected.set('due_through','');}
    if(defect==='move-resets-filters'&&parts[4]==='move'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('due_from','');selected.set('due_through','');}
    if(defect==='default-resets-filters'){selected.set('filter','All');selected.set('priority_filter','All');}
     destination=`/projects/${p.id}?${selected}`;
    }
    else if(action==='rename'&&!p.archived) {
     const name=(data.get('name')??'').trim();if(name){p.name=name;if(defect==='rename-default-reset')p.defaultPriority='Normal';}else alert='Project name is required';
    } else if(action==='create-task'&&!p.archived) {
     const title=(data.get('title')??'').trim();
     if(title){p.nextTaskOrder??=p.tasks.length;const created={id:nextId++,title,completed:false,priority:defect==='ignored-default'?'Normal':defaultValue(p),positionMap:{[p.id]:p.nextTaskOrder++}};created.fieldSnapshots={[p.id]:{completed:false,priority:created.priority,dueDate:''}};p.tasks.push(created);}else alert='Task title is required';
    } else if(action==='tasks'&&!p.archived) {
     const t=p.tasks.find(t=>t.id===Number(parts[3]));
     if(t&&parts[4]==='delete-task'&&defect!=='ignored-delete'){t.deleted=true;if(defect==='deletion-loses-notes')t.notes='';if(defect==='deletion-loses-priority')t.priority='Normal';if(defect==='deletion-loses-date')t.dueDate='';if(defect==='deletion-changes-completion')t.completed=!t.completed;}
     if(t&&parts[4]==='restore-task'&&defect!=='ignored-restore'){t.deleted=false;if(defect==='restore-inherits-default')t.priority=defaultValue(p);if(defect==='restore-changes-completion')t.completed=!t.completed;if(defect==='restore-loses-notes')t.notes='';if(defect==='restore-loses-date')t.dueDate='';if(defect==='restore-appends'){p.tasks=p.tasks.filter(other=>other!==t);p.tasks.push(t);}if(defect==='restore-clears-position-map')t.positionMap={};}
     if(t&&parts[4]==='notes'&&defect!=='ignored-notes'){const value=data.get('notes')??'';if(!(value===''&&defect==='ignored-note-clear'))t.notes=defect==='trimmed-notes'?value.trim():defect==='flattened-notes'?value.replace(/\n/g,' '):defect==='lost-notes-unicode'?value.replace(/[^\x00-\x7f]/g,''):value;if(defect==='notes-change-priority')t.priority='Normal';if(defect==='notes-change-completion')t.completed=!t.completed;if(defect==='notes-clear-date')t.dueDate='';if(defect==='notes-reorder'){p.tasks=p.tasks.filter(other=>other!==t);p.tasks.push(t);}if(defect==='global-notes')for(const other of p.tasks)other.notes=t.notes;}
     if(t&&parts[4]==='complete') t.completed=data.get('completed')==='1';
     if(t&&parts[4]==='rename') {
      const title=(data.get('title')??'').trim();if(title)t.title=title;else alert='Task title is required';
      if(defect==='rename-resets')t.priority='Normal';
      if(defect==='rename-date-reset')t.dueDate='';
     }
     if(t&&parts[4]==='move'&&defect!=='ignored-move') {
      const target=projects.find(other=>other.id===Number(data.get('destination'))&&!other.archived&&other.id!==p.id);
      if(target) {
       if(defect!=='copy-instead-of-move')p.tasks=p.tasks.filter(other=>other.id!==t.id);
       const moved=defect==='copy-instead-of-move'?{...t,id:nextId++}:t;
       if(defect==='move-inherits-default')moved.priority=defaultValue(target);
       if(defect==='move-resets-completion')moved.completed=false;
       if(defect==='move-clears-date')moved.dueDate='';if(defect==='move-loses-notes')moved.notes='';
       moved.positionMap??={[p.id]:p.tasks.length};moved.fieldSnapshots??={};target.nextTaskOrder??=target.tasks.length;
       const returning=moved.positionMap[target.id]!==undefined;
       if(!returning){moved.positionMap[target.id]=target.nextTaskOrder++;moved.fieldSnapshots[target.id]={completed:moved.completed,priority:moved.priority,dueDate:dateValue(moved)};}
       if(defect==='per-project-position-reset')moved.positionMap={[target.id]:target.nextTaskOrder++};
       if(defect==='stale-return-fields'&&returning&&moved.fieldSnapshots[target.id])Object.assign(moved,moved.fieldSnapshots[target.id]);
       if(defect==='prepend-move')target.tasks.unshift(moved);else target.tasks.push(moved);
       if(defect!=='always-append-return'&&defect!=='prepend-move')target.tasks.sort((a,b)=>a.positionMap[target.id]-b.positionMap[target.id]);
      }
     }
     if(t&&parts[4]==='due-date') {
      const date=(data.get('date')??'').trim();
      if(date!==''&&!validDate(date)&&defect!=='invalid-date-allowed')alert='Due date must be a valid YYYY-MM-DD date';
      else if(defect!=='broken-date-save'&&!(date===''&&defect==='ignored-date-clear')) {
       t.dueDate=date;
       if(defect==='global-date')for(const other of p.tasks)other.dueDate=date;
       if(defect==='date-changes-completion')t.completed=!t.completed;
       if(defect==='date-changes-priority')t.priority='Normal';
      }
     }
     if(t&&parts[4]==='priority'&&defect!=='broken-save') {
      t.priority=data.get('priority');
      if(defect==='changes-completion')t.completed=!t.completed;
      if(defect==='cross-task')for(const other of p.tasks)other.priority=t.priority;
     }
    }
   }
   if(p&&parts[2]==='task-search'&&defect==='normalized-stored-titles')for(const t of p.tasks)t.title=t.title.replace(/[ \t]+/g,' ');
   if(p&&['tasks','due-range','default-priority','rename','create-task','task-search'].includes(parts[2])) {
    const selected=new URLSearchParams({filter:data.get('filter')??'All',priority_filter:data.get('priority_filter')??'All',due_from:data.get('due_from')??'',due_through:data.get('due_through')??'',task_search:(defect==='untrimmed-search'?(data.get('task_search')??''):(data.get('task_search')??'').trim())});
    if(defect==='search-resets-filters'&&parts[2]==='task-search'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('due_from','');selected.set('due_through','');}
    if(defect==='rename-resets-search'&&parts[4]==='rename')selected.set('task_search','');
    if(defect==='delete-resets-filters'&&parts[4]==='delete-task'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('task_search','');selected.set('due_from','');selected.set('due_through','');}if(defect==='restore-resets-filter'&&parts[4]==='restore-task')selected.set('filter','All');if(defect==='notes-reset-search'&&parts[4]==='notes')selected.set('task_search','');if(defect==='notes-reset-filters'&&parts[4]==='notes'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('due_from','');selected.set('due_through','');}
    if(defect==='move-resets-filters'&&parts[4]==='move'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('due_from','');selected.set('due_through','');}
    if(defect==='default-resets-filters'&&parts[2]==='default-priority'){selected.set('filter','All');selected.set('priority_filter','All');}
    if(defect==='edit-resets-range'&&parts[2]==='tasks'){selected.set('due_from','');selected.set('due_through','');}
    if(defect==='project-rename-resets-range'&&parts[2]==='rename'){selected.set('due_from','');selected.set('due_through','');}
    if(defect==='default-resets-range'&&parts[2]==='default-priority'){selected.set('due_from','');selected.set('due_through','');}
    if(defect==='creation-resets-range'&&parts[2]==='create-task'){selected.set('due_from','');selected.set('due_through','');}
    if(defect==='date-resets-filters'&&parts[4]==='due-date'){selected.set('filter','All');selected.set('priority_filter','All');}
    if(defect==='reset-rename-filters'&&parts[4]==='rename') {selected.set('filter','All');selected.set('priority_filter','All');}
    if(defect==='no-live-membership')selected.set('forced_id',parts[3]);
    destination=`/projects/${p.id}?${selected}`;
   }
   if(alert) {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(p?detail(p,data.get('filter')??'All',alert,data.get('priority_filter')??'All',0,rangeError?data.get('old_from')??'':data.get('due_from')??'',rangeError?data.get('old_through')??'':data.get('due_through')??'',data.get('task_search')??''):home('Active',alert));return;}
   res.writeHead(303,{Location:destination});res.end();return;
  }
  let completionFilter=url.searchParams.get('filter')??'All';
  let priorityFilter=url.searchParams.get('priority_filter')??(defect==='open-remembers-filter'?p?.rememberedPriority??'All':'All');
  if(defect==='reset-priority-on-completion'&&url.searchParams.has('filter'))priorityFilter='All';
  if(defect==='reset-completion-on-priority'&&url.searchParams.has('priority_filter'))completionFilter='All';
  let a=url.searchParams.get('due_from')??'',b=url.searchParams.get('due_through')??'';
  if(defect==='combobox-resets-range'&&url.searchParams.has('filter')&&req.method==='GET'&&parts.length===2){a='';b='';}
  if(defect==='open-remembers-range'&&!url.searchParams.has('due_from')){a=p?.rememberedFrom??'';b=p?.rememberedThrough??'';}
  if(p){p.rememberedFrom=a;p.rememberedThrough=b;}
  let query=url.searchParams.get('task_search')??'';if(defect==='filters-reset-search'&&url.searchParams.has('filter'))query='';
  if(p)p.rememberedPriority=priorityFilter;
  res.setHeader('Content-Type','text/html; charset=utf-8');const body=p?detail(p,completionFilter,'',priorityFilter,Number(url.searchParams.get('forced_id')),a,b,query):home(url.searchParams.get('filter')??'Active','',url.searchParams,url.searchParams.get('project_search')??'');res.end(body+(p&&rowDelay?`<script>const rows=[...document.querySelectorAll('[data-testid=task-row]')];const marker=document.createElement('div');if(rows.length)rows[0].before(marker);for(const row of rows)row.remove();setTimeout(()=>{for(const row of rows)marker.before(row);marker.remove();},${rowDelay});</script>`:''));
 } catch(e) {res.statusCode=500;res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
async function run(name,phase='acceptance',grep) {
 const out=evidence+'/'+name;await mkdir(out,{recursive:true});
 const env={...process.env,PLAYWRIGHT_BROWSERS_PATH:resolve('.local/browsers'),FF_STAGE:String(stage),FF_PHASE:phase,FF_FIXTURE_PREFIX:'task-'+String(stage).padStart(3,'0'),FF_BASE_URL:origin,FF_RESULT:out+'/results.json',FF_OUTPUT:out+'/artifacts'};
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
  const result=await run('positive-'+mode);results.push(result);assert.equal(result.exit,0,JSON.stringify(result));assert.equal(result.statistics.expected,58);
  const persisted=await run('sentinel-'+mode,'postrestart');results.push(persisted);assert.equal(persisted.exit,0,JSON.stringify(persisted));assert.equal(persisted.statistics.expected,1);
 }
 const faults=[['wrong-export-format','058'],['wrong-export-version','058'],['wrong-export-filename','058'],['filtered-export','058'],['export-omits-deleted','058'],['export-reversed-order','058'],['export-normalized-notes','058'],['export-foreign-tasks','058'],['export-loses-priority','058'],['export-loses-date','058'],['export-loses-completion','058'],['export-loses-deletion','058'],['export-mutates-notes','058'],['export-wrong-project-default','059'],['export-wrong-archive','059'],['archived-export-disabled','059'],['ignored-delete','054'],['restore-appends','055'],['notes-match-search','052'],['uncollapsed-search-spaces','050']];
 for(const [fault,test] of faults) {
  defect=fault;mode='form';seed();
  const result=await run('negative-'+fault,'acceptance',test+' ');results.push(result);assert.notEqual(result.exit,0,'Fixture failed to reject '+fault);assert.equal(result.statistics.unexpected,1,'Exactly one selected assertion must fail for '+fault);
 }
 await writeFile(evidence+'/verified.json',JSON.stringify({verified:true,model_calls:0,results,scope:'All58 cumulative positive checks with100ms delayed GET rows and20 declared export/retained-behavior defects. Sentinel phase is reload only, not native process restart or SQLite migration proof'},null,2)+'\n');
 console.log(JSON.stringify({verified:true,variants:results.length,model_calls:0}));
} finally {await new Promise(r=>server.close(r));}
