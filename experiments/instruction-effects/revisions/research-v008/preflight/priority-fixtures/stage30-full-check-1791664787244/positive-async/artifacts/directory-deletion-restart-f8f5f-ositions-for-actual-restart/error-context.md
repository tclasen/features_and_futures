# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-deletion-restart.spec.mjs >> 081 seed bulk deletion restoration fields and remembered positions for actual restart
- Location: experiments/instruction-effects/revisions/research-v008/preflight/priority-fixtures/final030-fourth-executed-suite/directory-deletion-restart.spec.mjs:4:14

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Bulk deletion restart record restored first', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true })
Timeout: 5000ms
- Expected  - 2
+ Received  + 2

-   Bulk restart Ω 😀
- updated literal  
+ Restored restart Ω
+ first literal

Call log:
  - Expect "toHaveValue" getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Bulk deletion restart record restored first', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete task-030 Bulk deletion restart record restored first', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true })
    14 × locator resolved to <textarea name="notes">Restored restart Ω↵first literal</textarea>
       - unexpected value "Restored restart Ω
first literal"

```

```yaml
- textbox "Task notes": Restored restart Ω first literal
```

# Test source

```ts
  1  | import {expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | const firstOwner='Bulk deletion restart first',secondOwner='Bulk deletion restart second',holding='Bulk deletion restart holding';
  4  | const firstTitle=()=>projectName('Bulk deletion restart record')+' restored first';
  5  | const secondTitle=()=>projectName('Bulk deletion restart record')+' deleted second';
  6  | const before='Bulk deletion before',after='Bulk deletion after',holdBefore='Bulk deletion holding before',holdAfter='Bulk deletion holding after';
  7  | async function home(p,owner){await p.goto('/');await openProject(p,owner);}
  8  | async function order(p,titles){const rows=p.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(titles.length);for(const [i,title] of titles.entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  9  | async function save(p,owner,title,label,value){await taskRow(p,title).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(p,title).getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const o=await p.context().newPage();try{await expect.poll(async()=>{await home(o,owner);return taskRow(o,title).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await o.close();}await home(p,owner);}
  10 | async function defaults(p,owner,value){await p.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:value});const o=await p.context().newPage();try{await expect.poll(async()=>{await home(o,owner);return o.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe(value);}finally{await o.close();}await home(p,owner);}
  11 | async function move(p,source,target,title,sourceOrder,targetOrder){await taskRow(p,title).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(p,title).getByRole('button',{name:'Move task',exact:true}).click();const o=await p.context().newPage();try{await home(o,target);await order(o,targetOrder);await home(o,source);await order(o,sourceOrder);}finally{await o.close();}await home(p,target);}
  12 | export async function seedBulkDeletionPersistence(p){
  13 |  const first=firstTitle(),second=secondTitle();
  14 |  await createProject(p,firstOwner);await openProject(p,firstOwner);await defaults(p,firstOwner,'Low');await createTask(p,before);await createTask(p,first);await createTask(p,after);await taskRow(p,first).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(p,firstOwner,first,'High');await home(p,firstOwner);await save(p,firstOwner,first,'Task due date','2064-02-29');await save(p,firstOwner,first,'Task notes','Restored restart Ω\nfirst literal');
  15 |  await createProject(p,holding);await openProject(p,holding);await createTask(p,holdBefore);await home(p,firstOwner);await move(p,firstOwner,holding,first,[before,after],[holdBefore,first]);await move(p,holding,firstOwner,first,[holdBefore],[before,first,after]);await home(p,holding);await createTask(p,holdAfter);
  16 |  await createProject(p,secondOwner);await openProject(p,secondOwner);await defaults(p,secondOwner,'High');await createTask(p,second);await taskRow(p,second).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'Low'});await expectPersistedPriority(p,secondOwner,second,'Low');await home(p,secondOwner);await p.getByRole('checkbox',{name:'Complete '+second,exact:true}).check();await expectPersistedCompletion(p,secondOwner,second,true);await home(p,secondOwner);await save(p,secondOwner,second,'Task due date','2068-02-29');await save(p,secondOwner,second,'Task notes','Deleted restart Ω\nsecond literal');
  17 |  await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(projectName('Bulk deletion restart record'));await p.getByRole('button',{name:'Search directory',exact:true}).click();const rows=p.getByTestId('directory-task-row').filter({visible:true});await expect(rows.getByTestId('directory-task-title')).toHaveText([first,second]);await p.getByRole('button',{name:'Delete visible tasks',exact:true}).click();await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(rows).toHaveCount(0);await p.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(rows.getByTestId('directory-task-title')).toHaveText([first,second]);await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(first);await p.getByRole('button',{name:'Search directory',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([first]);await p.getByRole('button',{name:'Restore visible tasks',exact:true}).click();await expect(p.getByText('No matching tasks',{exact:true})).toBeVisible();await expect(rows).toHaveCount(0);
  18 | 
  19 |  if(stage>=25){await p.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await expect(rows.getByTestId('directory-task-title')).toHaveText([first]);await p.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Low'});await p.getByRole('button',{name:'Set visible priority',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([first]);await expectPersistedPriority(p,firstOwner,first,'Low');}
  20 |  if(stage>=26){await p.goto('/');await p.getByRole('button',{name:'Task directory',exact:true}).click();await p.getByRole('textbox',{name:'Directory search',exact:true}).fill(first);await p.getByRole('button',{name:'Search directory',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([first]);await p.getByRole('textbox',{name:'Visible tasks due date',exact:true}).fill('2400-02-29');await p.getByRole('button',{name:'Save visible due date',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([first]);const observer=await p.context().newPage();try{await expect.poll(async()=>{await home(observer,firstOwner);return taskRow(observer,first).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();}).toBe('2400-02-29');}finally{await observer.close();}}
  21 |  if(stage>=27){await p.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill('  Bulk restart Ω 😀\nupdated literal  ');await p.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([first]);}
  22 |  await checkBulkDeletionPersistence(p,false);
  23 | }
  24 | export async function checkBulkDeletionPersistence(p,movePositions){
  25 |  const first=firstTitle(),second=secondTitle();
> 26 |  await home(p,firstOwner);await order(p,[before,first,after]);await expect(p.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('Low');await expect(p.getByRole('checkbox',{name:'Complete '+first,exact:true})).not.toBeChecked();await expect(taskRow(p,first).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText(stage>=25?'Low':'High');await expect(taskRow(p,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(stage>=26?'2400-02-29':'2064-02-29');await expect(taskRow(p,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(stage>=27?'  Bulk restart Ω 😀\nupdated literal  ':'Restored restart Ω\nfirst literal');
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     ^ Error: expect(locator).toHaveValue(expected) failed
  27 |  await p.goto('/');await expect(projectRow(p,firstOwner).getByTestId('project-summary')).toHaveText('0/3 completed');await expect(projectRow(p,secondOwner).getByTestId('project-summary')).toHaveText('0/0 completed');await openProject(p,secondOwner);await order(p,[]);await expect(p.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('High');await p.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await order(p,[second]);await expect(p.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeChecked();await expect(p.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeDisabled();await expect(taskRow(p,second).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Low');await expect(taskRow(p,second).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2068-02-29');await expect(taskRow(p,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Deleted restart Ω\nsecond literal');await expect(taskRow(p,second).getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await home(p,holding);await order(p,[holdBefore,holdAfter]);
  28 |  if(movePositions){await home(p,firstOwner);await move(p,firstOwner,holding,first,[before,after],[holdBefore,first,holdAfter]);await move(p,holding,firstOwner,first,[holdBefore,holdAfter],[before,first,after]);}
  29 | }
  30 | 
```