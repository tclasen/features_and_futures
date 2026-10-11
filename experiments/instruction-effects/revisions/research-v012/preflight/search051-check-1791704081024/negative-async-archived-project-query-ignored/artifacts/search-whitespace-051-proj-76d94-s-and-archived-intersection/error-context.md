# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search-whitespace.spec.mjs >> 051 project whitespace matching retains original names and archived intersection
- Location: experiments/instruction-effects/revisions/research-v012/preflight/task020-executed-suite/search-whitespace.spec.mjs:12:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').visible()
Expected: 1
Received: 15
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').visible() with timeout 5000ms
  - waiting for getByTestId('project-row').visible()
    5 × locator resolved to 2 elements
      - unexpected value "2"
    9 × locator resolved to 15 elements
      - unexpected value "15"

```

# Page snapshot

```yaml
- generic [active] [ref=f8e1]:
  - heading "Workboard" [level=1] [ref=f8e2]
  - group [ref=f8e4]:
    - button "Task directory" [ref=f8e5]
  - group [ref=f8e7]:
    - generic [ref=f8e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f8e9]
    - generic [ref=f8e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f8e11]
    - button "Import project" [ref=f8e12]
  - group [ref=f8e14]:
    - generic [ref=f8e15]:
      - text: Project name
      - textbox "Project name" [ref=f8e16]
    - button "Create project" [ref=f8e17]
  - group [ref=f8e19]:
    - generic [ref=f8e20]:
      - text: Project search
      - textbox "Project search" [ref=f8e21]: task-020 whitespace saved
    - button "Search projects" [ref=f8e22]
  - generic [ref=f8e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f8e25]:
      - option "Active"
      - option "Archived" [selected]
  - generic [ref=f8e26]:
    - text: task-005 Persistence renamed1/1 completed
    - group [ref=f8e28]:
      - button "Open project" [ref=f8e29]
    - group [ref=f8e31]:
      - button "Restore project" [ref=f8e32]
  - generic [ref=f8e33]:
    - text: task-007 Persistence renamed1/1 completed
    - group [ref=f8e35]:
      - button "Open project" [ref=f8e36]
    - group [ref=f8e38]:
      - button "Restore project" [ref=f8e39]
  - generic [ref=f8e40]:
    - text: task-008 Persistence renamed1/1 completed
    - group [ref=f8e42]:
      - button "Open project" [ref=f8e43]
    - group [ref=f8e45]:
      - button "Restore project" [ref=f8e46]
  - generic [ref=f8e47]:
    - text: task-009 Persistence renamed1/1 completed
    - group [ref=f8e49]:
      - button "Open project" [ref=f8e50]
    - group [ref=f8e52]:
      - button "Restore project" [ref=f8e53]
  - generic [ref=f8e54]:
    - text: task-010 Persistence renamed1/1 completed
    - group [ref=f8e56]:
      - button "Open project" [ref=f8e57]
    - group [ref=f8e59]:
      - button "Restore project" [ref=f8e60]
  - generic [ref=f8e61]:
    - text: task-011 Persistence renamed1/1 completed
    - group [ref=f8e63]:
      - button "Open project" [ref=f8e64]
    - group [ref=f8e66]:
      - button "Restore project" [ref=f8e67]
  - generic [ref=f8e68]:
    - text: task-012 Persistence renamed1/1 completed
    - group [ref=f8e70]:
      - button "Open project" [ref=f8e71]
    - group [ref=f8e73]:
      - button "Restore project" [ref=f8e74]
  - generic [ref=f8e75]:
    - text: task-013 Persistence renamed1/1 completed
    - group [ref=f8e77]:
      - button "Open project" [ref=f8e78]
    - group [ref=f8e80]:
      - button "Restore project" [ref=f8e81]
  - generic [ref=f8e82]:
    - text: task-014 Persistence renamed1/1 completed
    - group [ref=f8e84]:
      - button "Open project" [ref=f8e85]
    - group [ref=f8e87]:
      - button "Restore project" [ref=f8e88]
  - generic [ref=f8e89]:
    - text: task-018 Persistence renamed1/1 completed
    - group [ref=f8e91]:
      - button "Open project" [ref=f8e92]
    - group [ref=f8e94]:
      - button "Restore project" [ref=f8e95]
  - generic [ref=f8e96]:
    - text: task-017 Persistence renamed1/1 completed
    - group [ref=f8e98]:
      - button "Open project" [ref=f8e99]
    - group [ref=f8e101]:
      - button "Restore project" [ref=f8e102]
  - generic [ref=f8e103]:
    - text: task-016 Persistence renamed1/1 completed
    - group [ref=f8e105]:
      - button "Open project" [ref=f8e106]
    - group [ref=f8e108]:
      - button "Restore project" [ref=f8e109]
  - generic [ref=f8e110]:
    - text: task-015 Persistence renamed1/1 completed
    - group [ref=f8e112]:
      - button "Open project" [ref=f8e113]
    - group [ref=f8e115]:
      - button "Restore project" [ref=f8e116]
  - generic [ref=f8e117]:
    - text: task-012 Search MIXED archived0/0 completed
    - group [ref=f8e119]:
      - button "Open project" [ref=f8e120]
    - group [ref=f8e122]:
      - button "Restore project" [ref=f8e123]
  - generic [ref=f8e124]:
    - text: task-020 Whitespace Saved archived0/0 completed
    - group [ref=f8e126]:
      - button "Open project" [ref=f8e127]
    - group [ref=f8e129]:
      - button "Restore project" [ref=f8e130]
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
  8  |    await page.getByRole('textbox',{name:'Task search',exact:true}).fill(query);await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Original  task gap')).toBeVisible();await expect(taskRow(page,'Other task gap')).toHaveCount(0);expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  9  |   }
  10 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Other task gap')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await page.reload();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');
  11 |  });
  12 |  test('051 project whitespace matching retains original names and archived intersection',async({page})=>{
  13 |   await createProject(page,'Whitespace   Saved first');await createProject(page,'Whitespace Saved second');await createProject(page,'Whitespace  Saved archived');await projectRow(page,'Whitespace  Saved archived').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Whitespace  Saved archived')).toHaveCount(0);
  14 |   await createProject(page,'Whitespace unrelated sentinel');let firstQuery=true;for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\t saved']){if(!firstQuery){await page.getByRole('textbox',{name:'Project search',exact:true}).fill('');await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,'Whitespace unrelated sentinel')).toBeVisible();}firstQuery=false;
  15 |    await page.getByRole('textbox',{name:'Project search',exact:true}).fill(projectName(query));await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,'Whitespace unrelated sentinel')).toHaveCount(0);await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(2);const rows=await page.getByTestId('project-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Whitespace   Saved first');expect(rows[1]).toContain('Whitespace Saved second');
  16 |   }
> 17 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');await page.reload();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,'Whitespace  Saved archived')).toBeVisible();expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');
     |                                                                                                                                                                             ^ Error: expect(locator).toHaveCount(expected) failed
  18 |  });
  19 | }
  20 | 
```