// PM-only synthetic browser fixture; never transfer this to builders.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('experiments/instruction-effects/revisions/research-v010');
const stage=37;
assert.ok([37].includes(stage));
const suite=root+'/preflight/task037-executed02-suite/playwright.config.mjs';
const evidence=root+'/preflight/task037-focused02-check-'+Date.now();
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let projects=[],nextId=1,mode='form',defect='none',rowDelay=100;
function seed() {
  nextId=27;
  projects=[{id:1,name:'task-005 Persistence renamed',archived:true,tasks:[{id:2,title:'Memory kept',completed:true}]},{id:3,name:'task-007 Persistence renamed',archived:true,tasks:[{id:4,title:'Memory kept',completed:true,priority:'High'}]},{id:5,name:'task-008 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:6,title:'Memory kept',completed:true,priority:'High'}]},{id:7,name:'task-009 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:8,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:9,name:'task-010 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:10,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:11,name:'task-011 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:12,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:21,name:'task-012 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:22,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:13,name:'task-012 Position first owner',archived:false,tasks:[{id:14,title:'First existing',completed:false},{id:15,title:'Position travelling',completed:false},{id:16,title:'First later',completed:false},{id:17,title:'First newly created',completed:false}]},{id:23,name:'task-013 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:24,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:18,name:'task-012 Position second owner',archived:false,tasks:[{id:19,title:'Second existing',completed:false},{id:20,title:'Second newly created',completed:false}]}];
  projects.push({id:25,name:'task-014 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:26,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]});
  projects.push({id:33,name:'task-018 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:34,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]},{id:35,name:'task-018 Import restart',archived:false,defaultPriority:'High',tasks:[{id:36,title:'Imported live',completed:false,priority:'Low',dueDate:'2044-02-29',notes:'Live import'},{id:37,title:'Imported deleted',completed:true,priority:'High',dueDate:'2042-01-01',notes:'Import Ω\nretained',deleted:true}]});
  projects.push({id:31,name:'task-017 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:32,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]});
  projects.push({id:29,name:'task-016 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:30,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]});
  projects.push({id:27,name:'task-015 Persistence renamed',archived:true,defaultPriority:'Low',tasks:[{id:28,title:'Memory kept',completed:true,priority:'High',dueDate:'2028-02-29'}]});if(defect==='wrong-upgrade-deletion')projects.find(p=>p.id===27).tasks[0].deleted=true;
  projects.push({id:1001,name:'task-012 Search Mixed first',archived:false,tasks:[]},{id:1002,name:'task-012 Search mixed last',archived:false,tasks:[]},{id:1003,name:'task-012 Search MIXED archived',archived:true,tasks:[]},{id:1004,name:'task-012 Search  double gap',archived:false,tasks:[]},{id:1005,name:'task-012 Whitespace   Saved first',archived:false,tasks:[]});nextId=1100;
  projects.push({id:1200,name:'task-032 Legacy title owner',archived:false,tasks:[{id:1201,title:defect==='title-limit-migrates-records'?'🙂'.repeat(500):'🙂'.repeat(501),completed:false,notes:'  Legacy title Ω\nkept  '}]});nextId=1300;
  for(const p of projects){p.nextTaskOrder=p.tasks.length;for(const [i,t] of p.tasks.entries())t.positionMap={[p.id]:i};}
  projects.find(p=>p.id===13).tasks.find(t=>t.id===15).positionMap={13:1,18:1};projects.find(p=>p.id===18).tasks[1].positionMap={18:2};projects.find(p=>p.id===18).nextTaskOrder=3;
}
const destinations=p=>{let rows=projects.filter(other=>(other.id!==p.id||defect==='self-destination')&&(!other.archived||defect==='archived-destination'));return defect==='reversed-destinations'?rows.toReversed():rows;};
const options=(values,current)=>values.map(v=>`<option ${v===current?'selected':''}>${v}</option>`).join('');
const submit=()=>mode!=='fetch'?'this.form.requestSubmit()':"fetch(this.form.action,{method:'POST',body:new URLSearchParams(new FormData(this.form))}).then(r=>r.text()).then(t=>document.documentElement.innerHTML=t)";
const button=(text,action,fields='',disabled=false)=>`<form method="post" action="${action}"><fieldset ${disabled?'disabled':''}>${fields}<button>${text}</button></fieldset></form>`;
const input=(label,name,value='')=>`<label>${label}<input name="${name}" value="${esc(value)}"></label>`;
const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
const nameCount=value=>defect==='name-limit-graphemes'?[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(value)].length:defect==='name-limit-normalizes-unicode'?Array.from(value.normalize('NFC')).length:defect==='name-limit-codeunits'?value.length:defect==='name-limit-bytes'?Buffer.byteLength(value):Array.from(value).length;
const titleCount=value=>defect==='title-limit-graphemes'?[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(value)].length:defect==='title-limit-normalizes-unicode'?Array.from(value.normalize('NFC')).length:defect==='title-limit-codeunits'?value.length:defect==='title-limit-bytes'?Buffer.byteLength(value):Array.from(value).length;
const dateValue=t=>t.dueDate??(defect==='wrong-date-default'?'2030-01-01':'');
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const leap=y%4===0&&(y%100!==0||y%400===0);return y>=1&&y<=9999&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];}
const defaultValue=p=>p.defaultPriority??(defect==='wrong-project-default'?'Low':'Normal');
const priorityValue=t=>t.priority??(defect==='wrong-default'?'Low':'Normal');
const searchMatch=(value,query,kind='task')=>{const fold=s=>defect==='case-sensitive-search'?s:s.replace(/[A-Z]/g,c=>c.toLowerCase());if(defect==='search-tabs-ignored'&&query.includes('\t'))return false;const q=defect==='untrimmed-search'?query:query.trim();const normal=defect==='uncollapsed-search-spaces'?s=>s:s=>s.replace(/[ \t]+/g,' ');return normal(fold(value)).includes(normal(fold(q)));};
const notesValue=t=>t.notes??(defect==='wrong-notes-default'?'Unexpected default':'');
function matches(t,filter,priorityFilter,dueFrom='',dueThrough='',query='') {
 const live=defect==='live-includes-deleted'||!t.deleted;const member=filter==='Deleted'?Boolean(t.deleted):live;const complete=member&&(filter==='Deleted'||filter==='All'||(filter==='Completed')===t.completed);
 const priority=(filter==='Deleted'&&defect==='deleted-ignores-priority')||priorityFilter==='All'||priorityValue(t)===priorityFilter;
 const date=dateValue(t);
 const dateMatch=(filter==='Deleted'&&defect==='deleted-ignores-date')||(defect==='range-includes-undated'&&!date)||(!dueFrom&&!dueThrough)||((date||defect==='range-includes-undated')&&(!dueFrom||(defect==='exclusive-range'?date>dueFrom:date>=dueFrom))&&(!dueThrough||(defect==='exclusive-range'?date<dueThrough:date<=dueThrough)));
 const search=(filter==='Deleted'&&defect==='deleted-ignores-search')||searchMatch(t.title,query)||(defect==='notes-match-search'&&query.trim()!==''&&searchMatch(notesValue(t),query));if(defect==='search-union')return search||(complete&&priority&&dateMatch);if(!search)return false;
 return defect==='range-union'?(complete&&priority||dateMatch):defect==='union-filters'?(complete||priority)&&dateMatch:complete&&priority&&dateMatch;
}
function detail(p,filter='All',alert='',priorityFilter='All',forcedId=0,dueFrom='',dueThrough='',taskQuery='',notesOverrides={},renameInput='',createTitleInput='',titleOverrides={}) {
 const disabled=p.archived?'disabled':'';
 const datesState=hidden('due_from',dueFrom)+hidden('due_through',dueThrough)+hidden('task_search',taskQuery);
 const state=hidden('filter',filter)+hidden('priority_filter',priorityFilter)+datesState;
 let rows=p.tasks.filter(t=>matches(t,filter,priorityFilter,dueFrom,dueThrough,taskQuery)||(defect==='no-live-membership'&&t.id===forcedId));
 if(defect==='reversed-order')rows=rows.toReversed();
 const filterDisabled=p.archived&&defect==='archived-filters-disabled'?'disabled':'';
 return `<h1>${esc(p.name)}</h1>${button('Download project',`/projects/${p.id}/export`,state,p.archived&&defect==='archived-export-disabled')}${button('Projects','/back',state+hidden('project_id',p.id))}${p.archived?'<p>Archived project</p>':''}${alert?`<div role="alert">${alert}</div>`:''}
 ${stage>=13?button('Search tasks',`/projects/${p.id}/task-search`,input('Task search','task_search',taskQuery)+hidden('filter',filter)+hidden('priority_filter',priorityFilter)+hidden('due_from',dueFrom)+hidden('due_through',dueThrough),p.archived&&defect==='archived-search-disabled'):''}
 ${stage>=10?button('Apply due range',`/projects/${p.id}/due-range`,input('Due from','due_from',dueFrom)+input('Due through','due_through',dueThrough)+hidden('filter',filter)+hidden('priority_filter',priorityFilter)+hidden('task_search',taskQuery)+hidden('old_from',dueFrom)+hidden('old_through',dueThrough),p.archived&&defect==='archived-range-disabled'):''}
 ${button('Rename project',`/projects/${p.id}/rename`,input('New project name','name',renameInput)+state,p.archived)}
 ${stage>=8?`<form method="post" action="/projects/${p.id}/default-priority">${state}<label>Default task priority<select name="priority" ${defect==='enabled-default-archive'?'':disabled} onchange="${submit()}">${options(['Low','Normal','High'],defaultValue(p))}</select></label></form>`:''}
 ${button('Create task',`/projects/${p.id}/create-task`,input('Task title','title',createTitleInput)+state,p.archived)}
 <form>${datesState}${hidden('priority_filter',priorityFilter)}<label>Task filter<select name="filter" ${filterDisabled} onchange="this.form.requestSubmit()">${options(['All','Open','Completed','Deleted'],filter)}</select></label></form>
 ${stage>=7?`<form>${datesState}${hidden('filter',filter)}<label>Priority filter<select name="priority_filter" ${filterDisabled} onchange="this.form.requestSubmit()">${options(['All','Low','Normal','High'],priorityFilter)}</select></label></form>`:''}
 ${rows.map(t=>`<div data-testid="task-row">${esc(t.title)}${button(t.deleted?'Restore task':'Delete task',`/projects/${p.id}/tasks/${t.id}/${t.deleted?'restore-task':'delete-task'}`,state,p.archived&&defect!=='enabled-archive-deletion')}
    <form method="post" action="/projects/${p.id}/tasks/${t.id}/complete">${state}<input type="checkbox" aria-label="Complete ${esc(t.title)}" name="completed" value="1" ${t.completed?'checked':''} ${p.archived||(t.deleted&&defect!=='enabled-deleted-controls')?'disabled':''} onchange="${submit()}"></form>
    ${stage>=15?button('Save notes',`/projects/${p.id}/tasks/${t.id}/notes`,`<label>Task notes<textarea name="notes">${esc(notesOverrides[t.id]??notesValue(t))}</textarea></label>`+state,(p.archived&&defect!=='enabled-notes-archive')||(t.deleted&&defect!=='enabled-deleted-controls')):''}
    ${stage>=9?button('Save due date',`/projects/${p.id}/tasks/${t.id}/due-date`,input('Task due date','date',dateValue(t))+state,(p.archived&&defect!=='enabled-date-archive')||(t.deleted&&defect!=='enabled-deleted-controls')):''}
    ${stage>=11?`<form method="post" action="/projects/${p.id}/tasks/${t.id}/move">${state}<fieldset ${(p.archived&&defect!=='enabled-archive-move')||(t.deleted&&defect!=='enabled-deleted-controls')||!destinations(p).length?'disabled':''}><label>Destination project<select name="destination">${destinations(p).map(other=>`<option value="${other.id}">${esc(other.name)}</option>`).join('')}</select></label><button>Move task</button></fieldset></form>`:''}
    ${button('Rename task',`/projects/${p.id}/tasks/${t.id}/rename`,input('New task title','title',titleOverrides[t.id]??'')+state,p.archived||(t.deleted&&defect!=='enabled-deleted-controls'))}
    <form method="post" action="/projects/${p.id}/tasks/${t.id}/priority">${state}<label>Task priority<select name="priority" ${(p.archived&&defect!=='enabled-archive')||(t.deleted&&defect!=='enabled-deleted-controls')?'disabled':''} onchange="${submit()}">${options(['Low','Normal','High'],priorityValue(t))}</select></label></form></div>`).join('')}`;
}
function home(filter='Active',alert='',summary,query='',importValues={}) {
 return `<h1>Workboard</h1>${button('Task directory','/directory')}${button('Import project','/import-project',`<label>Project JSON<textarea name="project_json">${esc(importValues.json??'')}</textarea></label>`+input('Imported project name','import_name',importValues.name??''))}${stage>=30?button('Import workspace','/import-workspace','<label>Workspace JSON<textarea name=workspace_json>'+esc(importValues.workspace??'')+'</textarea></label>'):''}${alert?`<div role="alert">${alert}</div>`:''}${button('Create project','/create',input('Project name','name',importValues.newName??''))}
 ${stage>=13?button('Search projects','/search-projects',input('Project search','project_search',query)+hidden('filter',filter)):''}
 <form>${hidden('project_search',query)}<label>Project filter<select name="filter" onchange="this.form.requestSubmit()">${options(['Active','Archived'],filter)}</select></label></form>
 ${projects.filter(p=>(filter==='Archived')===p.archived&&searchMatch(p.name,query,'project')).map(p=>{
    const allTasks=p.tasks.filter(t=>defect==='deleted-in-summary'||!t.deleted);const tasks=defect==='filtered-summary'&&summary&&Number(summary.get('summary_project'))===p.id?p.tasks.filter(t=>matches(t,summary.get('summary_filter'),summary.get('summary_priority'))):allTasks;
    return `<div data-testid="project-row">${esc(p.name)}<span data-testid="project-summary">${tasks.filter(t=>t.completed).length}/${tasks.length} completed</span>${button('Open project',`/projects/${p.id}/open`)}${button(p.archived?'Restore project':'Archive project',`/projects/${p.id}/${p.archived?'restore':'archive'}`)}</div>`;
 }).join('')}`;
}
function directorySearchMatch(title,query,wordMode='Phrase',kind='display'){
 if(defect==='word-ignored'||defect==='word-'+kind+'-ignored')wordMode='Phrase';
 if(defect==='word-all-is-any'&&wordMode==='All words')wordMode='Any words';if(defect==='word-any-is-all'&&wordMode==='Any words')wordMode='All words';
 const fold=s=>defect==='word-unicode-fold'?s.toLowerCase():defect==='word-case-sensitive'?s:s.replace(/[A-Z]/g,c=>c.toLowerCase());
 const normal=s=>fold(s).replace(/[ \t]+/g,' '),q=normal(query.trim()),value=normal(title);
 if(!q)return defect!=='word-empty-is-none';if(wordMode==='Phrase')return value.includes(q);
 const tokens=defect==='word-unicode-tokenize'?q.split(/\s+/):q.split(' ');
 const hit=t=>defect==='word-boundaries'?new RegExp('\\b'+t+'\\b').test(value):value.includes(t);
 if(defect==='word-repeat-count'){const counts=new Map();for(const token of tokens)counts.set(token,(counts.get(token)??0)+1);return [...counts].every(([token,n])=>value.split(token).length-1>=n);}
 return wordMode==='All words'?tokens.every(hit):tokens.some(hit);
}
function duePresenceMatch(task,status,kind='display'){
 if(defect==='due-ignored'||defect==='due-'+kind+'-ignored')return true;
 if(defect==='due-reversed')status=status==='Dated'?'Undated':status==='Undated'?'Dated':status;
 const dated=Boolean(dateValue(task));return status==='Dated'?dated:status==='Undated'?!dated:true;
}
function notesPresenceMatch(task,status,kind='display'){
 if(defect==='notes36-ignored'||defect==='notes36-'+kind+'-ignored')return true;
 if(defect==='notes36-reversed')status=status==='Empty'?'Present':status==='Present'?'Empty':status;
 const value=defect==='notes36-trims-presence'?notesValue(task).trim():notesValue(task);return status==='Empty'?value==='':status==='Present'?value!=='':true;
}
function ownerDefaultMatch(owner,selected,kind='display',task){
 if(defect==='owner37-ignored'||defect==='owner37-'+kind+'-ignored')return true;
 const value=defect==='owner37-uses-task-priority'&&task?priorityValue(task):defect==='owner37-always-normal'?'Normal':defaultValue(owner);return selected==='All'||value===selected;
}
function directoryDueSearchMatch(task,fields,query,wordMode,kind){return ownerDefaultMatch(projects.find(p=>p.tasks.includes(task)),fields.get('owner_default_filter')??'All',kind,task)&&notesPresenceMatch(task,fields.get('directory_notes_status')??'All',kind)&&duePresenceMatch(task,fields.get('directory_due_status')??'All',kind)&&directorySearchMatch(task.title,query,wordMode,kind);}
function directoryView(scope='Active',filter='All',priorityFilter='All',from='',through='',query='',alert='',ordering='Original',visibleNotes='',wordMode='Phrase',dueStatus='All',notesStatus='All',ownerFilter='All'){
 const state=(defect==='owner37-not-carried'?'':hidden('owner_default_filter',ownerFilter))+(defect==='notes36-not-carried'?'':hidden('directory_notes_status',notesStatus))+(defect==='due-not-carried'?'':hidden('directory_due_status',dueStatus))+hidden('directory_order',ordering)+hidden('project_scope',scope)+hidden('filter',filter)+hidden('priority_filter',priorityFilter)+hidden('due_from',from)+hidden('due_through',through)+hidden('directory_search',query)+(defect==='word-not-carried'?'':hidden('directory_mode',wordMode));
 const select=(label,name,values,current)=>`<form method="post" action="/directory/filters">${state}<label>${label}<select name="${name}_new" onchange="this.form.requestSubmit()">${options(values,current)}</select></label></form>`;
 const owners=projects.filter(p=>defect==='directory-ignores-scope'||(scope==='Archived')===p.archived);let entries=[];
 for(const p of owners)for(const t of p.tasks){
  const selectedFilter=defect==='directory-ignores-completion'&&filter!=='Deleted'?'All':filter;const selectedPriority=defect==='directory-ignores-priority'?'All':priorityFilter;
  const selectedFrom=defect==='directory-ignores-range'?'':from,selectedThrough=defect==='directory-ignores-range'?'':through;
  const textMatch=directorySearchMatch(t.title,query,wordMode)||((defect==='word-notes-search'||defect==='notes36-searches-notes')&&directorySearchMatch(notesValue(t),query,wordMode))||(defect==='directory-notes-search'&&searchMatch(notesValue(t),query))||(defect==='directory-owner-search'&&searchMatch(p.name,query));
  if((matches(t,selectedFilter,selectedPriority,selectedFrom,selectedThrough,'')||(defect==='directory-includes-deleted'&&t.deleted&&filter!=='Deleted'))&&textMatch&&duePresenceMatch(t,dueStatus)&&notesPresenceMatch(t,notesStatus)&&ownerDefaultMatch(p,ownerFilter,'display',t))entries.push([p,t]);
 }
 const fold=s=>defect==='order-folds-unicode'?s.toLowerCase():s.replace(/[A-Z]/g,c=>c.toLowerCase());
 const lexical=(a,b)=>{if(defect==='order-utf16')return a<b?-1:a>b?1:0;const x=Array.from(a,c=>c.codePointAt(0)),y=Array.from(b,c=>c.codePointAt(0));for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;};
 const compare=([pa,a],[pb,b])=>{let v=0;if(ordering==='Priority'&&defect!=='order-ignores-priority')v=({High:0,Normal:1,Low:2}[priorityValue(a)])-({High:0,Normal:1,Low:2}[priorityValue(b)]);if(ordering==='Due date'&&defect!=='order-ignores-date'){const x=dateValue(a),y=dateValue(b);v=x&&y?lexical(x,y):x?-1:y?1:0;if(defect==='order-undated-first'&&(!x||!y))v=-v;if(defect==='order-reverse-date'&&x&&y)v=-v;}if(ordering==='Title'&&defect!=='order-ignores-title'){let x=defect==='order-case-sensitive'?a.title:fold(a.title),y=defect==='order-case-sensitive'?b.title:fold(b.title);if(defect==='order-collapses-spaces'){x=x.replace(/[ \t]+/g,' ');y=y.replace(/[ \t]+/g,' ');}v=lexical(x,y);}if(ordering==='Project name'){const foldName=x=>defect==='name-order-case-sensitive'?x:defect==='name-order-unicode-fold'?x.toLowerCase():fold(x);let x=foldName(pa.name),y=foldName(pb.name);if(defect==='name-order-collapses-spaces'){x=x.replace(/[ \t]+/g,' ');y=y.replace(/[ \t]+/g,' ');}v=defect==='name-order-utf16'?(x<y?-1:x>y?1:0):lexical(x,y);if(defect==='name-order-ignored')v=0;if(!v&&defect==='name-order-reverse-ties')v=pb.id-pa.id;if(!v&&defect==='name-order-task-title')v=lexical(a.title,b.title);}return v||((defect==='order-reverse-ties'&&ordering!=='Original')?b.id-a.id:0);};
 if(ordering==='Project name'&&defect==='name-order-clears-positions')for(const [p,t] of entries)t.positionMap={};if(ordering!=='Original'){entries.sort(compare);if(defect==='order-by-owner')entries.sort(([a],[b])=>a.id-b.id);if(defect==='order-mutates-storage'||defect==='name-order-mutates-storage'&&ordering==='Project name')for(const owner of owners)owner.tasks.sort((a,b)=>compare([owner,a],[owner,b]));}
 const allowed=scope==='Active'&&filter!=='Deleted';let bulk=stage>=20?button('Complete visible tasks','/directory/bulk-complete',state,!(defect==='bulk-enabled-protected'||allowed&&entries.some(([p,t])=>!t.completed)))+button('Reopen visible tasks','/directory/bulk-reopen',state,!(defect==='bulk-enabled-protected'||allowed&&entries.some(([p,t])=>t.completed)))+(entries.length?'':'<p>No matching tasks</p>'):'';
 if(stage>=24)bulk+=button('Delete visible tasks','/directory/bulk-delete',state,!(defect==='bulk-delete-enabled-protected'||scope==='Active'&&filter!=='Deleted'&&entries.length>0))+button('Restore visible tasks','/directory/bulk-restore',state,!(defect==='bulk-delete-enabled-protected'||scope==='Active'&&filter==='Deleted'&&entries.length>0));
 if(stage>=25)bulk+=button('Set visible priority','/directory/bulk-priority',state+'<label>Visible tasks priority<select name=visible_priority>'+options(['Low','Normal','High'],'Normal')+'</select></label>',!(defect==='priority-enabled-protected'||scope==='Active'&&filter!=='Deleted'&&entries.length>0));
 if(stage>=26)bulk+=button('Save visible due date','/directory/bulk-date',state+input('Visible tasks due date','visible_date'),!(defect==='date-enabled-protected'||scope==='Active'&&filter!=='Deleted'&&entries.length>0));
 if(stage>=27)bulk+=button('Save visible notes','/directory/bulk-notes',state+'<label>Visible tasks notes<textarea name=visible_notes>'+esc(visibleNotes)+'</textarea></label>',!(defect==='notes-enabled-protected'||scope==='Active'&&filter!=='Deleted'&&entries.length>0));
 if(stage>=29)bulk+=button('Export matching workspace','/directory/workspace-export',state);
 if(defect==='directory-reversed-order')entries.reverse();if(defect==='directory-mutates')for(const [p,t] of entries)t.completed=true;
 let counted=entries;
 if(['summary-ignores-priority','summary-ignores-date','summary-ignores-completion','summary-ignores-search','summary-ignores-scope','summary-case-sensitive','summary-untrimmed','summary-live-includes-deleted'].includes(defect)){
  counted=[];for(const owner of projects){if(defect!=='summary-ignores-scope'&&(scope==='Archived')!==owner.archived)continue;for(const task of owner.tasks){const t=defect==='summary-live-includes-deleted'&&filter!=='Deleted'?{...task,deleted:false}:task;let textMatch=defect==='summary-ignores-search'||searchMatch(t.title,query);if(defect==='summary-case-sensitive')textMatch=t.title.includes(query.trim());if(defect==='summary-untrimmed')textMatch=t.title.replace(/[A-Z]/g,c=>c.toLowerCase()).includes(query.replace(/[A-Z]/g,c=>c.toLowerCase()));if(matches(t,defect==='summary-ignores-completion'&&filter!=='Deleted'?'All':filter,defect==='summary-ignores-priority'?'All':priorityFilter,defect==='summary-ignores-date'?'':from,defect==='summary-ignores-date'?'':through,'')&&textMatch)counted.push([owner,task]);}}
 }
 if(defect==='summary-first-owner'&&counted.length)counted=counted.filter(([p,t])=>p.id===counted[0][0].id);
 if(defect==='summary-forgets-deleted')counted=counted.filter(([p,t])=>!t.deleted);
 if(defect==='summary-mutates-completion')for(const [p,t] of counted)t.completed=true;
 let n=counted.length,k=counted.filter(([p,t])=>t.completed).length;if(defect==='summary-duplicates'){n*=2;k*=2;}if(defect==='summary-empty-stale'&&!n)k=1;
 let represented=projects.filter(owner=>entries.some(([p,t])=>p.id===owner.id));
 if(defect==='owners-reversed')represented.reverse();if(defect==='owners-alphabetical')represented.sort((a,b)=>a.name<b.name?-1:1);if(defect==='owners-task-order'||defect==='name-order-sorts-owner-list'&&ordering==='Project name')represented=[...new Map(entries.map(([p,t])=>[p.id,p])).values()];if(defect==='owners-omit-last')represented.pop();if(defect==='owners-collapse-names')represented=represented.filter((p,i)=>represented.findIndex(other=>other.name===p.name)===i);
 const ownerList=stage>=23?represented.map(owner=>{let members=entries.filter(([p,t])=>p.id===owner.id).map(([p,t])=>t);if(defect==='owners-ignore-filters')members=owner.tasks.filter(t=>!t.deleted);if(defect==='owners-include-deleted')members=owner.tasks;if(defect==='owners-mutate')for(const t of members)t.completed=true;return `<div data-testid="directory-owner-row"><span data-testid="directory-owner-name">${esc(owner.name)}</span><span data-testid="directory-owner-summary">${defect==='owners-wrong-completed'?members.length:members.filter(t=>t.completed).length}/${defect==='owners-wrong-denominator'?owner.tasks.length:members.length} completed</span>${button('Open project',`/projects/${defect==='owners-wrong-open'?projects.find(p=>p.id!==owner.id&&entries.some(([q,t])=>q.id===p.id))?.id??owner.id:owner.id}/open`)}</div>`;}).join(''):'';
 const totals=stage>=22?`<span data-testid="directory-summary">${k}/${n} completed</span>`:'';
 return `<h1>Task directory</h1>${totals}${ownerList}${bulk}${button('Projects','/back')}${alert?`<div role="alert">${alert}</div>`:''}${stage>=37?select('Project default priority','owner_default_filter',['All','Low','Normal','High'],ownerFilter):''}${stage>=36?select('Directory notes status','directory_notes_status',['All','Empty','Present'],notesStatus):''}${stage>=35?select('Directory due status','directory_due_status',['All','Dated','Undated'],dueStatus):''}${stage>=34?select('Directory search mode','directory_mode',['Phrase','All words','Any words'],wordMode):''}${select('Directory order','directory_order',['Original','Priority','Due date','Title',...(stage>=28?['Project name']:[])],ordering)}${select('Project scope','project_scope',['Active','Archived'],scope)}${select('Task filter','filter',['All','Open','Completed','Deleted'],filter)}${select('Priority filter','priority_filter',['All','Low','Normal','High'],priorityFilter)}${button('Search directory','/directory/search',state+input('Directory search','directory_search_new',query))}${button('Apply due range','/directory/due-range',state+input('Due from','due_from_new',from)+input('Due through','due_through_new',through))}${entries.map(([p,t])=>`<div data-testid="directory-task-row"><span data-testid="directory-task-title">${esc(t.title)}</span><span data-testid="directory-project-name">${esc(p.name)}</span><span data-testid="directory-task-completion">${t.completed?'Completed':'Open'}</span><span data-testid="directory-task-priority">${priorityValue(t)}</span><span data-testid="directory-task-due-date">${dateValue(t)}</span><span data-testid="directory-task-notes">${defect==='directory-raw-notes'?notesValue(t):esc(notesValue(t))}</span>${button('Open project',`/projects/${defect==='directory-wrong-owner'?projects.find(owner=>!owner.archived)?.id:p.id}/open`)}</div>`).join('')}`;
}
const taskFromImport=t=>({title:t.title,completed:t.completed,priority:t.priority,dueDate:t.dueDate,notes:t.notes?.replace(/\r\n?/g,'\n'),deleted:t.deleted});
const directoryAsyncScript=`<script>(function install(){for(const form of document.forms){if(!['/directory/filters','/directory/search','/directory/due-range','/directory/bulk-priority','/directory/bulk-date','/directory/bulk-notes'].some(path=>form.action.endsWith(path)))continue;form.onsubmit=async function(event){event.preventDefault();const ticket=window.__directoryGeneration=(window.__directoryGeneration||0)+1;const params=new URLSearchParams(new FormData(this));for(const node of document.querySelectorAll('p'))if(node.textContent==='No matching tasks')node.remove();const response=await fetch(this.action,{method:'POST',body:params}),text=await response.text();if(ticket!==window.__directoryGeneration)return;const parsed=new DOMParser().parseFromString(text,'text/html');history.replaceState(null,'',response.url);document.body.innerHTML=parsed.body.innerHTML;install();};}})();</script>`;
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health') {res.setHeader('Content-Type','application/json');res.end('{"status":"ok"}');return;}
  const parts=url.pathname.split('/').filter(Boolean);
  let p=projects.find(p=>p.id===Number(parts[1]));
  if(parts[0]==='directory'){
   const fields=new URLSearchParams(url.searchParams);let alert='';
   if(req.method==='POST'){
    let raw='';for await(const c of req)raw+=c;for(const [key,value] of new URLSearchParams(raw))fields.set(key,value);
    if(mode==='async'&&['bulk-priority','bulk-date','bulk-notes'].includes(parts[1]))await new Promise(r=>setTimeout(r,500));
    for(const key of ['project_scope','filter','priority_filter','directory_search','directory_order','directory_mode','directory_due_status','directory_notes_status','owner_default_filter'])if(fields.has(key+'_new'))fields.set(key,fields.get(key+'_new'));
    if(fields.has('owner_default_filter_new')){
 if(defect==='owner37-clears-query')fields.set('directory_search','');if(defect==='owner37-resets-controls'){fields.set('priority_filter','All');fields.set('directory_due_status','All');fields.set('directory_notes_status','All');}
 if(defect==='owner37-resets-order')fields.set('directory_order','Original');if(defect==='owner37-mutates-defaults'&&fields.get('owner_default_filter')!=='All')for(const owner of projects)owner.defaultPriority=fields.get('owner_default_filter');if(defect==='owner37-mutates-priorities'&&fields.get('owner_default_filter')!=='All')for(const owner of projects)for(const task of owner.tasks)task.priority=fields.get('owner_default_filter');
 if(defect==='owner37-clears-positions')for(const owner of projects)for(const task of owner.tasks)task.positionMap={};if(defect==='owner37-forgets-foreign')for(const owner of projects)for(const task of owner.tasks)task.positionMap={[owner.id]:task.positionMap?.[owner.id]};
}
    if(fields.has('directory_notes_status_new')){
 if(defect==='notes36-clears-query')fields.set('directory_search','');if(defect==='notes36-resets-controls'){fields.set('priority_filter','All');fields.set('directory_due_status','All');fields.set('directory_order','Original');}
 if(defect==='notes36-clears-positions')for(const owner of projects)for(const task of owner.tasks)task.positionMap={};if(defect==='notes36-forgets-foreign')for(const owner of projects)for(const task of owner.tasks)task.positionMap={[owner.id]:task.positionMap?.[owner.id]};
}
    if(fields.has('directory_due_status_new')){if(defect==='due-clears-positions')for(const owner of projects)for(const task of owner.tasks)task.positionMap={};if(defect==='due-forgets-foreign')for(const owner of projects)for(const task of owner.tasks)task.positionMap={[owner.id]:task.positionMap?.[owner.id]};if(defect==='due-mutates-date')for(const owner of projects)for(const task of owner.tasks)task.dueDate='';}
    if(fields.has('directory_mode_new')){if(defect==='word-clears-query')fields.set('directory_search','');if(defect==='word-clears-positions')for(const owner of projects)for(const task of owner.tasks)task.positionMap={};if(defect==='word-forgets-foreign')for(const owner of projects)for(const task of owner.tasks)task.positionMap={[owner.id]:task.positionMap?.[owner.id]};if(defect==='word-mutates-notes')for(const owner of projects)for(const task of owner.tasks)task.notes='';}
    if(parts[1]==='workspace-export'){
     const scope=fields.get('project_scope')??'Active',filter=fields.get('filter')??'All',priority=fields.get('priority_filter')??'All',from=fields.get('due_from')??'',through=fields.get('due_through')??'',query=fields.get('directory_search')??'';
     const owners=[];for(const owner of projects){if(defect!=='workspace-export-ignores-scope'&&(scope==='Archived')!==owner.archived)continue;let tasks=owner.tasks.filter(task=>matches(task,defect==='workspace-export-ignores-completion'?'All':filter,defect==='workspace-export-ignores-priority'?'All':priority,defect==='workspace-export-ignores-date'?'':from,defect==='workspace-export-ignores-date'?'':through,'')&&directoryDueSearchMatch(task,fields,defect==='workspace-export-ignores-search'?'':query,fields.get('directory_mode')??'Phrase',parts[1]));if(!tasks.length)continue;
      if(defect==='workspace-export-global-order')tasks=tasks.toSorted((a,b)=>a.title<b.title?-1:a.title>b.title?1:0);const snapshot={name:owner.name,archived:owner.archived,defaultPriority:defaultValue(owner),tasks:tasks.map(t=>({title:t.title,completed:t.completed,priority:priorityValue(t),dueDate:dateValue(t),notes:defect==='workspace-export-trims-notes'?notesValue(t).trim():notesValue(t).replace(/\r\n?/g,'\n'),deleted:Boolean(t.deleted)}))};
      if(defect==='workspace-export-ids'){snapshot.id=owner.id;for(const [i,t] of snapshot.tasks.entries())t.id=tasks[i].id;}if(defect==='workspace-export-mutates-notes')for(const t of tasks)t.notes='';owners.push(snapshot);
     }
     if(defect==='workspace-export-reverses-owners')owners.reverse();if(defect==='workspace-export-collapse-names')for(let i=owners.length-1;i>=0;i--)if(owners.findIndex(p=>p.name===owners[i].name)!==i)owners.splice(i,1);
     const doc={format:defect==='workspace-export-wrong-format'?'other':'workboard-workspace',version:defect==='workspace-export-wrong-version'?2:1,projects:owners};res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="'+(defect==='workspace-export-wrong-filename'?'wrong.json':'workboard-workspace.json')+'"');res.end(JSON.stringify(doc));return;
    }
    if(parts[1]==='due-range'){
     const from=(fields.get('due_from_new')??'').trim(),through=(fields.get('due_through_new')??'').trim();
     if((from&&!validDate(from))||(through&&!validDate(through)))alert='Due range must use valid YYYY-MM-DD dates';else if(from&&through&&from>through)alert='Due from must not be after Due through';
     if(defect==='directory-allows-invalid-range')alert='';if(!alert){fields.set('due_from',from);fields.set('due_through',through);}
    }
    if(parts[1]==='bulk-notes'){
     const scope=fields.get('project_scope')??'Active',filter=fields.get('filter')??'All',priority=fields.get('priority_filter')??'All',from=fields.get('due_from')??'',through=fields.get('due_through')??'',query=fields.get('directory_search')??'',raw=fields.get('visible_notes')??'',value=raw.replace(/\r\n?/g,'\n');
     if((defect==='bulk-notes-utf16-limit'?value.length:Array.from(value).length)>10000&&defect!=='bulk-notes-no-limit')alert='Task notes must be at most 10000 characters';
     if(!alert&&scope==='Active'&&filter!=='Deleted')for(const owner of projects)for(const task of owner.tasks){
      const selected=!owner.archived&&!task.deleted&&matches(task,defect==='notes-ignores-completion'?'All':filter,defect==='notes-ignores-priority'?'All':priority,defect==='notes-ignores-date'?'':from,defect==='notes-ignores-date'?'':through,'')&&directoryDueSearchMatch(task,fields,defect==='notes-ignores-search'?'':query,fields.get('directory_mode')??'Phrase',parts[1]);
      if(selected){if(defect!=='bulk-notes-ignored'&&!(defect==='bulk-notes-clear-ignored'&&!value))task.notes=(defect==='bulk-notes-trimmed'||defect==='notes36-trims-write')?value.trim():defect==='bulk-notes-flattened'?value.replace(/\n/g,' '):defect==='bulk-notes-loses-unicode'?value.replace(/[^\x00-\x7f]/g,''):value;if((defect==='bulk-notes-clears-priority'||defect==='notes36-clears-priority'))task.priority='Normal';if((defect==='bulk-notes-clears-date'||defect==='notes36-clears-date'))task.dueDate='';if((defect==='bulk-notes-flips-completion'||defect==='notes36-flips-completion'))task.completed=!task.completed;if(defect==='bulk-notes-clears-positions')task.positionMap={};if(defect==='bulk-notes-forgets-foreign')task.positionMap={[owner.id]:task.positionMap?.[owner.id]};if(defect==='bulk-notes-forgets-own'){const map={...task.positionMap};delete map[owner.id];task.positionMap=map;}}
     }
     if(defect==='bulk-notes-reorders')for(const owner of projects)owner.tasks.reverse();
     if(defect==='bulk-notes-resets-controls'){fields.set('filter','All');fields.set('priority_filter','All');fields.set('due_from','');fields.set('due_through','');fields.set('directory_search','');}
     if(defect==='bulk-notes-resets-order')fields.set('directory_order','Original');
     if(alert&&defect==='bulk-notes-loses-rejected-input')fields.set('visible_notes','');
     if(!alert)fields.delete('visible_notes');
    }
    if(parts[1]==='bulk-date'){
     const scope=fields.get('project_scope')??'Active',filter=fields.get('filter')??'All',priority=fields.get('priority_filter')??'All',from=fields.get('due_from')??'',through=fields.get('due_through')??'',query=fields.get('directory_search')??'',value=(fields.get('visible_date')??'').trim();
     if(value&&!validDate(value)&&defect!=='bulk-date-invalid-allowed')alert='Due date must use valid YYYY-MM-DD';
     if(!alert&&scope==='Active'&&filter!=='Deleted')for(const owner of projects)for(const task of owner.tasks){
      const selected=!owner.archived&&!task.deleted&&matches(task,defect==='date-ignores-completion'?'All':filter,defect==='date-ignores-priority'?'All':priority,defect==='date-ignores-date'?'':from,defect==='date-ignores-date'?'':through,'')&&directoryDueSearchMatch(task,fields,defect==='date-ignores-search'?'':query,fields.get('directory_mode')??'Phrase',parts[1]);
      if(selected){if(defect!=='bulk-date-ignored'&&!(defect==='bulk-date-clear-ignored'&&!value))task.dueDate=value;if(defect==='bulk-date-clears-priority')task.priority='Normal';if(defect==='bulk-date-clears-notes')task.notes='';if(defect==='bulk-date-flips-completion')task.completed=!task.completed;if(defect==='bulk-date-clears-positions')task.positionMap={};if(defect==='bulk-date-forgets-foreign')task.positionMap={[owner.id]:task.positionMap?.[owner.id]};if(defect==='bulk-date-forgets-own'){const map={...task.positionMap};delete map[owner.id];task.positionMap=map;}}
     }
     if(defect==='bulk-date-reorders')for(const owner of projects)owner.tasks.reverse();
     if(defect==='bulk-date-resets-controls'){fields.set('filter','All');fields.set('priority_filter','All');fields.set('due_from','');fields.set('due_through','');fields.set('directory_search','');}
     if(defect==='bulk-date-resets-order')fields.set('directory_order','Original');
    }
    if(parts[1]==='bulk-priority'){
     const scope=fields.get('project_scope')??'Active',filter=fields.get('filter')??'All',priority=fields.get('priority_filter')??'All',from=fields.get('due_from')??'',through=fields.get('due_through')??'',query=fields.get('directory_search')??'',value=fields.get('visible_priority');
     if(scope==='Active'&&filter!=='Deleted'&&['Low','Normal','High'].includes(value))for(const owner of projects)for(const task of owner.tasks){
      const selected=!owner.archived&&!task.deleted&&matches(task,defect==='priority-ignores-completion'?'All':filter,defect==='priority-ignores-priority'?'All':priority,defect==='priority-ignores-date'?'':from,defect==='priority-ignores-date'?'':through,'')&&directoryDueSearchMatch(task,fields,defect==='priority-ignores-search'?'':query,fields.get('directory_mode')??'Phrase',parts[1]);
      if(selected){if(defect!=='priority-ignored')task.priority=value;if(defect==='owner37-priority-modifies-default')owner.defaultPriority=value;if(defect==='priority-clears-date')task.dueDate='';if(defect==='priority-clears-notes')task.notes='';if(defect==='priority-flips-completion')task.completed=!task.completed;if(defect==='priority-clears-positions')task.positionMap={};if(defect==='priority-forgets-foreign')task.positionMap={[owner.id]:task.positionMap?.[owner.id]};if(defect==='priority-forgets-own'){const map={...task.positionMap};delete map[owner.id];task.positionMap=map;}if(defect==='priority-collapses-owners'){const first=projects.find(p=>p.name===owner.name);if(first!==owner){owner.tasks=owner.tasks.filter(t=>t!==task);first.tasks.push(task);}}}
     }
     if(defect==='priority-reorders')for(const owner of projects)owner.tasks.reverse();
     if(defect==='priority-resets-controls'){fields.set('filter','All');fields.set('priority_filter','All');fields.set('due_from','');fields.set('due_through','');fields.set('directory_search','');}
     if(defect==='priority-resets-order')fields.set('directory_order','Original');
    }
    if(parts[1]==='bulk-delete'||parts[1]==='bulk-restore'){
     const restoring=parts[1]==='bulk-restore',scope=fields.get('project_scope')??'Active',filter=fields.get('filter')??'All',priority=fields.get('priority_filter')??'All',from=fields.get('due_from')??'',through=fields.get('due_through')??'',query=fields.get('directory_search')??'';
     if(scope==='Active'&&(restoring?filter==='Deleted':filter!=='Deleted'))for(const owner of projects)for(const task of [...owner.tasks]){
      const selectedPriority=defect===(restoring?'restore-ignores-priority':'delete-ignores-priority')?'All':priority;
      const selectedFrom=defect===(restoring?'restore-ignores-date':'delete-ignores-date')?'':from,selectedThrough=defect===(restoring?'restore-ignores-date':'delete-ignores-date')?'':through;
      const selectedFilter=defect==='delete-ignores-completion'&&!restoring?'All':filter;
      const selectedQuery=defect===(restoring?'restore-ignores-search':'delete-ignores-search')?'':query;
      if((defect==='delete-includes-archived'||!owner.archived)&&Boolean(task.deleted)===restoring&&matches(task,selectedFilter,selectedPriority,selectedFrom,selectedThrough,'')&&directoryDueSearchMatch(task,fields,selectedQuery,fields.get('directory_mode')??'Phrase',parts[1])){
       if(defect!=='bulk-delete-ignored')task.deleted=!restoring;
       if(defect==='delete-clears-positions'&&!restoring||defect==='restore-clears-positions'&&restoring)task.positionMap={};
       if(defect==='bulk-deletion-forgets-foreign-positions')task.positionMap={[owner.id]:task.positionMap?.[owner.id]};
       if(defect==='bulk-deletion-forgets-own-position'){const kept={...task.positionMap};delete kept[owner.id];task.positionMap=kept;}
       if(defect==='bulk-delete-clears-priority')task.priority='Normal';if(defect==='bulk-delete-clears-date')task.dueDate='';if(defect==='bulk-delete-clears-notes')task.notes='';if(defect==='bulk-delete-flips-completion')task.completed=!task.completed;
       if(defect==='restore-collapses-owners'&&restoring){const first=projects.find(p=>p.name===owner.name);if(first!==owner){owner.tasks=owner.tasks.filter(t=>t!==task);first.tasks.push(task);}}
      }
     }
     if(defect==='bulk-delete-reorders')for(const owner of projects)owner.tasks.reverse();
     if(defect==='bulk-delete-resets-controls'){fields.set('filter','All');fields.set('priority_filter','All');fields.set('due_from','');fields.set('due_through','');fields.set('directory_search','');}
     if(defect==='restore-resets-order'&&restoring)fields.set('directory_order','Original');
    }
    if(parts[1]==='bulk-complete'||parts[1]==='bulk-reopen'){
     const completed=parts[1]==='bulk-complete',scope=fields.get('project_scope')??'Active',filter=fields.get('filter')??'All',priority=fields.get('priority_filter')??'All',from=fields.get('due_from')??'',through=fields.get('due_through')??'',query=fields.get('directory_search')??'';
     if(scope==='Active'&&filter!=='Deleted')for(const owner of projects)for(const task of owner.tasks){
      const selected=(defect==='bulk-includes-archived'||!owner.archived)&&(defect==='bulk-includes-deleted'||!task.deleted)&&(defect==='bulk-overapplies'||matches(defect==='bulk-includes-deleted'?{...task,deleted:false}:task,filter,priority,from,through,'')&&directoryDueSearchMatch(task,fields,query,fields.get('directory_mode')??'Phrase',parts[1]));
      if(selected){if(defect!=='bulk-ignored')task.completed=completed;if(defect==='bulk-clears-notes')task.notes='';if(defect==='bulk-clears-date')task.dueDate='';if(defect==='bulk-resets-priority')task.priority='Normal';if(defect==='bulk-clears-positions')task.positionMap={};}
     }
     if(defect==='bulk-reorders')for(const owner of projects)owner.tasks.reverse();
     if(defect==='bulk-resets-filters'){fields.set('filter','All');fields.set('priority_filter','All');fields.set('due_from','');fields.set('due_through','');fields.set('directory_search','');}
    }
    if(defect==='directory-resets-filters'&&parts[1]==='filters'){fields.set('filter','All');fields.set('priority_filter','All');fields.set('due_from','');fields.set('due_through','');fields.set('directory_search','');}
    if(defect==='order-resets-controls'&&fields.has('directory_order_new')){fields.set('filter','All');fields.set('priority_filter','All');fields.set('due_from','');fields.set('due_through','');fields.set('directory_search','');}
    if(defect==='order-filter-reset'&&parts[1]==='filters'&&!fields.has('directory_order_new')||defect==='order-search-reset'&&parts[1]==='search'||defect==='order-range-reset'&&parts[1]==='due-range'||defect==='order-bulk-reset'&&parts[1]?.startsWith('bulk-'))fields.set('directory_order','Original');
    if(!alert){res.writeHead(303,{Location:'/directory?'+fields});res.end();return;}
   }
   const scope=fields.get('project_scope')??'Active',filter=fields.get('filter')??'All',priority=fields.get('priority_filter')??'All',from=fields.get('due_from')??'',through=fields.get('due_through')??'',query=fields.get('directory_search')??'';
   if(mode==='async')await new Promise(r=>setTimeout(r,req.headers['x-pm-delayed-read']==='yes'?500:100));res.setHeader('Content-Type','text/html; charset=utf-8');const body=directoryView(scope,filter,priority,from,through,query,alert,fields.get('directory_order')??'Original',fields.get('visible_notes')??'',fields.get('directory_mode')??'Phrase',fields.get('directory_due_status')??'All',fields.get('directory_notes_status')??'All',fields.get('owner_default_filter')??'All');res.end(body+(mode==='async'?directoryAsyncScript:'')+(mode==='async'?'':`<script>const rows=[...document.querySelectorAll('[data-testid=directory-task-row]')];const marker=document.createElement('div');if(rows.length)rows[0].before(marker);for(const row of rows)row.remove();setTimeout(()=>{for(const row of rows)marker.before(row);marker.remove();},${rowDelay});</script>`));return;
  }
  if(p&&parts[2]==='export'){if(req.method==='POST'){let raw='';for await(const c of req)raw+=c;for(const [key,value] of new URLSearchParams(raw))url.searchParams.set(key,value);}
   const listed=defect==='filtered-export'?p.tasks.filter(t=>matches(t,url.searchParams.get('filter')??'All',url.searchParams.get('priority_filter')??'All',url.searchParams.get('due_from')??'',url.searchParams.get('due_through')??'',url.searchParams.get('task_search')??'')):defect==='export-omits-deleted'?p.tasks.filter(t=>!t.deleted):p.tasks;
   const exported={format:defect==='wrong-export-format'?'other':'workboard-project',version:defect==='wrong-export-version'?2:1,project:{name:p.name,archived:p.archived,defaultPriority:defaultValue(p),tasks:(defect==='export-reversed-order'?listed.toReversed():listed).map(t=>({title:t.title,completed:t.completed,priority:priorityValue(t),dueDate:dateValue(t),notes:defect==='export-crlf-notes'?notesValue(t):defect==='export-trimmed-notes'?notesValue(t).replace(/\r\n?/g,'\n').trim():notesValue(t).replace(/\r\n?/g,'\n'),deleted:Boolean(t.deleted)}))}};
   if(defect==='export-foreign-tasks')exported.project.tasks.push({title:'Must not export'});if(defect==='export-loses-priority')for(const t of exported.project.tasks)t.priority='Normal';if(defect==='export-loses-date')for(const t of exported.project.tasks)t.dueDate='';if(defect==='export-loses-completion')for(const t of exported.project.tasks)t.completed=false;if(defect==='export-loses-deletion')for(const t of exported.project.tasks)t.deleted=false;if(defect==='export-wrong-project-default')exported.project.defaultPriority='High';if(defect==='export-wrong-archive')exported.project.archived=false;
   if(defect==='export-mutates-notes')for(const t of p.tasks)t.notes='';res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="'+(defect==='wrong-export-filename'?'wrong.json':'workboard-project.json')+'"');res.end(JSON.stringify(exported));return;
  }
  let notesOverrides={},titleOverrides={};let rangeError=false;let alert='',destination=p?`/projects/${p.id}`:'/';
  if(req.method==='POST') {
   let raw='';for await(const c of req) raw+=c;
   const data=new URLSearchParams(raw);
   await new Promise(r=>setTimeout(r,60));
   if(parts[0]==='import-workspace'){
    const raw=data.get('workspace_json')??'';let doc=null;try{doc=JSON.parse(raw);}catch{}
    const validTask=t=>t&&typeof t==='object'&&!Array.isArray(t)&&typeof t.title==='string'&&t.title.trim()&&(defect==='title-limit-workspace-import-ignored'||titleCount(t.title.trim())<=500)&&typeof t.completed==='boolean'&&['Low','Normal','High'].includes(t.priority)&&typeof t.dueDate==='string'&&(!t.dueDate||validDate(t.dueDate))&&typeof t.notes==='string'&&(defect==='workspace-import-no-limit'||Array.from(t.notes.replace(/\r\n?/g,'\n')).length<=10000)&&typeof t.deleted==='boolean';
    const validOwner=p=>p&&typeof p==='object'&&!Array.isArray(p)&&typeof p.name==='string'&&p.name.trim()&&(defect==='name-limit-workspace-ignored'||nameCount(p.name.trim())<=200)&&typeof p.archived==='boolean'&&['Low','Normal','High'].includes(p.defaultPriority)&&Array.isArray(p.tasks)&&p.tasks.every(validTask);
    const valid=doc&&typeof doc==='object'&&!Array.isArray(doc)&&doc.format==='workboard-workspace'&&doc.version===1&&Array.isArray(doc.projects)&&doc.projects.every(validOwner);
    if(!valid){if(defect==='workspace-import-partial-before-error'&&Array.isArray(doc?.projects)&&validOwner(doc.projects[0])){const p=doc.projects[0],id=nextId++;projects.push({id,name:p.name.trim(),archived:p.archived,defaultPriority:p.defaultPriority,tasks:p.tasks.map((t,i)=>({...taskFromImport(t),title:t.title.trim(),id:nextId++,positionMap:{[id]:i}})),nextTaskOrder:p.tasks.length});}
     res.setHeader('Content-Type','text/html; charset=utf-8');res.end(home('Active','Invalid workspace JSON',undefined,'',{workspace:defect==='workspace-import-loses-rejected-input'?'':raw}));return;
    }
    for(const source of (defect==='workspace-import-reverse-owners'?doc.projects.toReversed():doc.projects)){
     const id=nextId++,name=defect==='workspace-import-untrimmed-name'?source.name:source.name.trim(),imported={id,name,archived:defect==='workspace-import-drops-archive'?false:source.archived,defaultPriority:defect==='workspace-import-wrong-default'?'Normal':source.defaultPriority,tasks:source.tasks.map((t,i)=>({...taskFromImport(t),title:defect==='workspace-import-untrimmed-title'?t.title:t.title.trim(),id:nextId++,positionMap:{[id]:i}})),nextTaskOrder:source.tasks.length};
     if(defect==='workspace-import-collapse-names'){const old=projects.find(p=>p.name===name);if(old){old.tasks.push(...imported.tasks);continue;}}
     if(defect==='workspace-import-overwrites-existing'){const old=projects.find(p=>p.name===name);if(old){Object.assign(old,imported);continue;}}
     if(defect==='workspace-import-reverses-tasks')imported.tasks.reverse();for(const t of imported.tasks){if(defect==='workspace-import-loses-deletion')t.deleted=false;if(defect==='workspace-import-loses-completion')t.completed=false;if(defect==='workspace-import-loses-priority')t.priority='Normal';if(defect==='workspace-import-loses-date')t.dueDate='';if(defect==='workspace-import-trims-notes')t.notes=t.notes.trim();if(defect==='workspace-import-restore-appends')t.positionMap={};}
     projects.push(imported);
    }
    res.writeHead(303,{Location:'/'});res.end();return;
   }
   if(parts[0]==='import-project'){
    const raw=data.get('project_json')??'',name=data.get('import_name')??'';let doc=null;
    try{doc=JSON.parse(raw);}catch{}
    const requiredTask=t=>t&&typeof t==='object'&&!Array.isArray(t)&&typeof t.title==='string'&&t.title.trim()&&(defect==='title-limit-project-import-ignored'||titleCount(t.title.trim())<=500)&&typeof t.completed==='boolean'&&['Low','Normal','High'].includes(t.priority)&&typeof t.dueDate==='string'&&(!t.dueDate||validDate(t.dueDate))&&typeof t.notes==='string'&&typeof t.deleted==='boolean';
    if(defect==='import-defaults-missing-fields'&&Array.isArray(doc?.project?.tasks))for(const t of doc.project.tasks)if(t&&typeof t==='object')for(const [key,value] of Object.entries({completed:false,priority:'Normal',dueDate:'',notes:'',deleted:false}))if(!(key in t))t[key]=value;
    const owner=doc?.project;let valid=doc&&typeof doc==='object'&&!Array.isArray(doc)&&doc.format==='workboard-project'&&doc.version===1&&owner&&typeof owner==='object'&&!Array.isArray(owner)&&typeof owner.name==='string'&&owner.name.trim()&&(defect==='name-limit-source-ignored'||nameCount(owner.name.trim())<=200)&&typeof owner.archived==='boolean'&&['Low','Normal','High'].includes(owner.defaultPriority)&&Array.isArray(owner.tasks)&&owner.tasks.every(requiredTask);
    if(defect==='import-allows-boolean-version'&&doc?.version===true){doc.version=1;valid=owner&&Array.isArray(owner.tasks)&&owner.tasks.every(requiredTask);}
    if(!name.trim()||!valid||(defect!=='name-limit-override-ignored'&&nameCount(name.trim())>200)){
     if(defect==='invalid-import-creates-project')projects.push({id:nextId++,name:name.trim()||'Ghost import',archived:false,tasks:[]});
     if(defect==='invalid-import-mutates-existing'){const old=projects.find(p=>p.name.endsWith('guard existing'));if(old)old.tasks=[];}
     if(defect==='late-invalid-partial-import'&&owner?.tasks?.length)projects.push({id:nextId++,name:name.trim(),archived:false,tasks:[{...taskFromImport(owner.tasks[0]),id:nextId++}]});
     res.setHeader('Content-Type','text/html; charset=utf-8');res.end(home('Active',!name.trim()?'Project name is required':'Invalid project JSON',undefined,'',defect==='import-clears-rejected-inputs'?{}:{json:raw,name}));return;
    }
    const newId=defect==='import-uses-supplied-ids'&&Number.isInteger(owner.id)?owner.id:nextId++;
    const imported={id:newId,name:name.trim(),archived:defect==='import-drops-archive'?false:owner.archived,defaultPriority:defect==='import-wrong-default'?'Normal':owner.defaultPriority,tasks:owner.tasks.map((t,index)=>({...taskFromImport(t),id:nextId++,positionMap:{[newId]:index}})),nextTaskOrder:owner.tasks.length};
    if(defect==='import-reversed-order')imported.tasks.reverse();if(defect==='import-loses-deletion')for(const t of imported.tasks)t.deleted=false;if(defect==='import-loses-completion')for(const t of imported.tasks)t.completed=false;if(defect==='import-loses-priority')for(const t of imported.tasks)t.priority='Normal';if(defect==='import-loses-date')for(const t of imported.tasks)t.dueDate='';if(defect==='import-trims-notes')for(const t of imported.tasks)t.notes=t.notes.trim();if(defect==='import-append-restoration')for(const t of imported.tasks)t.positionMap={};
    if(defect==='import-reuses-source'){const old=projects.find(p=>p.name===owner.name);if(old){old.name=imported.name;old.tasks=imported.tasks;old.defaultPriority=imported.defaultPriority;destination='/projects/'+old.id;res.writeHead(303,{Location:destination});res.end();return;}}
    projects.push(imported);res.writeHead(303,{Location:'/projects/'+newId});res.end();return;
   }
   if(parts[0]==='search-projects'){if(defect==='normalized-stored-projects')for(const owner of projects)owner.name=owner.name.replace(/[ \t]+/g,' ');destination='/?'+new URLSearchParams({filter:data.get('filter')??'Active',project_search:(defect==='untrimmed-search'?(data.get('project_search')??''):(data.get('project_search')??'').trim())});}
   else if(parts[0]==='create') {
    const name=(data.get('name')??'').trim();
    if(!name)alert='Project name is required';else if(nameCount(name)>200&&defect!=='name-limit-create-ignored')alert='Project name must be at most 200 characters';else projects.push({id:nextId++,name,archived:false,tasks:[]});destination='/';
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
    if((defect==='rename-resets-search'||defect==='title-limit-resets-query')&&parts[4]==='rename')selected.set('task_search','');
    if(defect==='delete-resets-filters'&&parts[4]==='delete-task'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('task_search','');selected.set('due_from','');selected.set('due_through','');}if(defect==='restore-resets-filter'&&parts[4]==='restore-task')selected.set('filter','All');if(defect==='notes-reset-search'&&parts[4]==='notes')selected.set('task_search','');if(defect==='notes-reset-filters'&&parts[4]==='notes'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('due_from','');selected.set('due_through','');}
    if(defect==='move-resets-filters'&&parts[4]==='move'){selected.set('filter','All');selected.set('priority_filter','All');selected.set('due_from','');selected.set('due_through','');}
    if(defect==='default-resets-filters'){selected.set('filter','All');selected.set('priority_filter','All');}
     destination=`/projects/${p.id}?${selected}`;
    }
    else if(action==='rename'&&!p.archived) {
     const name=(data.get('name')??'').trim();if(!name)alert='Project name is required';else if(nameCount(name)>200&&defect!=='name-limit-rename-ignored'){alert='Project name must be at most 200 characters';if(defect==='name-limit-rename-mutates')p.name=name;}else{p.name=name;if(defect==='rename-default-reset')p.defaultPriority='Normal';}
    } else if(action==='create-task'&&!p.archived) {
     const title=(data.get('title')??'').trim();
     if(title&&titleCount(title)>500&&defect!=='title-limit-create-ignored')alert='Task title must be at most 500 characters';else if(title){p.nextTaskOrder??=p.tasks.length;const created={id:nextId++,title,completed:false,priority:defect==='ignored-default'?'Normal':defaultValue(p),positionMap:{[p.id]:p.nextTaskOrder++}};created.fieldSnapshots={[p.id]:{completed:false,priority:created.priority,dueDate:''}};p.tasks.push(created);}else alert='Task title is required';
    } else if(action==='tasks'&&!p.archived) {
     const t=p.tasks.find(t=>t.id===Number(parts[3]));
     if(t&&parts[4]==='delete-task'&&defect!=='ignored-delete'){t.deleted=true;if(defect==='deletion-loses-notes')t.notes='';if(defect==='deletion-loses-priority')t.priority='Normal';if(defect==='deletion-loses-date')t.dueDate='';if(defect==='deletion-changes-completion')t.completed=!t.completed;}
     if(t&&parts[4]==='restore-task'&&defect!=='ignored-restore'){t.deleted=false;if(defect==='restore-inherits-default')t.priority=defaultValue(p);if(defect==='restore-changes-completion')t.completed=!t.completed;if(defect==='restore-loses-notes')t.notes='';if(defect==='restore-loses-date')t.dueDate='';if(defect==='restore-appends'){p.tasks=p.tasks.filter(other=>other!==t);p.tasks.push(t);}if(defect==='restore-clears-position-map')t.positionMap={};}
     if(t&&parts[4]==='notes'&&defect!=='ignored-notes'){
      const value=(data.get('notes')??'').replace(/\r\n?/g,'\n');const count=defect==='notes-limit-graphemes'?[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(value)].length:defect==='notes-limit-normalizes-unicode'?Array.from(value.normalize('NFC')).length:defect==='notes-limit-codeunits'?value.length:defect==='notes-limit-bytes'?Buffer.byteLength(value):Array.from(value).length;
      if(count>10000&&defect!=='notes-limit-ignored'){
       alert='Task notes must be at most 10000 characters';if(defect!=='notes-limit-loses-input')notesOverrides[t.id]=value;
       if(defect==='notes-limit-truncates')t.notes=Array.from(value).slice(0,10000).join('');
       if(defect==='notes-limit-changes-fields'){t.priority='Normal';t.completed=false;t.dueDate='';}
       if(defect==='notes-limit-clears-positions')t.positionMap={};
      }else{
       t.notes=defect==='trimmed-notes'?value.trim():defect==='flattened-notes'?value.replace(/\n/g,' '):value;
       if(defect==='global-notes')for(const other of p.tasks)other.notes=t.notes;
      }
     }
     if(t&&parts[4]==='complete') t.completed=data.get('completed')==='1';
     if(t&&parts[4]==='rename') {
      const title=(data.get('title')??'').trim();if(title&&titleCount(title)>500&&defect!=='title-limit-rename-ignored'){alert='Task title must be at most 500 characters';if(defect!=='title-limit-loses-input')titleOverrides[t.id]=data.get('title')??'';if(defect==='title-limit-rename-mutates')t.title=title;if(defect==='title-limit-clears-fields'){t.priority='Normal';t.completed=false;t.dueDate='';t.notes='';}if(defect==='title-limit-clears-positions')t.positionMap={};}else if(title)t.title=title;else alert='Task title is required';
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
    if((defect==='rename-resets-search'||defect==='title-limit-resets-query')&&parts[4]==='rename')selected.set('task_search','');
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
   if(alert) {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(p?detail(p,data.get('filter')??'All',alert,data.get('priority_filter')??'All',0,rangeError?data.get('old_from')??'':data.get('due_from')??'',rangeError?data.get('old_through')??'':data.get('due_through')??'',data.get('task_search')??'',notesOverrides,defect==='name-limit-loses-input'?'':data.get('name')??'',defect==='title-limit-loses-input'?'':data.get('title')??'',titleOverrides):home('Active',alert,undefined,'',{newName:defect==='name-limit-loses-input'?'':data.get('name')??''}));return;}
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
  if(mode==='async')await new Promise(r=>setTimeout(r,req.headers['x-pm-delayed-read']==='yes'?500:100));
  res.setHeader('Content-Type','text/html; charset=utf-8');const body=p?detail(p,completionFilter,'',priorityFilter,Number(url.searchParams.get('forced_id')),a,b,query):home(url.searchParams.get('filter')??'Active','',url.searchParams,url.searchParams.get('project_search')??'');res.end(body+(mode==='async'?"<script>(function installSearchReads(){let generation=0;async function replaceBody(reply,ticket){const text=await reply.text();if(ticket!==generation)return;history.replaceState(null,'',reply.url);const parsed=new DOMParser().parseFromString(text,'text/html');document.body.innerHTML=parsed.body.innerHTML;for(const node of [...document.body.querySelectorAll('script')])new Function(node.textContent)();}for(const form of document.forms){if(form.action.includes('/task-search')||form.action.includes('/search-projects'))form.onsubmit=async function(event){event.preventDefault();const ticket=++generation;const reply=await fetch(this.action,{method:'POST',headers:{'x-pm-delayed-read':'yes'},body:new URLSearchParams(new FormData(this))});await replaceBody(reply,ticket);};}if(location.pathname==='/')for(const select of document.querySelectorAll('select[name=filter]'))select.onchange=async function(){const ticket=++generation;const q=new URLSearchParams(new FormData(this.form));await replaceBody(await fetch('/?'+q,{headers:{'x-pm-delayed-read':'yes'}}),ticket);};})();</script>":'')+(mode==='async'&&p?"<script>\n(function install(){\n let generation=0;\n function parameters(form){const q=new URLSearchParams(new FormData(form));for(const select of document.querySelectorAll('select[name=filter],select[name=priority_filter]'))q.set(select.name,select.value);return q;}\n async function redraw(q){const ticket=++generation;history.replaceState(null,\"\",location.pathname+\"?\"+q);for(const [name,value] of q){for(const input of document.querySelectorAll('input[type=hidden]'))if(input.name===name)input.value=value;}\n const reply=await fetch(location.pathname+'?'+q,{headers:{'x-pm-delayed-read':'yes'}});const parsed=new DOMParser().parseFromString(await reply.text(),'text/html');if(ticket!==generation)return;\n const previous=[...document.querySelectorAll('[data-testid=task-row]')];const fresh=[...parsed.querySelectorAll('[data-testid=task-row]')];const marker=document.createElement('div');if(previous.length)previous[0].before(marker);else document.body.append(marker);for(const row of previous)row.remove();for(const row of fresh)marker.before(row);marker.remove();}\n for(const select of document.querySelectorAll('select[name=filter],select[name=priority_filter]'))select.onchange=function(){redraw(parameters(this.form));};\n for(const form of document.forms)if(form.action.includes('/due-range'))form.onsubmit=function(event){event.preventDefault();const q=parameters(this);const a=q.get('due_from'),b=q.get('due_through');const valid=s=>{if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number),leap=y%4===0&&(y%100!==0||y%400===0);return y>=1&&y<=9999&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];};if(a&&!valid(a)||b&&!valid(b)||a&&b&&a>b){this.submit();return;}q.set('old_from',a);q.set('old_through',b);redraw(q);};\n})();\n</script>":'')+(p&&rowDelay&&mode!=='async'?`<script>const rows=[...document.querySelectorAll('[data-testid=task-row]')];const marker=document.createElement('div');if(rows.length)rows[0].before(marker);for(const row of rows)row.remove();setTimeout(()=>{for(const row of rows)marker.before(row);marker.remove();},${rowDelay});</script>`:''));
 } catch(e) {res.statusCode=500;res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
async function run(name,phase='acceptance',grep) {
 const out=evidence+'/'+name;await mkdir(out,{recursive:false});
 const env={...process.env,PLAYWRIGHT_BROWSERS_PATH:resolve('.local/browsers'),FF_STAGE:String(stage),FF_PHASE:phase,FF_FIXTURE_PREFIX:'task-'+String(stage).padStart(3,'0'),FF_BASE_URL:origin,FF_RESULT:out+'/results.json',FF_OUTPUT:out+'/artifacts'};
 const args=['test','--config',suite];if(grep)args.push('--grep',grep);
 const child=spawn(resolve('node_modules/.bin/playwright'),args,{env,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
 const exit=await new Promise((r,j)=>{child.on('error',j);child.on('exit',r);});
 await writeFile(out+'/stdout.log',stdout);await writeFile(out+'/stderr.log',stderr);
 const result=JSON.parse(await readFile(out+'/results.json','utf8'));
 return {name,phase,exit,statistics:result.stats};
}
await mkdir(evidence,{recursive:true});await writeFile(evidence+'/executed-controller.mjs',await readFile(import.meta.filename));
const results=[];
try {
 for(mode of ['async','form','fetch']){defect='none';seed();const r=await run('positive-'+mode,'acceptance','1(26|27|28|29) ');results.push(r);assert.equal(r.exit,0,JSON.stringify(r));assert.equal(r.statistics.expected,4);}
 for(const [fault,id] of [["owner37-ignored", "126"], ["owner37-uses-task-priority", "126"], ["owner37-always-normal", "126"], ["owner37-not-carried", "126"], ["owner37-clears-query", "126"], ["owner37-resets-controls", "126"], ["owner37-resets-order", "128"], ["owner37-mutates-defaults", "126"], ["owner37-mutates-priorities", "126"], ["owner37-workspace-export-ignored", "127"], ["owner37-bulk-complete-ignored", "127"], ["owner37-bulk-reopen-ignored", "127"], ["owner37-bulk-priority-ignored", "127"], ["owner37-bulk-date-ignored", "127"], ["owner37-bulk-notes-ignored", "127"], ["owner37-bulk-delete-ignored", "127"], ["owner37-bulk-restore-ignored", "127"], ["owner37-clears-positions", "129"], ["owner37-forgets-foreign", "129"], ["owner37-priority-modifies-default", "127"]]){mode='form';defect=fault;seed();const r=await run('negative-'+fault+'-'+id,'acceptance',id+' ');results.push(r);assert.notEqual(r.exit,0,'Unrejected '+fault);assert.equal(r.statistics.unexpected,1);}
 await writeFile(evidence+'/verified.json',JSON.stringify({verified:true,model_calls:0,results,scope:'Four unfrozen owner-default cases in3correct modes plus20 genuine faults. Full128 and actual native upgrade/restart still required.'},null,2)+'\n');console.log(JSON.stringify({verified:true,variants:results.length,model_calls:0}));
}finally{await new Promise(r=>server.close(r));}
