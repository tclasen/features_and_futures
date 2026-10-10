# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search-whitespace.spec.mjs >> 051 project whitespace matching retains original names and archived intersection
- Location: experiments/instruction-effects/revisions/research-v003/decisions/task-014-draft/suite/search-whitespace.spec.mjs:12:2

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "Whitespace   Saved first"
Received string:    "task-014 Whitespace Saved first0/0 completedOpen projectArchive project"
```

# Page snapshot

```yaml
- generic [active] [ref=f7e1]:
  - heading "Workboard" [level=1] [ref=f7e2]
  - group [ref=f7e4]:
    - generic [ref=f7e5]:
      - text: Project name
      - textbox "Project name" [ref=f7e6]
    - button "Create project" [ref=f7e7]
  - group [ref=f7e9]:
    - generic [ref=f7e10]:
      - text: Project search
      - textbox "Project search" [ref=f7e11]: whitespace saved
    - button "Search projects" [ref=f7e12]
  - generic [ref=f7e14]:
    - text: Project filter
    - combobox "Project filter" [ref=f7e15]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f7e16]:
    - text: task-014 Whitespace Saved first0/0 completed
    - group [ref=f7e18]:
      - button "Open project" [ref=f7e19]
    - group [ref=f7e21]:
      - button "Archive project" [ref=f7e22]
  - generic [ref=f7e23]:
    - text: task-014 Whitespace Saved second0/0 completed
    - group [ref=f7e25]:
      - button "Open project" [ref=f7e26]
    - group [ref=f7e28]:
      - button "Archive project" [ref=f7e29]
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
  8  |    await page.getByRole('textbox',{name:'Task search',exact:true}).fill(query);await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Original  task gap')).toBeVisible();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  9  |   }
  10 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('');await page.getByRole('button',{name:'Search tasks',exact:true}).click();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await page.reload();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');
  11 |  });
  12 |  test('051 project whitespace matching retains original names and archived intersection',async({page})=>{
  13 |   await createProject(page,'Whitespace   Saved first');await createProject(page,'Whitespace Saved second');await createProject(page,'Whitespace  Saved archived');await projectRow(page,'Whitespace  Saved archived').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Whitespace  Saved archived')).toHaveCount(0);
  14 |   for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\t saved']){
> 15 |    await page.getByRole('textbox',{name:'Project search',exact:true}).fill(query);await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(2);const rows=await page.getByTestId('project-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Whitespace   Saved first');expect(rows[1]).toContain('Whitespace Saved second');
     |                                                                                                                                                                                                                                                                                                                                                            ^ Error: expect(received).toContain(expected) // indexOf
  16 |   }
  17 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');await page.reload();expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');
  18 |  });
  19 | }
  20 | 
```