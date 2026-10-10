# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bulk-directory.spec.mjs >> 067 bulk completion intersects every directory filter and preserves fields order and reserved positions
- Location: experiments/instruction-effects/revisions/research-v006/decisions/task-020-draft/suite/bulk-directory.spec.mjs:13:2

# Error details

```
Error: Completion state must be durable before the next navigation

Completion state must be durable before the next navigation

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f54e1]:
  - heading "Task directory" [level=1] [ref=f54e2]
  - group [ref=f54e4]:
    - button "Complete visible tasks" [ref=f54e5]
  - group [ref=f54e7]:
    - button "Reopen visible tasks" [disabled] [ref=f54e8]
  - group [ref=f54e10]:
    - button "Projects" [ref=f54e11]
  - generic [ref=f54e13]:
    - text: Directory order
    - combobox "Directory order" [ref=f54e14]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
  - generic [ref=f54e16]:
    - text: Project scope
    - combobox "Project scope" [ref=f54e17]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f54e19]:
    - text: Task filter
    - combobox "Task filter" [ref=f54e20]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
      - option "Deleted"
  - generic [ref=f54e22]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f54e23]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - group [ref=f54e25]:
    - generic [ref=f54e26]:
      - text: Directory search
      - textbox "Directory search" [ref=f54e27]: task-020 Bulk match
    - button "Search directory" [ref=f54e28]
  - group [ref=f54e30]:
    - generic [ref=f54e31]:
      - text: Due from
      - textbox "Due from" [ref=f54e32]: 2050-01-01
    - generic [ref=f54e33]:
      - text: Due through
      - textbox "Due through" [ref=f54e34]: 2050-01-01
    - button "Apply due range" [ref=f54e35]
  - generic [ref=f54e36]:
    - text: task-020 Bulk match firsttask-020 Bulk first ownerOpenHigh2050-01-01 Bulk <b>Ω</b> retained
    - group [ref=f54e38]:
      - button "Open project" [ref=f54e39]
  - generic [ref=f54e40]:
    - text: task-020 Bulk match secondtask-020 Bulk second ownerOpenHigh2050-01-01Second original note
    - group [ref=f54e42]:
      - button "Open project" [ref=f54e43]
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
> 62 |     }, {timeout:5000, message:'Completion state must be durable before the next navigation'}).toBe(completed);
     |                                                                                               ^ Error: Completion state must be durable before the next navigation
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