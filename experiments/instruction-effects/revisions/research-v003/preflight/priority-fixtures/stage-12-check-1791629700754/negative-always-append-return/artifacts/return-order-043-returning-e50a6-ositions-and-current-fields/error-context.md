# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: return-order.spec.mjs >> 043 returning tasks in reverse order restores prior positions and current fields
- Location: experiments/instruction-effects/revisions/research-v003/decisions/task-012-draft/suite/return-order.spec.mjs:13:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete Return second', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete Return second', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').visible().nth(1).getByRole('checkbox', { name: 'Complete Return second', exact: true })

```

```yaml
- heading "task-012 Return owner" [level=1]
- group:
  - button "Projects"
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
- text: Priority filter
- combobox "Priority filter":
  - option "All" [selected]
  - option "Low"
  - option "Normal"
  - option "High"
- text: Return first
- checkbox "Complete Return first"
- group:
  - text: Task due date
  - textbox "Task due date"
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Return holding" [selected]
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
- text: Return fourth
- checkbox "Complete Return fourth"
- group:
  - text: Task due date
  - textbox "Task due date"
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Return holding" [selected]
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
- text: Return third
- checkbox "Complete Return third"
- group:
  - text: Task due date
  - textbox "Task due date"
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Return holding" [selected]
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
- text: Return second
- checkbox "Complete Return second" [checked]
- group:
  - text: Task due date
  - textbox "Task due date"
  - button "Save due date"
- group:
  - text: Destination project
  - combobox "Destination project":
    - option "task-012 Return holding" [selected]
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
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3  | async function moveTask(page,source,target,title){
  4  |  const completed=await taskRow(page,title).getByRole('checkbox',{name:'Complete '+title,exact:true}).isChecked();
  5  |  const baseline=await page.context().newPage();let sourceSummary;
  6  |  try{await baseline.goto('/');const summary=projectRow(baseline,source).getByTestId('project-summary');await expect(summary).toHaveText(/^\d+\/\d+ completed$/);const [done,total]=(await summary.innerText()).match(/\d+/g).map(Number);sourceSummary=`${done-Number(completed)}/${total-1} completed`;}finally{await baseline.close();}
  7  |  await taskRow(page,title).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,title).getByRole('button',{name:'Move task',exact:true}).click();
  8  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,target);await expect(taskRow(observer,title)).toBeVisible();let count=await taskRow(observer,title).count();await observer.goto('/');await expect(projectRow(observer,source).getByTestId('project-summary')).toHaveText(sourceSummary);await openProject(observer,source);return [count,await taskRow(observer,title).count()];},{timeout:5000}).toEqual([1,0]);}finally{await observer.close();}
  9  | }
> 10 | async function order(page,titles){const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(titles.length);for(const [i,title] of titles.entries())await expect(rows.nth(i).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
     |                                                                                                                                                                                                                                                                            ^ Error: expect(locator).toBeVisible() failed
  11 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  12 | if(stage>=12){
  13 |  test('043 returning tasks in reverse order restores prior positions and current fields',async({page})=>{
  14 |   await createProject(page,'Return holding');await createProject(page,'Return owner');await openProject(page,'Return owner');
  15 |   for(const title of ['Return first','Return second','Return third','Return fourth'])await createTask(page,title);
  16 |   await moveTask(page,'Return owner','Return holding','Return second');await moveTask(page,'Return owner','Return holding','Return third');await order(page,['Return first','Return fourth']);await page.goto('/');await openProject(page,'Return holding');
  17 |   await taskRow(page,'Return second').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Return holding','Return second','High');await page.getByRole('checkbox',{name:'Complete Return second',exact:true}).check();await expectPersistedCompletion(page,'Return holding','Return second',true);
  18 |   await moveTask(page,'Return holding','Return owner','Return third');await moveTask(page,'Return holding','Return owner','Return second');await page.goto('/');await openProject(page,'Return owner');await order(page,['Return first','Return second','Return third','Return fourth']);await expect(taskRow(page,'Return second').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('checkbox',{name:'Complete Return second',exact:true})).toBeChecked();await page.reload();await order(page,['Return first','Return second','Return third','Return fourth']);
  19 |  });
  20 |  test('044 rename archival and restoration preserve returning project identity',async({page})=>{
  21 |   await createProject(page,'Return identity holding');await createProject(page,'Return identity owner');await openProject(page,'Return identity owner');for(const title of ['Identity before','Identity returning','Identity after'])await createTask(page,title);await moveTask(page,'Return identity owner','Return identity holding','Identity returning');
  22 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Returned owner renamed'));await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName('Returned owner renamed'),exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Returned owner renamed').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Returned owner renamed')).toHaveCount(0);await openProject(page,'Return identity holding');
  23 |   const choices=()=>taskRow(page,'Identity returning').getByRole('combobox',{name:'Destination project',exact:true}).locator('option');await expect(taskRow(page,'Identity returning')).toBeVisible();await expect(choices()).not.toContainText([projectName('Returned owner renamed')]);
  24 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Returned owner renamed').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Return identity holding');await expect(taskRow(page,'Identity returning')).toBeVisible();await expect(choices()).toContainText([projectName('Returned owner renamed')]);await expect(choices()).not.toContainText([projectName('Return identity owner')]);
  25 |   await moveTask(page,'Return identity holding','Returned owner renamed','Identity returning');await page.goto('/');await openProject(page,'Returned owner renamed');await order(page,['Identity before','Identity returning','Identity after']);
  26 |  });
  27 |  test('045 return positions belong to each project and precede later new arrivals',async({page})=>{
  28 |   await createProject(page,'Position second owner');await openProject(page,'Position second owner');await createTask(page,'Second existing');await createProject(page,'Position third owner');await createProject(page,'Position first owner');await openProject(page,'Position first owner');for(const title of ['First existing','Position travelling','First later'])await createTask(page,title);
  29 |   await moveTask(page,'Position first owner','Position second owner','Position travelling');await createTask(page,'First newly created');await page.goto('/');await openProject(page,'Position second owner');await order(page,['Second existing','Position travelling']);await moveTask(page,'Position second owner','Position third owner','Position travelling');await createTask(page,'Second newly created');await page.goto('/');await openProject(page,'Position third owner');await moveTask(page,'Position third owner','Position second owner','Position travelling');await page.goto('/');await openProject(page,'Position second owner');await order(page,['Second existing','Position travelling','Second newly created']);
  30 |   await moveTask(page,'Position second owner','Position first owner','Position travelling');await page.goto('/');await openProject(page,'Position first owner');await order(page,['First existing','Position travelling','First later','First newly created']);
  31 |  });
  32 | }
  33 | 
```