# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.mjs >> 046 project search trims ASCII case and intersects archive filter in creation order
- Location: runs/instruction-effects/eval-014/tasks/task-014/suite/search.spec.mjs:7:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').visible()
Expected: 1
Received: 19
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').visible() with timeout 5000ms
  - waiting for getByTestId('project-row').visible()
    14 × locator resolved to 19 elements
       - unexpected value "19"

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
    - generic [ref=f4e121]:
      - generic [ref=f4e122]: task-014 Search MIXED archived
      - generic [ref=f4e123]:
        - generic [ref=f4e124]: 0/0 completed
        - button "Open project" [ref=f4e125] [cursor=pointer]
        - button "Restore project" [ref=f4e126] [cursor=pointer]
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
> 11 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(projectRow(page,'Search MIXED archived')).toBeVisible();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);
     |                                                                                                                                                                                                                                                  ^ Error: expect(locator).toHaveCount(expected) failed
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
  24 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});await expect(taskRow(page,'Mixed undated')).toBeVisible();await expect(taskRow(page,'Other normal guard')).toBeVisible();await expect(taskRow(page,'MIXED completed')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(5);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Other high')).toBeVisible();await expect(taskRow(page,'Mixed undated')).toBeVisible();await expect(taskRow(page,'Other normal guard')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2034-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2034-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,'Other high')).toBeVisible();await expect(taskRow(page,'Mixed first')).toBeVisible();await expect(taskRow(page,'mixed last')).toBeVisible();await expect(taskRow(page,'Mixed undated')).toHaveCount(0);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await taskSearch(page,' MIXED ');
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