# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority-filter.spec.mjs >> 024 filtered edits re-evaluate rows while retaining both filter choices
- Location: runs/instruction-effects/eval-008/tasks/task-014/suite/priority-filter.spec.mjs:42:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.uncheck: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByRole('checkbox', { name: 'Complete Leaving completion', exact: true })
    - locator resolved to <input checked value="1" type="checkbox" name="completed" data-autosubmit="" aria-label="Complete Leaving completion"/>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - performing click action
    - click action done
    - waiting for scheduled navigations to finish
    - navigations have finished

```

# Page snapshot

```yaml
- main [ref=f16e2]:
  - heading "task-014 Priority live filters" [level=1] [ref=f16e3]
  - button "Projects" [ref=f16e5] [cursor=pointer]
  - generic [ref=f16e6]:
    - generic [ref=f16e7]: New project name
    - generic [ref=f16e8]:
      - textbox "New project name" [ref=f16e9]
      - button "Rename project" [ref=f16e10] [cursor=pointer]
  - generic [ref=f16e11]:
    - generic [ref=f16e12]: Default task priority
    - combobox "Default task priority" [ref=f16e13]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - generic [ref=f16e14]:
    - generic [ref=f16e15]: Task title
    - generic [ref=f16e16]:
      - textbox "Task title" [ref=f16e17]
      - button "Create task" [ref=f16e18] [cursor=pointer]
  - generic [ref=f16e19]:
    - generic [ref=f16e20]: Task filter
    - combobox "Task filter" [ref=f16e21]:
      - option "All"
      - option "Open"
      - option "Completed" [selected]
    - generic [ref=f16e22]: Priority filter
    - combobox "Priority filter" [ref=f16e23]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f16e24]:
    - generic [ref=f16e25]: Due from
    - textbox "Due from" [ref=f16e26]
    - generic [ref=f16e27]: Due through
    - textbox "Due through" [ref=f16e28]
    - button "Apply due range" [ref=f16e29] [cursor=pointer]
  - generic [ref=f16e30]:
    - generic [ref=f16e31]: Task search
    - generic [ref=f16e32]:
      - textbox "Task search" [ref=f16e33]
      - button "Search tasks" [ref=f16e34] [cursor=pointer]
  - region "Tasks" [ref=f16e35]:
    - generic [ref=f16e36]:
      - generic [ref=f16e38]:
        - checkbox "Complete Completed high guard" [checked] [ref=f16e39]
        - generic [ref=f16e40]: Completed high guard
      - generic [ref=f16e41]:
        - generic [ref=f16e42]: New task title
        - generic [ref=f16e43]:
          - textbox "New task title" [ref=f16e44]
          - button "Rename task" [ref=f16e45] [cursor=pointer]
      - generic [ref=f16e46]:
        - generic [ref=f16e47]: Task priority
        - combobox "Task priority" [ref=f16e48]:
          - option "Low"
          - option "Normal"
          - option "High" [selected]
      - generic [ref=f16e49]:
        - generic [ref=f16e50]: Task due date
        - generic [ref=f16e51]:
          - textbox "Task due date" [ref=f16e52]
          - button "Save due date" [ref=f16e53] [cursor=pointer]
      - generic [ref=f16e54]:
        - generic [ref=f16e55]: Destination project
        - combobox "Destination project" [ref=f16e56]:
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
          - option "task-014 Defaults inheritance"
          - option "task-014 Defaults renamed"
          - option "task-014 Calendar persistence"
          - option "task-014 Calendar validation"
          - option "task-014 Calendar independence"
          - option "task-014 Calendar second owner"
          - option "task-014 Calendar archival"
          - option "task-014 Range boundaries"
          - option "task-014 Range intersections"
          - option "task-014 Range validation"
          - option "task-014 Range archival"
          - option "task-014 Range owner renamed"
          - option "task-014 Transfer target"
          - option "task-014 Transfer source"
          - option "task-014 Filtered transfer target"
          - option "task-014 Filtered transfer source"
          - option "task-014 Options first"
          - option "task-014 Options second"
          - option "task-014 Options owner"
          - option "task-014 Read-only transfer target"
          - option "task-014 Read-only transfer owner"
          - option "task-014 Priority intersection"
        - button "Move task" [ref=f16e57] [cursor=pointer]
