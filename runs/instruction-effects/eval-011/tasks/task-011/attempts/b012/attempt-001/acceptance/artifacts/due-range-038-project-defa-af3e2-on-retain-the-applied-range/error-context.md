# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: due-range.spec.mjs >> 038 project default rename and hidden creation retain the applied range
- Location: runs/instruction-effects/eval-011/tasks/task-011/suite/due-range.spec.mjs:57:2

# Error details

```
Error: locator.textContent: Error: strict mode violation: getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Created outside range', exact: true }) }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked') resolved to 2 elements:
    1) <option value="Low">Low</option> aka getByLabel('Task priority').nth(2)
    2) <option value="Low">Low</option> aka getByLabel('Task priority').nth(4)

Call log:
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Created outside range', exact: true }) }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked')

```

# Page snapshot

```yaml
- main [ref=f2e2]:
  - generic [ref=f2e3]:
    - heading "task-011 Range owner renamed" [level=1] [ref=f2e4]
    - button "Projects" [ref=f2e5] [cursor=pointer]
    - generic [ref=f2e6]:
      - generic [ref=f2e7]:
        - text: New project name
        - textbox "New project name" [ref=f2e8]: task-011 Range owner renamed
      - button "Rename project" [ref=f2e9] [cursor=pointer]
    - generic [ref=f2e10]:
      - text: Default task priority
      - combobox "Default task priority" [ref=f2e11]:
        - option "Low" [selected]
        - option "Normal"
        - option "High"
    - generic [ref=f2e12]:
      - generic [ref=f2e13]:
        - text: Task title
        - textbox "Task title" [ref=f2e14]
      - button "Create task" [active] [ref=f2e15] [cursor=pointer]
    - generic [ref=f2e16]:
      - text: Task filter
      - combobox "Task filter" [ref=f2e17]:
        - option "All"
        - option "Open" [selected]
        - option "Completed"
    - generic [ref=f2e18]:
      - text: Priority filter
      - combobox "Priority filter" [ref=f2e19]:
        - option "All"
        - option "Low"
        - option "Normal"
        - option "High" [selected]
    - generic [ref=f2e20]:
      - text: Due from
      - textbox "Due from" [ref=f2e21]: 2031-03-01
    - generic [ref=f2e22]:
      - text: Due through
      - textbox "Due through" [ref=f2e23]: 2031-03-01
    - button "Apply due range" [ref=f2e24] [cursor=pointer]
    - generic [ref=f2e26]:
      - checkbox "Complete Retained range member" [ref=f2e27]
      - generic [ref=f2e28]: Retained range member
      - combobox "Task priority" [ref=f2e29]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - generic [ref=f2e30]:
        - text: New task title
        - textbox "New task title" [ref=f2e31]: Retained range member
      - button "Rename task" [ref=f2e32] [cursor=pointer]
      - generic [ref=f2e33]:
        - text: Task due date
        - textbox "Task due date" [ref=f2e34]: 2031-03-01
      - button "Save due date" [ref=f2e35] [cursor=pointer]
      - generic [ref=f2e36]:
        - text: Destination project
        - combobox "Destination project" [ref=f2e37]:
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
          - option "task-011 Calendar archival"
          - option "task-011 Range boundaries"
          - option "task-011 Range intersections"
          - option "task-011 Range validation"
          - option "task-011 Range archival"
      - button "Move task" [ref=f2e38] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect } from '@playwright/test';
  2  | export const stage = Number(process.env.FF_STAGE);
  3  | export function projectName(name) {
  4  |   return (process.env.FF_FIXTURE_PREFIX ? process.env.FF_FIXTURE_PREFIX + ' ' : '') + name.trim();
  5  | }
  6  | export function projectRow(page, name) {
  7  |   return page.getByTestId('project-row').filter({ hasText: projectName(name) }).filter({ visible: true });
  8  | }
  9  | export function taskRow(page, title) {
  10 |   return page.getByTestId('task-row').filter({has:page.getByRole('checkbox',{name:'Complete '+title,exact:true})}).filter({visible:true});
  11 | }
  12 | export async function createProject(page, name) {
  13 |   await page.goto('/');
  14 |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name === name.trim() ? projectName(name) : '  ' + projectName(name) + '  ');
  15 |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  16 |   await expect(projectRow(page, name.trim())).toBeVisible();
  17 | }
  18 | export async function openProject(page, name) {
  19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
  20 |   await expect(page.getByRole('heading', { name: projectName(name), exact: true }).first()).toBeVisible();
  21 | }
  22 | export async function createTask(page, title) {
  23 |   await page.getByRole('textbox', { name: 'Task title', exact: true }).fill(title);
  24 |   await page.getByRole('button', { name: 'Create task', exact: true }).click();
  25 |   await expect(taskRow(page, title.trim())).toBeVisible();
  26 |   await expect(taskRow(page, title.trim()).getByRole('checkbox', { name: 'Complete ' + title.trim(), exact: true })).toBeVisible();
  27 | }
  28 | export async function isolateBrowser(context) {
  29 |   await context.routeWebSocket('**/*', socket => socket.close());
  30 |   const origin = new URL(process.env.FF_BASE_URL).origin;
  31 |   await context.route('**/*', route => {
  32 |     const url = new URL(route.request().url());
  33 |     return url.origin === origin ? route.continue() : route.abort();
  34 |   });
  35 | }
  36 | 
  37 | export function requiredAlert(page, message) {
  38 |   return page.getByRole('alert').filter({ hasText: message }).filter({ visible: true }).first();
  39 | }
  40 | 
  41 | export async function assertDisclosedControls(page, checkpoint) {
  42 |   const deferred = [
  43 |     [2, 'Create task'], [3, 'Archive project'], [3, 'Restore project'],
  44 |     [4, 'Rename project'], [5, 'Rename task']
  45 |   ];
  46 |   for (const [introduced, name] of deferred) {
  47 |     if (checkpoint < introduced) {
  48 |       await expect(page.getByRole('button', {name, exact:true}).filter({visible:true})).toHaveCount(0);
  49 |     }
  50 |   }
  51 | }
  52 | 
  53 | export async function expectPersistedCompletion(page, project, title, completed) {
  54 |   const observer = await page.context().newPage();
  55 |   try {
  56 |     await expect.poll(async () => {
  57 |       await observer.goto('/');
  58 |       await openProject(observer, project);
  59 |       await observer.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'All'});
  60 |       await expect(taskRow(observer, title)).toBeVisible();
  61 |       return observer.getByRole('checkbox', {name:'Complete '+title, exact:true}).isChecked();
  62 |     }, {timeout:5000, message:'Completion state must be durable before the next navigation'}).toBe(completed);
  63 |   } finally { await observer.close(); }
  64 | }
  65 | 
  66 | export async function expectPersistedPriority(page, project, title, priority) {
  67 |   const observer = await page.context().newPage();
  68 |   try {
  69 |     await expect.poll(async () => {
  70 |       await observer.goto('/');
  71 |       await openProject(observer, project);
  72 |       await observer.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'All'});
> 73 |       return taskRow(observer, title).getByRole('combobox', {name:'Task priority', exact:true}).locator('option:checked').textContent();
     |                                                                                                                           ^ Error: locator.textContent: Error: strict mode violation: getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Created outside range', exact: true }) }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked') resolved to 2 elements:
  74 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
  75 |   } finally { await observer.close(); }
  76 | }
  77 | 
```