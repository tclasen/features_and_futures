# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fixture-position.spec.mjs >> PM081 stored fields and own/foreign positions survive later traversal
- Location: experiments/instruction-effects/revisions/research-v009/preflight/priority-fixtures/stage30-seed081-position-only/suite/fixture-position.spec.mjs:4:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete task-030 Bulk deletion restart record restored first', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete task-030 Bulk deletion restart record restored first', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete task-030 Bulk deletion restart record restored first', exact: true })

```

```yaml
- heading "task-030 Bulk deletion restart first" [level=1]
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
  - option "Low" [selected]
  - option "Normal"
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
- text: Bulk deletion before
- group:
  - button "Delete task"
- checkbox "Complete Bulk deletion before"
- group:
  - text: Task notes
  - textbox "Task notes"
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date"
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
    - option "task-030 Bulk deletion restart holding"
    - option "task-030 Bulk deletion restart second"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low" [selected]
  - option "Normal"
  - option "High"
- text: Bulk deletion after
- group:
  - button "Delete task"
- checkbox "Complete Bulk deletion after"
- group:
  - text: Task notes
  - textbox "Task notes"
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date"
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
    - option "task-030 Bulk deletion restart holding"
    - option "task-030 Bulk deletion restart second"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low" [selected]
  - option "Normal"
  - option "High"
- text: task-030 Bulk deletion restart record restored first
- group:
  - button "Delete task"
- checkbox "Complete task-030 Bulk deletion restart record restored first"
- group:
  - text: Task notes
  - textbox "Task notes": Bulk restart Ω 😀 updated literal
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2400-02-29
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
    - option "task-030 Bulk deletion restart holding"
    - option "task-030 Bulk deletion restart second"
  - button "Move task"
- group:
  - text: New task title
  - textbox "New task title"
  - button "Rename task"
- text: Task priority
- combobox "Task priority":
  - option "Low" [selected]
  - option "Normal"
  - option "High"
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
> 8  | async function order(p,titles){const rows=p.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(titles.length);for(const [i,title] of titles.entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
     |                                                                                                                                                                                                                                                                      ^ Error: expect(locator).toBeVisible() failed
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
  21 |  if(stage>=27){await p.getByRole('textbox',{name:'Visible tasks notes',exact:true}).fill('  Bulk restart Ω 😀\nupdated literal  ');await p.getByRole('button',{name:'Save visible notes',exact:true}).click();await expect(rows.getByTestId('directory-task-title')).toHaveText([first]);const observer=await p.context().newPage();try{await expect.poll(async()=>{await home(observer,firstOwner);return taskRow(observer,first).getByRole('textbox',{name:'Task notes',exact:true}).inputValue();},{timeout:5000}).toBe('  Bulk restart Ω 😀\nupdated literal  ');}finally{await observer.close();}}
  22 |  await checkBulkDeletionPersistence(p,false);
  23 | }
  24 | export async function checkBulkDeletionPersistence(p,movePositions){
  25 |  const first=firstTitle(),second=secondTitle();
  26 |  await home(p,firstOwner);await order(p,[before,first,after]);await expect(p.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('Low');await expect(p.getByRole('checkbox',{name:'Complete '+first,exact:true})).not.toBeChecked();await expect(taskRow(p,first).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText(stage>=25?'Low':'High');await expect(taskRow(p,first).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue(stage>=26?'2400-02-29':'2064-02-29');await expect(taskRow(p,first).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue(stage>=27?'  Bulk restart Ω 😀\nupdated literal  ':'Restored restart Ω\nfirst literal');
  27 |  await p.goto('/');await expect(projectRow(p,firstOwner).getByTestId('project-summary')).toHaveText('0/3 completed');await expect(projectRow(p,secondOwner).getByTestId('project-summary')).toHaveText('0/0 completed');await openProject(p,secondOwner);await order(p,[]);await expect(p.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked')).toHaveText('High');await p.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await order(p,[second]);await expect(p.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeChecked();await expect(p.getByRole('checkbox',{name:'Complete '+second,exact:true})).toBeDisabled();await expect(taskRow(p,second).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Low');await expect(taskRow(p,second).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2068-02-29');await expect(taskRow(p,second).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Deleted restart Ω\nsecond literal');await expect(taskRow(p,second).getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await home(p,holding);await order(p,[holdBefore,holdAfter]);
  28 |  if(movePositions){await home(p,firstOwner);await move(p,firstOwner,holding,first,[before,after],[holdBefore,first,holdAfter]);await move(p,holding,firstOwner,first,[holdBefore,holdAfter],[before,first,after]);}
  29 | }
  30 | 
```