```

# Test source

```ts
  1   | import {test,expect} from '@playwright/test';
  2   | import {stage,projectRow,taskRow,createProject,openProject,createTask,isolateBrowser,expectPersistedCompletion,expectPersistedPriority} from './helpers.mjs';
  3   | const completion=page=>page.getByRole('combobox',{name:'Task filter',exact:true});
  4   | const filter=page=>page.getByRole('combobox',{name:'Priority filter',exact:true});
  5   | const priority=(page,title)=>taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true});
  6   | test.beforeEach(async({context})=>{await isolateBrowser(context);});
  7   | if(stage>=7) {
  8   |   test('023 priority and completion filters intersect in creation order',async({page})=>{
  9   |     await createProject(page,'Priority intersection');await openProject(page,'Priority intersection');
  10  |     await expect(filter(page).locator('option')).toHaveText(['All','Low','Normal','High']);
  11  |     await expect(filter(page).locator('option:checked')).toHaveText('All');
  12  |     for(const title of ['High open first','Low open','High completed','High open last'])await createTask(page,title);
  13  |     for(const title of ['High open first','High completed','High open last']) {
  14  |       await priority(page,title).selectOption({label:'High'});
  15  |       await expectPersistedPriority(page,'Priority intersection',title,'High');
  16  |     }
  17  |     await priority(page,'Low open').selectOption({label:'Low'});
  18  |     await expectPersistedPriority(page,'Priority intersection','Low open','Low');
  19  |     await page.getByRole('checkbox',{name:'Complete High completed',exact:true}).check();
  20  |     await expectPersistedCompletion(page,'Priority intersection','High completed',true);
  21  |     await filter(page).selectOption({label:'High'});
  22  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);
  23  |     await completion(page).selectOption({label:'Open'});
  24  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  25  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  26  |     const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
  27  |     expect(rows[0]).toContain('High open first');expect(rows[1]).toContain('High open last');
  28  |     await completion(page).selectOption({label:'Completed'});
  29  |     await expect(taskRow(page,'High completed')).toBeVisible();
  30  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  31  |     await filter(page).selectOption({label:'Low'});
  32  |     await expect(completion(page).locator('option:checked')).toHaveText('Completed');
  33  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  34  |     await filter(page).selectOption({label:'All'});
  35  |     await expect(taskRow(page,'High completed')).toBeVisible();
  36  |     await completion(page).selectOption({label:'All'});
  37  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(4);
  38  |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  39  |     await expect(projectRow(page,'Priority intersection').getByTestId('project-summary')).toHaveText('1/4 completed');
  40  |   });
  41  | 
  42  |   test('024 filtered edits re-evaluate rows while retaining both filter choices',async({page})=>{
  43  |     await createProject(page,'Priority live filters');await openProject(page,'Priority live filters');
  44  |     await createTask(page,'Leaving priority');await createTask(page,'Leaving completion');
  45  |     for(const title of ['Leaving priority','Leaving completion']) {
  46  |       await priority(page,title).selectOption({label:'High'});
  47  |       await expectPersistedPriority(page,'Priority live filters',title,'High');
  48  |     }
  49  |     await createTask(page,'Completed high guard');await priority(page,'Completed high guard').selectOption({label:'High'});await expectPersistedPriority(page,'Priority live filters','Completed high guard','High');await page.getByRole('checkbox',{name:'Complete Completed high guard',exact:true}).check();await expectPersistedCompletion(page,'Priority live filters','Completed high guard',true);await createTask(page,'Open normal guard');
  50  |     await completion(page).selectOption({label:'Open'});await expect(taskRow(page,'Completed high guard')).toHaveCount(0);await expect(taskRow(page,'Open normal guard')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(3);await filter(page).selectOption({label:'High'});await expect(taskRow(page,'Open normal guard')).toHaveCount(0);await expect(taskRow(page,'Leaving priority')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);
  51  |     await priority(page,'Leaving priority').selectOption({label:'Low'});
  52  |     await expectPersistedPriority(page,'Priority live filters','Leaving priority','Low');
  53  |     await expect(taskRow(page,'Leaving priority')).toHaveCount(0);
  54  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  55  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
  56  |     await page.getByRole('checkbox',{name:'Complete Leaving completion',exact:true}).check();
  57  |     await expectPersistedCompletion(page,'Priority live filters','Leaving completion',true);
  58  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  59  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  60  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
  61  |     await completion(page).selectOption({label:'Completed'});
  62  |     await expect(taskRow(page,'Leaving completion')).toBeVisible();
  63  |     await expect(priority(page,'Leaving completion').locator('option:checked')).toHaveText('High');
> 64  |     await page.getByRole('checkbox',{name:'Complete Leaving completion',exact:true}).uncheck();
      |                                                                                      ^ Error: locator.uncheck: Test timeout of 20000ms exceeded.
  65  |     await expectPersistedCompletion(page,'Priority live filters','Leaving completion',false);
  66  |     await expect(taskRow(page,'Leaving completion')).toHaveCount(0);
  67  |     await expect(completion(page).locator('option:checked')).toHaveText('Completed');
  68  |     await expect(filter(page).locator('option:checked')).toHaveText('High');
  69  |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  70  |     await expect(projectRow(page,'Priority live filters').getByTestId('project-summary')).toHaveText('1/4 completed');
  71  |   });
  72  | 
  73  |   test('025 task rename retains combined filter membership',async({page})=>{
  74  |     await createProject(page,'Priority rename filters');await openProject(page,'Priority rename filters');
  75  |     await createTask(page,'Filtered old title');await createTask(page,'Unmatched normal task');
  76  |     await priority(page,'Filtered old title').selectOption({label:'Low'});
  77  |     await expectPersistedPriority(page,'Priority rename filters','Filtered old title','Low');
  78  |     await createTask(page,'Completed low guard');await priority(page,'Completed low guard').selectOption({label:'Low'});await expectPersistedPriority(page,'Priority rename filters','Completed low guard','Low');await page.getByRole('checkbox',{name:'Complete Completed low guard',exact:true}).check();await expectPersistedCompletion(page,'Priority rename filters','Completed low guard',true);
  79  |     await filter(page).selectOption({label:'Low'});await expect(taskRow(page,'Unmatched normal task')).toHaveCount(0);await expect(taskRow(page,'Completed low guard')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(2);await completion(page).selectOption({label:'Open'});await expect(taskRow(page,'Completed low guard')).toHaveCount(0);await expect(taskRow(page,'Filtered old title')).toBeVisible();await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  80  |     await taskRow(page,'Filtered old title').getByRole('textbox',{name:'New task title',exact:true}).fill('Filtered new title');
  81  |     await taskRow(page,'Filtered old title').getByRole('button',{name:'Rename task',exact:true}).click();
  82  |     await expectPersistedPriority(page,'Priority rename filters','Filtered new title','Low');
  83  |     await expect(completion(page).locator('option:checked')).toHaveText('Open');
  84  |     await expect(filter(page).locator('option:checked')).toHaveText('Low');
  85  |     await expect(page.getByRole('checkbox',{name:'Complete Filtered new title',exact:true})).not.toBeChecked();
  86  |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  87  |     await filter(page).selectOption({label:'High'});
  88  |     await expect(taskRow(page,'Filtered new title')).toHaveCount(0);
  89  |   });
  90  | 
  91  |   test('026 archived combined filters are readable without enabling task editing',async({page})=>{
  92  |     await createProject(page,'Archived combined filters');await openProject(page,'Archived combined filters');
  93  |     await createTask(page,'Archived high open');await createTask(page,'Archived normal completed');
  94  |     await priority(page,'Archived high open').selectOption({label:'High'});
  95  |     await expectPersistedPriority(page,'Archived combined filters','Archived high open','High');
  96  |     await page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true}).check();
  97  |     await expectPersistedCompletion(page,'Archived combined filters','Archived normal completed',true);
  98  |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  99  |     await projectRow(page,'Archived combined filters').getByRole('button',{name:'Archive project',exact:true}).click();
  100 |     await expect(projectRow(page,'Archived combined filters')).toHaveCount(0);
  101 |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  102 |     await openProject(page,'Archived combined filters');
  103 |     await expect(filter(page)).toBeEnabled();await expect(completion(page)).toBeEnabled();
  104 |     await completion(page).selectOption({label:'Open'});await filter(page).selectOption({label:'High'});
  105 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  106 |     await expect(priority(page,'Archived high open')).toBeDisabled();
  107 |     await expect(page.getByRole('checkbox',{name:'Complete Archived high open',exact:true})).toBeDisabled();
  108 |     await expect(taskRow(page,'Archived high open').getByRole('textbox',{name:'New task title',exact:true})).toBeDisabled();
  109 |     await completion(page).selectOption({label:'Completed'});await filter(page).selectOption({label:'Normal'});
  110 |     await expect(page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true})).toBeChecked();
  111 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(1);
  112 |     await page.getByRole('button',{name:'Projects',exact:true}).click();
  113 |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Archived'});
  114 |     await projectRow(page,'Archived combined filters').getByRole('button',{name:'Restore project',exact:true}).click();
  115 |     await page.getByRole('combobox',{name:'Project filter',exact:true}).selectOption({label:'Active'});
  116 |     await openProject(page,'Archived combined filters');
  117 |     await expect(filter(page).locator('option:checked')).toHaveText('All');
  118 |     await expect(priority(page,'Archived high open')).toBeEnabled();
  119 |     await expect(priority(page,'Archived high open').locator('option:checked')).toHaveText('High');
  120 |     await expect(page.getByRole('checkbox',{name:'Complete Archived normal completed',exact:true})).toBeChecked();
  121 |   });
  122 | }
  123 | 
```