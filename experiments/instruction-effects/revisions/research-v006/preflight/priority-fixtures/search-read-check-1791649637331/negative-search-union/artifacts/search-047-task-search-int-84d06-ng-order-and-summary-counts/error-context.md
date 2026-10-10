# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.mjs >> 047 task search intersects all filters retaining order and summary counts
- Location: experiments/instruction-effects/revisions/research-v006/decisions/task-022-draft/suite/search.spec.mjs:15:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').visible()
Expected: 2
Received: 5
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').visible() with timeout 5000ms
  - waiting for getByTestId('task-row').visible()
    14 × locator resolved to 5 elements
       - unexpected value "5"

```

# Page snapshot

```yaml
- generic [active] [ref=f17e1]:
  - heading "task-022 Search task intersections" [level=1] [ref=f17e2]
  - group [ref=f17e4]:
    - button "Download project" [ref=f17e5]
  - group [ref=f17e7]:
    - button "Projects" [ref=f17e8]
  - group [ref=f17e10]:
    - generic [ref=f17e11]:
      - text: Task search
      - textbox "Task search" [ref=f17e12]: MIXED
    - button "Search tasks" [ref=f17e13]
  - group [ref=f17e15]:
    - generic [ref=f17e16]:
      - text: Due from
      - textbox "Due from" [ref=f17e17]: 2034-01-01
    - generic [ref=f17e18]:
      - text: Due through
      - textbox "Due through" [ref=f17e19]: 2034-01-01
    - button "Apply due range" [ref=f17e20]
  - group [ref=f17e22]:
    - generic [ref=f17e23]:
      - text: New project name
      - textbox "New project name" [ref=f17e24]
    - button "Rename project" [ref=f17e25]
  - generic [ref=f17e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f17e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f17e30]:
    - generic [ref=f17e31]:
      - text: Task title
      - textbox "Task title" [ref=f17e32]
    - button "Create task" [ref=f17e33]
  - generic [ref=f17e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f17e36]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
      - option "Deleted"
  - generic [ref=f17e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f17e39]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f17e40]:
    - text: Mixed first
    - group [ref=f17e42]:
      - button "Delete task" [ref=f17e43]
    - checkbox "Complete Mixed first" [ref=f17e45]
    - group [ref=f17e47]:
      - generic [ref=f17e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f17e49]
      - button "Save notes" [ref=f17e50]
    - group [ref=f17e52]:
      - generic [ref=f17e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f17e54]: 2034-01-01
      - button "Save due date" [ref=f17e55]
    - group [ref=f17e57]:
      - generic [ref=f17e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f17e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f17e60]
    - group [ref=f17e62]:
      - generic [ref=f17e63]:
        - text: New task title
        - textbox "New task title" [ref=f17e64]
      - button "Rename task" [ref=f17e65]
    - generic [ref=f17e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f17e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f17e69]:
    - text: Other high
    - group [ref=f17e71]:
      - button "Delete task" [ref=f17e72]
    - checkbox "Complete Other high" [ref=f17e74]
    - group [ref=f17e76]:
      - generic [ref=f17e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f17e78]
      - button "Save notes" [ref=f17e79]
    - group [ref=f17e81]:
      - generic [ref=f17e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f17e83]: 2034-01-01
      - button "Save due date" [ref=f17e84]
    - group [ref=f17e86]:
      - generic [ref=f17e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f17e88]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f17e89]
    - group [ref=f17e91]:
      - generic [ref=f17e92]:
        - text: New task title
        - textbox "New task title" [ref=f17e93]
      - button "Rename task" [ref=f17e94]
    - generic [ref=f17e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f17e97]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f17e98]:
    - text: MIXED completed
    - group [ref=f17e100]:
      - button "Delete task" [ref=f17e101]
    - checkbox "Complete MIXED completed" [checked] [ref=f17e103]
    - group [ref=f17e105]:
      - generic [ref=f17e106]:
        - text: Task notes
        - textbox "Task notes" [ref=f17e107]
      - button "Save notes" [ref=f17e108]
    - group [ref=f17e110]:
      - generic [ref=f17e111]:
        - text: Task due date
        - textbox "Task due date" [ref=f17e112]: 2034-01-01
      - button "Save due date" [ref=f17e113]
    - group [ref=f17e115]:
      - generic [ref=f17e116]:
        - text: Destination project
        - combobox "Destination project" [ref=f17e117]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f17e118]
    - group [ref=f17e120]:
      - generic [ref=f17e121]:
        - text: New task title
        - textbox "New task title" [ref=f17e122]
      - button "Rename task" [ref=f17e123]
    - generic [ref=f17e125]:
      - text: Task priority
      - combobox "Task priority" [ref=f17e126]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f17e127]:
    - text: Mixed undated
    - group [ref=f17e129]:
      - button "Delete task" [ref=f17e130]
    - checkbox "Complete Mixed undated" [ref=f17e132]
    - group [ref=f17e134]:
      - generic [ref=f17e135]:
        - text: Task notes
        - textbox "Task notes" [ref=f17e136]
      - button "Save notes" [ref=f17e137]
    - group [ref=f17e139]:
      - generic [ref=f17e140]:
        - text: Task due date
        - textbox "Task due date" [ref=f17e141]
      - button "Save due date" [ref=f17e142]
    - group [ref=f17e144]:
      - generic [ref=f17e145]:
        - text: Destination project
        - combobox "Destination project" [ref=f17e146]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f17e147]
    - group [ref=f17e149]:
      - generic [ref=f17e150]:
        - text: New task title
        - textbox "New task title" [ref=f17e151]
      - button "Rename task" [ref=f17e152]
    - generic [ref=f17e154]:
      - text: Task priority
      - combobox "Task priority" [ref=f17e155]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f17e156]:
    - text: mixed last
    - group [ref=f17e158]:
      - button "Delete task" [ref=f17e159]
    - checkbox "Complete mixed last" [ref=f17e161]
    - group [ref=f17e163]:
      - generic [ref=f17e164]:
        - text: Task notes
        - textbox "Task notes" [ref=f17e165]
      - button "Save notes" [ref=f17e166]
    - group [ref=f17e168]:
      - generic [ref=f17e169]:
        - text: Task due date
        - textbox "Task due date" [ref=f17e170]: 2034-01-01
      - button "Save due date" [ref=f17e171]
    - group [ref=f17e173]:
      - generic [ref=f17e174]:
        - text: Destination project
        - combobox "Destination project" [ref=f17e175]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f17e176]
    - group [ref=f17e178]:
      - generic [ref=f17e179]:
        - text: New task title
        - textbox "New task title" [ref=f17e180]
      - button "Rename task" [ref=f17e181]
    - generic [ref=f17e183]:
      - text: Task priority
      - combobox "Task priority" [ref=f17e184]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
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
> 25 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows.nth(0).getByRole('checkbox',{name:'Complete Mixed first',exact:true})).toBeVisible();await expect(rows.nth(1).getByRole('checkbox',{name:'Complete mixed last',exact:true})).toBeVisible();
     |                                                                     ^ Error: expect(locator).toHaveCount(expected) failed
  26 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2034-01-01');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2034-01-01');
  27 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await expect(taskRow(page,'MIXED completed')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await taskSearch(page,'');await expect(taskRow(page,'MIXED completed')).toBeVisible();await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Search task intersections').getByTestId('project-summary')).toHaveText('1/5 completed');
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