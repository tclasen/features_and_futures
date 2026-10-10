# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workspace-export.spec.mjs >> 095 workspace export preserves duplicate archived owners and selects only matching deleted tasks
- Location: experiments/instruction-effects/revisions/research-v009/preflight/priority-fixtures/final030-import-render-ready-executed-suite/workspace-export.spec.mjs:43:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: 0

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f52e1]:
  - heading "task-030 Workspace duplicate archive" [level=1] [ref=f52e2]
  - group [ref=f52e4]:
    - button "Download project" [ref=f52e5]
  - group [ref=f52e7]:
    - button "Projects" [ref=f52e8]
  - group [ref=f52e10]:
    - generic [ref=f52e11]:
      - text: Task search
      - textbox "Task search" [ref=f52e12]
    - button "Search tasks" [ref=f52e13]
  - group [ref=f52e15]:
    - generic [ref=f52e16]:
      - text: Due from
      - textbox "Due from" [ref=f52e17]
    - generic [ref=f52e18]:
      - text: Due through
      - textbox "Due through" [ref=f52e19]
    - button "Apply due range" [ref=f52e20]
  - group [ref=f52e22]:
    - generic [ref=f52e23]:
      - text: New project name
      - textbox "New project name" [ref=f52e24]
    - button "Rename project" [ref=f52e25]
  - generic [ref=f52e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f52e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f52e30]:
    - generic [ref=f52e31]:
      - text: Task title
      - textbox "Task title" [ref=f52e32]
    - button "Create task" [ref=f52e33]
  - generic [ref=f52e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f52e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f52e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f52e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
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
  34 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  35 | if(stage>=29){
  36 |  test('094 workspace export uses matching intersections owner creation and stored task order despite global sorting',async({page})=>{
  37 |   test.setTimeout(90000);const a='Workspace export Zulu',b='Workspace export Alpha',q=projectName('Workspace export record'),first=q+' zulu target',second=q+' alpha target',third=q+' bravo target',low=q+' low guard',late=q+' date guard',done=q+' completed guard',other=projectName('Unrelated workspace export guard'),deleted=q+' deleted guard',note='  Export Ω 😀\n<script>literal</script>\t  ',fields={priority:'High',date:'2064-02-29',notes:note};
  38 |   await createProject(page,a);await openProject(page,a);await configured(page,a,first,fields);await configured(page,a,second,fields);await configured(page,a,low,{...fields,priority:'Low'});await configured(page,a,late,{...fields,date:'2064-03-01'});await configured(page,a,done,{...fields,completed:true});await configured(page,a,other,fields);await configured(page,a,deleted,{...fields,deleted:true});await defaults(page,a,'Low');await createProject(page,b);await openProject(page,b);await configured(page,b,third,fields);await defaults(page,b,'High');
  39 |   await directory(page,q);await result(page,[a,b],['1/5 completed','0/1 completed'],[first,second,low,late,done,third],'1/6 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/4 completed','0/1 completed'],[first,second,low,late,third],'0/5 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/3 completed','0/1 completed'],[first,second,late,third],'0/4 completed');await page.getByRole('textbox',{name:'Due from',exact:true}).fill(fields.date);await page.getByRole('textbox',{name:'Due through',exact:true}).fill(fields.date);await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/2 completed','0/1 completed'],[first,second,third],'0/3 completed');
  40 |   for(const [ordering,expected] of [['Title',[second,third,first]],['Project name',[third,first,second]],['Original',[first,second,third]]]){await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:ordering});await result(page,[a,b],['0/2 completed','0/1 completed'],expected,'0/3 completed');const data=await exported(page);expect(data).toHaveLength(2);expect(data.map(p=>p.name)).toEqual([a,b].map(projectName));expect(data.map(p=>p.defaultPriority)).toEqual(['Low','High']);expect(data.map(p=>p.tasks.map(t=>t.title))).toEqual([[first,second],[third]]);for(const owner of data){expect(owner.archived).toBe(false);for(const t of owner.tasks)expect(t).toMatchObject({priority:'High',dueDate:fields.date,notes:note,completed:false,deleted:false});}noIds(data);await result(page,[a,b],['0/2 completed','0/1 completed'],expected,'0/3 completed');await expect(page.getByRole('combobox',{name:'Directory order',exact:true}).locator('option:checked')).toHaveText(ordering);await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q);}
  41 |   await returnTo(page,a);await titles(page,[first,second,low,late,done,other]);await expect(taskRow(page,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(note);await expect(page.getByRole('checkbox',{name:'Complete '+done,exact:true})).toBeChecked();
  42 |  });
  43 |  test('095 workspace export preserves duplicate archived owners and selects only matching deleted tasks',async({page})=>{
> 44 |   test.setTimeout(90000);const a='Workspace duplicate archive',b='Workspace duplicate temporary',q=projectName('Workspace deleted record'),first=q+' zulu',second=q+' alpha',guard=q+' low guard',live=q+' live guard',note='Deleted Ω\nkept';await createProject(page,a);await openProject(page,a);await configured(page,a,first,{priority:'High',date:'2068-02-29',notes:note,deleted:true});await configured(page,a,guard,{priority:'Low',date:'2068-02-29',deleted:true});await configured(page,a,live,{priority:'High',date:'2068-02-29'});await createProject(page,b);await openProject(page,b);await configured(page,b,second,{priority:'High',date:'2068-02-29',notes:note,completed:true,deleted:true});await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Rename project',exact:true}).click();const o=await page.context().newPage();try{await expect.poll(async()=>{await o.goto('/');return projectRow(o,a).count();}).toBe(2);}finally{await o.close();}await page.goto('/');for(let i=0;i<2;i++){await projectRow(page,a).first().getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,a)).toHaveCount(1-i);}
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  45 |   const activeOwner='Workspace scope guard',active=q+' active guard';await createProject(page,activeOwner);await openProject(page,activeOwner);await configured(page,activeOwner,active,{priority:'High',date:'2068-02-29',deleted:true});
  46 |   await directory(page,q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[a],['0/1 completed'],[live],'0/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,a],['0/2 completed','1/1 completed'],[first,guard,second],'1/3 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');const data=await exported(page);expect(data).toHaveLength(2);expect(data.map(p=>p.name)).toEqual([projectName(a),projectName(a)]);expect(data.map(p=>p.tasks.map(t=>t.title))).toEqual([[first],[second]]);for(const p of data){expect(p.archived).toBe(true);expect(p.defaultPriority).toBe('Normal');for(const t of p.tasks)expect(t).toMatchObject({priority:'High',dueDate:'2068-02-29',notes:note,deleted:true});}expect(data.map(p=>p.tasks[0].completed)).toEqual([false,true]);noIds(data);await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');
  47 |  });
  48 |  test('096 empty matching workspace export is valid and leaves known data and controls unchanged',async({page})=>{
  49 |   const a='Workspace empty owner',q=projectName('Workspace empty known');await createProject(page,a);await openProject(page,a);await createTask(page,q);await directory(page,q);await result(page,[a],['0/1 completed'],[q],'0/1 completed');await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(q+' absent');await page.getByRole('button',{name:'Search directory',exact:true}).click();await result(page,[],[],[],'0/0 completed');expect(await exported(page)).toEqual([]);await result(page,[],[],[],'0/0 completed');await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q+' absent');await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await page.getByRole('button',{name:'Search directory',exact:true}).click();await result(page,[a],['0/1 completed'],[q],'0/1 completed');
  50 |  });
  51 | }
  52 | 
```