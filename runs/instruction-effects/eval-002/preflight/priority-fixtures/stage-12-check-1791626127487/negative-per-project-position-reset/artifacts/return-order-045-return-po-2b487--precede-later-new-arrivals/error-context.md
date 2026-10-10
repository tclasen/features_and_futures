# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: return-order.spec.mjs >> 045 return positions belong to each project and precede later new arrivals
- Location: runs/instruction-effects/eval-002/decisions/task-012-draft/suite/return-order.spec.mjs:24:2

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "Position travelling"
Received string:    "Second newly created·····
    Task due dateSave due date
    Destination projecttask-012 Position third ownertask-012 Position first ownerMove task
    New task titleRename task
    Task priorityLowNormalHigh"
```

# Page snapshot

```yaml
- generic [active] [ref=f22e1]:
  - heading "task-012 Position second owner" [level=1] [ref=f22e2]
  - group [ref=f22e4]:
    - button "Projects" [ref=f22e5]
  - group [ref=f22e7]:
    - generic [ref=f22e8]:
      - text: Due from
      - textbox "Due from" [ref=f22e9]
    - generic [ref=f22e10]:
      - text: Due through
      - textbox "Due through" [ref=f22e11]
    - button "Apply due range" [ref=f22e12]
  - group [ref=f22e14]:
    - generic [ref=f22e15]:
      - text: New project name
      - textbox "New project name" [ref=f22e16]
    - button "Rename project" [ref=f22e17]
  - generic [ref=f22e19]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f22e20]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f22e22]:
    - generic [ref=f22e23]:
      - text: Task title
      - textbox "Task title" [ref=f22e24]
    - button "Create task" [ref=f22e25]
  - generic [ref=f22e27]:
    - text: Task filter
    - combobox "Task filter" [ref=f22e28]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f22e30]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f22e31]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f22e32]:
    - text: Second existing
    - checkbox "Complete Second existing" [ref=f22e34]
    - group [ref=f22e36]:
      - generic [ref=f22e37]:
        - text: Task due date
        - textbox "Task due date" [ref=f22e38]
      - button "Save due date" [ref=f22e39]
    - group [ref=f22e41]:
      - generic [ref=f22e42]:
        - text: Destination project
        - combobox "Destination project" [ref=f22e43]:
          - option "task-012 Position third owner" [selected]
          - option "task-012 Position first owner"
      - button "Move task" [ref=f22e44]
    - group [ref=f22e46]:
      - generic [ref=f22e47]:
        - text: New task title
        - textbox "New task title" [ref=f22e48]
      - button "Rename task" [ref=f22e49]
    - generic [ref=f22e51]:
      - text: Task priority
      - combobox "Task priority" [ref=f22e52]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f22e53]:
    - text: Second newly created
    - checkbox "Complete Second newly created" [ref=f22e55]
    - group [ref=f22e57]:
      - generic [ref=f22e58]:
        - text: Task due date
        - textbox "Task due date" [ref=f22e59]
      - button "Save due date" [ref=f22e60]
    - group [ref=f22e62]:
      - generic [ref=f22e63]:
        - text: Destination project
        - combobox "Destination project" [ref=f22e64]:
          - option "task-012 Position third owner" [selected]
          - option "task-012 Position first owner"
      - button "Move task" [ref=f22e65]
    - group [ref=f22e67]:
      - generic [ref=f22e68]:
        - text: New task title
        - textbox "New task title" [ref=f22e69]
      - button "Rename task" [ref=f22e70]
    - generic [ref=f22e72]:
      - text: Task priority
      - combobox "Task priority" [ref=f22e73]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f22e74]:
    - text: Position travelling
    - checkbox "Complete Position travelling" [ref=f22e76]
    - group [ref=f22e78]:
      - generic [ref=f22e79]:
        - text: Task due date
        - textbox "Task due date" [ref=f22e80]
      - button "Save due date" [ref=f22e81]
    - group [ref=f22e83]:
      - generic [ref=f22e84]:
        - text: Destination project
        - combobox "Destination project" [ref=f22e85]:
          - option "task-012 Position third owner" [selected]
          - option "task-012 Position first owner"
      - button "Move task" [ref=f22e86]
    - group [ref=f22e88]:
      - generic [ref=f22e89]:
        - text: New task title
        - textbox "New task title" [ref=f22e90]
      - button "Rename task" [ref=f22e91]
    - generic [ref=f22e93]:
      - text: Task priority
      - combobox "Task priority" [ref=f22e94]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3  | async function moveTask(page,source,target,title){
  4  |  await taskRow(page,title).getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,title).getByRole('button',{name:'Move task',exact:true}).click();
  5  |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,target);let count=await taskRow(observer,title).count();await observer.goto('/');await openProject(observer,source);return [count,await taskRow(observer,title).count()];},{timeout:5000}).toEqual([1,0]);}finally{await observer.close();}
  6  | }
