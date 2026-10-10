# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search-whitespace.spec.mjs >> 051 project whitespace matching retains original names and archived intersection
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-014-draft/suite/search-whitespace.spec.mjs:12:2

# Error details

```
ReferenceError: projectName is not defined
```

# Page snapshot

```yaml
- generic [active] [ref=f6e1]:
  - heading "Workboard" [level=1] [ref=f6e2]
  - group [ref=f6e4]:
    - generic [ref=f6e5]:
      - text: Project name
      - textbox "Project name" [ref=f6e6]
    - button "Create project" [ref=f6e7]
  - group [ref=f6e9]:
    - generic [ref=f6e10]:
      - text: Project search
      - textbox "Project search" [ref=f6e11]
    - button "Search projects" [ref=f6e12]
  - generic [ref=f6e14]:
    - text: Project filter
    - combobox "Project filter" [ref=f6e15]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f6e16]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f6e18]:
      - button "Open project" [ref=f6e19]
    - group [ref=f6e21]:
      - button "Archive project" [ref=f6e22]
  - generic [ref=f6e23]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f6e25]:
      - button "Open project" [ref=f6e26]
    - group [ref=f6e28]:
      - button "Archive project" [ref=f6e29]
  - generic [ref=f6e30]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f6e32]:
      - button "Open project" [ref=f6e33]
    - group [ref=f6e35]:
      - button "Archive project" [ref=f6e36]
  - generic [ref=f6e37]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f6e39]:
      - button "Open project" [ref=f6e40]
    - group [ref=f6e42]:
      - button "Archive project" [ref=f6e43]
  - generic [ref=f6e44]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f6e46]:
      - button "Open project" [ref=f6e47]
    - group [ref=f6e49]:
      - button "Archive project" [ref=f6e50]
  - generic [ref=f6e51]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f6e53]:
      - button "Open project" [ref=f6e54]
    - group [ref=f6e56]:
      - button "Archive project" [ref=f6e57]
  - generic [ref=f6e58]:
    - text: task-014 Defaults independent0/1 completed
    - group [ref=f6e60]:
      - button "Open project" [ref=f6e61]
    - group [ref=f6e63]:
      - button "Archive project" [ref=f6e64]
  - generic [ref=f6e65]:
    - text: task-014 Defaults inheritance1/4 completed
    - group [ref=f6e67]:
      - button "Open project" [ref=f6e68]
    - group [ref=f6e70]:
      - button "Archive project" [ref=f6e71]
  - generic [ref=f6e72]:
    - text: task-014 Defaults renamed0/2 completed
    - group [ref=f6e74]:
      - button "Open project" [ref=f6e75]
    - group [ref=f6e77]:
      - button "Archive project" [ref=f6e78]
  - generic [ref=f6e79]:
    - text: task-014 Calendar persistence0/1 completed
    - group [ref=f6e81]:
      - button "Open project" [ref=f6e82]
    - group [ref=f6e84]:
      - button "Archive project" [ref=f6e85]
  - generic [ref=f6e86]:
    - text: task-014 Calendar validation0/1 completed
    - group [ref=f6e88]:
      - button "Open project" [ref=f6e89]
    - group [ref=f6e91]:
      - button "Archive project" [ref=f6e92]
  - generic [ref=f6e93]:
    - text: task-014 Calendar independence1/2 completed
    - group [ref=f6e95]:
      - button "Open project" [ref=f6e96]
    - group [ref=f6e98]:
      - button "Archive project" [ref=f6e99]
  - generic [ref=f6e100]:
    - text: task-014 Calendar second owner0/1 completed
    - group [ref=f6e102]:
      - button "Open project" [ref=f6e103]
    - group [ref=f6e105]:
      - button "Archive project" [ref=f6e106]
  - generic [ref=f6e107]:
    - text: task-014 Calendar archival0/1 completed
    - group [ref=f6e109]:
      - button "Open project" [ref=f6e110]
    - group [ref=f6e112]:
      - button "Archive project" [ref=f6e113]
  - generic [ref=f6e114]:
    - text: task-014 Range boundaries0/5 completed
    - group [ref=f6e116]:
      - button "Open project" [ref=f6e117]
    - group [ref=f6e119]:
      - button "Archive project" [ref=f6e120]
  - generic [ref=f6e121]:
    - text: task-014 Range intersections0/4 completed
    - group [ref=f6e123]:
      - button "Open project" [ref=f6e124]
    - group [ref=f6e126]:
      - button "Archive project" [ref=f6e127]
  - generic [ref=f6e128]:
    - text: task-014 Range validation0/2 completed
    - group [ref=f6e130]:
      - button "Open project" [ref=f6e131]
    - group [ref=f6e133]:
      - button "Archive project" [ref=f6e134]
  - generic [ref=f6e135]:
    - text: task-014 Range archival0/2 completed
    - group [ref=f6e137]:
      - button "Open project" [ref=f6e138]
    - group [ref=f6e140]:
      - button "Archive project" [ref=f6e141]
  - generic [ref=f6e142]:
    - text: task-014 Range owner renamed0/3 completed
    - group [ref=f6e144]:
      - button "Open project" [ref=f6e145]
    - group [ref=f6e147]:
      - button "Archive project" [ref=f6e148]
  - generic [ref=f6e149]:
    - text: task-014 Transfer target1/3 completed
    - group [ref=f6e151]:
      - button "Open project" [ref=f6e152]
    - group [ref=f6e154]:
      - button "Archive project" [ref=f6e155]
  - generic [ref=f6e156]:
    - text: task-014 Transfer source0/1 completed
    - group [ref=f6e158]:
      - button "Open project" [ref=f6e159]
    - group [ref=f6e161]:
      - button "Archive project" [ref=f6e162]
  - generic [ref=f6e163]:
    - text: task-014 Filtered transfer target0/1 completed
    - group [ref=f6e165]:
      - button "Open project" [ref=f6e166]
    - group [ref=f6e168]:
      - button "Archive project" [ref=f6e169]
  - generic [ref=f6e170]:
    - text: task-014 Filtered transfer source0/2 completed
    - group [ref=f6e172]:
      - button "Open project" [ref=f6e173]
    - group [ref=f6e175]:
      - button "Archive project" [ref=f6e176]
  - generic [ref=f6e177]:
    - text: task-014 Options first0/0 completed
    - group [ref=f6e179]:
      - button "Open project" [ref=f6e180]
    - group [ref=f6e182]:
      - button "Archive project" [ref=f6e183]
  - generic [ref=f6e184]:
    - text: task-014 Options second0/0 completed
    - group [ref=f6e186]:
      - button "Open project" [ref=f6e187]
    - group [ref=f6e189]:
      - button "Archive project" [ref=f6e190]
  - generic [ref=f6e191]:
    - text: task-014 Options owner0/1 completed
    - group [ref=f6e193]:
      - button "Open project" [ref=f6e194]
    - group [ref=f6e196]:
      - button "Archive project" [ref=f6e197]
  - generic [ref=f6e198]:
    - text: task-014 Read-only transfer target0/0 completed
    - group [ref=f6e200]:
      - button "Open project" [ref=f6e201]
    - group [ref=f6e203]:
      - button "Archive project" [ref=f6e204]
  - generic [ref=f6e205]:
    - text: task-014 Read-only transfer owner0/1 completed
    - group [ref=f6e207]:
      - button "Open project" [ref=f6e208]
    - group [ref=f6e210]:
      - button "Archive project" [ref=f6e211]
  - generic [ref=f6e212]:
    - text: task-014 Priority intersection1/4 completed
    - group [ref=f6e214]:
      - button "Open project" [ref=f6e215]
    - group [ref=f6e217]:
      - button "Archive project" [ref=f6e218]
  - generic [ref=f6e219]:
    - text: task-014 Priority live filters0/2 completed
    - group [ref=f6e221]:
      - button "Open project" [ref=f6e222]
    - group [ref=f6e224]:
      - button "Archive project" [ref=f6e225]
  - generic [ref=f6e226]:
    - text: task-014 Priority rename filters0/2 completed
    - group [ref=f6e228]:
      - button "Open project" [ref=f6e229]
    - group [ref=f6e231]:
      - button "Archive project" [ref=f6e232]
  - generic [ref=f6e233]:
    - text: task-014 Archived combined filters1/2 completed
    - group [ref=f6e235]:
      - button "Open project" [ref=f6e236]
    - group [ref=f6e238]:
      - button "Archive project" [ref=f6e239]
  - generic [ref=f6e240]:
    - text: task-014 Priority ownership0/2 completed
    - group [ref=f6e242]:
      - button "Open project" [ref=f6e243]
    - group [ref=f6e245]:
      - button "Archive project" [ref=f6e246]
  - generic [ref=f6e247]:
    - text: task-014 Priority other owner0/1 completed
    - group [ref=f6e249]:
      - button "Open project" [ref=f6e250]
    - group [ref=f6e252]:
      - button "Archive project" [ref=f6e253]
  - generic [ref=f6e254]:
    - text: task-014 Priority completion1/2 completed
    - group [ref=f6e256]:
      - button "Open project" [ref=f6e257]
    - group [ref=f6e259]:
      - button "Archive project" [ref=f6e260]
  - generic [ref=f6e261]:
    - text: task-014 Priority archive0/1 completed
    - group [ref=f6e263]:
      - button "Open project" [ref=f6e264]
    - group [ref=f6e266]:
      - button "Archive project" [ref=f6e267]
  - generic [ref=f6e268]:
    - text: task-014 Return holding0/0 completed
    - group [ref=f6e270]:
      - button "Open project" [ref=f6e271]
    - group [ref=f6e273]:
      - button "Archive project" [ref=f6e274]
  - generic [ref=f6e275]:
    - text: task-014 Return owner1/4 completed
    - group [ref=f6e277]:
      - button "Open project" [ref=f6e278]
    - group [ref=f6e280]:
      - button "Archive project" [ref=f6e281]
  - generic [ref=f6e282]:
    - text: task-014 Return identity holding0/0 completed
    - group [ref=f6e284]:
      - button "Open project" [ref=f6e285]
    - group [ref=f6e287]:
      - button "Archive project" [ref=f6e288]
  - generic [ref=f6e289]:
    - text: task-014 Returned owner renamed0/3 completed
    - group [ref=f6e291]:
      - button "Open project" [ref=f6e292]
    - group [ref=f6e294]:
      - button "Archive project" [ref=f6e295]
  - generic [ref=f6e296]:
    - text: task-014 Position second owner0/2 completed
    - group [ref=f6e298]:
      - button "Open project" [ref=f6e299]
    - group [ref=f6e301]:
      - button "Archive project" [ref=f6e302]
  - generic [ref=f6e303]:
    - text: task-014 Position third owner0/0 completed
    - group [ref=f6e305]:
      - button "Open project" [ref=f6e306]
    - group [ref=f6e308]:
      - button "Archive project" [ref=f6e309]
  - generic [ref=f6e310]:
    - text: task-014 Position first owner0/4 completed
    - group [ref=f6e312]:
      - button "Open project" [ref=f6e313]
    - group [ref=f6e315]:
      - button "Archive project" [ref=f6e316]
  - generic [ref=f6e317]:
    - text: task-014 Whitespace retained owner0/2 completed
    - group [ref=f6e319]:
      - button "Open project" [ref=f6e320]
    - group [ref=f6e322]:
      - button "Archive project" [ref=f6e323]
  - generic [ref=f6e324]:
    - text: task-014 Whitespace Saved first0/0 completed
    - group [ref=f6e326]:
      - button "Open project" [ref=f6e327]
    - group [ref=f6e329]:
      - button "Archive project" [ref=f6e330]
  - generic [ref=f6e331]:
    - text: task-014 Whitespace Saved second0/0 completed
    - group [ref=f6e333]:
      - button "Open project" [ref=f6e334]
    - group [ref=f6e336]:
      - button "Archive project" [ref=f6e337]
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
  8  |    await page.getByRole('textbox',{name:'Task search',exact:true}).fill(projectName(query));await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Original  task gap')).toBeVisible();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  9  |   }
  10 |   await page.getByRole('textbox',{name:'Task search',exact:true}).fill('');await page.getByRole('button',{name:'Search tasks',exact:true}).click();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');await page.reload();expect(await taskRow(page,'Original  task gap').textContent()).toContain('Original  task gap');
  11 |  });
  12 |  test('051 project whitespace matching retains original names and archived intersection',async({page})=>{
  13 |   await createProject(page,'Whitespace   Saved first');await createProject(page,'Whitespace Saved second');await createProject(page,'Whitespace  Saved archived');await projectRow(page,'Whitespace  Saved archived').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Whitespace  Saved archived')).toHaveCount(0);
  14 |   for(const query of ['whitespace saved',' WHITESPACE  SAVED ','whitespace\t saved']){
> 15 |    await page.getByRole('textbox',{name:'Project search',exact:true}).fill(projectName(query));await page.getByRole('button',{name:'Search projects',exact:true}).click();await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(2);const rows=await page.getByTestId('project-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Whitespace   Saved first');expect(rows[1]).toContain('Whitespace Saved second');
     |                                                                      ^ ReferenceError: projectName is not defined
  16 |   }
  17 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await expect(page.getByTestId('project-row').filter({visible:true})).toHaveCount(1);expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');await page.reload();expect(await projectRow(page,'Whitespace  Saved archived').textContent()).toContain('Whitespace  Saved archived');
  18 |  });
  19 | }
  20 | 
```