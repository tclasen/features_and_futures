# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.mjs >> 047 task search intersects all filters retaining order and summary counts
- Location: experiments/instruction-effects/revisions/research-v008/decisions/task-013-corrected/suite/search.spec.mjs:15:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete MIXED completed', exact: true }) }).visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete MIXED completed', exact: true }) }).visible() with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete MIXED completed', exact: true }) }).visible()
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=f18e1]:
  - heading "task-013 Search task intersections" [level=1] [ref=f18e2]
  - group [ref=f18e4]:
    - button "Download project" [ref=f18e5]
  - group [ref=f18e7]:
    - button "Projects" [ref=f18e8]
  - group [ref=f18e10]:
    - generic [ref=f18e11]:
      - text: Task search
      - textbox "Task search" [ref=f18e12]
    - button "Search tasks" [ref=f18e13]
  - group [ref=f18e15]:
    - generic [ref=f18e16]:
      - text: Due from
      - textbox "Due from" [ref=f18e17]
    - generic [ref=f18e18]:
      - text: Due through
      - textbox "Due through" [ref=f18e19]
    - button "Apply due range" [ref=f18e20]
  - group [ref=f18e22]:
    - generic [ref=f18e23]:
      - text: New project name
      - textbox "New project name" [ref=f18e24]
    - button "Rename project" [ref=f18e25]
  - generic [ref=f18e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f18e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f18e30]:
    - generic [ref=f18e31]:
      - text: Task title
      - textbox "Task title" [ref=f18e32]
    - button "Create task" [ref=f18e33]
  - generic [ref=f18e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f18e36]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
      - option "Deleted"
  - generic [ref=f18e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f18e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f18e40]:
    - text: Mixed first
    - group [ref=f18e42]:
      - button "Delete task" [ref=f18e43]
    - checkbox "Complete Mixed first" [ref=f18e45]
    - group [ref=f18e47]:
      - generic [ref=f18e48]:
        - text: Task due date
        - textbox "Task due date" [ref=f18e49]: 2034-01-01
      - button "Save due date" [ref=f18e50]
    - group [ref=f18e52]:
      - generic [ref=f18e53]:
        - text: Destination project
        - combobox "Destination project" [ref=f18e54]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f18e55]
    - group [ref=f18e57]:
      - generic [ref=f18e58]:
        - text: New task title
        - textbox "New task title" [ref=f18e59]
      - button "Rename task" [ref=f18e60]
    - generic [ref=f18e62]:
      - text: Task priority
      - combobox "Task priority" [ref=f18e63]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f18e64]:
    - text: Other high
    - group [ref=f18e66]:
      - button "Delete task" [ref=f18e67]
    - checkbox "Complete Other high" [ref=f18e69]
    - group [ref=f18e71]:
      - generic [ref=f18e72]:
        - text: Task due date
        - textbox "Task due date" [ref=f18e73]: 2034-01-01
      - button "Save due date" [ref=f18e74]
    - group [ref=f18e76]:
      - generic [ref=f18e77]:
        - text: Destination project
        - combobox "Destination project" [ref=f18e78]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f18e79]
    - group [ref=f18e81]:
      - generic [ref=f18e82]:
        - text: New task title
        - textbox "New task title" [ref=f18e83]
      - button "Rename task" [ref=f18e84]
    - generic [ref=f18e86]:
      - text: Task priority
      - combobox "Task priority" [ref=f18e87]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f18e88]:
    - text: MIXED completed
    - group [ref=f18e90]:
      - button "Delete task" [ref=f18e91]
    - checkbox "Complete MIXED completed" [checked] [ref=f18e93]
    - group [ref=f18e95]:
      - generic [ref=f18e96]:
        - text: Task due date
        - textbox "Task due date" [ref=f18e97]: 2034-01-01
      - button "Save due date" [ref=f18e98]
    - group [ref=f18e100]:
      - generic [ref=f18e101]:
        - text: Destination project
        - combobox "Destination project" [ref=f18e102]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f18e103]
    - group [ref=f18e105]:
      - generic [ref=f18e106]:
        - text: New task title
        - textbox "New task title" [ref=f18e107]
      - button "Rename task" [ref=f18e108]
    - generic [ref=f18e110]:
      - text: Task priority
      - combobox "Task priority" [ref=f18e111]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f18e112]:
    - text: Mixed undated
    - group [ref=f18e114]:
      - button "Delete task" [ref=f18e115]
    - checkbox "Complete Mixed undated" [ref=f18e117]
    - group [ref=f18e119]:
      - generic [ref=f18e120]:
        - text: Task due date
        - textbox "Task due date" [ref=f18e121]
      - button "Save due date" [ref=f18e122]
    - group [ref=f18e124]:
      - generic [ref=f18e125]:
        - text: Destination project
        - combobox "Destination project" [ref=f18e126]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f18e127]
    - group [ref=f18e129]:
      - generic [ref=f18e130]:
        - text: New task title
        - textbox "New task title" [ref=f18e131]
      - button "Rename task" [ref=f18e132]
    - generic [ref=f18e134]:
      - text: Task priority
      - combobox "Task priority" [ref=f18e135]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f18e136]:
    - text: mixed last
    - group [ref=f18e138]:
      - button "Delete task" [ref=f18e139]
    - checkbox "Complete mixed last" [ref=f18e141]
    - group [ref=f18e143]:
      - generic [ref=f18e144]:
        - text: Task due date
        - textbox "Task due date" [ref=f18e145]: 2034-01-01
      - button "Save due date" [ref=f18e146]
    - group [ref=f18e148]:
      - generic [ref=f18e149]:
        - text: Destination project
        - combobox "Destination project" [ref=f18e150]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f18e151]
    - group [ref=f18e153]:
      - generic [ref=f18e154]:
        - text: New task title
        - textbox "New task title" [ref=f18e155]
      - button "Rename task" [ref=f18e156]
    - generic [ref=f18e158]:
      - text: Task priority
      - combobox "Task priority" [ref=f18e159]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f18e160]:
    - text: Other normal guard
    - group [ref=f18e162]:
      - button "Delete task" [ref=f18e163]
    - checkbox "Complete Other normal guard" [ref=f18e165]
    - group [ref=f18e167]:
      - generic [ref=f18e168]:
        - text: Task due date
        - textbox "Task due date" [ref=f18e169]
      - button "Save due date" [ref=f18e170]
    - group [ref=f18e172]:
      - generic [ref=f18e173]:
        - text: Destination project
        - combobox "Destination project" [ref=f18e174]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f18e175]
    - group [ref=f18e177]:
      - generic [ref=f18e178]:
        - text: New task title
        - textbox "New task title" [ref=f18e179]
      - button "Rename task" [ref=f18e180]
    - generic [ref=f18e182]:
      - text: Task priority
      - combobox "Task priority" [ref=f18e183]:
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
  17 |   for(const title of ['Mixed first','Other high','MIXED completed','Mixed undated','mixed last'])await createTask(page,title);await createTask(page,'Other normal guard');
  18 |   for(const title of ['Mixed first','Other high','MIXED completed','Mixed undated','mixed last']){await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Search task intersections',title,'High');}
  19 |   await page.getByRole('checkbox',{name:'Complete MIXED completed',exact:true}).check();await expectPersistedCompletion(page,'Search task intersections','MIXED completed',true);
  20 |   for(const title of ['Mixed first','Other high','MIXED completed','mixed last']){
  21 |    await taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true}).fill('2034-01-01');await taskRow(page,title).getByRole('button',{name:'Save due date',exact:true}).click();
  22 |    const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Search task intersections');return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2034-01-01');}finally{await observer.close();}
  23 |   }