> 7  | async function order(page,titles){let rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows).toHaveLength(titles.length);for(const [i,title] of titles.entries())expect(rows[i]).toContain(title);}
     |                                                                                                                                                                                                                         ^ Error: expect(received).toContain(expected) // indexOf
  8  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  9  | if(stage>=12){
  10 |  test('043 returning tasks in reverse order restores prior positions and current fields',async({page})=>{
  11 |   await createProject(page,'Return holding');await createProject(page,'Return owner');await openProject(page,'Return owner');
  12 |   for(const title of ['Return first','Return second','Return third','Return fourth'])await createTask(page,title);
  13 |   await moveTask(page,'Return owner','Return holding','Return second');await moveTask(page,'Return owner','Return holding','Return third');await order(page,['Return first','Return fourth']);await page.goto('/');await openProject(page,'Return holding');
  14 |   await taskRow(page,'Return second').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Return holding','Return second','High');await page.getByRole('checkbox',{name:'Complete Return second',exact:true}).check();await expectPersistedCompletion(page,'Return holding','Return second',true);
  15 |   await moveTask(page,'Return holding','Return owner','Return third');await moveTask(page,'Return holding','Return owner','Return second');await page.goto('/');await openProject(page,'Return owner');await order(page,['Return first','Return second','Return third','Return fourth']);await expect(taskRow(page,'Return second').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('checkbox',{name:'Complete Return second',exact:true})).toBeChecked();await page.reload();await order(page,['Return first','Return second','Return third','Return fourth']);
  16 |  });
  17 |  test('044 rename archival and restoration preserve returning project identity',async({page})=>{
  18 |   await createProject(page,'Return identity holding');await createProject(page,'Return identity owner');await openProject(page,'Return identity owner');for(const title of ['Identity before','Identity returning','Identity after'])await createTask(page,title);await moveTask(page,'Return identity owner','Return identity holding','Identity returning');
  19 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Returned owner renamed'));await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName('Returned owner renamed'),exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Returned owner renamed').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Returned owner renamed')).toHaveCount(0);await openProject(page,'Return identity holding');
  20 |   const choices=()=>taskRow(page,'Identity returning').getByRole('combobox',{name:'Destination project',exact:true}).locator('option');expect(await choices().allTextContents()).not.toContain(projectName('Returned owner renamed'));
  21 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Returned owner renamed').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Return identity holding');expect(await choices().allTextContents()).toContain(projectName('Returned owner renamed'));expect(await choices().allTextContents()).not.toContain(projectName('Return identity owner'));
  22 |   await moveTask(page,'Return identity holding','Returned owner renamed','Identity returning');await page.goto('/');await openProject(page,'Returned owner renamed');await order(page,['Identity before','Identity returning','Identity after']);
  23 |  });
  24 |  test('045 return positions belong to each project and precede later new arrivals',async({page})=>{
  25 |   await createProject(page,'Position second owner');await openProject(page,'Position second owner');await createTask(page,'Second existing');await createProject(page,'Position third owner');await createProject(page,'Position first owner');await openProject(page,'Position first owner');for(const title of ['First existing','Position travelling','First later'])await createTask(page,title);
  26 |   await moveTask(page,'Position first owner','Position second owner','Position travelling');await createTask(page,'First newly created');await page.goto('/');await openProject(page,'Position second owner');await order(page,['Second existing','Position travelling']);await moveTask(page,'Position second owner','Position third owner','Position travelling');await createTask(page,'Second newly created');await page.goto('/');await openProject(page,'Position third owner');await moveTask(page,'Position third owner','Position second owner','Position travelling');await page.goto('/');await openProject(page,'Position second owner');await order(page,['Second existing','Position travelling','Second newly created']);
  27 |   await moveTask(page,'Position second owner','Position first owner','Position travelling');await page.goto('/');await openProject(page,'Position first owner');await order(page,['First existing','Position travelling','First later','First newly created']);
  28 |  });
  29 | }
  30 | 
```