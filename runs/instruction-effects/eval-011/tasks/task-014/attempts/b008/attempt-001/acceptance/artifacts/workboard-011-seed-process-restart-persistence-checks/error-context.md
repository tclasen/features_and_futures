# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 011 seed process-restart persistence checks
- Location: runs/instruction-effects/eval-011/tasks/task-014/suite/workboard.spec.mjs:155:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "2028-02-29"
Received: ""

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=f5e2]:
  - generic [ref=f5e3]:
    - button "Projects" [ref=f5e4] [cursor=pointer]
    - heading "task-014 Persistence renamed" [level=1] [ref=f5e5]
    - generic [ref=f5e6]:
      - generic [ref=f5e7]: New project name
      - generic [ref=f5e8]:
        - textbox "New project name" [ref=f5e9]: task-014 Persistence renamed
        - button "Rename project" [ref=f5e10] [cursor=pointer]
    - generic [ref=f5e11]:
      - generic [ref=f5e12]: Task title
      - generic [ref=f5e13]:
        - textbox "Task title" [ref=f5e14]
        - button "Create task" [ref=f5e15] [cursor=pointer]
    - generic [ref=f5e16]: Default task priority
    - combobox "Default task priority" [ref=f5e17]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
    - generic [ref=f5e18]: Task filter
    - combobox "Task filter" [ref=f5e19]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
    - generic [ref=f5e20]: Priority filter
    - combobox "Priority filter" [ref=f5e21]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
    - generic [ref=f5e22]:
      - generic [ref=f5e23]: Task search
      - generic [ref=f5e24]:
        - textbox "Task search" [ref=f5e25]
        - button "Search tasks" [ref=f5e26] [cursor=pointer]
    - generic [ref=f5e27]:
      - generic [ref=f5e28]: Due from
      - textbox "Due from" [ref=f5e29]:
        - /placeholder: YYYY-MM-DD
      - generic [ref=f5e30]: Due through
      - textbox "Due through" [ref=f5e31]:
        - /placeholder: YYYY-MM-DD
      - button "Apply due range" [ref=f5e32] [cursor=pointer]
    - generic [ref=f5e34]:
      - generic [ref=f5e35]: Memory kept
      - checkbox "Complete Memory kept" [checked] [ref=f5e36]
      - textbox "New task title" [ref=f5e37]: Memory kept
      - button "Rename task" [ref=f5e38] [cursor=pointer]
      - combobox "Task priority" [ref=f5e39]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - textbox "Task due date" [ref=f5e40]:
        - /placeholder: YYYY-MM-DD
      - button "Save due date" [ref=f5e41] [cursor=pointer]
      - combobox "Destination project" [ref=f5e42]:
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
        - option "task-014 Priority live filters"
        - option "task-014 Priority rename filters"
        - option "task-014 Archived combined filters"
        - option "task-014 Priority ownership"
        - option "task-014 Priority other owner"
        - option "task-014 Priority completion"
        - option "task-014 Priority archive"
        - option "task-014 Return holding"
        - option "task-014 Return owner"
        - option "task-014 Return identity holding"
        - option "task-014 Returned owner renamed"
        - option "task-014 Position second owner"
        - option "task-014 Position third owner"
        - option "task-014 Position first owner"
        - option "task-014 Whitespace retained owner"
        - option "task-014 Whitespace Saved first"
        - option "task-014 Whitespace Saved second"
        - option "task-014 Whitespace unrelated sentinel"
        - option "task-014 Search Mixed first"
        - option "task-014 Search unrelated"
        - option "task-014 Search mixed last"
        - option "task-014 Search task intersections"
        - option "task-014 Search internal spacing"
        - option "task-014 Alpha create"
        - option "task-014 Blank validation sentinel"
        - option "task-014 Order first"
        - option "task-014 Order second"
        - option "task-014 Task reload"
        - option "task-014 Task invalid"
        - option "task-014 Task owner"
        - option "task-014 Other project"
        - option "task-014 Task filters"
        - option "task-014 Archive lifecycle"
        - option "task-014 Archive tasks"
        - option "task-014 Summary project"
        - option "task-014 Transfer restart origin"
      - button "Move task" [ref=f5e43] [cursor=pointer]
