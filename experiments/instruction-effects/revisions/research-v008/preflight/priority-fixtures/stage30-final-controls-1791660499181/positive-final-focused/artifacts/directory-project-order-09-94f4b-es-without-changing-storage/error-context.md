# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-order.spec.mjs >> 091 project-name ordering folds ASCII keeps stable owner ties and reads current renames without changing storage
- Location: experiments/instruction-effects/revisions/research-v008/preflight/priority-fixtures/final030-corrected-executed-suite/directory-project-order.spec.mjs:38:2

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-030 Name order ALPHA' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button>Open project</button> aka locator('div:nth-child(36) > form > fieldset > button').first()
    2) <button>Open project</button> aka locator('div:nth-child(37) > form > fieldset > button').first()

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-030 Name order ALPHA' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f29e1]:
  - heading "task-030 Name order ALPHA" [level=1] [ref=f29e2]
  - group [ref=f29e4]:
    - button "Download project" [ref=f29e5]
  - group [ref=f29e7]:
    - button "Projects" [ref=f29e8]
  - group [ref=f29e10]:
    - generic [ref=f29e11]:
      - text: Task search
      - textbox "Task search" [ref=f29e12]
    - button "Search tasks" [ref=f29e13]
  - group [ref=f29e15]:
    - generic [ref=f29e16]:
      - text: Due from
      - textbox "Due from" [ref=f29e17]
    - generic [ref=f29e18]:
      - text: Due through
      - textbox "Due through" [ref=f29e19]
    - button "Apply due range" [ref=f29e20]
  - group [ref=f29e22]:
    - generic [ref=f29e23]:
      - text: New project name
      - textbox "New project name" [ref=f29e24]
    - button "Rename project" [ref=f29e25]
  - generic [ref=f29e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f29e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f29e30]:
    - generic [ref=f29e31]:
      - text: Task title
      - textbox "Task title" [ref=f29e32]
    - button "Create task" [ref=f29e33]
  - generic [ref=f29e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f29e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f29e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f29e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f29e40]:
    - text: task-030 Name order target third
    - group [ref=f29e42]:
      - button "Delete task" [ref=f29e43]
    - checkbox "Complete task-030 Name order target third" [ref=f29e45]
    - group [ref=f29e47]:
      - generic [ref=f29e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f29e49]
      - button "Save notes" [ref=f29e50]
    - group [ref=f29e52]:
      - generic [ref=f29e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f29e54]
      - button "Save due date" [ref=f29e55]
    - group [ref=f29e57]:
      - generic [ref=f29e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f29e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-018 Import restart"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-030 Date batch first"
          - option "task-030 Date batch second"
          - option "task-030 Date validation first"
          - option "task-030 Date validation second"
          - option "task-030 Due reserved first"
          - option "task-030 Due reserved second"
          - option "task-030 Notes batch first"
          - option "task-030 Notes batch second"
          - option "task-030 Notes limit first"
          - option "task-030 Notes limit second"
          - option "task-030 Notes reserved first"
          - option "task-030 Notes reserved second"
          - option "task-030 Priority reserved first"
          - option "task-030 Priority reserved second"
          - option "task-030 Priority batch first owner"
          - option "task-030 Priority batch second owner"
          - option "task-030 Priority duplicate owner"
          - option "task-030 Priority duplicate owner"
          - option "task-030 Project order reserved first"
          - option "task-030 Project order reserved second"
          - option "task-030 Name order Zulu"
          - option "task-030 Name order alpha"
      - button "Move task" [ref=f29e60]
    - group [ref=f29e62]:
      - generic [ref=f29e63]:
        - text: New task title
        - textbox "New task title" [ref=f29e64]
      - button "Rename task" [ref=f29e65]
    - generic [ref=f29e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f29e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
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
> 19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
     |                                                                                           ^ Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-030 Name order ALPHA' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
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
  73 |       return taskRow(observer, title).getByRole('combobox', {name:'Task priority', exact:true}).locator('option:checked').textContent();
  74 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
  75 |   } finally { await observer.close(); }
  76 | }
  77 | 
```