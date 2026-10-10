# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.mjs >> 047 task search intersects all filters retaining order and summary counts
- Location: runs/instruction-effects/eval-002/decisions/task-013-draft/suite/search.spec.mjs:15:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('task-row').filter({ hasText: 'mixed last' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('task-row').filter({ hasText: 'mixed last' }).visible() resolved to 5 elements:
    1) <div data-testid="task-row">…</div> aka getByText('Mixed first Task due dateSave')
    2) <div data-testid="task-row">…</div> aka getByText('Other high Task due dateSave')
    3) <div data-testid="task-row">…</div> aka getByText('MIXED completed Task due')
    4) <div data-testid="task-row">…</div> aka getByText('Mixed undated Task due')
    5) <div data-testid="task-row">…</div> aka getByText('mixed last Task due dateSave')

Call log:
  - Expect "toBeVisible" getByTestId('task-row').filter({ hasText: 'mixed last' }).visible() with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ hasText: 'mixed last' }).visible()

```

# Page snapshot

```yaml
- generic [active] [ref=f7e1]:
  - heading "task-013 Search task intersections" [level=1] [ref=f7e2]
  - group [ref=f7e4]:
    - button "Projects" [ref=f7e5]
  - group [ref=f7e7]:
    - generic [ref=f7e8]:
      - text: Task search
      - textbox "Task search" [ref=f7e9]
    - button "Search tasks" [ref=f7e10]
  - group [ref=f7e12]:
    - generic [ref=f7e13]:
      - text: Due from
      - textbox "Due from" [ref=f7e14]
    - generic [ref=f7e15]:
      - text: Due through
      - textbox "Due through" [ref=f7e16]
    - button "Apply due range" [ref=f7e17]
  - group [ref=f7e19]:
    - generic [ref=f7e20]:
      - text: New project name
      - textbox "New project name" [ref=f7e21]
    - button "Rename project" [ref=f7e22]
  - generic [ref=f7e24]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f7e25]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f7e27]:
    - generic [ref=f7e28]:
      - text: Task title
      - textbox "Task title" [ref=f7e29]
    - button "Create task" [ref=f7e30]
  - generic [ref=f7e32]:
    - text: Task filter
    - combobox "Task filter" [ref=f7e33]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f7e35]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f7e36]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f7e37]:
    - text: Mixed first
    - checkbox "Complete Mixed first" [ref=f7e39]
    - group [ref=f7e41]:
      - generic [ref=f7e42]:
        - text: Task due date
        - textbox "Task due date" [ref=f7e43]
      - button "Save due date" [ref=f7e44]
    - group [ref=f7e46]:
      - generic [ref=f7e47]:
        - text: Destination project
        - combobox "Destination project" [ref=f7e48]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
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
      - button "Move task" [ref=f7e49]
    - group [ref=f7e51]:
      - generic [ref=f7e52]:
        - text: New task title
        - textbox "New task title" [ref=f7e53]
      - button "Rename task" [ref=f7e54]
    - generic [ref=f7e56]:
      - text: Task priority
      - combobox "Task priority" [ref=f7e57]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f7e58]:
    - text: Other high
    - checkbox "Complete Other high" [ref=f7e60]
    - group [ref=f7e62]:
      - generic [ref=f7e63]:
        - text: Task due date
        - textbox "Task due date" [ref=f7e64]
      - button "Save due date" [ref=f7e65]
    - group [ref=f7e67]:
      - generic [ref=f7e68]:
        - text: Destination project
        - combobox "Destination project" [ref=f7e69]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
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
      - button "Move task" [ref=f7e70]
    - group [ref=f7e72]:
      - generic [ref=f7e73]:
        - text: New task title
        - textbox "New task title" [ref=f7e74]
      - button "Rename task" [ref=f7e75]
    - generic [ref=f7e77]:
      - text: Task priority
      - combobox "Task priority" [ref=f7e78]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f7e79]:
    - text: MIXED completed
    - checkbox "Complete MIXED completed" [ref=f7e81]
    - group [ref=f7e83]:
      - generic [ref=f7e84]:
        - text: Task due date
        - textbox "Task due date" [ref=f7e85]
      - button "Save due date" [ref=f7e86]
    - group [ref=f7e88]:
      - generic [ref=f7e89]:
        - text: Destination project
        - combobox "Destination project" [ref=f7e90]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
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
      - button "Move task" [ref=f7e91]
    - group [ref=f7e93]:
      - generic [ref=f7e94]:
        - text: New task title
        - textbox "New task title" [ref=f7e95]
      - button "Rename task" [ref=f7e96]
    - generic [ref=f7e98]:
      - text: Task priority
      - combobox "Task priority" [ref=f7e99]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f7e100]:
    - text: Mixed undated
    - checkbox "Complete Mixed undated" [ref=f7e102]
    - group [ref=f7e104]:
      - generic [ref=f7e105]:
        - text: Task due date
        - textbox "Task due date" [ref=f7e106]
      - button "Save due date" [ref=f7e107]
    - group [ref=f7e109]:
      - generic [ref=f7e110]:
        - text: Destination project
        - combobox "Destination project" [ref=f7e111]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
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
      - button "Move task" [ref=f7e112]
    - group [ref=f7e114]:
      - generic [ref=f7e115]:
        - text: New task title
        - textbox "New task title" [ref=f7e116]
      - button "Rename task" [ref=f7e117]
    - generic [ref=f7e119]:
      - text: Task priority
      - combobox "Task priority" [ref=f7e120]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f7e121]:
    - text: mixed last
    - checkbox "Complete mixed last" [ref=f7e123]
    - group [ref=f7e125]:
      - generic [ref=f7e126]:
        - text: Task due date
        - textbox "Task due date" [ref=f7e127]
      - button "Save due date" [ref=f7e128]
    - group [ref=f7e130]:
      - generic [ref=f7e131]:
        - text: Destination project
        - combobox "Destination project" [ref=f7e132]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
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
      - button "Move task" [ref=f7e133]
    - group [ref=f7e135]:
      - generic [ref=f7e136]:
        - text: New task title
        - textbox "New task title" [ref=f7e137]
      - button "Rename task" [ref=f7e138]
    - generic [ref=f7e140]:
      - text: Task priority
      - combobox "Task priority" [ref=f7e141]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
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
  10 |   return page.getByTestId('task-row').filter({ hasText: title }).filter({ visible: true });
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
> 25 |   await expect(taskRow(page, title.trim())).toBeVisible();
     |                                             ^ Error: expect(locator).toBeVisible() failed
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
  73 |       return taskRow(observer, title).getByRole('combobox', {name:'Task priority', exact:true}).locator('option:checked').textContent();
  74 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
  75 |   } finally { await observer.close(); }
  76 | }
  77 | 
```