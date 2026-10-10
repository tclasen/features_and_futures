# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: due-range.spec.mjs >> 036 invalid due ranges preserve the last applied membership
- Location: experiments/instruction-effects/revisions/research-v005/decisions/task-018-draft/suite/due-range.spec.mjs:40:2

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Undated outsider', exact: true }) }).visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Undated outsider', exact: true }) }).visible() with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Undated outsider', exact: true }) }).visible()
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=f6e1]:
  - heading "task-018 Range validation" [level=1] [ref=f6e2]
  - group [ref=f6e4]:
    - button "Download project" [ref=f6e5]
  - group [ref=f6e7]:
    - button "Projects" [ref=f6e8]
  - alert [ref=f6e9]: Due range must use valid YYYY-MM-DD dates
  - group [ref=f6e11]:
    - generic [ref=f6e12]:
      - text: Task search
      - textbox "Task search" [ref=f6e13]
    - button "Search tasks" [ref=f6e14]
  - group [ref=f6e16]:
    - generic [ref=f6e17]:
      - text: Due from
      - textbox "Due from" [ref=f6e18]
    - generic [ref=f6e19]:
      - text: Due through
      - textbox "Due through" [ref=f6e20]
    - button "Apply due range" [ref=f6e21]
  - group [ref=f6e23]:
    - generic [ref=f6e24]:
      - text: New project name
      - textbox "New project name" [ref=f6e25]
    - button "Rename project" [ref=f6e26]
  - generic [ref=f6e28]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f6e29]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f6e31]:
    - generic [ref=f6e32]:
      - text: Task title
      - textbox "Task title" [ref=f6e33]
    - button "Create task" [ref=f6e34]
  - generic [ref=f6e36]:
    - text: Task filter
    - combobox "Task filter" [ref=f6e37]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f6e39]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f6e40]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f6e41]:
    - text: Valid member
    - group [ref=f6e43]:
      - button "Delete task" [ref=f6e44]
    - checkbox "Complete Valid member" [ref=f6e46]
    - group [ref=f6e48]:
      - generic [ref=f6e49]:
        - text: Task notes
        - textbox "Task notes" [ref=f6e50]
      - button "Save notes" [ref=f6e51]
    - group [ref=f6e53]:
      - generic [ref=f6e54]:
        - text: Task due date
        - textbox "Task due date" [ref=f6e55]: 2028-06-15
      - button "Save due date" [ref=f6e56]
    - group [ref=f6e58]:
      - generic [ref=f6e59]:
        - text: Destination project
        - combobox "Destination project" [ref=f6e60]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-018 Deletion fields"
          - option "task-018 Deletion target"
          - option "task-018 Deletion order"
          - option "task-018 Deletion restart"
          - option "task-018 Calendar independence"
          - option "task-018 Calendar second owner"
      - button "Move task" [ref=f6e61]
    - group [ref=f6e63]:
      - generic [ref=f6e64]:
        - text: New task title
        - textbox "New task title" [ref=f6e65]
      - button "Rename task" [ref=f6e66]
    - generic [ref=f6e68]:
      - text: Task priority
      - combobox "Task priority" [ref=f6e69]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f6e70]:
    - text: Undated outsider
    - group [ref=f6e72]:
      - button "Delete task" [ref=f6e73]
    - checkbox "Complete Undated outsider" [ref=f6e75]
    - group [ref=f6e77]:
      - generic [ref=f6e78]:
        - text: Task notes
        - textbox "Task notes" [ref=f6e79]
      - button "Save notes" [ref=f6e80]
    - group [ref=f6e82]:
      - generic [ref=f6e83]:
        - text: Task due date
        - textbox "Task due date" [ref=f6e84]
      - button "Save due date" [ref=f6e85]
    - group [ref=f6e87]:
      - generic [ref=f6e88]:
        - text: Destination project
        - combobox "Destination project" [ref=f6e89]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-018 Deletion fields"
          - option "task-018 Deletion target"
          - option "task-018 Deletion order"
          - option "task-018 Deletion restart"
          - option "task-018 Calendar independence"
          - option "task-018 Calendar second owner"
      - button "Move task" [ref=f6e90]
    - group [ref=f6e92]:
      - generic [ref=f6e93]:
        - text: New task title
        - textbox "New task title" [ref=f6e94]
      - button "Rename task" [ref=f6e95]
    - generic [ref=f6e97]:
      - text: Task priority
      - combobox "Task priority" [ref=f6e98]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority,requiredAlert} from './helpers.mjs';
  3  | const from=page=>page.getByRole('textbox',{name:'Due from',exact:true});
  4  | const through=page=>page.getByRole('textbox',{name:'Due through',exact:true});
  5  | const completion=page=>page.getByRole('combobox',{name:'Task filter',exact:true});
  6  | const priorityFilter=page=>page.getByRole('combobox',{name:'Priority filter',exact:true});
  7  | async function range(page,a,b){await from(page).fill(a);await through(page).fill(b);await page.getByRole('button',{name:'Apply due range',exact:true}).click();}
  8  | async function saveDate(page,project,title,value){
  9  |  await taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true}).fill(value);await taskRow(page,title).getByRole('button',{name:'Save due date',exact:true}).click();
  10 |  const observer=await page.context().newPage();try{await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return taskRow(observer,title).getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe(value);}finally{await observer.close();}
  11 | }
  12 | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  13 | if(stage>=10){
  14 |  test('034 date ranges include endpoints exclude undated tasks and preserve order',async({page})=>{
  15 |   await createProject(page,'Range boundaries');await openProject(page,'Range boundaries');await expect(from(page)).toHaveValue('');await expect(through(page)).toHaveValue('');
  16 |   for(const title of ['Before range','Range first','No calendar date','Range last','After range'])await createTask(page,title);
  17 |   for(const [title,value] of [['Before range','2028-02-28'],['Range first','2028-02-29'],['Range last','2028-03-02'],['After range','2028-03-03']])await saveDate(page,'Range boundaries',title,value);
  18 |   await range(page,' 2028-02-29 ',' 2028-03-02 ');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  19 |   let rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Range first');expect(rows[1]).toContain('Range last');
  20 |   await range(page,'','2028-02-29');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await expect(taskRow(page,'Before range')).toBeVisible();await expect(taskRow(page,'Range first')).toBeVisible();
  21 |   await range(page,'2028-03-02','');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await expect(taskRow(page,'Range last')).toBeVisible();await expect(taskRow(page,'After range')).toBeVisible();
  22 |   await range(page,'','');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(5);
  23 |  });
  24 |  test('035 due ranges intersect completion priority and live date edits',async({page})=>{
  25 |   await createProject(page,'Range intersections');await openProject(page,'Range intersections');
  26 |   for(const title of ['Range matching','Range low','Range completed','Range undated'])await createTask(page,title);
  27 |   for(const title of ['Range matching','Range completed','Range undated']){await taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Range intersections',title,'High');}
  28 |   for(const title of ['Range matching','Range low','Range completed'])await saveDate(page,'Range intersections',title,'2029-01-15');
  29 |   await page.getByRole('checkbox',{name:'Complete Range completed',exact:true}).check();await expectPersistedCompletion(page,'Range intersections','Range completed',true);
  30 |   await completion(page).selectOption({label:'Open'});await priorityFilter(page).selectOption({label:'High'});await range(page,'2029-01-01','2029-01-31');
  31 |   await expect(completion(page).locator('option:checked')).toHaveText('Open');await expect(priorityFilter(page).locator('option:checked')).toHaveText('High');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  32 |   await saveDate(page,'Range intersections','Range matching','2029-02-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  33 |   await expect(from(page)).toHaveValue('2029-01-01');await expect(through(page)).toHaveValue('2029-01-31');
  34 |   await completion(page).selectOption({label:'Completed'});await expect(taskRow(page,'Range completed')).toBeVisible();await expect(from(page)).toHaveValue('2029-01-01');
  35 |   await page.getByRole('checkbox',{name:'Complete Range completed',exact:true}).uncheck();await expectPersistedCompletion(page,'Range intersections','Range completed',false);await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  36 |   await completion(page).selectOption({label:'Open'});await taskRow(page,'Range completed').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'Low'});await expectPersistedPriority(page,'Range intersections','Range completed','Low');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  37 |   await priorityFilter(page).selectOption({label:'All'});await expect(from(page)).toHaveValue('2029-01-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  38 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Range intersections').getByTestId('project-summary')).toHaveText('0/4 completed');
  39 |  });
  40 |  test('036 invalid due ranges preserve the last applied membership',async({page})=>{
  41 |   await createProject(page,'Range validation');await openProject(page,'Range validation');await createTask(page,'Valid member');await createTask(page,'Undated outsider');await saveDate(page,'Range validation','Valid member','2028-06-15');
  42 |   await range(page,'2028-06-01','2028-06-30');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  43 |   for(const [a,b,message] of [['2028-02-30','2028-06-30','Due range must use valid YYYY-MM-DD dates'],['2028-06-01','bad','Due range must use valid YYYY-MM-DD dates'],['2028-07-01','2028-06-30','Due from must not be after Due through']]){
> 44 |    await range(page,a,b);await expect(requiredAlert(page,message)).toBeVisible();await expect(taskRow(page,'Valid member')).toBeVisible();await expect(taskRow(page,'Undated outsider')).toHaveCount(0);
     |                                                                                                                                                                                          ^ Error: expect(locator).toHaveCount(expected) failed
  45 |   }
  46 |   await range(page,'','');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  47 |  });
  48 |  test('037 archived ranges stay usable and reopening clears transient boundaries',async({page})=>{
  49 |   await createProject(page,'Range archival');await openProject(page,'Range archival');await createTask(page,'Archived date member');await createTask(page,'Archived undated outsider');await saveDate(page,'Range archival','Archived date member','2030-01-01');
  50 |   await range(page,'2030-01-01','2030-01-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  51 |   await taskRow(page,'Archived date member').getByRole('textbox',{name:'New task title',exact:true}).fill('Archived date renamed');await taskRow(page,'Archived date member').getByRole('button',{name:'Rename task',exact:true}).click();await expect(taskRow(page,'Archived date renamed')).toBeVisible();await expect(from(page)).toHaveValue('2030-01-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  52 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Range archival').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Range archival')).toHaveCount(0);
  53 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Range archival');await expect(from(page)).toBeEnabled();await expect(through(page)).toBeEnabled();await expect(from(page)).toHaveValue('');await expect(through(page)).toHaveValue('');
  54 |   await range(page,'2030-01-01','2030-01-01');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);await expect(taskRow(page,'Archived date renamed').getByRole('textbox',{name:'Task due date',exact:true})).toBeDisabled();await expect(taskRow(page,'Archived date renamed').getByRole('button',{name:'Save due date',exact:true})).toBeDisabled();
  55 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Range archival').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Range archival');await expect(from(page)).toHaveValue('');await expect(through(page)).toHaveValue('');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await expect(taskRow(page,'Archived date renamed').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2030-01-01');
  56 |  });
  57 |  test('038 project default rename and hidden creation retain the applied range',async({page})=>{
  58 |   await createProject(page,'Range identity');await openProject(page,'Range identity');await createTask(page,'Retained range member');await createTask(page,'Retained undated outsider');
  59 |   await taskRow(page,'Retained range member').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Range identity','Retained range member','High');await saveDate(page,'Range identity','Retained range member','2031-03-01');
  60 |   await completion(page).selectOption({label:'Open'});await priorityFilter(page).selectOption({label:'High'});await range(page,'2031-03-01','2031-03-01');
  61 |   await page.getByRole('combobox',{name:'Default task priority',exact:true}).selectOption({label:'Low'});
  62 |   const observer=await page.context().newPage();
  63 |   try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Range identity');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');}finally{await observer.close();}
  64 |   await expect(from(page)).toHaveValue('2031-03-01');await expect(through(page)).toHaveValue('2031-03-01');await expect(completion(page).locator('option:checked')).toHaveText('Open');await expect(priorityFilter(page).locator('option:checked')).toHaveText('High');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  65 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Range owner renamed'));await page.getByRole('button',{name:'Rename project',exact:true}).click();await expect(page.getByRole('heading',{name:projectName('Range owner renamed'),exact:true}).first()).toBeVisible();
  66 |   await expect(from(page)).toHaveValue('2031-03-01');await expect(through(page)).toHaveValue('2031-03-01');await expect(completion(page).locator('option:checked')).toHaveText('Open');await expect(priorityFilter(page).locator('option:checked')).toHaveText('High');
  67 |   await page.getByRole('textbox',{name:'Task title',exact:true}).fill('Created outside range');await page.getByRole('button',{name:'Create task',exact:true}).click();
  68 |   await expectPersistedPriority(page,'Range owner renamed','Created outside range','Low');await expect(from(page)).toHaveValue('2031-03-01');await expect(through(page)).toHaveValue('2031-03-01');await expect(completion(page).locator('option:checked')).toHaveText('Open');await expect(priorityFilter(page).locator('option:checked')).toHaveText('High');await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  69 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Range owner renamed').getByTestId('project-summary')).toHaveText('0/3 completed');await openProject(page,'Range owner renamed');await expect(taskRow(page,'Created outside range').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('');
  70 |  });
  71 | 
  72 | }
  73 | 
```