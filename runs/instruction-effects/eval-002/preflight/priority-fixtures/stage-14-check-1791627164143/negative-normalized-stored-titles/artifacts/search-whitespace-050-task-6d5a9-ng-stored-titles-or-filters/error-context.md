# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search-whitespace.spec.mjs >> 050 task search collapses spaces tabs without changing stored titles or filters
- Location: runs/instruction-effects/eval-002/decisions/task-014-draft/suite/search-whitespace.spec.mjs:5:2

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "Original  task gap"
Received string:    "Original task gap·····
    Task due dateSave due date
    Destination projecttask-012 Position first ownertask-012 Position second ownerMove task
    New task titleRename task
    Task priorityLowNormalHigh"
```

# Page snapshot

```yaml
- generic [active] [ref=f8e1]:
  - heading "task-014 Whitespace retained owner" [level=1] [ref=f8e2]
  - group [ref=f8e4]:
    - button "Projects" [ref=f8e5]
  - group [ref=f8e7]:
    - generic [ref=f8e8]:
      - text: Task search
      - textbox "Task search" [ref=f8e9]: original task
    - button "Search tasks" [ref=f8e10]
  - group [ref=f8e12]:
    - generic [ref=f8e13]:
      - text: Due from
      - textbox "Due from" [ref=f8e14]
    - generic [ref=f8e15]:
      - text: Due through
      - textbox "Due through" [ref=f8e16]
    - button "Apply due range" [ref=f8e17]
  - group [ref=f8e19]:
    - generic [ref=f8e20]:
      - text: New project name
      - textbox "New project name" [ref=f8e21]
    - button "Rename project" [ref=f8e22]
  - generic [ref=f8e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f8e25]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f8e27]:
    - generic [ref=f8e28]:
      - text: Task title
      - textbox "Task title" [ref=f8e29]
    - button "Create task" [ref=f8e30]
  - generic [ref=f8e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f8e33]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
  - generic [ref=f8e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f8e36]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f8e37]:
    - text: Original task gap
    - checkbox "Complete Original task gap" [ref=f8e39]
    - group [ref=f8e41]:
      - generic [ref=f8e42]:
        - text: Task due date
        - textbox "Task due date" [ref=f8e43]
      - button "Save due date" [ref=f8e44]
    - group [ref=f8e46]:
      - generic [ref=f8e47]:
        - text: Destination project
        - combobox "Destination project" [ref=f8e48]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
      - button "Move task" [ref=f8e49]
    - group [ref=f8e51]:
      - generic [ref=f8e52]:
        - text: New task title
        - textbox "New task title" [ref=f8e53]
      - button "Rename task" [ref=f8e54]
    - generic [ref=f8e56]:
      - text: Task priority
      - combobox "Task priority" [ref=f8e57]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority} from './helpers.mjs';
  3  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  4  | if(stage>=14){
  5  |  test('050 task search collapses spaces tabs without changing stored titles or filters',async({page})=>{
  6  |   await createProject(page,'Whitespace retained owner');await openProject(page,'Whitespace retained owner');await createTask(page,'Original  task gap');await createTask(page,'Other task gap');await taskRow(page,'Original  task gap').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Whitespace retained owner','Original  task gap','High');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});
  7  |   for(const query of [' original task ','ORIGINAL   TASK','original\t task']){
> 8  |    await page.getByRole('textbox',{name:'Task search',exact:true}).fill(query);await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Original  task gap')).toBeVisible();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
     |                                                                                                                                                                                                                                                                                                                                                                       ^ Error: expect(received).toContain(expected) // indexOf
  9  |   }
  10 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('');await page.getByRole('button',{name:'Search tasks',exact:true}).click();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await page.reload();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');
  11 |  });
  12 |  test('051 project whitespace matching retains original names and archived intersection',async({page})=>{
  13 |   await createProject(page,'Whitespace   Saved first');await createProject(page,'Whitespace Saved second');await createProject(page,'Whitespace  Saved archived');await projectRow(page,'Whitespace  Saved archived').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Whitespace  Saved archived')).toHaveCount(0);
  14 |   for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\t saved']){
  15 |    await page.getByRole('textbox',{name:'Project search',exact:true}).fill(query);await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(2);const rows=await page.getByTestId('project-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Whitespace   Saved first');expect(rows[1]).toContain('Whitespace Saved second');
  16 |   }
  17 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');await page.reload();expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');
  18 |  });
  19 | }
  20 | 
```