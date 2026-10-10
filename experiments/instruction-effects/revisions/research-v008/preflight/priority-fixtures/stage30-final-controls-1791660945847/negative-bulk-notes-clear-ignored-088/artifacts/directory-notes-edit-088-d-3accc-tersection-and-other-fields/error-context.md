# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-notes-edit.spec.mjs >> 088 directory notes preserve literal text every intersection and other fields
- Location: experiments/instruction-effects/revisions/research-v008/preflight/priority-fixtures/final030-third-executed-suite/directory-notes-edit.spec.mjs:37:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: ""
Received: "  Literal Ω 😀	 with  spaces
second line
  "

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f98e1]:
  - heading "Task directory" [level=1] [ref=f98e2]
  - text: 0/2 completed
  - generic [ref=f98e3]:
    - text: task-030 Notes batch first0/1 completed
    - group [ref=f98e5]:
      - button "Open project" [ref=f98e6]
  - generic [ref=f98e7]:
    - text: task-030 Notes batch second0/1 completed
    - group [ref=f98e9]:
      - button "Open project" [ref=f98e10]
  - group [ref=f98e12]:
    - button "Complete visible tasks" [ref=f98e13]
  - group [ref=f98e15]:
    - button "Reopen visible tasks" [disabled] [ref=f98e16]
  - group [ref=f98e18]:
    - button "Delete visible tasks" [ref=f98e19]
  - group [ref=f98e21]:
    - button "Restore visible tasks" [disabled] [ref=f98e22]
  - group [ref=f98e24]:
    - generic [ref=f98e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f98e26]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f98e27]
  - group [ref=f98e29]:
    - generic [ref=f98e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f98e31]
    - button "Save visible due date" [ref=f98e32]
  - group [ref=f98e34]:
    - generic [ref=f98e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f98e36]
    - button "Save visible notes" [ref=f98e37]
  - group [ref=f98e39]:
    - button "Export matching workspace" [ref=f98e40]
  - group [ref=f98e42]:
    - button "Projects" [ref=f98e43]
  - generic [ref=f98e45]:
    - text: Directory order
    - combobox "Directory order" [ref=f98e46]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f98e48]:
    - text: Project scope
    - combobox "Project scope" [ref=f98e49]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f98e51]:
    - text: Task filter
    - combobox "Task filter" [ref=f98e52]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
      - option "Deleted"
  - generic [ref=f98e54]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f98e55]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - group [ref=f98e57]:
    - generic [ref=f98e58]:
      - text: Directory search
      - textbox "Directory search" [ref=f98e59]: task-030 Notes batch record
    - button "Search directory" [ref=f98e60]
  - group [ref=f98e62]:
    - generic [ref=f98e63]:
      - text: Due from
      - textbox "Due from" [ref=f98e64]: 2064-02-29
    - generic [ref=f98e65]:
      - text: Due through
      - textbox "Due through" [ref=f98e66]: 2064-02-29
    - button "Apply due range" [ref=f98e67]
  - generic [ref=f98e68]:
    - text: task-030 Notes batch record alpha targettask-030 Notes batch secondOpenHigh2064-02-29 Literal Ω 😀 with spaces second line
    - group [ref=f98e70]:
      - button "Open project" [ref=f98e71]
  - generic [ref=f98e72]:
    - text: task-030 Notes batch record zulu targettask-030 Notes batch firstOpenHigh2064-02-29 Literal Ω 😀 with spaces second line
    - group [ref=f98e74]:
      - button "Open project" [ref=f98e75]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const rows=p=>p.getByTestId('directory-task-row').filter({visible:true});
  4  | const owners=p=>p.getByTestId('directory-owner-row').filter({visible:true});
  5  | const save=p=>p.getByRole('button',{name:'Save visible notes',exact:true});
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
  31 | 
  32 | 
