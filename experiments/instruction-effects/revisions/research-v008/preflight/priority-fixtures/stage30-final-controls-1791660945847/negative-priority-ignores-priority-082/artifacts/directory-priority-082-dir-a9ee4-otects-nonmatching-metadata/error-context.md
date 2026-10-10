# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-priority.spec.mjs >> 082 directory priority assignment honors intersected live results and protects nonmatching metadata
- Location: experiments/instruction-effects/revisions/research-v008/preflight/priority-fixtures/final030-third-executed-suite/directory-priority.spec.mjs:32:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Priority batch record low guard', exact: true }) }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked')
Expected: "Low"
Received: "High"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Priority batch record low guard', exact: true }) }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked') with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Priority batch record low guard', exact: true }) }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked')
    14 × locator resolved to <option selected>High</option>
       - unexpected value "High"

```

```yaml
- heading "task-030 Priority batch first owner" [level=1]
- group:
  - button "Download project"
- group:
  - button "Projects"
- group:
  - text: Task search
  - textbox "Task search"
  - button "Search tasks"
- group:
  - text: Due from
  - textbox "Due from"
  - text: Due through
  - textbox "Due through"
  - button "Apply due range"
- group:
  - text: New project name
  - textbox "New project name"
  - button "Rename project"
- text: Default task priority
- combobox "Default task priority":
  - option "Low"
  - option "Normal" [selected]
  - option "High"
- group:
  - text: Task title
  - textbox "Task title"
  - button "Create task"
- text: Task filter
- combobox "Task filter":
  - option "All" [selected]
  - option "Open"
  - option "Completed"
  - option "Deleted"
- text: Priority filter
- combobox "Priority filter":
  - option "All" [selected]
  - option "Low"
  - option "Normal"
  - option "High"
- text: task-030 Priority batch record target zulu
- group:
  - button "Delete task"
- checkbox "Complete task-030 Priority batch record target zulu"
- group:
  - text: Task notes
  - textbox "Task notes": Literal Ω retained priority notes
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2064-02-29
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Position first owner" [selected]
    - option "task-012 Position second owner"
    - option "task-018 Import restart"
    - option "task-012 Search Mixed first"
    - option "task-012 Search mixed last"
    - option "task-012 Search double gap"
    - option "task-012 Whitespace Saved first"
    - option "task-030 Priority batch second owner"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal"
  - option "High" [selected]
- text: task-030 Priority batch record low guard
- group:
  - button "Delete task"
- checkbox "Complete task-030 Priority batch record low guard"
- group:
  - text: Task notes
  - textbox "Task notes": Literal Ω retained priority notes
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2064-02-29
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Position first owner" [selected]
    - option "task-012 Position second owner"
    - option "task-018 Import restart"
    - option "task-012 Search Mixed first"
    - option "task-012 Search mixed last"
    - option "task-012 Search double gap"
    - option "task-012 Whitespace Saved first"
    - option "task-030 Priority batch second owner"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal"
  - option "High" [selected]
- text: task-030 Priority batch record date guard
- group:
  - button "Delete task"
- checkbox "Complete task-030 Priority batch record date guard"
- group:
  - text: Task notes
  - textbox "Task notes": Literal Ω retained priority notes
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2064-03-01
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Position first owner" [selected]
    - option "task-012 Position second owner"
    - option "task-018 Import restart"
    - option "task-012 Search Mixed first"
    - option "task-012 Search mixed last"
    - option "task-012 Search double gap"
    - option "task-012 Whitespace Saved first"
    - option "task-030 Priority batch second owner"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal" [selected]
  - option "High"
- text: task-030 Priority batch record completed guard
- group:
  - button "Delete task"
- checkbox "Complete task-030 Priority batch record completed guard" [checked]
- group:
  - text: Task notes
  - textbox "Task notes": Literal Ω retained priority notes
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2064-02-29
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Position first owner" [selected]
    - option "task-012 Position second owner"
    - option "task-018 Import restart"
    - option "task-012 Search Mixed first"
    - option "task-012 Search mixed last"
    - option "task-012 Search double gap"
    - option "task-012 Whitespace Saved first"
    - option "task-030 Priority batch second owner"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal" [selected]
  - option "High"
- text: task-030 Priority unrelated guard
- group:
  - button "Delete task"
