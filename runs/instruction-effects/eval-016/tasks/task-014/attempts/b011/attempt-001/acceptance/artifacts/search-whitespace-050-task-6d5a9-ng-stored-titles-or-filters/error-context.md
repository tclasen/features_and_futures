# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search-whitespace.spec.mjs >> 050 task search collapses spaces tabs without changing stored titles or filters
- Location: runs/instruction-effects/eval-016/tasks/task-014/suite/search-whitespace.spec.mjs:5:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').visible()
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').visible() with timeout 5000ms
  - waiting for getByTestId('task-row').visible()
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- main [ref=e2]:
  - button "Projects" [ref=e3] [cursor=pointer]
  - heading "task-014 Whitespace retained owner" [level=1] [ref=e4]
  - generic [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]: New project name
      - textbox "New project name" [ref=e8]
    - button "Rename project" [ref=e9] [cursor=pointer]
  - generic [ref=e10]:
    - generic [ref=e11]:
      - generic [ref=e12]: Task title
      - textbox "Task title" [ref=e13]
    - button "Create task" [ref=e14] [cursor=pointer]
  - generic [ref=e15]:
    - generic [ref=e16]: Default task priority
    - combobox "Default task priority" [ref=e17]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
    - generic [ref=e18]: Task filter
    - combobox "Task filter" [ref=e19]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
    - generic [ref=e20]: Priority filter
    - combobox "Priority filter" [ref=e21]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
    - generic [ref=e22]:
      - generic [ref=e23]:
        - generic [ref=e24]: Due from
        - textbox "Due from" [ref=e25]
      - generic [ref=e26]:
        - generic [ref=e27]: Due through
        - textbox "Due through" [ref=e28]
      - button "Apply due range" [ref=e29] [cursor=pointer]
  - generic [ref=e30]:
    - generic [ref=e31]:
      - generic [ref=e32]: Task search
      - textbox "Task search" [ref=e33]: original task
    - button "Search tasks" [active] [ref=e34] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority} from './helpers.mjs';
  3  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  4  | if(stage>=14){
  5  |  test('050 task search collapses spaces tabs without changing stored titles or filters',async({page})=>{
  6  |   await createProject(page,'Whitespace retained owner');await openProject(page,'Whitespace retained owner');await createTask(page,'Original  task gap');await createTask(page,'Other task gap');await taskRow(page,'Original  task gap').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Whitespace retained owner','Original  task gap','High');await taskRow(page,'Other task gap').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Whitespace retained owner','Other task gap','High');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});
  7  |   for(const query of [' original task ','ORIGINAL   TASK','original\t task']){await page.getByRole('textbox',{name:'Task search',exact:true}).fill('');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Other task gap')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
> 8  |    await page.getByRole('textbox',{name:'Task search',exact:true}).fill(query);await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Original  task gap')).toBeVisible();await expect(taskRow(page,'Other task gap')).toHaveCount(0);expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
     |                                                                                                                                                                                                                          ^ Error: expect(locator).toHaveCount(expected) failed
  9  |   }
  10 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Other task gap')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await page.reload();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');
  11 |  });
  12 |  test('051 project whitespace matching retains original names and archived intersection',async({page})=>{
  13 |   await createProject(page,'Whitespace   Saved first');await createProject(page,'Whitespace Saved second');await createProject(page,'Whitespace  Saved archived');await projectRow(page,'Whitespace  Saved archived').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Whitespace  Saved archived')).toHaveCount(0);
  14 |   await createProject(page,'Whitespace unrelated sentinel');let firstQuery=true;for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\t saved']){if(!firstQuery){await page.getByRole('textbox',{name:'Project search',exact:true}).fill('');await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,'Whitespace unrelated sentinel')).toBeVisible();}firstQuery=false;
  15 |    await page.getByRole('textbox',{name:'Project search',exact:true}).fill(projectName(query));await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,'Whitespace unrelated sentinel')).toHaveCount(0);await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(2);const rows=await page.getByTestId('project-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Whitespace   Saved first');expect(rows[1]).toContain('Whitespace Saved second');
  16 |   }
  17 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');await page.reload();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,'Whitespace  Saved archived')).toBeVisible();expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');
  18 |  });
  19 | }
  20 | 
```