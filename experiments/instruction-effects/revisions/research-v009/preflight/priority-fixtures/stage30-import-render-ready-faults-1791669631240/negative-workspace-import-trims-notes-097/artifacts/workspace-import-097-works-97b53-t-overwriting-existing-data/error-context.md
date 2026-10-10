# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workspace-import.spec.mjs >> 097 workspace import appends independent duplicate owners trims names and preserves literal fields without overwriting existing data
- Location: experiments/instruction-effects/revisions/research-v009/preflight/priority-fixtures/final030-import-render-ready-executed-suite/workspace-import.spec.mjs:42:2

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Workspace import record first', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true })
Timeout: 5000ms
- Expected  - 2
+ Received  + 2

-   Import Ω 😀
+ Import Ω 😀
- second line	  
+ second line

Call log:
  - Expect "toHaveValue" getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Workspace import record first', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Workspace import record first', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true })
    14 × locator resolved to <textarea name="notes">Import Ω 😀↵second line</textarea>
       - unexpected value "Import Ω 😀
second line"

```

```yaml
- textbox "Task notes": Import Ω 😀 second line
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
  4  | const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
  5  | const save=p=>p.getByRole('button',{name:'Set visible priority',exact:true});
  6  | const restore=p=>p.getByRole('button',{name:'Restore visible tasks',exact:true});
  7  | async function titles(p,expected){const r=p.getByTestId('task-row').filter({visible:true});await expect(r).toHaveCount(expected.length);for(const [i,title] of expected.entries())await expect(r.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  8  | async function result(p,names,counts,expected,total){
  9  |  if(!expected.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();
  10 |  await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
  11 |  await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));
  12 |  await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);
  13 |  await expect(p.getByTestId('directory-summary')).toHaveText(total);
  14 | }
  15 | async function directory(p,q){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await p.getByRole('button',{name:'Search directory',exact:true}).click();}
  16 | async function returnTo(p,owner){await p.goto('/');await openProject(p,owner);}
  17 | async function observed(p,owner,title,field,value){
  18 |  const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:field,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await o.close();}
  19 |  await returnTo(p,owner);
  20 | }
  21 | async function configured(p,owner,title,{priority='Normal',date='',completed=false,deleted=false,notes=''}={}){
  22 |  await createTask(p,title);
  23 |  if(priority!=='Normal'){await taskRow(p,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:priority});await expectPersistedPriority(p,owner,title,priority);await returnTo(p,owner);}
  24 |  if(date){await taskRow(p,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(date);await taskRow(p,title).getByRole('button',{name:'Save due date',exact:true}).click();await observed(p,owner,title,'Task due date',date);}
  25 |  if(notes){await taskRow(p,title).getByRole('textbox',{name:'Task notes',exact:true}).fill(notes);await taskRow(p,title).getByRole('button',{name:'Save notes',exact:true}).click();await observed(p,owner,title,'Task notes',notes);}
  26 |  if(completed){await p.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await expectPersistedCompletion(p,owner,title,true);await returnTo(p,owner);}
  27 |  if(deleted){await taskRow(p,title).getByRole('button',{name:'Delete task',exact:true}).click();const o=await p.context().newPage();try{await returnTo(o,owner);await o.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(o,title)).toBeVisible();}finally{await o.close();}await returnTo(p,owner);}
  28 | }
  29 | 
  30 | 
  31 | async function exported(p){const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Export matching workspace',exact:true}).click()]);expect(d.suggestedFilename()).toBe('workboard-workspace.json');const stream=await d.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));expect(value.format).toBe('workboard-workspace');expect(value.version).toBe(1);expect(Number.isInteger(value.version)).toBe(true);return value.projects;}
  32 | function noIds(value){for(const [key,item] of Object.entries(value)){expect(['id','projectId','taskId','ownerId','positionMap','fieldSnapshots'].includes(key)).toBe(false);if(item&&typeof item==='object')noIds(item);}}
  33 | async function defaults(p,owner,value){await p.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:value});const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return o.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();}).toBe(value);}finally{await o.close();}await returnTo(p,owner);}
  34 | 
  35 | const task=(title,fields={})=>({title,completed:false,priority:'Normal',dueDate:'',notes:'',deleted:false,...fields});
  36 | const owner=(name,tasks,fields={})=>({name,archived:false,defaultPriority:'Normal',tasks,...fields});
  37 | const workspace=projects=>({format:'workboard-workspace',version:1,projects});
  38 | async function importing(p,doc){await p.goto('/');await p.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(typeof doc==='string'?doc:JSON.stringify(doc));await p.getByRole('button',{name:'Import workspace',exact:true}).click();}
  39 | async function countProjects(p,name,count,ready=name){const o=await p.context().newPage();try{await expect.poll(async()=>{await o.goto('/');await expect(projectRow(o,ready).first()).toBeVisible();return projectRow(o,name).count();}).toBe(count);}finally{await o.close();}}
  40 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  41 | if(stage>=30){
  42 |  test('097 workspace import appends independent duplicate owners trims names and preserves literal fields without overwriting existing data',async({page})=>{
  43 |   test.setTimeout(90000);const a='Workspace imported same',c='Workspace imported archived',q=projectName('Workspace import record'),existing=q+' existing',first=q+' first',removed=q+' deleted',last=q+' last',second=q+' second',archived=q+' archived',note='  Import Ω 😀\r\nsecond line\t  ';
  44 |   await createProject(page,a);await openProject(page,a);await configured(page,a,existing,{priority:'Low',notes:'Existing untouched'});
  45 |   const doc=workspace([owner('  '+projectName(a)+'  ',[task('  '+first+'  ',{completed:true,priority:'High',dueDate:'2400-02-29',notes:note,id:'ignored'}),task(removed,{priority:'Low',deleted:true,notes:'Deleted literal Ω\nkept'}),task(last)],{defaultPriority:'High',id:'ignored',extra:'unknown'}),owner(projectName(a),[task(second,{priority:'Low',notes:'😀'.repeat(10000)})],{defaultPriority:'Low',id:'ignored'}),owner(projectName(c),[task(archived,{completed:true,priority:'High',dueDate:'0001-01-01',notes:'Archived Ω\nkept'})],{archived:true,defaultPriority:'High'})]);
  46 |   await importing(page,doc);await countProjects(page,a,3);await expect(page.getByRole('combobox',{name:'Project filter',exact:true}).locator('option:checked')).toHaveText('Active');await expect(page.getByRole('textbox',{name:'Project search',exact:true})).toHaveValue('');await expect(projectRow(page,a).getByTestId('project-summary')).toHaveText(['0/1 completed','1/2 completed','0/1 completed']);await projectRow(page,a).nth(0).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[existing]);await expect(taskRow(page,existing).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Existing untouched');
> 47 |   await page.goto('/');await projectRow(page,a).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[first,last]);await expect(page.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(note.replace(/\r\n?/g,'\n'));await expect(taskRow(page,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2400-02-29');await expect(page.getByRole('checkbox',{name:'Complete '+first,exact:true})).toBeChecked();await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await titles(page,[removed]);await expect(taskRow(page,removed).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Deleted literal Ω\nkept');
     |                                                                                                                                                                                                                                                                                                                                                                           ^ Error: expect(locator).toHaveValue(expected) failed
  48 |   await page.goto('/');await projectRow(page,a).nth(2).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[second]);await expect(taskRow(page,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('😀'.repeat(10000));await expect(page.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('Low');await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,c).getByTestId('project-summary')).toHaveText('1/1 completed');await openProject(page,c);await titles(page,[archived]);await expect(page.getByRole('checkbox',{name:'Complete '+archived,exact:true})).toBeDisabled();await expect(taskRow(page,archived).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('0001-01-01');
  49 |   await directory(page,q);await result(page,[a,a,a],['0/1 completed','1/2 completed','0/1 completed'],[existing,first,last,second],'1/4 completed');const snapshot=await exported(page);expect(snapshot.map(p=>p.name)).toEqual([projectName(a),projectName(a),projectName(a)]);expect(snapshot.map(p=>p.tasks.map(t=>t.title))).toEqual([[existing],[first,last],[second]]);noIds(snapshot);await page.reload();await result(page,[a,a,a],['0/1 completed','1/2 completed','0/1 completed'],[existing,first,last,second],'1/4 completed');
  50 |  });
  51 | 
  52 |  test('098 imported deleted tasks restore into supplied positions and preserve bulk-edited fields across later moves',async({page})=>{
  53 |   test.setTimeout(90000);const a='Workspace position imported',b='Workspace position holding',before='Workspace imported before',after='Workspace imported after',holdBefore='Workspace holding before',holdAfter='Workspace holding later',travel=projectName('Workspace imported travelling');await createProject(page,b);await openProject(page,b);await createTask(page,holdBefore);
  54 |   await importing(page,workspace([owner(projectName(a),[task(before),task(travel,{priority:'Low',dueDate:'2064-02-29',notes:'Imported deleted Ω\nkept',deleted:true}),task(after)],{defaultPriority:'High'})]));await countProjects(page,a,1,b);await openProject(page,a);await titles(page,[before,after]);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,travel)).toBeVisible();await taskRow(page,travel).getByRole('button',{name:'Restore task',exact:true}).click();const o=await page.context().newPage();try{await expect.poll(async()=>{await returnTo(o,a);await expect(taskRow(o,before)).toBeVisible();return o.getByTestId('task-row').filter({visible:true}).count();}).toBe(3);}finally{await o.close();}await returnTo(page,a);await titles(page,[before,travel,after]);
  55 |   async function move(source,target,sourceOrder,targetOrder){await returnTo(page,source);await taskRow(page,travel).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,travel).getByRole('button',{name:'Move task',exact:true}).click();const observer=await page.context().newPage();try{await returnTo(observer,target);await titles(observer,targetOrder);await returnTo(observer,source);await titles(observer,sourceOrder);}finally{await observer.close();}await returnTo(page,target);}
  56 |   await move(a,b,[before,after],[holdBefore,travel]);await createTask(page,holdAfter);await move(b,a,[holdBefore,holdAfter],[before,travel,after]);await move(a,b,[before,after],[holdBefore,travel,holdAfter]);await directory(page,travel);await result(page,[b],['0/1 completed'],[travel],'0/1 completed');await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'High'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();await result(page,[b],['0/1 completed'],[travel],'0/1 completed');await expectPersistedPriority(page,b,travel,'High');await expect(rows(page).getByTestId('directory-task-priority')).toHaveText(['High']);await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill('2068-02-29');await page.getByRole('button',{name:'Save visible due date',exact:true}).click();await result(page,[b],['0/1 completed'],[travel],'0/1 completed');await expect(rows(page).getByTestId('directory-task-due-date')).toHaveText(['2068-02-29']);const dateObserver=await page.context().newPage();try{await expect.poll(async()=>{await returnTo(dateObserver,b);return taskRow(dateObserver,travel).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();}).toBe('2068-02-29');}finally{await dateObserver.close();}await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill('  Bulk imported Ω\nnew literal  ');await page.getByRole('button',{name:'Save visible notes',exact:true}).click();await result(page,[b],['0/1 completed'],[travel],'0/1 completed');await expect(rows(page).getByTestId('directory-task-notes')).toHaveText(['  Bulk imported Ω\nnew literal  ']);const notesObserver=await page.context().newPage();try{await expect.poll(async()=>{await returnTo(notesObserver,b);return taskRow(notesObserver,travel).getByRole('textbox',{name:'Task notes',exact:true}).inputValue();}).toBe('  Bulk imported Ω\nnew literal  ');}finally{await notesObserver.close();}const data=await exported(page);expect(data[0].tasks[0]).toMatchObject({priority:'High',dueDate:'2068-02-29',notes:'  Bulk imported Ω\nnew literal  ',deleted:false});await move(b,a,[holdBefore,holdAfter],[before,travel,after]);await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('  Bulk imported Ω\nnew literal  ');await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2068-02-29');await expect(taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');
  57 |  });
  58 |  test('099 invalid workspace objects including the final owner fail atomically and retain the rejected input',async({page})=>{
  59 |   test.setTimeout(180000);const a='Workspace invalid record',q=projectName(a),existing=q+' existing';await createProject(page,a);await openProject(page,a);await configured(page,a,existing,{priority:'High',date:'2064-02-29',notes:'Existing literal Ω\nkept'});
  60 |   const good=owner(q+' would be created',[task(q+' new target')]);const base=workspace([good,owner(q+' invalid last',[task(q+' tail target')])]);const invalid=[null,[],{},'{bad json', {...base,format:'other'}, {...base,version:'1'}, {...base,version:2}, {...base,projects:{}}, {...base,projects:[good,null]}, {...base,projects:[good,[]]}];
  61 |   for(const [field,value] of [['name','   '],['name',12],['archived','false'],['defaultPriority','Urgent'],['tasks',{}]]){const doc=structuredClone(base);doc.projects[1][field]=value;invalid.push(doc);}
  62 |   for(const [field,value] of [['title',' \t '],['title',17],['completed','false'],['priority','Urgent'],['dueDate','2300-02-29'],['dueDate','0000-01-01'],['dueDate','10000-01-01'],['dueDate','2400-04-31'],['notes',15],['notes','😀'.repeat(10001)],['deleted','false']]){const doc=structuredClone(base);doc.projects[1].tasks[0][field]=value;invalid.push(doc);}
  63 |   for(const missing of ['name','archived','defaultPriority','tasks']){const doc=structuredClone(base);delete doc.projects[1][missing];invalid.push(doc);}
  64 |   for(const missing of ['title','completed','priority','dueDate','notes','deleted']){const doc=structuredClone(base);delete doc.projects[1].tasks[0][missing];invalid.push(doc);}
  65 |   for(const doc of invalid){const raw=typeof doc==='string'?doc:JSON.stringify(doc);await importing(page,raw);await expect(page.getByRole('alert')).toContainText('Invalid workspace JSON');await expect(page.getByRole('textbox',{name:'Workspace JSON',exact:true})).toHaveValue(raw);const o=await page.context().newPage();try{await o.goto('/');await o.getByRole('textbox',{name:'Project search',exact:true}).fill(q);await o.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(o,a)).toHaveCount(1);await expect(o.getByTestId('project-row').filter({visible:true})).toHaveCount(1);await openProject(o,a);await titles(o,[existing]);await expect(taskRow(o,existing).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Existing literal Ω\nkept');await expect(taskRow(o,existing).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2064-02-29');await expect(taskRow(o,existing).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');}finally{await o.close();}}
  66 |  });
  67 |  test('100 empty workspace imports create nothing and matching exports round-trip as independent owners',async({page})=>{
  68 |   test.setTimeout(90000);const a='Workspace roundtrip owner',q=projectName('Workspace roundtrip record'),first=q+' live',deleted=q+' deleted';await createProject(page,a);await openProject(page,a);await configured(page,a,first,{priority:'High',date:'2400-02-29',notes:'  Roundtrip Ω\nkept  ',completed:true});await configured(page,a,deleted,{priority:'Low',notes:'Deleted roundtrip',deleted:true});const c='Workspace empty archived first',d='Workspace empty archived second';for(const guard of [c,d]){await createProject(page,guard);await projectRow(page,guard).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,guard)).toHaveCount(0);}await page.goto('/');await expect(projectRow(page,a)).toBeVisible();const before=await page.getByTestId('project-row').filter({visible:true}).count();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,c)).toBeVisible();await expect(projectRow(page,d)).toBeVisible();await page.getByRole('textbox',{name:'Project search',exact:true}).fill(projectName(c));await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,c)).toBeVisible();await expect(projectRow(page,d)).toHaveCount(0);await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);await page.getByRole('textbox',{name:'Workspace JSON',exact:true}).fill(JSON.stringify(workspace([])));await page.getByRole('button',{name:'Import workspace',exact:true}).click();await expect(projectRow(page,a)).toBeVisible();await expect(page.getByRole('combobox',{name:'Project filter',exact:true}).locator('option:checked')).toHaveText('Active');await expect(page.getByRole('textbox',{name:'Project search',exact:true})).toHaveValue('');await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(before);await page.reload();await expect(projectRow(page,a)).toBeVisible();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(before);await directory(page,q);await result(page,[a],['1/1 completed'],[first],'1/1 completed');const data=await exported(page);await importing(page,workspace(data));await countProjects(page,a,2);await directory(page,q);await result(page,[a,a],['1/1 completed','1/1 completed'],[first,first],'2/2 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');await owners(page).first().getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[first]);await page.goto('/');await projectRow(page,a).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await titles(page,[]);await page.reload();await titles(page,[]);
  69 |  });
  70 | }
  71 | 
```