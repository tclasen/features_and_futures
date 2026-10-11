# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: default-priority.spec.mjs >> 028 project default affects only future tasks and retains filters and summary
- Location: runs/instruction-effects/eval-012/tasks/task-014/suite/default-priority.spec.mjs:20:2

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByRole('combobox', { name: 'Priority filter', exact: true }).locator('option:checked')
Expected: "High"
Received: "All"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByRole('combobox', { name: 'Priority filter', exact: true }).locator('option:checked') with timeout 5000ms
  - waiting for getByRole('combobox', { name: 'Priority filter', exact: true }).locator('option:checked')
    14 × locator resolved to <option selected>All</option>
       - unexpected value "All"

```

```yaml
- main:
  - button "Projects"
  - heading "task-014 Defaults inheritance" [level=1]
  - text: New project name
  - textbox "New project name"
  - button "Rename project"
  - text: Default task priority
  - combobox "Default task priority":
    - option "Low" [selected]
    - option "Normal"
    - option "High"
  - text: Task title
  - textbox "Task title"
  - button "Create task"
  - text: Task filter
  - combobox "Task filter":
    - option "All"
    - option "Open" [selected]
    - option "Completed"
  - text: Priority filter
  - combobox "Priority filter":
    - option "All" [selected]
    - option "Low"
    - option "Normal"
    - option "High"
  - text: Due from
  - textbox "Due from"
  - text: Due through
  - textbox "Due through"
  - button "Apply due range"
  - text: Task search
  - textbox "Task search"
  - button "Search tasks"
  - region "Tasks":
    - text: Inherited high
    - checkbox "Complete Inherited high"
    - text: Task priority
    - combobox "Task priority":
      - option "Low"
      - option "Normal"
      - option "High" [selected]
    - text: New task title
    - textbox "New task title"
    - button "Rename task"
    - text: Task due date
    - textbox "Task due date"
    - button "Save due date"
    - text: Destination project
    - combobox "Destination project":
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
      - option "task-011 Calendar independence"
      - option "task-011 Calendar second owner"
      - option "task-011 Calendar archival"
      - option "task-011 Range boundaries"
      - option "task-011 Range intersections"
      - option "task-011 Range validation"
      - option "task-011 Range archival"
      - option "task-011 Range owner renamed"
      - option "task-011 Transfer target"
      - option "task-011 Transfer source"
      - option "task-011 Filtered transfer target"
      - option "task-011 Filtered transfer source"
      - option "task-011 Options first"
      - option "task-011 Options second"
      - option "task-011 Options owner"
      - option "task-011 Read-only transfer target"
      - option "task-011 Read-only transfer owner"
      - option "task-011 Priority intersection"
      - option "task-011 Priority live filters"
      - option "task-011 Priority rename filters"
      - option "task-011 Archived combined filters"
      - option "task-011 Priority ownership"
      - option "task-011 Priority other owner"
      - option "task-011 Priority completion"
      - option "task-011 Priority archive"
      - option "task-011 Alpha create"
      - option "task-011 Blank validation sentinel"
      - option "task-011 Order first"
      - option "task-011 Order second"
      - option "task-011 Task reload"
      - option "task-011 Task invalid"
      - option "task-011 Task owner"
      - option "task-011 Other project"
      - option "task-011 Task filters"
      - option "task-011 Archive lifecycle"
      - option "task-011 Archive tasks"
      - option "task-011 Summary project"
      - option "task-011 Transfer restart origin"
      - option "task-011 Identity updated"
      - option "task-011 Identity second"
      - option "task-011 Rename invalid"
      - option "task-011 Rename archive"
      - option "task-011 Task rename identity"
      - option "task-011 Task rename invalid"
      - option "task-011 Task rename archive"
      - option "task-012 Defaults independent"
      - option "task-012 Defaults inheritance"
      - option "task-012 Defaults renamed"
      - option "task-012 Calendar persistence"
      - option "task-012 Calendar validation"
      - option "task-012 Calendar independence"
      - option "task-012 Calendar second owner"
      - option "task-012 Calendar archival"
      - option "task-012 Range boundaries"
      - option "task-012 Range intersections"
      - option "task-012 Range validation"
      - option "task-012 Range archival"
      - option "task-012 Range owner renamed"
      - option "task-012 Transfer target"
      - option "task-012 Transfer source"
      - option "task-012 Filtered transfer target"
      - option "task-012 Filtered transfer source"
      - option "task-012 Options first"
      - option "task-012 Options second"
      - option "task-012 Options owner"
      - option "task-012 Read-only transfer target"
      - option "task-012 Read-only transfer owner"
      - option "task-012 Priority intersection"
      - option "task-012 Priority live filters"
      - option "task-012 Priority rename filters"
      - option "task-012 Archived combined filters"
      - option "task-012 Priority ownership"
      - option "task-012 Priority other owner"
      - option "task-012 Priority completion"
      - option "task-012 Priority archive"
      - option "task-012 Return holding"
      - option "task-012 Return owner"
      - option "task-012 Return identity holding"
      - option "task-012 Returned owner renamed"
      - option "task-012 Position second owner"
      - option "task-012 Position third owner"
      - option "task-012 Position first owner"
      - option "task-012 Alpha create"
      - option "task-012 Blank validation sentinel"
      - option "task-012 Order first"
      - option "task-012 Order second"
      - option "task-012 Task reload"
      - option "task-012 Task invalid"
      - option "task-012 Task owner"
      - option "task-012 Other project"
      - option "task-012 Task filters"
      - option "task-012 Archive lifecycle"
      - option "task-012 Archive tasks"
      - option "task-012 Summary project"
      - option "task-012 Transfer restart origin"
      - option "task-012 Identity updated"
      - option "task-012 Identity second"
      - option "task-012 Rename invalid"
      - option "task-012 Rename archive"
      - option "task-012 Task rename identity"
      - option "task-012 Task rename invalid"
      - option "task-012 Task rename archive"
      - option "task-013 Defaults independent"
      - option "task-013 Defaults inheritance"
      - option "task-013 Defaults renamed"
      - option "task-013 Calendar persistence"
      - option "task-013 Calendar validation"
      - option "task-013 Calendar independence"
      - option "task-013 Calendar second owner"
      - option "task-013 Calendar archival"
      - option "task-013 Range boundaries"
      - option "task-013 Range intersections"
      - option "task-013 Range validation"
      - option "task-013 Range archival"
      - option "task-013 Range owner renamed"
      - option "task-013 Transfer target"
      - option "task-013 Transfer source"
      - option "task-013 Filtered transfer target"
      - option "task-013 Filtered transfer source"
      - option "task-013 Options first"
      - option "task-013 Options second"
      - option "task-013 Options owner"
      - option "task-013 Read-only transfer target"
      - option "task-013 Read-only transfer owner"
      - option "task-013 Priority intersection"
      - option "task-013 Priority live filters"
      - option "task-013 Priority rename filters"
      - option "task-013 Archived combined filters"
      - option "task-013 Priority ownership"
      - option "task-013 Priority other owner"
      - option "task-013 Priority completion"
      - option "task-013 Priority archive"
      - option "task-013 Return holding"
      - option "task-013 Return owner"
      - option "task-013 Return identity holding"
      - option "task-013 Returned owner renamed"
      - option "task-013 Position second owner"
      - option "task-013 Position third owner"
      - option "task-013 Position first owner"
      - option "task-013 Search Mixed first"
      - option "task-013 Search unrelated"
      - option "task-013 Search mixed last"
      - option "task-013 Search double gap"
      - option "task-013 Search double sentinel"
      - option "task-013 Search task intersections"
      - option "task-013 Search internal spacing"
      - option "task-013 Alpha create"
      - option "task-013 Blank validation sentinel"
      - option "task-013 Order first"
      - option "task-013 Order second"
      - option "task-013 Task reload"
      - option "task-013 Task invalid"
      - option "task-013 Task owner"
      - option "task-013 Other project"
      - option "task-013 Task filters"
      - option "task-013 Archive lifecycle"
      - option "task-013 Archive tasks"
      - option "task-013 Summary project"
      - option "task-013 Transfer restart origin"
      - option "task-013 Identity updated"
      - option "task-013 Identity second"
      - option "task-013 Rename invalid"
      - option "task-013 Rename archive"
      - option "task-013 Task rename identity"
      - option "task-013 Task rename invalid"
      - option "task-013 Task rename archive"
      - option "task-014 Defaults independent"
    - button "Move task"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import {stage,projectName,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3  | const defaults=page=>page.getByRole('combobox',{name:'Default task priority',exact:true});
  4  | const priority=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true});
  5  | export async function persistedDefault(page,project,value) {
  6  |  const observer=await page.context().newPage();
  7  |  try {await expect.poll(async()=>{await observer.goto('/');await openProject(observer,project);return defaults(observer).locator('option:checked').textContent();},{timeout:5000}).toBe(value);} finally {await observer.close();}
  8  | }
  9  | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  10 | if(stage>=8) {
  11 |  test('027 pre-default projects and tasks preserve their distinct saved priorities',async({page})=>{
  12 |   await page.goto('/');await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  13 |   const prior=page.getByTestId('project-row').filter({hasText:'task-007 Persistence renamed'}).filter({visible:true});
  14 |   await expect(prior.getByTestId('project-summary')).toHaveText('1/1 completed');
  15 |   await prior.getByRole('button',{name:'Open project',exact:true}).click();
  16 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');await expect(defaults(page)).toBeDisabled();
  17 |   await expect(priority(page,'Memory kept').locator('option:checked')).toHaveText('High');
  18 |   await expect(page.getByRole('checkbox',{name:'Complete Memory kept',exact:true})).toBeChecked();
  19 |  });
  20 |  test('028 project default affects only future tasks and retains filters and summary',async({page})=>{
  21 |   await createProject(page,'Defaults independent');
  22 |   await createProject(page,'Defaults inheritance');await openProject(page,'Defaults inheritance');
  23 |   await expect(defaults(page).locator('option')).toHaveText(['Low','Normal','High']);
  24 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');
  25 |   await createTask(page,'Before default change');
  26 |   await page.getByRole('checkbox',{name:'Complete Before default change',exact:true}).check();
  27 |   await expectPersistedCompletion(page,'Defaults inheritance','Before default change',true);
  28 |   await defaults(page).selectOption({label:'High'});await persistedDefault(page,'Defaults inheritance','High');
  29 |   await createTask(page,'Inherited high');await expectPersistedPriority(page,'Defaults inheritance','Inherited high','High');
  30 |   await expect(priority(page,'Before default change').locator('option:checked')).toHaveText('Normal');
  31 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Open'});
  32 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'High'});
  33 |   await defaults(page).selectOption({label:'Low'});await persistedDefault(page,'Defaults inheritance','Low');
  34 |   await persistedDefault(page,'Defaults independent','Normal');
  35 |   await expect(page.getByRole('combobox',{name:'Task filter',exact:true}).locator('option:checked')).toHaveText('Open');
> 36 |   await expect(page.getByRole('combobox',{name:'Priority filter',exact:true}).locator('option:checked')).toHaveText('High');
     |                                                                                                          ^ Error: expect(locator).toHaveText(expected) failed
  37 |   await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  38 |   await expect(priority(page,'Inherited high').locator('option:checked')).toHaveText('High');
  39 |   await page.getByRole('combobox',{name:'Priority filter',exact:true}).selectOption({label:'All'});
  40 |   await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'All'});
  41 |   await createTask(page,'Inherited low');await expectPersistedPriority(page,'Defaults inheritance','Inherited low','Low');
  42 |   await defaults(page).selectOption({label:'Normal'});await persistedDefault(page,'Defaults inheritance','Normal');
  43 |   await createTask(page,'Inherited normal');await expectPersistedPriority(page,'Defaults inheritance','Inherited normal','Normal');
  44 |   await expect(priority(page,'Inherited high').locator('option:checked')).toHaveText('High');
  45 |   await expect(priority(page,'Inherited low').locator('option:checked')).toHaveText('Low');
  46 |   const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
  47 |   for(const [i,title] of ['Before default change','Inherited high','Inherited low','Inherited normal'].entries())expect(rows[i]).toContain(title);
  48 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await expect(projectRow(page,'Defaults inheritance').getByTestId('project-summary')).toHaveText('1/4 completed');
  49 |   await page.goto('/');await openProject(page,'Defaults independent');
  50 |   await expect(defaults(page).locator('option:checked')).toHaveText('Normal');await createTask(page,'Independent normal');
  51 |   await expect(priority(page,'Independent normal').locator('option:checked')).toHaveText('Normal');
  52 |  });
  53 |  test('029 project default survives rename archive and restoration',async({page})=>{
  54 |   await createProject(page,'Defaults lifecycle');await openProject(page,'Defaults lifecycle');
  55 |   await defaults(page).selectOption({label:'Low'});await persistedDefault(page,'Defaults lifecycle','Low');
  56 |   await createTask(page,'Lifecycle task');await expectPersistedPriority(page,'Defaults lifecycle','Lifecycle task','Low');
  57 |   await page.getByRole('textbox',{name:'New project name',exact:true}).fill(projectName('Defaults renamed'));
  58 |   await page.getByRole('button',{name:'Rename project',exact:true}).click();
  59 |   await expect(page.getByRole('heading',{name:projectName('Defaults renamed'),exact:true}).first()).toBeVisible();
  60 |   await persistedDefault(page,'Defaults renamed','Low');await page.reload();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  61 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await projectRow(page,'Defaults renamed').getByRole('button',{name:'Archive project',exact:true}).click();
  62 |   await expect(projectRow(page,'Defaults renamed')).toHaveCount(0);
  63 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});await openProject(page,'Defaults renamed');
  64 |   await expect(defaults(page)).toBeDisabled();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  65 |   await page.getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  66 |   await projectRow(page,'Defaults renamed').getByRole('button',{name:'Restore project',exact:true}).click();
  67 |   await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});await openProject(page,'Defaults renamed');
  68 |   await expect(defaults(page)).toBeEnabled();await expect(defaults(page).locator('option:checked')).toHaveText('Low');
  69 |   await expect(priority(page,'Lifecycle task').locator('option:checked')).toHaveText('Low');
  70 |   await createTask(page,'Restored inherits');await expectPersistedPriority(page,'Defaults renamed','Restored inherits','Low');
  71 |  });
  72 | }
  73 | 
```