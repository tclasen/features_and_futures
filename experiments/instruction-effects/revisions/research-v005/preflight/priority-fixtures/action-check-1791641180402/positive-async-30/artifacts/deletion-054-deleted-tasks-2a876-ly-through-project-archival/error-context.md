# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deletion.spec.mjs >> 054 deleted tasks preserve fields intersect filters and remain read-only through project archival
- Location: experiments/instruction-effects/revisions/research-v005/decisions/task-018-draft/suite/deletion.spec.mjs:10:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Completed remove', exact: true }) }).visible()
Expected: visible
Error: strict mode violation: getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Completed remove', exact: true }) }).visible() resolved to 2 elements:
    1) <div data-testid="task-row">…</div> aka getByTestId('task-row').first()
    2) <div data-testid="task-row">…</div> aka getByTestId('task-row').nth(3)

Call log:
  - Expect "toBeVisible" getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Completed remove', exact: true }) }).visible() with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Completed remove', exact: true }) }).visible()

```

# Page snapshot

```yaml
- generic [ref=f14e1]:
  - heading "task-018 Deletion fields" [level=1] [ref=f14e2]
  - group [ref=f14e4]:
    - button "Download project" [ref=f14e5]
  - group [ref=f14e7]:
    - button "Projects" [ref=f14e8]
  - group [ref=f14e10]:
    - generic [ref=f14e11]:
      - text: Task search
      - textbox "Task search" [ref=f14e12]: completed remove
    - button "Search tasks" [ref=f14e13]
  - group [ref=f14e15]:
    - generic [ref=f14e16]:
      - text: Due from
      - textbox "Due from" [ref=f14e17]: 2036-02-29
    - generic [ref=f14e18]:
      - text: Due through
      - textbox "Due through" [ref=f14e19]: 2036-02-29
    - button "Apply due range" [active] [ref=f14e20]
  - group [ref=f14e22]:
    - generic [ref=f14e23]:
      - text: New project name
      - textbox "New project name" [ref=f14e24]
    - button "Rename project" [ref=f14e25]
  - generic [ref=f14e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f14e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f14e30]:
    - generic [ref=f14e31]:
      - text: Task title
      - textbox "Task title" [ref=f14e32]
    - button "Create task" [ref=f14e33]
  - generic [ref=f14e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f14e36]:
      - option "All"
      - option "Open"
      - option "Completed" [selected]
      - option "Deleted"
  - generic [ref=f14e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f14e39]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f14e40]:
    - text: Completed remove
    - group [ref=f14e42]:
      - button "Delete task" [ref=f14e43]
    - checkbox "Complete Completed remove" [checked] [ref=f14e45]
    - group [ref=f14e47]:
      - generic [ref=f14e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f14e49]: Deleted Ω note second line
      - button "Save notes" [ref=f14e50]
    - group [ref=f14e52]:
      - generic [ref=f14e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f14e54]: 2036-02-29
      - button "Save due date" [ref=f14e55]
    - group [ref=f14e57]:
      - generic [ref=f14e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f14e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f14e60]
    - group [ref=f14e62]:
      - generic [ref=f14e63]:
        - text: New task title
        - textbox "New task title" [ref=f14e64]
      - button "Rename task" [ref=f14e65]
    - generic [ref=f14e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f14e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f14e69]:
    - text: Completed remove sentinel
    - group [ref=f14e71]:
      - button "Delete task" [ref=f14e72]
    - checkbox "Complete Completed remove sentinel" [checked] [ref=f14e74]
    - group [ref=f14e76]:
      - generic [ref=f14e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f14e78]
      - button "Save notes" [ref=f14e79]
    - group [ref=f14e81]:
      - generic [ref=f14e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f14e83]: 2036-02-29
      - button "Save due date" [ref=f14e84]
    - group [ref=f14e86]:
      - generic [ref=f14e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f14e88]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f14e89]
    - group [ref=f14e91]:
      - generic [ref=f14e92]:
        - text: New task title
        - textbox "New task title" [ref=f14e93]
      - button "Rename task" [ref=f14e94]
    - generic [ref=f14e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f14e97]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f14e98]:
    - text: Completed remove outside
    - group [ref=f14e100]:
      - button "Delete task" [ref=f14e101]
    - checkbox "Complete Completed remove outside" [checked] [ref=f14e103]
    - group [ref=f14e105]:
      - generic [ref=f14e106]:
        - text: Task notes
        - textbox "Task notes" [ref=f14e107]
      - button "Save notes" [ref=f14e108]
    - group [ref=f14e110]:
      - generic [ref=f14e111]:
        - text: Task due date
        - textbox "Task due date" [ref=f14e112]: 2037-01-01
      - button "Save due date" [ref=f14e113]
    - group [ref=f14e115]:
      - generic [ref=f14e116]:
        - text: Destination project
        - combobox "Destination project" [ref=f14e117]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f14e118]
    - group [ref=f14e120]:
      - generic [ref=f14e121]:
        - text: New task title
        - textbox "New task title" [ref=f14e122]
      - button "Rename task" [ref=f14e123]
    - generic [ref=f14e125]:
      - text: Task priority
      - combobox "Task priority" [ref=f14e126]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f14e127]:
    - text: Completed remove
    - group [ref=f14e129]:
      - button "Delete task" [ref=f14e130]
    - checkbox "Complete Completed remove" [checked] [ref=f14e132]
    - group [ref=f14e134]:
      - generic [ref=f14e135]:
        - text: Task notes
        - textbox "Task notes" [ref=f14e136]: Deleted Ω note second line
      - button "Save notes" [ref=f14e137]
    - group [ref=f14e139]:
      - generic [ref=f14e140]:
        - text: Task due date
        - textbox "Task due date" [ref=f14e141]: 2036-02-29
      - button "Save due date" [ref=f14e142]
    - group [ref=f14e144]:
      - generic [ref=f14e145]:
        - text: Destination project
        - combobox "Destination project" [ref=f14e146]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f14e147]
    - group [ref=f14e149]:
      - generic [ref=f14e150]:
        - text: New task title
        - textbox "New task title" [ref=f14e151]
      - button "Rename task" [ref=f14e152]
    - generic [ref=f14e154]:
      - text: Task priority
      - combobox "Task priority" [ref=f14e155]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f14e156]:
    - text: Completed remove sentinel
    - group [ref=f14e158]:
      - button "Delete task" [ref=f14e159]
    - checkbox "Complete Completed remove sentinel" [checked] [ref=f14e161]
    - group [ref=f14e163]:
      - generic [ref=f14e164]:
        - text: Task notes
        - textbox "Task notes" [ref=f14e165]
      - button "Save notes" [ref=f14e166]
    - group [ref=f14e168]:
      - generic [ref=f14e169]:
        - text: Task due date
        - textbox "Task due date" [ref=f14e170]: 2036-02-29
      - button "Save due date" [ref=f14e171]
    - group [ref=f14e173]:
      - generic [ref=f14e174]:
        - text: Destination project
        - combobox "Destination project" [ref=f14e175]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f14e176]
    - group [ref=f14e178]:
      - generic [ref=f14e179]:
        - text: New task title
        - textbox "New task title" [ref=f14e180]
      - button "Rename task" [ref=f14e181]
    - generic [ref=f14e183]:
      - text: Task priority
      - combobox "Task priority" [ref=f14e184]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedPriority} from './helpers.mjs';
  3  | const filter=page=>page.getByRole('combobox',{name:'Task filter',exact:true});
  4  | const notes=(page,title)=>taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true});
  5  | async function summary(page,owner,value){const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');return projectRow(observer,owner).getByTestId('project-summary').textContent();},{timeout:5000}).toBe(value);}finally{await observer.close();}}
  6  | async function saved(page,owner,title,label,value){const row=taskRow(page,title);await row.getByRole('textbox',{name:label,exact:true}).fill(value);await row.getByRole('button',{name:label==='Task notes'?'Save notes':'Save due date',exact:true}).click();const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,owner);return taskRow(observer,title).getByRole('textbox',{name:label,exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}}
  7  | async function ordered(page,titles){const rows=page.getByTestId('task-row').filter({visible:true});await expect(rows).toHaveCount(titles.length);for(const [index,title] of titles.entries())await expect(rows.nth(index).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();}
  8  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  9  | if(stage>=16){
  10 |  test('054 deleted tasks preserve fields intersect filters and remain read-only through project archival',async({page})=>{
  11 |   const owner='Deletion fields',title='Completed remove';await createProject(page,owner);await openProject(page,owner);for(const t of ['Live before',title,'Live after','Completed remove sentinel'])await createTask(page,t);
  12 |   await expect(filter(page).locator('option')).toHaveText(['All','Open','Completed','Deleted']);await page.getByRole('checkbox',{name:'Complete '+title,exact:true}).check();await summary(page,owner,'1/4 completed');await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,title,'High');await saved(page,owner,title,'Task due date','2036-02-29');await saved(page,owner,title,'Task notes','  Deleted Ω note\nsecond line  ');await page.getByRole('checkbox',{name:'Complete Completed remove sentinel',exact:true}).check();await summary(page,owner,'2/4 completed');await taskRow(page,'Completed remove sentinel').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,'Completed remove sentinel','High');await saved(page,owner,'Completed remove sentinel','Task due date','2036-02-29');
  13 |   await createTask(page,'Completed remove outside');await page.getByRole('checkbox',{name:'Complete Completed remove outside',exact:true}).check();await summary(page,owner,'3/5 completed');await taskRow(page,'Completed remove outside').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,'Completed remove outside','High');await saved(page,owner,'Completed remove outside','Task due date','2037-01-01');await createTask(page,'Completed normal exclusion');await page.getByRole('checkbox',{name:'Complete Completed normal exclusion',exact:true}).check();await summary(page,owner,'4/6 completed');
> 14 |   await filter(page).selectOption({label:'Completed'});await expect(taskRow(page,'Live before')).toHaveCount(0);await expect(taskRow(page,'Completed normal exclusion')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Completed normal exclusion')).toHaveCount(0);await expect(taskRow(page,'Completed remove outside')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await page.getByRole('textbox',{name:'Task search',exact:true}).fill('completed remove');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2036-02-29');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2036-02-29');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,'Completed remove outside')).toHaveCount(0);await expect(taskRow(page,title)).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await taskRow(page,title).getByRole('button',{name:'Delete task',exact:true}).click();await summary(page,owner,'3/5 completed');await expect(taskRow(page,'Completed remove sentinel')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(filter(page).locator('option:checked')).toHaveText('Completed');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('completed remove');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2036-02-29');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2036-02-29');
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                ^ Error: expect(locator).toBeVisible() failed
  15 |   await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,title)).toBeVisible();await expect(taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2036-02-29');await expect(page.getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeChecked();await expect(notes(page,title)).toHaveValue('  Deleted Ω note\nsecond line  ');for(const label of ['New task title','Task due date','Task notes'])await expect(taskRow(page,title).getByRole('textbox',{name:label,exact:true})).toBeDisabled();await expect(page.getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeDisabled();for(const label of ['Task priority','Destination project'])await expect(taskRow(page,title).getByRole('combobox',{name:label,exact:true})).toBeDisabled();for(const label of ['Rename task','Save due date','Save notes','Move task'])await expect(taskRow(page,title).getByRole('button',{name:label,exact:true})).toBeDisabled();await expect(taskRow(page,title).getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await page.reload();await filter(page).selectOption({label:'Deleted'});await expect(notes(page,title)).toHaveValue('  Deleted Ω note\nsecond line  ');
  16 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,owner).getByRole('button',{name:'Archive project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,owner);await expect(taskRow(page,'Live before').getByRole('button',{name:'Delete task',exact:true})).toBeDisabled();await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,title)).toBeVisible();await expect(taskRow(page,title).getByRole('button',{name:'Restore task',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Search tasks',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Apply due range',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,owner).getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,owner);await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,title)).toBeVisible();await expect(taskRow(page,title).getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();
  17 |  });
  18 |  test('055 restoration retains reserved order explicit priority completion and remembered destination positions',async({page})=>{
  19 |   await createProject(page,'Deletion target');await openProject(page,'Deletion target');await createTask(page,'Target first');await createProject(page,'Deletion order');await openProject(page,'Deletion order');for(const t of ['Before','Reserved','After'])await createTask(page,t);await taskRow(page,'Reserved').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Deletion order','Reserved','High');await page.getByRole('checkbox',{name:'Complete Reserved',exact:true}).check();await summary(page,'Deletion order','1/3 completed');await saved(page,'Deletion order','Reserved','Task due date','2037-01-01');await saved(page,'Deletion order','Reserved','Task notes','Restore original note');
  20 |   const move=async(target)=>{await taskRow(page,'Reserved').getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,'Reserved').getByRole('button',{name:'Move task',exact:true}).click();await page.goto('/');await openProject(page,target);await expect(taskRow(page,'Reserved')).toBeVisible();};
  21 |   await move('Deletion target');await createTask(page,'Target later');await move('Deletion order');await taskRow(page,'Reserved').getByRole('button',{name:'Delete task',exact:true}).click();await summary(page,'Deletion order','0/2 completed');await createTask(page,'New arrival');await page.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:'Low'});const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Deletion order');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');}finally{await observer.close();}await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,'Reserved')).toBeVisible();await taskRow(page,'Reserved').getByRole('button',{name:'Restore task',exact:true}).click();await summary(page,'Deletion order','1/4 completed');await expect(filter(page).locator('option:checked')).toHaveText('Deleted');await filter(page).selectOption({label:'All'});await ordered(page,['Before','Reserved','After','New arrival']);await expect(taskRow(page,'Reserved').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('checkbox',{name:'Complete Reserved',exact:true})).toBeChecked();await expect(notes(page,'Reserved')).toHaveValue('Restore original note');await expect(taskRow(page,'Reserved').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2037-01-01');await move('Deletion target');await ordered(page,['Target first','Reserved','Target later']);await page.reload();await ordered(page,['Target first','Reserved','Target later']);
  22 |  });
  23 |  test('056 upgraded original tasks remain live and deleted-only project persists with an empty live summary',async({page})=>{
  24 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await page.getByTestId('project-row').filter({hasText:'task-015 Persistence renamed'}).filter({visible:true}).getByRole('button',{name:'Open project',exact:true}).click();await expect(taskRow(page,'Memory kept')).toBeVisible();await expect(taskRow(page,'Memory kept').getByRole('button',{name:'Delete task',exact:true})).toBeDisabled();
  25 |   await createProject(page,'Deletion restart');await openProject(page,'Deletion restart');await createTask(page,'Deleted memory');await saved(page,'Deletion restart','Deleted memory','Task notes','Original deleted note\nretained');await taskRow(page,'Deleted memory').getByRole('button',{name:'Delete task',exact:true}).click();await summary(page,'Deletion restart','0/0 completed');await filter(page).selectOption({label:'Deleted'});await expect(notes(page,'Deleted memory')).toHaveValue('Original deleted note\nretained');await page.reload();await filter(page).selectOption({label:'Deleted'});await expect(notes(page,'Deleted memory')).toHaveValue('Original deleted note\nretained');
  26 |  });
  27 |  test('057 deleted filter intersects priority due range and title search',async({page})=>{
  28 |   const owner='Deleted intersections';await createProject(page,owner);await openProject(page,owner);for(const t of ['Hit one','Hit two','Other title','Undated hit'])await createTask(page,t);
  29 |   for(const t of ['Hit one','Other title','Undated hit']){await taskRow(page,t).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,t,'High');}
  30 |   for(const t of ['Hit one','Hit two','Other title'])await saved(page,owner,t,'Task due date','2039-01-01');
  31 |   for(const t of ['Hit one','Hit two','Other title','Undated hit']){await taskRow(page,t).getByRole('button',{name:'Delete task',exact:true}).click();await summary(page,owner,'0/'+(3-['Hit one','Hit two','Other title','Undated hit'].indexOf(t))+' completed');}
  32 |   await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2039-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2039-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await page.getByRole('textbox',{name:'Task search',exact:true}).fill('HIT');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await page.reload();await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  33 |  });
  34 | 
  35 | }
  36 | 
```