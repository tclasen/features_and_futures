# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-priority-position.spec.mjs >> 084 bulk priority assignment preserves own and foreign reserved positions later edits and export order
- Location: experiments/instruction-effects/revisions/research-v007/decisions/task-025-expanded-draft/suite/directory-priority-position.spec.mjs:8:14

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete task-025 Bulk position travelling', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete task-025 Bulk position travelling', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete task-025 Bulk position travelling', exact: true })

```

```yaml
- heading "task-025 Bulk position first" [level=1]
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
- text: Bulk before A
- group:
  - button "Delete task"
- checkbox "Complete Bulk before A"
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
    - option "task-025 Bulk position second"
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
- text: Bulk after A
- group:
  - button "Delete task"
- checkbox "Complete Bulk after A"
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
    - option "task-025 Bulk position second"
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
- text: task-025 Bulk position travelling
- group:
  - button "Delete task"
- checkbox "Complete task-025 Bulk position travelling" [checked]
- group:
  - text: Task notes
  - textbox "Task notes": After deletion Ω new literal notes
  - button "Save notes"
- group:
  - text: Task due date
  - textbox "Task due date": 2068-02-29
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
    - option "task-025 Bulk position second"
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
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | async function home(p,owner){await p.goto('/');await openProject(p,owner);}
> 4  | async function order(p,titles){const rows=p.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(titles.length);for(const [i,title] of titles.entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
     |                                                                                                                                                                                                                                                                      ^ Error: expect(locator).toBeVisible() failed
  5  | async function save(p,owner,title,label,value){await taskRow(p,title).getByRole('textbox',{name:label,exact:true}).fill(value);await taskRow(p,title).getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const o=await p.context().newPage();try{await expect.poll(async()=>{await home(o,owner);return taskRow(o,title).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await o.close();}await home(p,owner);}
  6  | async function move(p,source,target,title,sourceOrder,targetOrder){await taskRow(p,title).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(p,title).getByRole('button',{name:'Move task',exact:true}).click();const o=await p.context().newPage();try{await home(o,target);await order(o,targetOrder);await home(o,source);await order(o,sourceOrder);}finally{await o.close();}await home(p,target);}
  7  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  8  | if(stage>=25)test('084 bulk priority assignment preserves own and foreign reserved positions later edits and export order',async({page})=>{
  9  |  test.setTimeout(90000);const a='Bulk position first',b='Bulk position second',beforeA='Bulk before A',afterA='Bulk after A',beforeB='Bulk before B',afterB='Bulk later B',travel=projectName('Bulk position travelling');
  10 |  await createProject(page,a);await openProject(page,a);await createTask(page,beforeA);await createTask(page,travel);await createTask(page,afterA);await taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,a,travel,'High');await home(page,a);await save(page,a,travel,'Task due date','2064-02-29');await save(page,a,travel,'Task notes','Before deletion Ω\nretained');
  11 |  await createProject(page,b);await openProject(page,b);await createTask(page,beforeB);await home(page,a);await move(page,a,b,travel,[beforeA,afterA],[beforeB,travel]);await move(page,b,a,travel,[beforeB],[beforeA,travel,afterA]);await home(page,b);await createTask(page,afterB);
  12 |  await page.goto('/');await page.getByRole('button',{name:'Task directory',exact:true}).click();await page.getByRole('textbox',{name:'Directory search',exact:true}).fill(travel);await page.getByRole('button',{name:'Search directory',exact:true}).click();const rows=page.getByTestId('directory-task-row').filter({visible:true});await expect(rows.getByTestId('directory-task-title')).toHaveText([travel]);await page.getByRole('combobox',{name:'Visible tasks priority',exact:true}).selectOption({label:'Normal'});await page.getByRole('button',{name:'Set visible priority',exact:true}).click();const observer=await page.context().newPage();try{await expectPersistedPriority(observer,a,travel,'Normal');}finally{await observer.close();}await expect(rows.getByTestId('directory-task-title')).toHaveText([travel]);
  13 |  await home(page,a);await order(page,[beforeA,travel,afterA]);await expect(taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Normal');await move(page,a,b,travel,[beforeA,afterA],[beforeB,travel,afterB]);await taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'Low'});await expectPersistedPriority(page,b,travel,'Low');await home(page,b);await page.getByRole('checkbox',{name:'Complete '+travel,exact:true}).check();await expectPersistedCompletion(page,b,travel,true);await home(page,b);await save(page,b,travel,'Task due date','2068-02-29');await save(page,b,travel,'Task notes','After deletion Ω\nnew literal notes');await move(page,b,a,travel,[beforeB,afterB],[beforeA,travel,afterA]);
  14 |  await expect(taskRow(page,travel).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('Low');await expect(page.getByRole('checkbox',{name:'Complete '+travel,exact:true})).toBeChecked();await expect(taskRow(page,travel).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2068-02-29');await expect(taskRow(page,travel).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('After deletion Ω\nnew literal notes');
  15 |  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download project',exact:true}).click();const download=await pending;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const doc=JSON.parse(Buffer.concat(chunks).toString('utf8'));expect(doc.project.tasks.map(t=>t.title)).toEqual([beforeA,travel,afterA]);expect(doc.project.tasks[1]).toMatchObject({title:travel,completed:true,priority:'Low',dueDate:'2068-02-29',notes:'After deletion Ω\nnew literal notes',deleted:false});await page.goto('/');await expect(projectRow(page,a).getByTestId('project-summary')).toHaveText('1/3 completed');await expect(projectRow(page,b).getByTestId('project-summary')).toHaveText('0/2 completed');
  16 | });
  17 | 
```