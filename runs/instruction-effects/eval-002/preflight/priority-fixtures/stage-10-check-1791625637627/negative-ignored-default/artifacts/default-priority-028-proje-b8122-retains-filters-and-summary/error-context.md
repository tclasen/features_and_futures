# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: default-priority.spec.mjs >> 028 project default affects only future tasks and retains filters and summary
- Location: runs/instruction-effects/eval-002/decisions/task-010-draft/suite/default-priority.spec.mjs:20:2

# Error details

```
Error: Task priority must be durable before the next navigation

Task priority must be durable before the next navigation

expect(received).toBe(expected) // Object.is equality

Expected: "High"
Received: "Normal"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f8e1]:
  - heading "task-010 Defaults inheritance" [level=1] [ref=f8e2]
  - group [ref=f8e4]:
    - button "Projects" [ref=f8e5]
  - group [ref=f8e7]:
    - generic [ref=f8e8]:
      - text: Due from
      - textbox "Due from" [ref=f8e9]
    - generic [ref=f8e10]:
      - text: Due through
      - textbox "Due through" [ref=f8e11]
    - button "Apply due range" [ref=f8e12]
  - group [ref=f8e14]:
    - generic [ref=f8e15]:
      - text: New project name
      - textbox "New project name" [ref=f8e16]
    - button "Rename project" [ref=f8e17]
  - generic [ref=f8e19]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f8e20]:
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - group [ref=f8e22]:
    - generic [ref=f8e23]:
      - text: Task title
      - textbox "Task title" [ref=f8e24]
    - button "Create task" [ref=f8e25]
  - generic [ref=f8e27]:
    - text: Task filter
    - combobox "Task filter" [ref=f8e28]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f8e30]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f8e31]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f8e32]:
    - text: Before default change
    - checkbox "Complete Before default change" [checked] [ref=f8e34]
    - group [ref=f8e36]:
      - generic [ref=f8e37]:
        - text: Task due date
        - textbox "Task due date" [ref=f8e38]
      - button "Save due date" [ref=f8e39]
    - group [ref=f8e41]:
      - generic [ref=f8e42]:
        - text: New task title
        - textbox "New task title" [ref=f8e43]
      - button "Rename task" [ref=f8e44]
    - generic [ref=f8e46]:
      - text: Task priority
      - combobox "Task priority" [ref=f8e47]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f8e48]:
    - text: Inherited high
    - checkbox "Complete Inherited high" [ref=f8e50]
    - group [ref=f8e52]:
      - generic [ref=f8e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f8e54]
      - button "Save due date" [ref=f8e55]
    - group [ref=f8e57]:
      - generic [ref=f8e58]:
        - text: New task title
        - textbox "New task title" [ref=f8e59]
      - button "Rename task" [ref=f8e60]
    - generic [ref=f8e62]:
      - text: Task priority
      - combobox "Task priority" [ref=f8e63]:
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
> 74 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
     |                                                                                            ^ Error: Task priority must be durable before the next navigation
  75 |   } finally { await observer.close(); }
  76 | }
  77 | 
```