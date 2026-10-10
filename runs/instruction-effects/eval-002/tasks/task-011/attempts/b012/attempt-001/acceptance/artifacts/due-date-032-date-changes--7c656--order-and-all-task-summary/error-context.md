# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: due-date.spec.mjs >> 032 date changes retain task identity filters order and all-task summary
- Location: runs/instruction-effects/eval-002/tasks/task-011/suite/due-date.spec.mjs:29:2

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
- main [ref=f1e2]:
  - button "Projects" [ref=f1e3] [cursor=pointer]
  - heading "task-011 Calendar independence" [level=1] [ref=f1e4]
  - generic [ref=f1e5]:
    - generic [ref=f1e6]: New project name
    - textbox "New project name" [ref=f1e7]
    - button "Rename project" [ref=f1e8] [cursor=pointer]
  - text: Default task priority
  - combobox "Default task priority" [ref=f1e9]:
    - option "Low"
    - option "Normal" [selected]
    - option "High"
  - generic [ref=f1e10]:
    - generic [ref=f1e11]: Task title
    - textbox "Task title" [ref=f1e12]
    - button "Create task" [ref=f1e13] [cursor=pointer]
  - text: Task filter
  - combobox "Task filter" [ref=f1e14]:
    - option "All"
    - option "Open"
    - option "Completed" [selected]
  - text: Priority filter
  - combobox "Priority filter" [ref=f1e15]:
    - option "All"
    - option "Low"
    - option "Normal"
    - option "High" [selected]
  - text: Due from
  - textbox "Due from" [ref=f1e16]
  - text: Due through
  - textbox "Due through" [ref=f1e17]
  - button "Apply due range" [ref=f1e18] [cursor=pointer]
  - region "Tasks" [ref=f1e19]:
    - generic [ref=f1e20]:
      - text: Dated first
      - checkbox "Complete Dated first" [checked] [ref=f1e21]
      - combobox "Task priority" [ref=f1e22]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - textbox "Task due date" [ref=f1e23]
      - button "Save due date" [ref=f1e24] [cursor=pointer]
      - alert
      - textbox "New task title" [ref=f1e25]
      - button "Rename task" [ref=f1e26] [cursor=pointer]
      - alert
      - combobox "Destination project" [ref=f1e27]:
        - option "task-001 Alpha create" [selected]
        - option "task-001 Blank validation sentinel"
        - option "task-001 Order first"
        - option "task-001 Order second"
        - option "task-001 Persistence sentinel"
        - option "task-002 Alpha create"
        - option "task-002 Blank validation sentinel"
        - option "task-002 Order first"
        - option "task-002 Order second"
        - option "task-002 Task reload"
        - option "task-002 Task invalid"
        - option "task-002 Task owner"
        - option "task-002 Other project"
        - option "task-002 Task filters"
        - option "task-002 Persistence sentinel"
        - option "task-003 Alpha create"
        - option "task-003 Blank validation sentinel"
        - option "task-003 Order first"
        - option "task-003 Order second"
        - option "task-003 Task reload"
        - option "task-003 Task invalid"
        - option "task-003 Task owner"
        - option "task-003 Other project"
        - option "task-003 Task filters"
        - option "task-003 Archive lifecycle"
        - option "task-003 Archive tasks"
        - option "task-003 Summary project"
        - option "task-004 Alpha create"
        - option "task-004 Blank validation sentinel"
        - option "task-004 Order first"
        - option "task-004 Order second"
        - option "task-004 Task reload"
        - option "task-004 Task invalid"
        - option "task-004 Task owner"
        - option "task-004 Other project"
        - option "task-004 Task filters"
        - option "task-004 Archive lifecycle"
        - option "task-004 Archive tasks"
        - option "task-004 Summary project"
        - option "task-004 Identity updated"
        - option "task-004 Identity second"
        - option "task-004 Rename invalid"
        - option "task-004 Rename archive"
        - option "task-005 Alpha create"
        - option "task-005 Blank validation sentinel"
        - option "task-005 Order first"
        - option "task-005 Order second"
        - option "task-005 Task reload"
        - option "task-005 Task invalid"
        - option "task-005 Task owner"
        - option "task-005 Other project"
        - option "task-005 Task filters"
        - option "task-005 Archive lifecycle"
        - option "task-005 Archive tasks"
        - option "task-005 Summary project"
        - option "task-005 Identity updated"
        - option "task-005 Identity second"
        - option "task-005 Rename invalid"
        - option "task-005 Rename archive"
        - option "task-005 Task rename identity"
        - option "task-005 Task rename invalid"
        - option "task-005 Task rename archive"
        - option "task-006 Priority ownership"
        - option "task-006 Priority other owner"
        - option "task-006 Priority completion"
        - option "task-006 Priority archive"
        - option "task-006 Alpha create"
        - option "task-006 Blank validation sentinel"
        - option "task-006 Order first"
        - option "task-006 Order second"
        - option "task-006 Task reload"
        - option "task-006 Task invalid"
        - option "task-006 Task owner"
        - option "task-006 Other project"
        - option "task-006 Task filters"
        - option "task-006 Archive lifecycle"
        - option "task-006 Archive tasks"
        - option "task-006 Summary project"
        - option "task-006 Identity updated"
        - option "task-006 Identity second"
        - option "task-006 Rename invalid"
        - option "task-006 Rename archive"
        - option "task-006 Task rename identity"
        - option "task-006 Task rename invalid"
        - option "task-006 Task rename archive"
        - option "task-007 Priority intersection"
        - option "task-007 Priority live filters"
        - option "task-007 Priority rename filters"
        - option "task-007 Archived combined filters"
        - option "task-007 Priority ownership"
        - option "task-007 Priority other owner"
        - option "task-007 Priority completion"
        - option "task-007 Priority archive"
        - option "task-007 Alpha create"
        - option "task-007 Blank validation sentinel"
        - option "task-007 Order first"
        - option "task-007 Order second"
        - option "task-007 Task reload"
        - option "task-007 Task invalid"
        - option "task-007 Task owner"
        - option "task-007 Other project"
        - option "task-007 Task filters"
        - option "task-007 Archive lifecycle"
        - option "task-007 Archive tasks"
        - option "task-007 Summary project"
        - option "task-007 Identity updated"
        - option "task-007 Identity second"
        - option "task-007 Rename invalid"
        - option "task-007 Rename archive"
        - option "task-007 Task rename identity"
        - option "task-007 Task rename invalid"
        - option "task-007 Task rename archive"
        - option "task-008 Defaults independent"
        - option "task-008 Defaults inheritance"
        - option "task-008 Defaults renamed"
        - option "task-008 Priority intersection"
        - option "task-008 Priority live filters"
        - option "task-008 Priority rename filters"
        - option "task-008 Archived combined filters"
        - option "task-008 Priority ownership"
        - option "task-008 Priority other owner"
        - option "task-008 Priority completion"
        - option "task-008 Priority archive"
        - option "task-008 Alpha create"
        - option "task-008 Blank validation sentinel"
        - option "task-008 Order first"
        - option "task-008 Order second"
        - option "task-008 Task reload"
        - option "task-008 Task invalid"
        - option "task-008 Task owner"
        - option "task-008 Other project"
        - option "task-008 Task filters"
        - option "task-008 Archive lifecycle"
        - option "task-008 Archive tasks"
        - option "task-008 Summary project"
        - option "task-008 Identity updated"
        - option "task-008 Identity second"
        - option "task-008 Rename invalid"
        - option "task-008 Rename archive"
        - option "task-008 Task rename identity"
        - option "task-008 Task rename invalid"
        - option "task-008 Task rename archive"
        - option "task-009 Defaults independent"
        - option "task-009 Defaults inheritance"
        - option "task-009 Defaults renamed"
        - option "task-009 Calendar persistence"
        - option "task-009 Calendar validation"
        - option "task-009 Calendar independence"
        - option "task-009 Calendar second owner"
        - option "task-009 Calendar archival"
        - option "task-009 Priority intersection"
        - option "task-009 Priority live filters"
        - option "task-009 Priority rename filters"
        - option "task-009 Archived combined filters"
        - option "task-009 Priority ownership"
        - option "task-009 Priority other owner"
        - option "task-009 Priority completion"
        - option "task-009 Priority archive"
        - option "task-009 Alpha create"
        - option "task-009 Blank validation sentinel"
        - option "task-009 Order first"
        - option "task-009 Order second"
        - option "task-009 Task reload"
        - option "task-009 Task invalid"
        - option "task-009 Task owner"
        - option "task-009 Other project"
        - option "task-009 Task filters"
        - option "task-009 Archive lifecycle"
        - option "task-009 Archive tasks"
        - option "task-009 Summary project"
        - option "task-009 Identity updated"
        - option "task-009 Identity second"
        - option "task-009 Rename invalid"
        - option "task-009 Rename archive"
        - option "task-009 Task rename identity"
        - option "task-009 Task rename invalid"
        - option "task-009 Task rename archive"
        - option "task-010 Defaults independent"
        - option "task-010 Defaults inheritance"
        - option "task-010 Defaults renamed"
        - option "task-010 Calendar persistence"
        - option "task-010 Calendar validation"
        - option "task-010 Calendar independence"
        - option "task-010 Calendar second owner"
        - option "task-010 Calendar archival"
        - option "task-010 Range boundaries"
        - option "task-010 Range intersections"
        - option "task-010 Range validation"
        - option "task-010 Range archival"
        - option "task-010 Range owner renamed"
        - option "task-010 Priority intersection"
        - option "task-010 Priority live filters"
        - option "task-010 Priority rename filters"
        - option "task-010 Archived combined filters"
        - option "task-010 Priority ownership"
        - option "task-010 Priority other owner"
        - option "task-010 Priority completion"
        - option "task-010 Priority archive"
        - option "task-010 Alpha create"
        - option "task-010 Blank validation sentinel"
        - option "task-010 Order first"
        - option "task-010 Order second"
        - option "task-010 Task reload"
        - option "task-010 Task invalid"
        - option "task-010 Task owner"
        - option "task-010 Other project"
        - option "task-010 Task filters"
        - option "task-010 Archive lifecycle"
        - option "task-010 Archive tasks"
        - option "task-010 Summary project"
        - option "task-010 Identity updated"
        - option "task-010 Identity second"
        - option "task-010 Rename invalid"
        - option "task-010 Rename archive"
        - option "task-010 Task rename identity"
        - option "task-010 Task rename invalid"
        - option "task-010 Task rename archive"
        - option "task-011 Defaults independent"
        - option "task-011 Defaults inheritance"
        - option "task-011 Defaults renamed"
        - option "task-011 Calendar persistence"
        - option "task-011 Calendar validation"
      - button "Move task" [ref=f1e28] [cursor=pointer]
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
  31 |   await createTask(page,'Dated first');await createTask(page,'Undated second');
  32 |   await taskRow(page,'Dated first').getByRole('combobox',{name:'Task priority',exact:true}).selectOption({label:'High'});await expectPersistedPriority(page,'Calendar independence','Dated first','High');
  33 |   await page.getByRole('checkbox',{name:'Complete Dated first',exact:true}).check();await expectPersistedCompletion(page,'Calendar independence','Dated first',true);
  34 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Completed'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});
  35 |   await date(page,'Dated first').fill('2029-01-01');await save(page,'Dated first').click();await persistedDate(page,'Calendar independence','Dated first','2029-01-01');
  36 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Completed');await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
  37 |   await expect(page.getByRole('checkbox',{name:'Complete Dated first',exact:true})).toBeChecked();await expect(taskRow(page,'Dated first').getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');
  38 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  39 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});
  40 |   await expect(date(page,'Undated second')).toHaveValue('');const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();expect(rows[0]).toContain('Dated first');expect(rows[1]).toContain('Undated second');
  41 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Calendar independence').getByTestId('project-summary')).toHaveText('1/2 completed');
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