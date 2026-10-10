# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority.spec.mjs >> 021 archived priorities are read-only and restored unchanged
- Location: runs/instruction-effects/eval-002/decisions/task-007-draft/suite/priority.spec.mjs:71:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-007 Priority archive' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-007 Priority archive' }).visible() resolved to 2 elements:
    1) <div data-testid="project-row">…</div> aka getByText('task-007 Priority archived')
    2) <div data-testid="project-row">…</div> aka getByText('task-007 Priority archive0/0')

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-007 Priority archive' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-007 Priority archive' }).visible()

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - heading "Workboard" [level=1] [ref=f1e2]
  - group [ref=f1e4]:
    - generic [ref=f1e5]:
      - text: Project name
      - textbox "Project name" [ref=f1e6]
    - button "Create project" [ref=f1e7]
  - generic [ref=f1e9]:
    - text: Project filter
    - combobox "Project filter" [ref=f1e10]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f1e11]:
    - text: task-007 Priority intersection1/4 completed
    - group [ref=f1e13]:
      - button "Open project" [ref=f1e14]
    - group [ref=f1e16]:
      - button "Archive project" [ref=f1e17]
  - generic [ref=f1e18]:
    - text: task-007 Priority live filters0/2 completed
    - group [ref=f1e20]:
      - button "Open project" [ref=f1e21]
    - group [ref=f1e23]:
      - button "Archive project" [ref=f1e24]
  - generic [ref=f1e25]:
    - text: task-007 Priority rename filters0/2 completed
    - group [ref=f1e27]:
      - button "Open project" [ref=f1e28]
    - group [ref=f1e30]:
      - button "Archive project" [ref=f1e31]
  - generic [ref=f1e32]:
    - text: task-007 Priority archived filters1/2 completed
    - group [ref=f1e34]:
      - button "Open project" [ref=f1e35]
    - group [ref=f1e37]:
      - button "Archive project" [ref=f1e38]
  - generic [ref=f1e39]:
    - text: task-007 Priority ownership0/2 completed
    - group [ref=f1e41]:
      - button "Open project" [ref=f1e42]
    - group [ref=f1e44]:
      - button "Archive project" [ref=f1e45]
  - generic [ref=f1e46]:
    - text: task-007 Priority other owner0/1 completed
    - group [ref=f1e48]:
      - button "Open project" [ref=f1e49]
    - group [ref=f1e51]:
      - button "Archive project" [ref=f1e52]
  - generic [ref=f1e53]:
    - text: task-007 Priority completion1/2 completed
    - group [ref=f1e55]:
      - button "Open project" [ref=f1e56]
    - group [ref=f1e58]:
      - button "Archive project" [ref=f1e59]
  - generic [ref=f1e60]:
    - text: task-007 Priority archive0/0 completed
    - group [ref=f1e62]:
      - button "Open project" [ref=f1e63]
    - group [ref=f1e65]:
      - button "Archive project" [ref=f1e66]
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
> 16 |   await expect(projectRow(page, name.trim())).toBeVisible();
     |                                               ^ Error: expect(locator).toBeVisible() failed
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
  73 |       return taskRow(observer, title).getByRole('combobox', {name:'Task priority', exact:true}).locator('option:checked').textContent();
  74 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
  75 |   } finally { await observer.close(); }
  76 | }
  77 | 
```