> 24 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await expect(taskRow(page,'Mixed undated')).toBeVisible();await expect(taskRow(page,'Other normal guard')).toBeVisible();await expect(taskRow(page,'MIXED completed')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(5);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Other high')).toBeVisible();await expect(taskRow(page,'Mixed undated')).toBeVisible();await expect(taskRow(page,'Other normal guard')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2034-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2034-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,'Other high')).toBeVisible();await expect(taskRow(page,'Mixed first')).toBeVisible();await expect(taskRow(page,'mixed last')).toBeVisible();await expect(taskRow(page,'Mixed undated')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await taskSearch(page,' MIXED ');
     |                                                                                                                                                                                                                                                                        ^ Error: expect(locator).toHaveCount(expected) failed
  25 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows.nth(0).getByRole('checkbox',{name:'Complete Mixed first',exact:true})).toBeVisible();await expect(rows.nth(1).getByRole('checkbox',{name:'Complete mixed last',exact:true})).toBeVisible();
  26 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2034-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2034-01-01');
  27 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await expect(taskRow(page,'MIXED completed')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await taskSearch(page,'');await expect(taskRow(page,'MIXED completed')).toBeVisible();await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Search task intersections').getByTestId('project-summary')).toHaveText('1/6 completed');
  28 |   await createProject(page,'Search internal spacing');await openProject(page,'Search internal spacing');await createTask(page,'Two  spaces');await createTask(page,'Two spaces sentinel');await taskSearch(page,'two spaces');await expect(taskRow(page,'Two spaces sentinel')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(stage>=14?2:1);if(stage===13)await expect(taskRow(page,'Two  spaces')).toHaveCount(0);await taskSearch(page,'two  spaces');await expect(taskRow(page,'Two  spaces')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(stage>=14?2:1);if(stage===13)await expect(taskRow(page,'Two spaces sentinel')).toHaveCount(0);
  29 |  });
  30 |  test('048 rename re-evaluates search membership and archived search remains readable',async({page})=>{
  31 |   await createProject(page,'Search mutable titles');await openProject(page,'Search mutable titles');await createTask(page,'Matching title');await createTask(page,'Other title');await createTask(page,'Matching second');await taskSearch(page,'matching');await expect(taskRow(page,'Matching second')).toBeVisible();await expect(taskRow(page,'Other title')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  32 |   await taskRow(page,'Matching title').getByRole('textbox',{name:'New task title',exact:true}).fill('Renamed outside query');await taskRow(page,'Matching title').getByRole('button',{name:'Rename task',exact:true}).click();
  33 |   const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Search mutable titles');await expect(taskRow(observer,'Other title')).toBeVisible();return taskRow(observer,'Renamed outside query').count();},{timeout:5000}).toBe(1);}finally{await observer.close();}
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