```

# Test source

```ts
  89  |     await expect(taskRow(page, 'Done task')).toBeVisible();
  90  |     await expect(taskRow(page, 'Open task')).toHaveCount(0);
  91  |     await page.reload();
  92  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
  93  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
  94  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
  95  |     await expectPersistedCompletion(page, 'Task filters', 'Done task', false);
  96  |     await page.reload();
  97  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  98  |   });
  99  | }
  100 | 
  101 | if (stage >= 3) {
  102 |   test('008 archive state persists and project can be restored', async ({ page }) => {
  103 |     await createProject(page, 'Archive lifecycle');
  104 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
  105 |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
  106 |     await page.reload();
  107 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  108 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  109 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
  110 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  111 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  112 |   });
  113 | 
  114 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  115 |     await createProject(page, 'Archive tasks');
  116 |     await openProject(page, 'Archive tasks');
  117 |     await createTask(page, 'Retained task');
  118 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  119 |     await expectPersistedCompletion(page, 'Archive tasks', 'Retained task', true);
  120 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  121 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  122 |     await expect(projectRow(page, 'Archive tasks')).toHaveCount(0);
  123 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  124 |     await openProject(page, 'Archive tasks');
  125 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  126 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  127 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  128 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  129 |     await expect(taskRow(page, 'Retained task')).toHaveCount(0);
  130 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  131 |     await expect(taskRow(page, 'Retained task')).toBeVisible();
  132 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  133 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  134 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  135 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  136 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  137 |     await openProject(page, 'Archive tasks');
  138 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  139 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  140 |   });
  141 | 
  142 |   test('010 completion summaries reflect all tasks', async ({ page }) => {
  143 |     await createProject(page, 'Summary project');
  144 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
  145 |     await openProject(page, 'Summary project');
  146 |     await createTask(page, 'Summary one');
  147 |     await createTask(page, 'Summary two');
  148 |     await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
  149 |     await expectPersistedCompletion(page, 'Summary project', 'Summary one', true);
  150 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  151 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  152 |   });
  153 | }
  154 | 
  155 | test('011 seed process-restart persistence checks', async ({ page }) => {
  156 |   await createProject(page, 'Persistence sentinel');
  157 |   if (stage >= 2) {
  158 |     await openProject(page, 'Persistence sentinel');
  159 |     if(stage>=11) {
  160 |       await createProject(page,'Transfer restart origin');await openProject(page,'Transfer restart origin');await createTask(page,'Remember me');
  161 |       await taskRow(page,'Remember me').getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName('Persistence sentinel')});
  162 |       await taskRow(page,'Remember me').getByRole('button',{name:'Move task',exact:true}).click();
  163 |       await expect(taskRow(page,'Remember me')).toHaveCount(0);
  164 |       await page.goto('/');await openProject(page,'Persistence sentinel');await expect(taskRow(page,'Remember me')).toBeVisible();
  165 |     } else {await createTask(page, 'Remember me');}
  166 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  167 |     await expectPersistedCompletion(page, 'Persistence sentinel', 'Remember me', true);
  168 |     if (stage >= 6) {
  169 |       await taskRow(page, 'Remember me').getByRole('combobox', {name:'Task priority', exact:true}).selectOption({label:'High'});
  170 |       await expectPersistedPriority(page, 'Persistence sentinel', 'Remember me', 'High');
  171 |     }
  172 |     if (stage >= 5) {
  173 |       await taskRow(page, 'Remember me').getByRole('textbox', { name: 'New task title', exact: true }).fill('Memory kept');
  174 |       await taskRow(page, 'Remember me').getByRole('button', { name: 'Rename task', exact: true }).click();
  175 |       await expect(page.getByRole('checkbox', { name: 'Complete Memory kept', exact: true })).toBeChecked();
  176 |     }
  177 |   }
  178 |   if (stage >= 4) {
  179 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  180 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  181 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  182 |   }
  183 |   if (stage >= 9) {
  184 |     const dateRow=taskRow(page,'Memory kept');
  185 |     await dateRow.getByRole('textbox',{name:'Task due date',exact:true}).fill('2028-02-29');
  186 |     await dateRow.getByRole('button',{name:'Save due date',exact:true}).click();
  187 |     const dateObserver=await page.context().newPage();
  188 |     try {
> 189 |       await expect.poll(async()=>{await dateObserver.goto('/');await openProject(dateObserver,'Persistence renamed');return taskRow(dateObserver,'Memory kept').getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2028-02-29');
      |                                                                                                                                                                                                                                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  190 |     } finally {await dateObserver.close();}
  191 |   }
  192 |   if (stage >= 8) {
  193 |     await page.getByRole('combobox', {name:'Default task priority', exact:true}).selectOption({label:'Low'});
  194 |     const observer=await page.context().newPage();
  195 |     try {
  196 |       await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Persistence renamed');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');
  197 |     } finally {await observer.close();}
  198 |   }
  199 |   if (stage >= 3) {
  200 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  201 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  202 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  203 |   }
  204 | });
  205 | 
  206 | if (stage >= 4) {
  207 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  208 |     await createProject(page, 'Identity first');
  209 |     await createProject(page, 'Identity second');
  210 |     await openProject(page, 'Identity first');
  211 |     const originalPath = new URL(page.url()).pathname;
  212 |     await createTask(page, 'Identity task');
  213 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  214 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  215 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  216 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  217 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  218 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  219 |     await page.reload();
  220 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  221 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  222 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  223 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  224 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  225 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  226 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  227 |     await openProject(page, 'Identity updated');
  228 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  229 |   });
  230 | 
  231 |   test('014 blank rename preserves original name', async ({ page }) => {
  232 |     await createProject(page, 'Rename invalid');
  233 |     await openProject(page, 'Rename invalid');
  234 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  235 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  236 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  237 |     await page.reload();
  238 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  239 |   });
  240 | 
  241 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  242 |     await createProject(page, 'Rename archive');
  243 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  244 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  245 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  246 |     await openProject(page, 'Rename archive');
  247 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  248 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  249 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  250 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  251 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
  252 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  253 |     await openProject(page, 'Rename archive');
  254 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  255 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  256 |   });
  257 | }
  258 | 
  259 | if (stage >= 5) {
  260 |   test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
  261 |     await createProject(page, 'Task rename identity');
  262 |     await openProject(page, 'Task rename identity');
  263 |     await createTask(page, 'Name initial');
  264 |     await createTask(page, 'Name second');
  265 |     await page.getByRole('checkbox', { name: 'Complete Name initial', exact: true }).check();
  266 |     await expectPersistedCompletion(page, 'Task rename identity', 'Name initial', true);
  267 |     await taskRow(page, 'Name initial').getByRole('textbox', { name: 'New task title', exact: true }).fill('  Name updated  ');
  268 |     await taskRow(page, 'Name initial').getByRole('button', { name: 'Rename task', exact: true }).click();
  269 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  270 |     await page.reload();
  271 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  272 |     const rows = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  273 |     expect(rows.findIndex(t => t.includes('Name updated'))).toBeLessThan(rows.findIndex(t => t.includes('Name second')));
  274 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  275 |     await expect(taskRow(page, 'Name updated')).toHaveCount(0);
  276 |     await expect(taskRow(page, 'Name second')).toBeVisible();
  277 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  278 |     await expect(taskRow(page, 'Name updated')).toBeVisible();
  279 |     await expect(taskRow(page, 'Name second')).toHaveCount(0);
  280 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  281 |     await expect(projectRow(page, 'Task rename identity').getByTestId('project-summary')).toHaveText('1/2 completed');
  282 |   });
  283 |   test('017 blank task rename preserves the original title', async ({ page }) => {
  284 |     await createProject(page, 'Task rename invalid');
  285 |     await openProject(page, 'Task rename invalid');
  286 |     await createTask(page, 'Kept title');
  287 |     await taskRow(page, 'Kept title').getByRole('textbox', { name: 'New task title', exact: true }).fill('   ');
  288 |     await taskRow(page, 'Kept title').getByRole('button', { name: 'Rename task', exact: true }).click();
  289 |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
```