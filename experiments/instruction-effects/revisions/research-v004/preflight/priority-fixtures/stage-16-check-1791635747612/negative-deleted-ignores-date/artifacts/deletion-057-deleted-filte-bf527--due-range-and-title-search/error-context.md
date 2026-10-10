# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deletion.spec.mjs >> 057 deleted filter intersects priority due range and title search
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-016-draft/suite/deletion.spec.mjs:26:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').visible()
Expected: 2
Received: 3
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').visible() with timeout 5000ms
  - waiting for getByTestId('task-row').visible()
    14 × locator resolved to 3 elements
       - unexpected value "3"

```

# Page snapshot

```yaml
- generic [active] [ref=f19e1]:
  - heading "task-016 Deleted intersections" [level=1] [ref=f19e2]
  - group [ref=f19e4]:
    - button "Projects" [ref=f19e5]
  - group [ref=f19e7]:
    - generic [ref=f19e8]:
      - text: Task search
      - textbox "Task search" [ref=f19e9]
    - button "Search tasks" [ref=f19e10]
  - group [ref=f19e12]:
    - generic [ref=f19e13]:
      - text: Due from
      - textbox "Due from" [ref=f19e14]: 2039-01-01
    - generic [ref=f19e15]:
      - text: Due through
      - textbox "Due through" [ref=f19e16]: 2039-01-01
    - button "Apply due range" [ref=f19e17]
  - group [ref=f19e19]:
    - generic [ref=f19e20]:
      - text: New project name
      - textbox "New project name" [ref=f19e21]
    - button "Rename project" [ref=f19e22]
  - generic [ref=f19e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f19e25]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f19e27]:
    - generic [ref=f19e28]:
      - text: Task title
      - textbox "Task title" [ref=f19e29]
    - button "Create task" [ref=f19e30]
  - generic [ref=f19e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f19e33]:
      - option "All"
      - option "Open"
      - option "Completed"
      - option "Deleted" [selected]
  - generic [ref=f19e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f19e36]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f19e37]:
    - text: Hit one
    - group [ref=f19e39]:
      - button "Restore task" [ref=f19e40]
    - checkbox "Complete Hit one" [disabled] [ref=f19e42]
    - group [ref=f19e44]:
      - generic [ref=f19e45]:
        - text: Task notes
        - textbox "Task notes" [disabled] [ref=f19e46]
      - button "Save notes" [disabled] [ref=f19e47]
    - group [ref=f19e49]:
      - generic [ref=f19e50]:
        - text: Task due date
        - textbox "Task due date" [disabled] [ref=f19e51]: 2039-01-01
      - button "Save due date" [disabled] [ref=f19e52]
    - group [ref=f19e54]:
      - generic [ref=f19e55]:
        - text: Destination project
        - combobox "Destination project" [disabled] [ref=f19e56]:
          - option "task-012 Position first owner" [disabled] [selected]
          - option "task-012 Position second owner" [disabled]
          - option "task-012 Search Mixed first" [disabled]
          - option "task-012 Search mixed last" [disabled]
          - option "task-012 Search double gap" [disabled]
          - option "task-012 Whitespace Saved first" [disabled]
      - button "Move task" [disabled] [ref=f19e57]
    - group [ref=f19e59]:
      - generic [ref=f19e60]:
        - text: New task title
        - textbox "New task title" [disabled] [ref=f19e61]
      - button "Rename task" [disabled] [ref=f19e62]
    - generic [ref=f19e64]:
      - text: Task priority
      - combobox "Task priority" [disabled] [ref=f19e65]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f19e66]:
    - text: Other title
    - group [ref=f19e68]:
      - button "Restore task" [ref=f19e69]
    - checkbox "Complete Other title" [disabled] [ref=f19e71]
    - group [ref=f19e73]:
      - generic [ref=f19e74]:
        - text: Task notes
        - textbox "Task notes" [disabled] [ref=f19e75]
      - button "Save notes" [disabled] [ref=f19e76]
    - group [ref=f19e78]:
      - generic [ref=f19e79]:
        - text: Task due date
        - textbox "Task due date" [disabled] [ref=f19e80]: 2039-01-01
      - button "Save due date" [disabled] [ref=f19e81]
    - group [ref=f19e83]:
      - generic [ref=f19e84]:
        - text: Destination project
        - combobox "Destination project" [disabled] [ref=f19e85]:
          - option "task-012 Position first owner" [disabled] [selected]
          - option "task-012 Position second owner" [disabled]
          - option "task-012 Search Mixed first" [disabled]
          - option "task-012 Search mixed last" [disabled]
          - option "task-012 Search double gap" [disabled]
          - option "task-012 Whitespace Saved first" [disabled]
      - button "Move task" [disabled] [ref=f19e86]
    - group [ref=f19e88]:
      - generic [ref=f19e89]:
        - text: New task title
        - textbox "New task title" [disabled] [ref=f19e90]
      - button "Rename task" [disabled] [ref=f19e91]
    - generic [ref=f19e93]:
      - text: Task priority
      - combobox "Task priority" [disabled] [ref=f19e94]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f19e95]:
    - text: Undated hit
    - group [ref=f19e97]:
      - button "Restore task" [ref=f19e98]
    - checkbox "Complete Undated hit" [disabled] [ref=f19e100]
    - group [ref=f19e102]:
      - generic [ref=f19e103]:
        - text: Task notes
        - textbox "Task notes" [disabled] [ref=f19e104]
      - button "Save notes" [disabled] [ref=f19e105]
    - group [ref=f19e107]:
      - generic [ref=f19e108]:
        - text: Task due date
        - textbox "Task due date" [disabled] [ref=f19e109]
      - button "Save due date" [disabled] [ref=f19e110]
    - group [ref=f19e112]:
      - generic [ref=f19e113]:
        - text: Destination project
        - combobox "Destination project" [disabled] [ref=f19e114]:
          - option "task-012 Position first owner" [disabled] [selected]
          - option "task-012 Position second owner" [disabled]
          - option "task-012 Search Mixed first" [disabled]
          - option "task-012 Search mixed last" [disabled]
          - option "task-012 Search double gap" [disabled]
          - option "task-012 Whitespace Saved first" [disabled]
      - button "Move task" [disabled] [ref=f19e115]
    - group [ref=f19e117]:
      - generic [ref=f19e118]:
        - text: New task title
        - textbox "New task title" [disabled] [ref=f19e119]
      - button "Rename task" [disabled] [ref=f19e120]
    - generic [ref=f19e122]:
      - text: Task priority
      - combobox "Task priority" [disabled] [ref=f19e123]:
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
  13 |   await filter(page).selectOption({label:'Completed'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await page.getByRole('textbox',{name:'Task search',exact:true}).fill('completed remove');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2036-02-29');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2036-02-29');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,title)).toBeVisible();await taskRow(page,title).getByRole('button',{name:'Delete task',exact:true}).click();await summary(page,owner,'1/3 completed');await expect(taskRow(page,'Completed remove sentinel')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(filter(page).locator('option:checked')).toHaveText('Completed');await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('completed remove');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('2036-02-29');await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('2036-02-29');
  14 |   await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,title)).toBeVisible();await expect(taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2036-02-29');await expect(page.getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeChecked();await expect(notes(page,title)).toHaveValue('  Deleted Ω note\nsecond line  ');for(const label of ['New task title','Task due date','Task notes'])await expect(taskRow(page,title).getByRole('textbox',{name:label,exact:true})).toBeDisabled();await expect(page.getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeDisabled();for(const label of ['Task priority','Destination project'])await expect(taskRow(page,title).getByRole('combobox',{name:label,exact:true})).toBeDisabled();for(const label of ['Rename task','Save due date','Save notes','Move task'])await expect(taskRow(page,title).getByRole('button',{name:label,exact:true})).toBeDisabled();await expect(taskRow(page,title).getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await page.reload();await expect(notes(page,title)).toHaveValue('  Deleted Ω note\nsecond line  ');
  15 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,owner).getByRole('button',{name:'Archive project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,owner);await expect(taskRow(page,'Live before').getByRole('button',{name:'Delete task',exact:true})).toBeDisabled();await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,title)).toBeVisible();await expect(taskRow(page,title).getByRole('button',{name:'Restore task',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Search tasks',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Apply due range',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,owner).getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,owner);await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,title)).toBeVisible();await expect(taskRow(page,title).getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();
  16 |  });
  17 |  test('055 restoration retains reserved order explicit priority completion and remembered destination positions',async({page})=>{
  18 |   await createProject(page,'Deletion target');await openProject(page,'Deletion target');await createTask(page,'Target first');await createProject(page,'Deletion order');await openProject(page,'Deletion order');for(const t of ['Before','Reserved','After'])await createTask(page,t);await taskRow(page,'Reserved').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Deletion order','Reserved','High');await page.getByRole('checkbox',{name:'Complete Reserved',exact:true}).check();await summary(page,'Deletion order','1/3 completed');await saved(page,'Deletion order','Reserved','Task due date','2037-01-01');await saved(page,'Deletion order','Reserved','Task notes','Restore original note');
  19 |   const move=async(target)=>{await taskRow(page,'Reserved').getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName(target)});await taskRow(page,'Reserved').getByRole('button',{name:'Move task',exact:true}).click();await page.goto('/');await openProject(page,target);await expect(taskRow(page,'Reserved')).toBeVisible();};
  20 |   await move('Deletion target');await createTask(page,'Target later');await move('Deletion order');await taskRow(page,'Reserved').getByRole('button',{name:'Delete task',exact:true}).click();await summary(page,'Deletion order','0/2 completed');await createTask(page,'New arrival');await page.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:'Low'});await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,'Reserved')).toBeVisible();await taskRow(page,'Reserved').getByRole('button',{name:'Restore task',exact:true}).click();await summary(page,'Deletion order','1/4 completed');await expect(filter(page).locator('option:checked')).toHaveText('Deleted');await filter(page).selectOption({label:'All'});await ordered(page,['Before','Reserved','After','New arrival']);await expect(taskRow(page,'Reserved').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(page.getByRole('checkbox',{name:'Complete Reserved',exact:true})).toBeChecked();await expect(notes(page,'Reserved')).toHaveValue('Restore original note');await expect(taskRow(page,'Reserved').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2037-01-01');await move('Deletion target');await ordered(page,['Target first','Reserved','Target later']);await page.reload();await ordered(page,['Target first','Reserved','Target later']);
  21 |  });
  22 |  test('056 upgraded original tasks remain live and deleted-only project persists with an empty live summary',async({page})=>{
  23 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await page.getByTestId('project-row').filter({hasText:'task-015 Persistence renamed'}).filter({visible:true}).getByRole('button',{name:'Open project',exact:true}).click();await expect(taskRow(page,'Memory kept')).toBeVisible();await expect(taskRow(page,'Memory kept').getByRole('button',{name:'Delete task',exact:true})).toBeDisabled();
  24 |   await createProject(page,'Deletion restart');await openProject(page,'Deletion restart');await createTask(page,'Deleted memory');await saved(page,'Deletion restart','Deleted memory','Task notes','Original deleted note\nretained');await taskRow(page,'Deleted memory').getByRole('button',{name:'Delete task',exact:true}).click();await summary(page,'Deletion restart','0/0 completed');await filter(page).selectOption({label:'Deleted'});await expect(notes(page,'Deleted memory')).toHaveValue('Original deleted note\nretained');await page.reload();await expect(notes(page,'Deleted memory')).toHaveValue('Original deleted note\nretained');
  25 |  });
  26 |  test('057 deleted filter intersects priority due range and title search',async({page})=>{
  27 |   const owner='Deleted intersections';await createProject(page,owner);await openProject(page,owner);for(const t of ['Hit one','Hit two','Other title','Undated hit'])await createTask(page,t);
  28 |   for(const t of ['Hit one','Other title','Undated hit']){await taskRow(page,t).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,owner,t,'High');}
  29 |   for(const t of ['Hit one','Hit two','Other title'])await saved(page,owner,t,'Task due date','2039-01-01');
  30 |   for(const t of ['Hit one','Hit two','Other title','Undated hit']){await taskRow(page,t).getByRole('button',{name:'Delete task',exact:true}).click();await summary(page,owner,'0/'+(3-['Hit one','Hit two','Other title','Undated hit'].indexOf(t))+' completed');}
> 31 |   await filter(page).selectOption({label:'Deleted'});await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await page.getByRole('textbox',{name:'Due from',exact:true}).fill('2039-01-01');await page.getByRole('textbox',{name:'Due through',exact:true}).fill('2039-01-01');await page.getByRole('button',{name:'Apply due range',exact:true}).click();await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await page.getByRole('textbox',{name:'Task search',exact:true}).fill('HIT');await page.getByRole('button',{name:'Search tasks',exact:true}).click();await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await page.reload();await expect(taskRow(page,'Hit one')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ^ Error: expect(locator).toHaveCount(expected) failed
  32 |  });
  33 | 
  34 | }
  35 | 
```