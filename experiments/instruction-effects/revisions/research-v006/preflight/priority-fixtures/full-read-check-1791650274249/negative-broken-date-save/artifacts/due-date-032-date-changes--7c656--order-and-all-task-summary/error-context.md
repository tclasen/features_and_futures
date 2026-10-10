# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: due-date.spec.mjs >> 032 date changes retain task identity filters order and all-task summary
- Location: experiments/instruction-effects/revisions/research-v006/decisions/task-020-draft/suite/due-date.spec.mjs:29:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "2029-01-01"
Received: ""

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f9e1]:
  - heading "task-020 Calendar independence" [level=1] [ref=f9e2]
  - group [ref=f9e4]:
    - button "Download project" [ref=f9e5]
  - group [ref=f9e7]:
    - button "Projects" [ref=f9e8]
  - group [ref=f9e10]:
    - generic [ref=f9e11]:
      - text: Task search
      - textbox "Task search" [ref=f9e12]
    - button "Search tasks" [ref=f9e13]
  - group [ref=f9e15]:
    - generic [ref=f9e16]:
      - text: Due from
      - textbox "Due from" [ref=f9e17]
    - generic [ref=f9e18]:
      - text: Due through
      - textbox "Due through" [ref=f9e19]
    - button "Apply due range" [ref=f9e20]
  - group [ref=f9e22]:
    - generic [ref=f9e23]:
      - text: New project name
      - textbox "New project name" [ref=f9e24]
    - button "Rename project" [ref=f9e25]
  - generic [ref=f9e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f9e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f9e30]:
    - generic [ref=f9e31]:
      - text: Task title
      - textbox "Task title" [ref=f9e32]
    - button "Create task" [ref=f9e33]
  - generic [ref=f9e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f9e36]:
      - option "All"
      - option "Open"
      - option "Completed" [selected]
      - option "Deleted"
  - generic [ref=f9e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f9e39]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f9e40]:
    - text: Dated first
    - group [ref=f9e42]:
      - button "Delete task" [ref=f9e43]
    - checkbox "Complete Dated first" [checked] [ref=f9e45]
    - group [ref=f9e47]:
      - generic [ref=f9e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f9e49]
      - button "Save notes" [ref=f9e50]
    - group [ref=f9e52]:
      - generic [ref=f9e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f9e54]
      - button "Save due date" [ref=f9e55]
    - group [ref=f9e57]:
      - generic [ref=f9e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f9e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
      - button "Move task" [ref=f9e60]
    - group [ref=f9e62]:
      - generic [ref=f9e63]:
        - text: New task title
        - textbox "New task title" [ref=f9e64]
      - button "Rename task" [ref=f9e65]
    - generic [ref=f9e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f9e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority,requiredAlert} from './helpers.mjs';
  3  | const date=(page,title)=>taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true});
  4  | const save=(page,title)=>taskRow(page,title).getByRole('button',{name:'Save due date',exact:true});
  5  | async function persistedDate(page,project,title,value) {
  6  |  const observer=await page.context().newPage();
> 7  |  try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return date(observer,title).inputValue();},{timeout:5000}).toBe(value);} finally {await observer.close();}
     |                                                                                                                                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  8  | }
  9  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  10 | if(stage>=9) {
  11 |  test('030 dates default empty save canonically survive rename and clear',async({page})=>{
  12 |   await createProject(page,'Calendar persistence');await openProject(page,'Calendar persistence');await createTask(page,'Calendar old title');
  13 |   await expect(date(page,'Calendar old title')).toHaveValue('');
  14 |   await date(page,'Calendar old title').fill(' 2028-02-29 ');await save(page,'Calendar old title').click();
  15 |   await persistedDate(page,'Calendar persistence','Calendar old title','2028-02-29');await page.reload();await expect(date(page,'Calendar old title')).toHaveValue('2028-02-29');
  16 |   await taskRow(page,'Calendar old title').getByRole('textbox',{name:'New task title',exact:true}).fill('Calendar renamed');
  17 |   await taskRow(page,'Calendar old title').getByRole('button',{name:'Rename task',exact:true}).click();
  18 |   await expect(date(page,'Calendar renamed')).toBeVisible();await persistedDate(page,'Calendar persistence','Calendar renamed','2028-02-29');
  19 |   await date(page,'Calendar renamed').fill('   ');await save(page,'Calendar renamed').click();await persistedDate(page,'Calendar persistence','Calendar renamed','');await page.reload();await expect(date(page,'Calendar renamed')).toHaveValue('');
  20 |  });
  21 |  test('031 invalid formats and impossible calendar dates preserve the saved date',async({page})=>{
  22 |   await createProject(page,'Calendar validation');await openProject(page,'Calendar validation');await createTask(page,'Calendar valid');
  23 |   await date(page,'Calendar valid').fill('2028-04-30');await save(page,'Calendar valid').click();await persistedDate(page,'Calendar validation','Calendar valid','2028-04-30');
  24 |   for(const bad of ['2027-02-29','2028-04-31','2028-13-01','2028-00-10','0000-01-01','28-01-01','2028-1-01','not a date']) {
  25 |    await date(page,'Calendar valid').fill(bad);await save(page,'Calendar valid').click();await expect(requiredAlert(page,'Due date must be a valid YYYY-MM-DD date')).toBeVisible();
  26 |    await persistedDate(page,'Calendar validation','Calendar valid','2028-04-30');await page.reload();await expect(date(page,'Calendar valid')).toHaveValue('2028-04-30');
  27 |   }
  28 |  });
  29 |  test('032 date changes retain task identity filters order and all-task summary',async({page})=>{
  30 |   await createProject(page,'Calendar independence');await openProject(page,'Calendar independence');
  31 |   await createTask(page,'Dated first');await createTask(page,'Undated second');await createTask(page,'Completed normal guard');await page.getByRole('checkbox',{name:'Complete Completed normal guard',exact:true}).check();await expectPersistedCompletion(page,'Calendar independence','Completed normal guard',true);
  32 |   await taskRow(page,'Dated first').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Calendar independence','Dated first','High');
  33 |   await page.getByRole('checkbox',{name:'Complete Dated first',exact:true}).check();await expectPersistedCompletion(page,'Calendar independence','Dated first',true);
  34 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await expect(taskRow(page,'Undated second')).toHaveCount(0);await expect(taskRow(page,'Completed normal guard')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});await expect(taskRow(page,'Completed normal guard')).toHaveCount(0);await expect(taskRow(page,'Dated first')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  35 |   await date(page,'Dated first').fill('2029-01-01');await save(page,'Dated first').click();await persistedDate(page,'Calendar independence','Dated first','2029-01-01');
  36 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Completed');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  37 |   await expect(page.getByRole('checkbox',{name:'Complete Dated first',exact:true})).toBeChecked();await expect(taskRow(page,'Dated first').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');
  38 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  39 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});
  40 |   await expect(date(page,'Undated second')).toHaveValue('');const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Dated first');expect(rows[1]).toContain('Undated second');
  41 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Calendar independence').getByTestId('project-summary')).toHaveText('2/3 completed');
  42 |   await createProject(page,'Calendar second owner');await openProject(page,'Calendar second owner');await createTask(page,'Owner task');await expect(date(page,'Owner task')).toHaveValue('');
  43 |  });
  44 |  test('033 archived dates are read-only restored and old data stays undated',async({page})=>{
  45 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  46 |   const prior=page.getByTestId('project-row').filter({hasText:'task-008 Persistence renamed'}).filter({visible:true});await prior.getByRole('button',{name:'Open project',exact:true}).click();
  47 |   await expect(date(page,'Memory kept')).toHaveValue('');await expect(page.getByRole('checkbox',{name:'Complete Memory kept',exact:true})).toBeChecked();await expect(taskRow(page,'Memory kept').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');
  48 |   await createProject(page,'Calendar archival');await openProject(page,'Calendar archival');await createTask(page,'Archive dated');
  49 |   await date(page,'Archive dated').fill('2030-12-31');await save(page,'Archive dated').click();await persistedDate(page,'Calendar archival','Archive dated','2030-12-31');
  50 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Calendar archival').getByRole('button',{name:'Archive project',exact:true}).click();await expect(projectRow(page,'Calendar archival')).toHaveCount(0);
  51 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Calendar archival');await expect(date(page,'Archive dated')).toBeDisabled();await expect(save(page,'Archive dated')).toBeDisabled();await expect(date(page,'Archive dated')).toHaveValue('2030-12-31');
  52 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await projectRow(page,'Calendar archival').getByRole('button',{name:'Restore project',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Calendar archival');await expect(date(page,'Archive dated')).toBeEnabled();await expect(save(page,'Archive dated')).toBeEnabled();await expect(date(page,'Archive dated')).toHaveValue('2030-12-31');
  53 |  });
  54 | }
  55 | 
```