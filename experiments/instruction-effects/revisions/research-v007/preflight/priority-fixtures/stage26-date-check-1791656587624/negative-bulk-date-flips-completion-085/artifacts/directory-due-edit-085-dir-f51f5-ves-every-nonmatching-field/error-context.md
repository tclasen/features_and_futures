# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-due-edit.spec.mjs >> 085 directory due-date assignment honors intersections and preserves every nonmatching field
- Location: experiments/instruction-effects/revisions/research-v007/decisions/task-026-draft/suite/directory-due-edit.spec.mjs:33:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
Timeout: 5000ms
- Expected  - 4
+ Received  + 1

- Array [
-   "task-026 Date batch record alpha target",
-   "task-026 Date batch record zulu target",
- ]
+ Array []

Call log:
  - Expect "toHaveText" getByTestId('directory-task-row').visible().getByTestId('directory-task-title') with timeout 5000ms
  - waiting for getByTestId('directory-task-row').visible().getByTestId('directory-task-title')
    14 × locator resolved to 0 elements

```

# Page snapshot

```yaml
- generic [active] [ref=f99e1]:
  - heading "Task directory" [level=1] [ref=f99e2]
  - text: 0/0 completed
  - group [ref=f99e4]:
    - button "Complete visible tasks" [disabled] [ref=f99e5]
  - group [ref=f99e7]:
    - button "Reopen visible tasks" [disabled] [ref=f99e8]
  - paragraph [ref=f99e9]: No matching tasks
  - group [ref=f99e11]:
    - button "Delete visible tasks" [disabled] [ref=f99e12]
  - group [ref=f99e14]:
    - button "Restore visible tasks" [disabled] [ref=f99e15]
  - group [ref=f99e17]:
    - generic [ref=f99e18]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f99e19]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f99e20]
  - group [ref=f99e22]:
    - generic [ref=f99e23]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f99e24]
    - button "Save visible due date" [disabled] [ref=f99e25]
  - group [ref=f99e27]:
    - button "Projects" [ref=f99e28]
  - generic [ref=f99e30]:
    - text: Directory order
    - combobox "Directory order" [ref=f99e31]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
  - generic [ref=f99e33]:
    - text: Project scope
    - combobox "Project scope" [ref=f99e34]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f99e36]:
    - text: Task filter
    - combobox "Task filter" [ref=f99e37]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
      - option "Deleted"
  - generic [ref=f99e39]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f99e40]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - group [ref=f99e42]:
    - generic [ref=f99e43]:
      - text: Directory search
      - textbox "Directory search" [ref=f99e44]: task-026 Date batch record
    - button "Search directory" [ref=f99e45]
  - group [ref=f99e47]:
    - generic [ref=f99e48]:
      - text: Due from
      - textbox "Due from" [ref=f99e49]: 2400-02-29
    - generic [ref=f99e50]:
      - text: Due through
      - textbox "Due through" [ref=f99e51]: 2400-02-29
    - button "Apply due range" [ref=f99e52]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
  4  | const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
  5  | const save=p=>p.getByRole('button',{name:'Save visible due date',exact:true});
  6  | const restore=p=>p.getByRole('button',{name:'Restore visible tasks',exact:true});
  7  | async function titles(p,expected){const r=p.getByTestId('task-row').filter({visible:true});await expect(r).toHaveCount(expected.length);for(const [i,title] of expected.entries())await expect(r.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  8  | async function result(p,names,counts,expected,total){
  9  |  if(!expected.length)await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();
> 10 |  await expect(rows(p).getByTestId('directory-task-title')).toHaveText(expected);
     |                                                            ^ Error: expect(locator).toHaveText(expected) failed
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
  31 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  32 | if(stage>=26){
  33 |  test('085 directory due-date assignment honors intersections and preserves every nonmatching field',async({page})=>{
  34 |   test.setTimeout(90000);const a='Date batch first',b='Date batch second',c='Date batch archived',q=projectName('Date batch record'),first=q+' zulu target',second=q+' alpha target',low=q+' low guard',late=q+' date guard',done=q+' completed guard',other=projectName('Unrelated date guard'),deleted=q+' deleted guard',archived=q+' archived guard';
  35 |   const fields={priority:'High',date:'2064-02-29',notes:'Date literal Ω\n  retained'};
  36 |   await createProject(page,a);await openProject(page,a);await configured(page,a,first,fields);await configured(page,a,low,{...fields,priority:'Low'});await configured(page,a,late,{...fields,date:'2064-03-01'});await configured(page,a,done,{...fields,completed:true});await configured(page,a,other,fields);await configured(page,a,deleted,{...fields,deleted:true});await createProject(page,b);await openProject(page,b);await configured(page,b,second,fields);
  37 |   await createProject(page,c);await openProject(page,c);await configured(page,c,archived,fields);await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  38 |   await directory(page,q);await result(page,[a,b],['1/4 completed','0/1 completed'],[first,low,late,done,second],'1/5 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/3 completed','0/1 completed'],[first,low,late,second],'0/4 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/2 completed','0/1 completed'],[first,late,second],'0/3 completed');await page.getByRole('textbox',{name:'Due from',exact:true}).fill(fields.date);await page.getByRole('textbox',{name:'Due through',exact:true}).fill(fields.date);await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[first,second],'0/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  39 |   await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(' 2400-02-29 ');await save(page).click();await result(page,[],[],[],'0/0 completed');await expect(save(page)).toBeDisabled();
  40 |   const o=await page.context().newPage();try{await returnTo(o,a);await titles(o,[first,low,late,done,other]);for(const [title,date] of [[first,'2400-02-29'],[low,fields.date],[late,'2064-03-01'],[done,fields.date],[other,fields.date]])await expect(taskRow(o,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(date);await expect(taskRow(o,first).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(o,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);await expect(o.getByRole('checkbox',{name:'Complete '+done,exact:true})).toBeChecked();await o.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(o,deleted).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(fields.date);await returnTo(o,b);await expect(taskRow(o,second).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2400-02-29');}finally{await o.close();}
  41 |   await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2400-02-29');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2400-02-29');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill('');await save(page).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('textbox',{name:'Due from',exact:true}).fill('');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/2 completed','0/1 completed'],[second,late,first],'0/3 completed');
  42 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[a],['1/1 completed'],[done],'1/1 completed');await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill('0001-01-01');await save(page).click();await result(page,[a],['1/1 completed'],[done],'1/1 completed');await returnTo(page,a);await expect(taskRow(page,done).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('0001-01-01');await expect(taskRow(page,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('');
  43 |   await directory(page,q);await result(page,[a,b],['1/4 completed','0/1 completed'],[first,low,late,done,second],'1/5 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');await expect(save(page)).toBeDisabled();await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await expect(save(page)).toBeDisabled();
  44 |  });
  45 |  test('086 invalid visible due dates are atomic and valid Gregorian boundaries persist',async({page})=>{
  46 |   test.setTimeout(90000);const a='Date validation first',b='Date validation second',q=projectName('Date validation target'),first=q+' first',second=q+' second';await createProject(page,a);await openProject(page,a);await configured(page,a,first,{date:'2064-02-29'});await createProject(page,b);await openProject(page,b);await configured(page,b,second,{date:'2064-02-29',completed:true});await directory(page,q);await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');
  47 |   for(const invalid of ['2300-02-29','2027-02-29','0000-01-01','10000-01-01','2400-04-31','2400-13-01','2400-2-29','not a date']){await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(invalid);await save(page).click();await expect(page.getByRole('alert')).toContainText('Due date must use valid YYYY-MM-DD');await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');const o=await page.context().newPage();try{for(const [owner,title] of [[a,first],[b,second]]){await returnTo(o,owner);await expect(taskRow(o,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2064-02-29');}}finally{await o.close();}}
  48 |   for(const valid of ['0001-01-01','2400-02-29','9999-12-31','']){await page.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill(valid);await save(page).click();const o=await page.context().newPage();try{for(const [owner,title] of [[a,first],[b,second]]){await returnTo(o,owner);await expect(taskRow(o,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(valid);}}finally{await o.close();}await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');}
  49 |  });
  50 | }
  51 | 
```