# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workspace-export.spec.mjs >> 094 workspace export uses matching intersections owner creation and stored task order despite global sorting
- Location: experiments/instruction-effects/revisions/research-v008/preflight/priority-fixtures/final030-third-executed-suite/workspace-export.spec.mjs:36:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "workboard-workspace.json"
Received: "wrong.json"
```

# Page snapshot

```yaml
- generic [ref=f99e1]:
  - heading "Task directory" [level=1] [ref=f99e2]
  - text: 0/3 completed
  - generic [ref=f99e3]:
    - text: task-030 Workspace export Zulu0/2 completed
    - group [ref=f99e5]:
      - button "Open project" [ref=f99e6]
  - generic [ref=f99e7]:
    - text: task-030 Workspace export Alpha0/1 completed
    - group [ref=f99e9]:
      - button "Open project" [ref=f99e10]
  - group [ref=f99e12]:
    - button "Complete visible tasks" [ref=f99e13]
  - group [ref=f99e15]:
    - button "Reopen visible tasks" [disabled] [ref=f99e16]
  - group [ref=f99e18]:
    - button "Delete visible tasks" [ref=f99e19]
  - group [ref=f99e21]:
    - button "Restore visible tasks" [disabled] [ref=f99e22]
  - group [ref=f99e24]:
    - generic [ref=f99e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f99e26]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f99e27]
  - group [ref=f99e29]:
    - generic [ref=f99e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f99e31]
    - button "Save visible due date" [ref=f99e32]
  - group [ref=f99e34]:
    - generic [ref=f99e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f99e36]
    - button "Save visible notes" [ref=f99e37]
  - group [ref=f99e39]:
    - button "Export matching workspace" [active] [ref=f99e40]
  - group [ref=f99e42]:
    - button "Projects" [ref=f99e43]
  - generic [ref=f99e45]:
    - text: Directory order
    - combobox "Directory order" [ref=f99e46]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f99e48]:
    - text: Project scope
    - combobox "Project scope" [ref=f99e49]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f99e51]:
    - text: Task filter
    - combobox "Task filter" [ref=f99e52]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
      - option "Deleted"
  - generic [ref=f99e54]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f99e55]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - group [ref=f99e57]:
    - generic [ref=f99e58]:
      - text: Directory search
      - textbox "Directory search" [ref=f99e59]: task-030 Workspace export record
    - button "Search directory" [ref=f99e60]
  - group [ref=f99e62]:
    - generic [ref=f99e63]:
      - text: Due from
      - textbox "Due from" [ref=f99e64]: 2064-02-29
    - generic [ref=f99e65]:
      - text: Due through
      - textbox "Due through" [ref=f99e66]: 2064-02-29
    - button "Apply due range" [ref=f99e67]
  - generic [ref=f99e68]:
    - text: task-030 Workspace export record alpha targettask-030 Workspace export ZuluOpenHigh2064-02-29 Export Ω 😀 <script>literal</script>
    - group [ref=f99e70]:
      - button "Open project" [ref=f99e71]
  - generic [ref=f99e72]:
    - text: task-030 Workspace export record bravo targettask-030 Workspace export AlphaOpenHigh2064-02-29 Export Ω 😀 <script>literal</script>
    - group [ref=f99e74]:
      - button "Open project" [ref=f99e75]
  - generic [ref=f99e76]:
    - text: task-030 Workspace export record zulu targettask-030 Workspace export ZuluOpenHigh2064-02-29 Export Ω 😀 <script>literal</script>
    - group [ref=f99e78]:
      - button "Open project" [ref=f99e79]
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
> 31 | async function exported(p){const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Export matching workspace',exact:true}).click()]);expect(d.suggestedFilename()).toBe('workboard-workspace.json');const stream=await d.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));expect(value.format).toBe('workboard-workspace');expect(value.version).toBe(1);expect(Number.isInteger(value.version)).toBe(true);return value.projects;}
     |                                                                                                                                                                                                ^ Error: expect(received).toBe(expected) // Object.is equality
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
  44 |   test.setTimeout(90000);const a='Workspace duplicate archive',b='Workspace duplicate temporary',q=projectName('Workspace deleted record'),first=q+' zulu',second=q+' alpha',guard=q+' low guard',live=q+' live guard',note='Deleted Ω\nkept';await createProject(page,a);await openProject(page,a);await configured(page,a,first,{priority:'High',date:'2068-02-29',notes:note,deleted:true});await configured(page,a,guard,{priority:'Low',date:'2068-02-29',deleted:true});await configured(page,a,live,{priority:'High',date:'2068-02-29'});await createProject(page,b);await openProject(page,b);await configured(page,b,second,{priority:'High',date:'2068-02-29',notes:note,completed:true,deleted:true});await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Rename project',exact:true}).click();const o=await page.context().newPage();try{await expect.poll(async()=>{await o.goto('/');return projectRow(o,a).count();}).toBe(2);}finally{await o.close();}await page.goto('/');for(let i=0;i<2;i++){await projectRow(page,a).first().getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,a)).toHaveCount(1-i);}
  45 |   const activeOwner='Workspace scope guard',active=q+' active guard';await createProject(page,activeOwner);await openProject(page,activeOwner);await configured(page,activeOwner,active,{priority:'High',date:'2068-02-29',deleted:true});
  46 |   await directory(page,q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[a],['0/1 completed'],[live],'0/1 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,a],['0/2 completed','1/1 completed'],[first,guard,second],'1/3 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');const data=await exported(page);expect(data).toHaveLength(2);expect(data.map(p=>p.name)).toEqual([projectName(a),projectName(a)]);expect(data.map(p=>p.tasks.map(t=>t.title))).toEqual([[first],[second]]);for(const p of data){expect(p.archived).toBe(true);expect(p.defaultPriority).toBe('Normal');for(const t of p.tasks)expect(t).toMatchObject({priority:'High',dueDate:'2068-02-29',notes:note,deleted:true});}expect(data.map(p=>p.tasks[0].completed)).toEqual([false,true]);noIds(data);await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');
  47 |  });
  48 |  test('096 empty matching workspace export is valid and leaves known data and controls unchanged',async({page})=>{
  49 |   const a='Workspace empty owner',q=projectName('Workspace empty known');await createProject(page,a);await openProject(page,a);await createTask(page,q);await directory(page,q);await result(page,[a],['0/1 completed'],[q],'0/1 completed');await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(q+' absent');await page.getByRole('button',{name:'Search directory',exact:true}).click();await result(page,[],[],[],'0/0 completed');expect(await exported(page)).toEqual([]);await result(page,[],[],[],'0/0 completed');await expect(page.getByRole('textbox',{name:'Directory search',exact:true})).toHaveValue(q+' absent');await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(q);await page.getByRole('button',{name:'Search directory',exact:true}).click();await result(page,[a],['0/1 completed'],[q],'0/1 completed');
  50 |  });
  51 | }
  52 | 
```