> 33 | async function persistedField(p,owner,title,label,value){const o=await p.context().newPage();try{await expect.poll(async()=>{await returnTo(o,owner);return taskRow(o,title).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await o.close();}}
     |                                                                                                                                                                                                                                                          ^ Error: expect(received).toBe(expected) // Object.is equality
  34 | 
  35 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  36 | if(stage>=27){
  37 |  test('088 directory notes preserve literal text every intersection and other fields',async({page})=>{
  38 |   test.setTimeout(90000);const a='Notes batch first',b='Notes batch second',c='Notes batch archived',q=projectName('Notes batch record'),first=q+' zulu target',second=q+' alpha target',low=q+' low guard',late=q+' date guard',done=q+' completed guard',other=projectName('Unrelated notes guard'),deleted=q+' deleted guard',archived=q+' archived guard';const original='Original Ω\nnotes',literal='  Literal Ω 😀\t with  spaces\nsecond line\n  ',fields={priority:'High',date:'2064-02-29',notes:original};
  39 |   await createProject(page,a);await openProject(page,a);await configured(page,a,first,fields);await configured(page,a,low,{...fields,priority:'Low'});await configured(page,a,late,{...fields,date:'2064-03-01'});await configured(page,a,done,{...fields,completed:true});await configured(page,a,other,{...fields,notes:q});await configured(page,a,deleted,{...fields,deleted:true});await createProject(page,b);await openProject(page,b);await configured(page,b,second,fields);await createProject(page,c);await openProject(page,c);await configured(page,c,archived,fields);await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,c).getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,c)).toHaveCount(0);
  40 |   await directory(page,q);await result(page,[a,b],['1/4 completed','0/1 completed'],[first,low,late,done,second],'1/5 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/3 completed','0/1 completed'],[first,low,late,second],'0/4 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/2 completed','0/1 completed'],[first,late,second],'0/3 completed');await page.getByRole('textbox',{name:'Due from',exact:true}).fill(fields.date);await page.getByRole('textbox',{name:'Due through',exact:true}).fill(fields.date);await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[first,second],'0/2 completed');await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(literal);await save(page).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await persistedField(page,a,first,'Task notes',literal);await persistedField(page,b,second,'Task notes',literal);
  41 |   const o=await page.context().newPage();try{await returnTo(o,a);await titles(o,[first,low,late,done,other]);for(const [title,text] of [[first,literal],[low,original],[late,original],[done,original],[other,q]])await expect(taskRow(o,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(text);await expect(taskRow(o,first).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(o,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(fields.date);await expect(o.getByRole('checkbox',{name:'Complete '+done,exact:true})).toBeChecked();await o.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(o,deleted).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(original);await returnTo(o,b);await expect(taskRow(o,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(literal);}finally{await o.close();}
  42 |   await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill('');await save(page).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await persistedField(page,a,first,'Task notes','');await persistedField(page,b,second,'Task notes','');const cleared=await page.context().newPage();try{for(const [owner,title] of [[a,first],[b,second]]){await returnTo(cleared,owner);await expect(taskRow(cleared,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('');}}finally{await cleared.close();}
  43 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[a],['1/1 completed'],[done],'1/1 completed');await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(literal);await save(page).click();await result(page,[a],['1/1 completed'],[done],'1/1 completed');await persistedField(page,a,done,'Task notes',literal);await returnTo(page,a);await expect(taskRow(page,done).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(literal);await directory(page,q);await result(page,[a,b],['1/4 completed','0/1 completed'],[first,low,late,done,second],'1/5 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');await expect(save(page)).toBeDisabled();await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await expect(save(page)).toBeDisabled();
  44 |  });
  45 |  test('089 directory notes limit counts Unicode code points and rejects atomically with correction text retained',async({page})=>{
  46 |   test.setTimeout(90000);const a='Notes limit first',b='Notes limit second',q=projectName('Notes limit target'),first=q+' first',second=q+' second';await createProject(page,a);await openProject(page,a);await configured(page,a,first,{notes:'First original'});await createProject(page,b);await openProject(page,b);await configured(page,b,second,{notes:'Second original',completed:true});await directory(page,q);await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');const proposed='😀'.repeat(10001);await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(proposed);await save(page).click();await expect(page.getByRole('alert')).toContainText('Task notes must be at most 10000 characters');await expect(page.getByRole('textbox',{name:'Visible tasks notes',exact:true})).toHaveValue(proposed);await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');const o=await page.context().newPage();try{for(const [owner,title,text] of [[a,first,'First original'],[b,second,'Second original']]){await returnTo(o,owner);await expect(taskRow(o,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(text);}}finally{await o.close();}
  47 |   const valid='😀'.repeat(10000);await page.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill(valid);await save(page).click();await persistedField(page,a,first,'Task notes',valid);await persistedField(page,b,second,'Task notes',valid);const check=await page.context().newPage();try{for(const [owner,title] of [[a,first],[b,second]]){await returnTo(check,owner);await expect(taskRow(check,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(valid);}}finally{await check.close();}await result(page,[a,b],['0/1 completed','1/1 completed'],[first,second],'1/2 completed');
  48 |  });
  49 | }
  50 | 
```