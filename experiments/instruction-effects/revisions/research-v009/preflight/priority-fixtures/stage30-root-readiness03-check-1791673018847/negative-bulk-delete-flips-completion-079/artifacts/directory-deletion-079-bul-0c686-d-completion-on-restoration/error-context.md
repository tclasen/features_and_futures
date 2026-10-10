# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-deletion.spec.mjs >> 079 bulk directory deletion preserves duplicate owner identities stored task order and completion on restoration
- Location: experiments/instruction-effects/revisions/research-v009/preflight/priority-fixtures/final030-root-readiness02-executed-suite/directory-deletion.spec.mjs:56:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary')
Timeout: 5000ms
- Expected  - 1
+ Received  + 1

  Array [
-   "0/1 completed",
    "1/1 completed",
+   "0/1 completed",
  ]

Call log:
  - Expect "toHaveText" getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary') with timeout 5000ms
  - waiting for getByTestId('directory-owner-row').visible().getByTestId('directory-owner-summary')
    14 × locator resolved to 2 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f21e1]:
  - heading "Task directory" [level=1] [ref=f21e2]
  - text: 1/2 completed
  - generic [ref=f21e3]:
    - text: task-030 Bulk duplicate owner1/1 completed
    - group [ref=f21e5]:
      - button "Open project" [ref=f21e6]
  - generic [ref=f21e7]:
    - text: task-030 Bulk duplicate owner0/1 completed
    - group [ref=f21e9]:
      - button "Open project" [ref=f21e10]
  - group [ref=f21e12]:
    - button "Complete visible tasks" [disabled] [ref=f21e13]
  - group [ref=f21e15]:
    - button "Reopen visible tasks" [disabled] [ref=f21e16]
  - group [ref=f21e18]:
    - button "Delete visible tasks" [disabled] [ref=f21e19]
  - group [ref=f21e21]:
    - button "Restore visible tasks" [ref=f21e22]
  - group [ref=f21e24]:
    - generic [ref=f21e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f21e26]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f21e27]
  - group [ref=f21e29]:
    - generic [ref=f21e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f21e31]
    - button "Save visible due date" [disabled] [ref=f21e32]
  - group [ref=f21e34]:
    - generic [ref=f21e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [disabled] [ref=f21e36]
    - button "Save visible notes" [disabled] [ref=f21e37]
  - group [ref=f21e39]:
    - button "Export matching workspace" [ref=f21e40]
  - group [ref=f21e42]:
    - button "Projects" [ref=f21e43]
  - generic [ref=f21e45]:
    - text: Directory order
    - combobox "Directory order" [ref=f21e46]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f21e48]:
    - text: Project scope
    - combobox "Project scope" [ref=f21e49]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f21e51]:
    - text: Task filter
    - combobox "Task filter" [ref=f21e52]:
      - option "All"
      - option "Open"
      - option "Completed"
      - option "Deleted" [selected]
  - generic [ref=f21e54]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f21e55]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f21e57]:
    - generic [ref=f21e58]:
      - text: Directory search
      - textbox "Directory search" [ref=f21e59]: task-030 Duplicate bulk target
    - button "Search directory" [ref=f21e60]
  - group [ref=f21e62]:
    - generic [ref=f21e63]:
      - text: Due from
      - textbox "Due from" [ref=f21e64]
    - generic [ref=f21e65]:
      - text: Due through
      - textbox "Due through" [ref=f21e66]
    - button "Apply due range" [ref=f21e67]
  - generic [ref=f21e68]:
    - text: task-030 Duplicate bulk target alpha secondtask-030 Bulk duplicate ownerOpenNormal
    - group [ref=f21e70]:
      - button "Open project" [ref=f21e71]
  - generic [ref=f21e72]:
    - text: task-030 Duplicate bulk target zulu firsttask-030 Bulk duplicate ownerCompletedNormal
    - group [ref=f21e74]:
      - button "Open project" [ref=f21e75]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
  4  | const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
  5  | const remove=p=>p.getByRole('button',{name:'Delete visible tasks',exact:true});
  6  | const restore=p=>p.getByRole('button',{name:'Restore visible tasks',exact:true});
  7  | async function titles(p,expected){const r=p.getByTestId('task-row').filter({visible:true});await expect(r).toHaveCount(expected.length);for(const [i,title] of expected.entries())await expect(r.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  8  | async function result(p,names,counts,expected,total){
  9  |  if(!expected.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();
  10 |  await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
  11 |  await expect(owners(p).getByTestId('directory-owner-name')).toHaveText(names.map(projectName));
> 12 |  await expect(owners(p).getByTestId('directory-owner-summary')).toHaveText(counts);
     |                                                                 ^ Error: expect(locator).toHaveText(expected) failed
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
  29 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  30 | if(stage>=24){
  31 |  test('078 directory bulk deletion and restoration honor every intersection and protect live summaries before restoration',async({page})=>{
  32 |   test.setTimeout(90000);
  33 |   const a='Bulk delete first owner',b='Bulk delete second owner',c='Bulk delete archived owner',q=projectName('Batch record');
  34 |   const before=q+' before first',first=q+' selected target zulu',low=q+' priority guard',late=q+' date guard',done=q+' completion guard',other=projectName('Unrelated search guard'),old=q+' earlier deleted';
  35 |   const lowDeleted=q+' selected target priority protected',lateDeleted=q+' selected target date protected';
  36 |   const beforeB=q+' before second',second=q+' selected target alpha',afterB=q+' after second',protectedLive=q+' selected target archived live',protectedDeleted=q+' selected target archived deleted';
  37 |   const fields={priority:'High',date:'2064-02-29',notes:'Literal Ω\nretained  notes'};
  38 |   await createProject(page,a);await openProject(page,a);await configured(page,a,before);await configured(page,a,first,fields);await configured(page,a,low,{...fields,priority:'Low'});await configured(page,a,late,{...fields,date:'2064-03-01'});await configured(page,a,done,{...fields,completed:true});await configured(page,a,other,fields);await configured(page,a,old,{...fields,completed:true,deleted:true});await configured(page,a,lowDeleted,{...fields,priority:'Low',deleted:true});await configured(page,a,lateDeleted,{...fields,date:'2064-03-01',deleted:true});
  39 |   await createProject(page,b);await openProject(page,b);await configured(page,b,beforeB);await configured(page,b,second,fields);await configured(page,b,afterB);
  40 |   await createProject(page,c);await openProject(page,c);await configured(page,c,protectedLive,fields);await configured(page,c,protectedDeleted,{...fields,deleted:true});await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  41 |   await directory(page,q);await result(page,[a,b],['1/5 completed','0/3 completed'],[before,first,low,late,done,beforeB,second,afterB],'1/8 completed');
  42 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/4 completed','0/3 completed'],[before,first,low,late,beforeB,second,afterB],'0/7 completed');
  43 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/2 completed','0/1 completed'],[first,late,second],'0/3 completed');
  44 |   await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2064-02-29');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2064-02-29');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[first,second],'0/2 completed');
  45 |   await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await expect(remove(page)).toBeEnabled();await expect(restore(page)).toBeDisabled();await remove(page).click();await result(page,[],[],[],'0/0 completed');await expect(remove(page)).toBeDisabled();await expect(restore(page)).toBeDisabled();await expect(page.getByRole('button',{name:'Complete visible tasks',exact:true})).toBeDisabled();
  46 |   // Observe live guards immediately; restoring later must not hide an over-broad deletion.
  47 |   const observer=await page.context().newPage();try{
  48 |    await returnTo(observer,a);await titles(observer,[before,low,late,done,other]);await expect(observer.getByRole('checkbox',{name:'Complete '+done,exact:true})).toBeChecked();await observer.goto('/');await expect(projectRow(observer,a).getByTestId('project-summary')).toHaveText('1/5 completed');await expect(projectRow(observer,b).getByTestId('project-summary')).toHaveText('0/2 completed');await returnTo(observer,b);await titles(observer,[beforeB,afterB]);
  49 |   }finally{await observer.close();}
  50 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,b],['1/2 completed','0/1 completed'],[old,second,first],'1/3 completed');await expect(remove(page)).toBeDisabled();await expect(restore(page)).toBeEnabled();
  51 |   await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(q+' selected target');await page.getByRole('button',{name:'Search directory',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await restore(page).click();await result(page,[],[],[],'0/0 completed');await expect(restore(page)).toBeDisabled();
  52 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  53 |   await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[c],['0/1 completed'],[protectedLive],'0/1 completed');await expect(remove(page)).toBeDisabled();await expect(restore(page)).toBeDisabled();await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[c],['0/1 completed'],[protectedDeleted],'0/1 completed');await expect(remove(page)).toBeDisabled();await expect(restore(page)).toBeDisabled();
  54 |   await returnTo(page,a);await titles(page,[before,first,low,late,done,other]);await expect(page.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await expect(taskRow(page,first).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(fields.date);await expect(taskRow(page,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await titles(page,[old,lowDeleted,lateDeleted]);await returnTo(page,b);await titles(page,[beforeB,second,afterB]);await expect(taskRow(page,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);
  55 |  });
  56 |  test('079 bulk directory deletion preserves duplicate owner identities stored task order and completion on restoration',async({page})=>{
  57 |   test.setTimeout(60000);
  58 |   const a='Bulk duplicate owner',b='Bulk duplicate temporary',q=projectName('Duplicate bulk target'),first=q+' zulu first',second=q+' alpha second',beforeA='Duplicate before A',afterA='Duplicate after A',beforeB='Duplicate before B',afterB='Duplicate after B';
  59 |   await createProject(page,a);await openProject(page,a);await createTask(page,beforeA);await createTask(page,first);await createTask(page,afterA);await createProject(page,b);await openProject(page,b);await createTask(page,beforeB);await createTask(page,second);await page.getByRole('checkbox',{name:'Complete '+second,exact:true}).check();await expectPersistedCompletion(page,b,second,true);await returnTo(page,b);await createTask(page,afterB);
  60 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Rename project',exact:true}).click();const o=await page.context().newPage();try{await expect.poll(async()=>{await o.goto('/');await expect(projectRow(o,a).first()).toBeVisible();return projectRow(o,a).count();},{timeout:5000}).toBe(2);}finally{await o.close();}
  61 |   await directory(page,q);await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');await remove(page).click();await result(page,[],[],[],'0/0 completed');
  62 |   const live=await page.context().newPage();try{await live.goto('/');await expect(projectRow(live,a).getByTestId('project-summary')).toHaveText(['0/2 completed','0/2 completed']);}finally{await live.close();}
  63 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,a],['0/1 completed','1/1 completed'],[second,first],'1/2 completed');await owners(page).nth(0).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeA,afterA]);
  64 |   await directory(page,q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeB,afterB]);
  65 |   await directory(page,q);await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await restore(page).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await owners(page).nth(0).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeA,first,afterA]);await expect(page.getByRole('checkbox',{name:'Complete '+first,exact:true})).not.toBeChecked();await directory(page,q);await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeB,second,afterB]);await expect(page.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeChecked();
  66 |  });
  67 | }
  68 | 
```