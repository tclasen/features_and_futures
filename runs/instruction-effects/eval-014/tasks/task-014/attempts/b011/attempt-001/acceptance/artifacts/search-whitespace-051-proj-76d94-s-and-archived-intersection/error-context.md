# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search-whitespace.spec.mjs >> 051 project whitespace matching retains original names and archived intersection
- Location: runs/instruction-effects/eval-014/tasks/task-014/suite/search-whitespace.spec.mjs:12:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').visible()
Expected: 1
Received: 18
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').visible() with timeout 5000ms
  - waiting for getByTestId('project-row').visible()
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:56278/?filter=Archived&q=task-014%20whitespace%09%20saved"
    - locator resolved to 0 elements
    - unexpected value "0"
    13 × locator resolved to 18 elements
       - unexpected value "18"

```

# Page snapshot

```yaml
- main [ref=f4e2]:
  - heading "Workboard" [level=1] [ref=f4e3]
  - generic [ref=f4e4]:
    - textbox "Project name" [ref=f4e5]
    - button "Create project" [ref=f4e6] [cursor=pointer]
  - generic [ref=f4e7]:
    - textbox "Project search" [ref=f4e8]
    - button "Search projects" [ref=f4e9] [cursor=pointer]
  - generic [ref=f4e10]:
    - text: Project filter
    - combobox "Project filter" [ref=f4e11]:
      - option "Active"
      - option "Archived" [selected]
  - region "Projects" [ref=f4e12]:
    - generic [ref=f4e13]:
      - generic [ref=f4e14]: task-003 Persistence sentinel
      - generic [ref=f4e15]:
        - generic [ref=f4e16]: 1/1 completed
        - button "Open project" [ref=f4e17] [cursor=pointer]
        - button "Restore project" [ref=f4e18] [cursor=pointer]
    - generic [ref=f4e19]:
      - generic [ref=f4e20]: task-004 Persistence renamed
      - generic [ref=f4e21]:
        - generic [ref=f4e22]: 1/1 completed
        - button "Open project" [ref=f4e23] [cursor=pointer]
        - button "Restore project" [ref=f4e24] [cursor=pointer]
    - generic [ref=f4e25]:
      - generic [ref=f4e26]: task-005 Persistence renamed
      - generic [ref=f4e27]:
        - generic [ref=f4e28]: 1/1 completed
        - button "Open project" [ref=f4e29] [cursor=pointer]
        - button "Restore project" [ref=f4e30] [cursor=pointer]
    - generic [ref=f4e31]:
      - generic [ref=f4e32]: task-006 Persistence renamed
      - generic [ref=f4e33]:
        - generic [ref=f4e34]: 1/1 completed
        - button "Open project" [ref=f4e35] [cursor=pointer]
        - button "Restore project" [ref=f4e36] [cursor=pointer]
    - generic [ref=f4e37]:
      - generic [ref=f4e38]: task-007 Persistence renamed
      - generic [ref=f4e39]:
        - generic [ref=f4e40]: 1/1 completed
        - button "Open project" [ref=f4e41] [cursor=pointer]
        - button "Restore project" [ref=f4e42] [cursor=pointer]
    - generic [ref=f4e43]:
      - generic [ref=f4e44]: task-008 Persistence renamed
      - generic [ref=f4e45]:
        - generic [ref=f4e46]: 1/1 completed
        - button "Open project" [ref=f4e47] [cursor=pointer]
        - button "Restore project" [ref=f4e48] [cursor=pointer]
    - generic [ref=f4e49]:
      - generic [ref=f4e50]: task-009 Persistence renamed
      - generic [ref=f4e51]:
        - generic [ref=f4e52]: 1/1 completed
        - button "Open project" [ref=f4e53] [cursor=pointer]
        - button "Restore project" [ref=f4e54] [cursor=pointer]
    - generic [ref=f4e55]:
      - generic [ref=f4e56]: task-010 Persistence renamed
      - generic [ref=f4e57]:
        - generic [ref=f4e58]: 1/1 completed
        - button "Open project" [ref=f4e59] [cursor=pointer]
        - button "Restore project" [ref=f4e60] [cursor=pointer]
    - generic [ref=f4e61]:
      - generic [ref=f4e62]: task-011 Options hidden
      - generic [ref=f4e63]:
        - generic [ref=f4e64]: 0/0 completed
        - button "Open project" [ref=f4e65] [cursor=pointer]
        - button "Restore project" [ref=f4e66] [cursor=pointer]
    - generic [ref=f4e67]:
      - generic [ref=f4e68]: task-011 Persistence renamed
      - generic [ref=f4e69]:
        - generic [ref=f4e70]: 1/1 completed
        - button "Open project" [ref=f4e71] [cursor=pointer]
        - button "Restore project" [ref=f4e72] [cursor=pointer]
    - generic [ref=f4e73]:
      - generic [ref=f4e74]: task-012 Options hidden
      - generic [ref=f4e75]:
        - generic [ref=f4e76]: 0/0 completed
        - button "Open project" [ref=f4e77] [cursor=pointer]
        - button "Restore project" [ref=f4e78] [cursor=pointer]
    - generic [ref=f4e79]:
      - generic [ref=f4e80]: task-012 Persistence renamed
      - generic [ref=f4e81]:
        - generic [ref=f4e82]: 1/1 completed
        - button "Open project" [ref=f4e83] [cursor=pointer]
        - button "Restore project" [ref=f4e84] [cursor=pointer]
    - generic [ref=f4e85]:
      - generic [ref=f4e86]: task-013 Options hidden
      - generic [ref=f4e87]:
        - generic [ref=f4e88]: 0/0 completed
        - button "Open project" [ref=f4e89] [cursor=pointer]
        - button "Restore project" [ref=f4e90] [cursor=pointer]
    - generic [ref=f4e91]:
      - generic [ref=f4e92]: task-013 Search MIXED archived
      - generic [ref=f4e93]:
        - generic [ref=f4e94]: 0/0 completed
        - button "Open project" [ref=f4e95] [cursor=pointer]
        - button "Restore project" [ref=f4e96] [cursor=pointer]
    - generic [ref=f4e97]:
      - generic [ref=f4e98]: task-013 Search mutable titles
      - generic [ref=f4e99]:
        - generic [ref=f4e100]: 0/3 completed
        - button "Open project" [ref=f4e101] [cursor=pointer]
        - button "Restore project" [ref=f4e102] [cursor=pointer]
    - generic [ref=f4e103]:
      - generic [ref=f4e104]: task-013 Persistence renamed
      - generic [ref=f4e105]:
        - generic [ref=f4e106]: 1/1 completed
        - button "Open project" [ref=f4e107] [cursor=pointer]
        - button "Restore project" [ref=f4e108] [cursor=pointer]
    - generic [ref=f4e109]:
      - generic [ref=f4e110]: task-014 Options hidden
      - generic [ref=f4e111]:
        - generic [ref=f4e112]: 0/0 completed
        - button "Open project" [ref=f4e113] [cursor=pointer]
        - button "Restore project" [ref=f4e114] [cursor=pointer]
    - generic [ref=f4e115]:
      - generic [ref=f4e116]: task-014 Whitespace Saved archived
      - generic [ref=f4e117]:
        - generic [ref=f4e118]: 0/0 completed
        - button "Open project" [ref=f4e119] [cursor=pointer]
        - button "Restore project" [ref=f4e120] [cursor=pointer]
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