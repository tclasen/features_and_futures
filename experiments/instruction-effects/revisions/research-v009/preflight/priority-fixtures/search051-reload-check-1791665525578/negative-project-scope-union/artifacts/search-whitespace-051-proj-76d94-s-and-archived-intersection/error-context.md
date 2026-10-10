# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search-whitespace.spec.mjs >> 051 project whitespace matching retains original names and archived intersection
- Location: experiments/instruction-effects/revisions/research-v009/decisions/frozen-prefix-drafts/task-014/suite/search-whitespace.spec.mjs:12:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').filter({ hasText: 'task-014 Whitespace  Saved archived' }).visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').filter({ hasText: 'task-014 Whitespace  Saved archived' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-014 Whitespace  Saved archived' }).visible()
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=f6e1]:
  - heading "Workboard" [level=1] [ref=f6e2]
  - group [ref=f6e4]:
    - button "Task directory" [ref=f6e5]
  - group [ref=f6e7]:
    - generic [ref=f6e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f6e9]
    - generic [ref=f6e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f6e11]
    - button "Import project" [ref=f6e12]
  - group [ref=f6e14]:
    - generic [ref=f6e15]:
      - text: Project name
      - textbox "Project name" [ref=f6e16]
    - button "Create project" [ref=f6e17]
  - group [ref=f6e19]:
    - generic [ref=f6e20]:
      - text: Project search
      - textbox "Project search" [ref=f6e21]
    - button "Search projects" [ref=f6e22]
  - generic [ref=f6e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f6e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f6e26]:
    - text: task-005 Persistence renamed1/1 completed
    - group [ref=f6e28]:
      - button "Open project" [ref=f6e29]
    - group [ref=f6e31]:
      - button "Restore project" [ref=f6e32]
  - generic [ref=f6e33]:
    - text: task-007 Persistence renamed1/1 completed
    - group [ref=f6e35]:
      - button "Open project" [ref=f6e36]
    - group [ref=f6e38]:
      - button "Restore project" [ref=f6e39]
  - generic [ref=f6e40]:
    - text: task-008 Persistence renamed1/1 completed
    - group [ref=f6e42]:
      - button "Open project" [ref=f6e43]
    - group [ref=f6e45]:
      - button "Restore project" [ref=f6e46]
  - generic [ref=f6e47]:
    - text: task-009 Persistence renamed1/1 completed
    - group [ref=f6e49]:
      - button "Open project" [ref=f6e50]
    - group [ref=f6e52]:
      - button "Restore project" [ref=f6e53]
  - generic [ref=f6e54]:
    - text: task-010 Persistence renamed1/1 completed
    - group [ref=f6e56]:
      - button "Open project" [ref=f6e57]
    - group [ref=f6e59]:
      - button "Restore project" [ref=f6e60]
  - generic [ref=f6e61]:
    - text: task-011 Persistence renamed1/1 completed
    - group [ref=f6e63]:
      - button "Open project" [ref=f6e64]
    - group [ref=f6e66]:
      - button "Restore project" [ref=f6e67]
  - generic [ref=f6e68]:
    - text: task-012 Persistence renamed1/1 completed
    - group [ref=f6e70]:
      - button "Open project" [ref=f6e71]
    - group [ref=f6e73]:
      - button "Restore project" [ref=f6e74]
  - generic [ref=f6e75]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f6e77]:
      - button "Open project" [ref=f6e78]
    - group [ref=f6e80]:
      - button "Archive project" [ref=f6e81]
  - generic [ref=f6e82]:
    - text: task-013 Persistence renamed1/1 completed
    - group [ref=f6e84]:
      - button "Open project" [ref=f6e85]
    - group [ref=f6e87]:
      - button "Restore project" [ref=f6e88]
  - generic [ref=f6e89]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f6e91]:
      - button "Open project" [ref=f6e92]
    - group [ref=f6e94]:
      - button "Archive project" [ref=f6e95]
  - generic [ref=f6e96]:
    - text: task-014 Persistence renamed1/1 completed
    - group [ref=f6e98]:
      - button "Open project" [ref=f6e99]
    - group [ref=f6e101]:
      - button "Restore project" [ref=f6e102]
  - generic [ref=f6e103]:
    - text: task-018 Persistence renamed1/1 completed
    - group [ref=f6e105]:
      - button "Open project" [ref=f6e106]
    - group [ref=f6e108]:
      - button "Restore project" [ref=f6e109]
  - generic [ref=f6e110]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f6e112]:
      - button "Open project" [ref=f6e113]
    - group [ref=f6e115]:
      - button "Archive project" [ref=f6e116]
  - generic [ref=f6e117]:
    - text: task-017 Persistence renamed1/1 completed
    - group [ref=f6e119]:
      - button "Open project" [ref=f6e120]
    - group [ref=f6e122]:
      - button "Restore project" [ref=f6e123]
  - generic [ref=f6e124]:
    - text: task-016 Persistence renamed1/1 completed
    - group [ref=f6e126]:
      - button "Open project" [ref=f6e127]
    - group [ref=f6e129]:
      - button "Restore project" [ref=f6e130]
  - generic [ref=f6e131]:
    - text: task-015 Persistence renamed1/1 completed
    - group [ref=f6e133]:
      - button "Open project" [ref=f6e134]
    - group [ref=f6e136]:
      - button "Restore project" [ref=f6e137]
  - generic [ref=f6e138]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f6e140]:
      - button "Open project" [ref=f6e141]
    - group [ref=f6e143]:
      - button "Archive project" [ref=f6e144]
  - generic [ref=f6e145]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f6e147]:
      - button "Open project" [ref=f6e148]
    - group [ref=f6e150]:
      - button "Archive project" [ref=f6e151]
  - generic [ref=f6e152]:
    - text: task-012 Search MIXED archived0/0 completed
    - group [ref=f6e154]:
      - button "Open project" [ref=f6e155]
    - group [ref=f6e157]:
      - button "Restore project" [ref=f6e158]
  - generic [ref=f6e159]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f6e161]:
      - button "Open project" [ref=f6e162]
    - group [ref=f6e164]:
      - button "Archive project" [ref=f6e165]
  - generic [ref=f6e166]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f6e168]:
      - button "Open project" [ref=f6e169]
    - group [ref=f6e171]:
      - button "Archive project" [ref=f6e172]
  - generic [ref=f6e173]:
    - text: task-014 Whitespace Saved first0/0 completed
    - group [ref=f6e175]:
      - button "Open project" [ref=f6e176]
    - group [ref=f6e178]:
      - button "Archive project" [ref=f6e179]
  - generic [ref=f6e180]:
    - text: task-014 Whitespace Saved second0/0 completed
    - group [ref=f6e182]:
      - button "Open project" [ref=f6e183]
    - group [ref=f6e185]:
      - button "Archive project" [ref=f6e186]
  - generic [ref=f6e187]:
    - text: task-014 Whitespace Saved archived0/0 completed
    - group [ref=f6e189]:
      - button "Open project" [ref=f6e190]
    - group [ref=f6e192]:
      - button "Restore project" [ref=f6e193]
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
> 13 |   await createProject(page,'Whitespace   Saved first');await createProject(page,'Whitespace Saved second');await createProject(page,'Whitespace  Saved archived');await projectRow(page,'Whitespace  Saved archived').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Whitespace  Saved archived')).toHaveCount(0);
     |                                                                                                                                                                                                                                                                                                                                                   ^ Error: expect(locator).toHaveCount(expected) failed
  14 |   await createProject(page,'Whitespace unrelated sentinel');for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\t saved']){await page.getByRole('textbox',{name:'Project search',exact:true}).fill('');await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,'Whitespace unrelated sentinel')).toBeVisible();
  15 |    await page.getByRole('textbox',{name:'Project search',exact:true}).fill(projectName(query));await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(projectRow(page,'Whitespace unrelated sentinel')).toHaveCount(0);await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(2);const rows=await page.getByTestId('project-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Whitespace   Saved first');expect(rows[1]).toContain('Whitespace Saved second');
  16 |   }
  17 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');await page.reload();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,'Whitespace  Saved archived')).toBeVisible();expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');
  18 |  });
  19 | }
  20 | 
```