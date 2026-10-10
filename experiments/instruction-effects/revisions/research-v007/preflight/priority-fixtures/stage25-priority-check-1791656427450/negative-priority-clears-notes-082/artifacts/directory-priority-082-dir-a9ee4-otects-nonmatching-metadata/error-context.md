# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-priority.spec.mjs >> 082 directory priority assignment honors intersected live results and protects nonmatching metadata
- Location: experiments/instruction-effects/revisions/research-v007/decisions/task-025-draft/suite/directory-priority.spec.mjs:32:2

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-025 Priority batch record target zulu', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true })
Timeout: 5000ms
Expected: "Literal Ω
  retained priority notes"
Received: ""

Call log:
  - Expect "toHaveValue" getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-025 Priority batch record target zulu', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-025 Priority batch record target zulu', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true })
    14 × locator resolved to <textarea name="notes"></textarea>
       - unexpected value ""

```

```yaml
- textbox "Task notes"
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
  41 |   await expect(page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).locator('option:checked')).toHaveText('Normal');
  42 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await result(page,[a,b],['0/3 completed','0/1 completed'],[first,low,late,second],'0/4 completed');
  43 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Normal'});await result(page,[a,b],['0/2 completed','0/1 completed'],[first,late,second],'0/3 completed');
  44 |   await page.getByRole('textbox',{name:'Due from',exact:true}).fill(fields.date);await page.getByRole('textbox',{name:'Due through',exact:true}).fill(fields.date);await page.getByRole('button',{name:'Apply due range',exact:true}).click();await result(page,[a,b],['0/1 completed','0/1 completed'],[first,second],'0/2 completed');
  45 |   await page.getByRole('combobox',{name:'Directory order',exact:true}).selectOption({label:'Title'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'High'});await save(page).click();await result(page,[],[],[],'0/0 completed');await expect(save(page)).toBeDisabled();
  46 |   const observer=await page.context().newPage();try{
  47 |    await returnTo(observer,a);await titles(observer,[first,low,late,done,other]);
  48 |    for(const [title,priority] of [[first,'High'],[low,'Low'],[late,'Normal'],[done,'Normal'],[other,'Normal']])await expect(taskRow(observer,title).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText(priority);
> 49 |    await expect(observer.getByRole('checkbox',{name:'Complete '+done,exact:true})).toBeChecked();await expect(taskRow(observer,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(fields.date);await expect(taskRow(observer,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);
     |                                                                                                                                                                                                                                                                                                                  ^ Error: expect(locator).toHaveValue(expected) failed
  50 |    await observer.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(observer,deleted).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');
  51 |    await returnTo(observer,b);await expect(taskRow(observer,second).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(observer,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(fields.notes);
  52 |   }finally{await observer.close();}
  53 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await result(page,[a,b],['0/1 completed','0/1 completed'],[second,first],'0/2 completed');
  54 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Normal'});await result(page,[a],['1/1 completed'],[done],'1/1 completed');await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await save(page).click();await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Low'});await result(page,[a],['1/1 completed'],[done],'1/1 completed');
  55 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'Normal'});await result(page,[a],['0/1 completed'],[deleted],'0/1 completed');await expect(save(page)).toBeDisabled();
  56 |   await page.getByRole('combobox',{name:'Project scope',exact:true}).selectOption({label:'Archived'});await result(page,[],[],[],'0/0 completed');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await result(page,[c],['0/1 completed'],[archived],'0/1 completed');await expect(save(page)).toBeDisabled();
  57 |   await directory(page,q);await result(page,[a,b],['1/4 completed','0/1 completed'],[first,low,late,done,second],'1/5 completed');await expect(page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).locator('option:checked')).toHaveText('Normal');
  58 |  });
  59 | }
  60 | 
```