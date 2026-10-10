# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.mjs >> 047 task search intersects all filters retaining order and summary counts
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-013-draft/suite/search.spec.mjs:15:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').visible()
Expected: 1
Received: 2
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').visible() with timeout 5000ms
  - waiting for getByTestId('task-row').visible()
    14 × locator resolved to 2 elements
       - unexpected value "2"

```

# Page snapshot

```yaml
- generic [active] [ref=f30e1]:
  - heading "task-013 Search internal spacing" [level=1] [ref=f30e2]
  - group [ref=f30e4]:
    - button "Projects" [ref=f30e5]
  - group [ref=f30e7]:
    - generic [ref=f30e8]:
      - text: Task search
      - textbox "Task search" [ref=f30e9]: two spaces
    - button "Search tasks" [ref=f30e10]
  - group [ref=f30e12]:
    - generic [ref=f30e13]:
      - text: Due from
      - textbox "Due from" [ref=f30e14]
    - generic [ref=f30e15]:
      - text: Due through
      - textbox "Due through" [ref=f30e16]
    - button "Apply due range" [ref=f30e17]
  - group [ref=f30e19]:
    - generic [ref=f30e20]:
      - text: New project name
      - textbox "New project name" [ref=f30e21]
    - button "Rename project" [ref=f30e22]
  - generic [ref=f30e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f30e25]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f30e27]:
    - generic [ref=f30e28]:
      - text: Task title
      - textbox "Task title" [ref=f30e29]
    - button "Create task" [ref=f30e30]
  - generic [ref=f30e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f30e33]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f30e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f30e36]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f30e37]:
    - text: Two spaces
    - checkbox "Complete Two spaces" [ref=f30e39]
    - group [ref=f30e41]:
      - generic [ref=f30e42]:
        - text: Task due date
        - textbox "Task due date" [ref=f30e43]
      - button "Save due date" [ref=f30e44]
    - group [ref=f30e46]:
      - generic [ref=f30e47]:
        - text: Destination project
        - combobox "Destination project" [ref=f30e48]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-013 Search task intersections"
      - button "Move task" [ref=f30e49]
    - group [ref=f30e51]:
      - generic [ref=f30e52]:
        - text: New task title
        - textbox "New task title" [ref=f30e53]
      - button "Rename task" [ref=f30e54]
    - generic [ref=f30e56]:
      - text: Task priority
      - combobox "Task priority" [ref=f30e57]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f30e58]:
    - text: Two spaces sentinel
    - checkbox "Complete Two spaces sentinel" [ref=f30e60]
    - group [ref=f30e62]:
      - generic [ref=f30e63]:
        - text: Task due date
        - textbox "Task due date" [ref=f30e64]
      - button "Save due date" [ref=f30e65]
    - group [ref=f30e67]:
      - generic [ref=f30e68]:
        - text: Destination project
        - combobox "Destination project" [ref=f30e69]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-013 Search task intersections"
      - button "Move task" [ref=f30e70]
    - group [ref=f30e72]:
      - generic [ref=f30e73]:
        - text: New task title
        - textbox "New task title" [ref=f30e74]
      - button "Rename task" [ref=f30e75]
    - generic [ref=f30e77]:
      - text: Task priority
      - combobox "Task priority" [ref=f30e78]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority,expectPersistedCompletion} from './helpers.mjs';
  3  | async function projectSearch(page,value){await page.getByRole('textbox',{name:'Project search',exact:true}).fill(value);await page.getByRole('button',{name:'Search projects',exact:true}).click();}
  4  | async function taskSearch(page,value){await page.getByRole('textbox',{name:'Task search',exact:true}).fill(value);await page.getByRole('button',{name:'Search tasks',exact:true}).click();}
  5  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  6  | if(stage>=13){
  7  |  test('046 project search trims ASCII case and intersects archive filter in creation order',async({page})=>{
  8  |   for(const name of ['Search Mixed first','Search unrelated','Search MIXED archived','Search mixed last'])await createProject(page,name);
  9  |   await projectRow(page,'Search MIXED archived').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Search MIXED archived')).toHaveCount(0);
  10 |   await projectSearch(page,'  '+projectName('Search MIXED').toUpperCase()+'  ');await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(2);let rows=await page.getByTestId('project-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain(projectName('Search Mixed first'));expect(rows[1]).toContain(projectName('Search mixed last'));
  11 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,'Search MIXED archived')).toBeVisible();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);
  12 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Search Mixed first');await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(page.getByRole('textbox',{name:'Project search',exact:true})).toHaveValue('');await expect(projectRow(page,'Search unrelated')).toBeVisible();
  13 |   await createProject(page,'Search  double gap');await createProject(page,'Search double sentinel');await projectSearch(page,projectName('Search double'));await expect(projectRow(page,'Search double sentinel')).toBeVisible();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(stage>=14?2:1);if(stage===13)await expect(projectRow(page,'Search  double gap')).toHaveCount(0);await projectSearch(page,projectName('Search  double'));await expect(projectRow(page,'Search  double gap')).toBeVisible();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(stage>=14?2:1);if(stage===13)await expect(projectRow(page,'Search double sentinel')).toHaveCount(0);
  14 |  });
  15 |  test('047 task search intersects all filters retaining order and summary counts',async({page})=>{
  16 |   await createProject(page,'Search task intersections');await openProject(page,'Search task intersections');
  17 |   for(const title of ['Mixed first','Other high','MIXED completed','Mixed undated','mixed last'])await createTask(page,title);
  18 |   for(const title of ['Mixed first','Other high','MIXED completed','Mixed undated','mixed last']){await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Search task intersections',title,'High');}
  19 |   await page.getByRole('checkbox',{name:'Complete MIXED completed',exact:true}).check();await expectPersistedCompletion(page,'Search task intersections','MIXED completed',true);
  20 |   for(const title of ['Mixed first','Other high','MIXED completed','mixed last']){
  21 |    await taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true}).fill('2034-01-01');await taskRow(page,title).getByRole('button',{name:'Save due date',exact:true}).click();
  22 |    const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Search task intersections');return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2034-01-01');}finally{await observer.close();}
  23 |   }
  24 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2034-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2034-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await taskSearch(page,' MIXED ');
  25 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows.nth(0).getByRole('checkbox',{name:'Complete Mixed first',exact:true})).toBeVisible();await expect(rows.nth(1).getByRole('checkbox',{name:'Complete mixed last',exact:true})).toBeVisible();
  26 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2034-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2034-01-01');
  27 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await expect(taskRow(page,'MIXED completed')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await taskSearch(page,'');await expect(taskRow(page,'MIXED completed')).toBeVisible();await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Search task intersections').getByTestId('project-summary')).toHaveText('1/5 completed');
> 28 |   await createProject(page,'Search internal spacing');await openProject(page,'Search internal spacing');await createTask(page,'Two  spaces');await createTask(page,'Two spaces sentinel');await taskSearch(page,'two spaces');await expect(taskRow(page,'Two spaces sentinel')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(stage>=14?2:1);if(stage===13)await expect(taskRow(page,'Two  spaces')).toHaveCount(0);await taskSearch(page,'two  spaces');await expect(taskRow(page,'Two  spaces')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(stage>=14?2:1);if(stage===13)await expect(taskRow(page,'Two spaces sentinel')).toHaveCount(0);
     |                                                                                                                                                                                                                                                                                                                                                                 ^ Error: expect(locator).toHaveCount(expected) failed
  29 |  });
  30 |  test('048 rename re-evaluates search membership and archived search remains readable',async({page})=>{
  31 |   await createProject(page,'Search mutable titles');await openProject(page,'Search mutable titles');await createTask(page,'Matching title');await createTask(page,'Other title');await createTask(page,'Matching second');await taskSearch(page,'matching');
  32 |   await taskRow(page,'Matching title').getByRole('textbox',{name:'New task title',exact:true}).fill('Renamed outside query');await taskRow(page,'Matching title').getByRole('button',{name:'Rename task',exact:true}).click();
  33 |   const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Search mutable titles');await expect(taskRow(observer,'Renamed outside query')).toBeVisible();return taskRow(observer,'Renamed outside query').count();},{timeout:5000}).toBe(1);}finally{await observer.close();}
  34 |   await expect(taskRow(page,'Renamed outside query')).toHaveCount(0);await expect(taskRow(page,'Matching second')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await taskSearch(page,'');await expect(taskRow(page,'Renamed outside query')).toBeVisible();
  35 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Search mutable titles').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Search mutable titles')).toHaveCount(0);await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Search mutable titles');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toBeEnabled();await taskSearch(page,'matching');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(page.getByRole('checkbox',{name:'Complete Matching second',exact:true})).toBeDisabled();await expect(taskRow(page,'Matching second').getByRole('button',{name:'Move task',exact:true})).toBeDisabled();
  36 |  });
  37 |  test('049 upgraded original task012 return positions remain usable',async({page})=>{
  38 |   const oldProject=async(name)=>{await page.goto('/');await page.getByTestId('project-row').filter({hasText:'task-012 '+name}).filter({visible:true}).getByRole('button',{name:'Open project',exact:true}).click();};
  39 |   const move=async(target)=>{await taskRow(page,'Position travelling').getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:'task-012 '+target});await taskRow(page,'Position travelling').getByRole('button',{name:'Move task',exact:true}).click();await expect(taskRow(page,'Position travelling')).toHaveCount(0);};
  40 |   await oldProject('Position first owner');await move('Position second owner');await oldProject('Position second owner');await expect(taskRow(page,'Position travelling')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);let rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows).toHaveLength(3);expect(rows[0]).toContain('Second existing');expect(rows[1]).toContain('Position travelling');expect(rows[2]).toContain('Second newly created');
  41 |   await move('Position first owner');await oldProject('Position first owner');await expect(taskRow(page,'Position travelling')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows).toHaveLength(4);for(const [i,title] of ['First existing','Position travelling','First later','First newly created'].entries())expect(rows[i]).toContain(title);
  42 |  });
  43 | }
  44 | 
```