- checkbox "Complete task-030 Priority unrelated guard"
- group:
  - text: Task notes
  - textbox "Task notes": Literal Ω retained priority notes
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2064-02-29
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Position first owner" [selected]
    - option "task-012 Position second owner"
    - option "task-018 Import restart"
    - option "task-012 Search Mixed first"
    - option "task-012 Search mixed last"
    - option "task-012 Search double gap"
    - option "task-012 Whitespace Saved first"
    - option "task-030 Priority batch second owner"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low"
  - option "Normal" [selected]
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
  30 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  31 | if(stage>=25){
  32 |  test('082 directory priority assignment honors intersected live results and protects nonmatching metadata',async({page})=>{
  33 |   test.setTimeout(90000);
  34 |   const a='Priority batch first owner',b='Priority batch second owner',c='Priority batch archived owner',q=projectName('Priority batch record');
  35 |   const first=q+' target zulu',second=q+' target alpha',low=q+' low guard',late=q+' date guard',done=q+' completed guard',other=projectName('Priority unrelated guard'),deleted=q+' deleted guard',archived=q+' archived guard';
  36 |   const fields={date:'2064-02-29',notes:'Literal Ω\n  retained priority notes'};
  37 |   await createProject(page,a);await openProject(page,a);await configured(page,a,first,fields);await configured(page,a,low,{...fields,priority:'Low'});await configured(page,a,late,{...fields,date:'2064-03-01'});await configured(page,a,done,{...fields,completed:true});await configured(page,a,other,fields);await configured(page,a,deleted,{...fields,deleted:true});
  38 |   await createProject(page,b);await openProject(page,b);await configured(page,b,second,fields);
  39 |   await createProject(page,c);await openProject(page,c);await configured(page,c,archived,fields);await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  40 |   await directory(page,q);await result(page,[a,b],['1/4 completed','0/1 completed'],[first,low,late,done,second],'1/5 completed');
  41 |   await expect(page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).locator('option')).toHaveText(['Low','Normal','High']);
  42 |   await expect(page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).locator('option:checked')).toHaveText('Normal');
  43 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/3 completed','0/1 completed'],[first,low,late,second],'0/4 completed');
  44 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Normal'});await result(page,[a,b],['0/2 completed','0/1 completed'],[first,late,second],'0/3 completed');
  45 |   await page.getByRole('textbox',{name:'Due from',exact:true}).fill(fields.date);await page.getByRole('textbox',{name:'Due through',exact:true}).fill(fields.date);await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[first,second],'0/2 completed');
  46 |   await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'High'});await save(page).click();await result(page,[],[],[],'0/0 completed');await expect(save(page)).toBeDisabled();await expectPersistedPriority(page,a,first,'High');await expectPersistedPriority(page,b,second,'High');
  47 |   const observer=await page.context().newPage();try{
  48 |    await returnTo(observer,a);await titles(observer,[first,low,late,done,other]);
> 49 |    for(const [title,priority] of [[first,'High'],[low,'Low'],[late,'Normal'],[done,'Normal'],[other,'Normal']])await expect(taskRow(observer,title).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText(priority);
     |                                                                                                                                                                                                                                        ^ Error: expect(locator).toHaveText(expected) failed
  50 |    await expect(observer.getByRole('checkbox',{name:'Complete '+done,exact:true})).toBeChecked();await expect(taskRow(observer,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(fields.date);await expect(taskRow(observer,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);
  51 |    await observer.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(observer,deleted).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');
  52 |    await returnTo(observer,b);await expect(taskRow(observer,second).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(observer,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);
  53 |   }finally{await observer.close();}
  54 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  55 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Normal'});await result(page,[a],['1/1 completed'],[done],'1/1 completed');await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await save(page).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[a],['1/1 completed'],[done],'1/1 completed');
  56 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Normal'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');await expect(save(page)).toBeDisabled();
  57 |   await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await expect(save(page)).toBeDisabled();
  58 |   await directory(page,q);await result(page,[a,b],['1/4 completed','0/1 completed'],[first,low,late,done,second],'1/5 completed');await expect(page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).locator('option:checked')).toHaveText('Normal');
  59 |  });
  60 |  test('083 bulk priority assignment distinguishes duplicate owners and preserves completion and local order',async({page})=>{
  61 |   test.setTimeout(60000);const a='Priority duplicate owner',b='Priority duplicate temporary',q=projectName('Priority duplicate target'),first=q+' zulu',second=q+' alpha',beforeA=q+' Normal guard',afterA='Priority after A',beforeB='Priority before B',afterB='Priority after B';
  62 |   await createProject(page,a);await openProject(page,a);await createTask(page,beforeA);await configured(page,a,first,{priority:'Low',date:'2068-02-29',notes:'Duplicate first Ω\nkept'});await createTask(page,afterA);
  63 |   await createProject(page,b);await openProject(page,b);await createTask(page,beforeB);await configured(page,b,second,{priority:'Low',completed:true,date:'2064-02-29',notes:'Duplicate second Ω\nkept'});await createTask(page,afterB);
  64 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName(a));await page.getByRole('button',{name:'Rename project',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');return projectRow(observer,a).count();},{timeout:5000}).toBe(2);}finally{await observer.close();}
  65 |   await directory(page,q);await result(page,[a,a],['0/2 completed','1/1 completed'],[beforeA,first,second],'1/3 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[a,a],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');await save(page).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Normal'});await result(page,[a,a],['0/2 completed','1/1 completed'],[beforeA,first,second],'1/3 completed');
  66 |   await owners(page).nth(0).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeA,first,afterA]);await expect(taskRow(page,first).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await expect(taskRow(page,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2068-02-29');await expect(taskRow(page,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Duplicate first Ω\nkept');await expect(page.getByRole('checkbox',{name:'Complete '+first,exact:true})).not.toBeChecked();
  67 |   await directory(page,q);await result(page,[a,a],['0/2 completed','1/1 completed'],[beforeA,first,second],'1/3 completed');await owners(page).nth(1).getByRole('button',{name:'Open project',exact:true}).click();await titles(page,[beforeB,second,afterB]);await expect(taskRow(page,second).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await expect(taskRow(page,second).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2064-02-29');await expect(taskRow(page,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Duplicate second Ω\nkept');await expect(page.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeChecked();await page.goto('/');await expect(projectRow(page,a).getByTestId('project-summary')).toHaveText(['0/3 completed','1/3 completed']);
  68 |  });
  69 | 
  70 | }
  71 | 
```