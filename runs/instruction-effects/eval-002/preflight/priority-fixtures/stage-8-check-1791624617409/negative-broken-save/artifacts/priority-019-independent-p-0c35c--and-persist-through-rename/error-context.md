# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority.spec.mjs >> 019 independent priorities default to Normal and persist through rename
- Location: .local/task008-preparation/suite/priority.spec.mjs:19:3

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
- generic [active] [ref=f5e1]:
  - heading "task-008 Priority ownership" [level=1] [ref=f5e2]
  - group [ref=f5e4]:
    - button "Projects" [ref=f5e5]
  - group [ref=f5e7]:
    - generic [ref=f5e8]:
      - text: New project name
      - textbox "New project name" [ref=f5e9]
    - button "Rename project" [ref=f5e10]
  - generic [ref=f5e12]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f5e13]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f5e15]:
    - generic [ref=f5e16]:
      - text: Task title
      - textbox "Task title" [ref=f5e17]
    - button "Create task" [ref=f5e18]
  - generic [ref=f5e20]:
    - text: Task filter
    - combobox "Task filter" [ref=f5e21]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f5e23]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f5e24]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f5e25]:
    - text: Priority first
    - checkbox "Complete Priority first" [ref=f5e27]
    - group [ref=f5e29]:
      - generic [ref=f5e30]:
        - text: New task title
        - textbox "New task title" [ref=f5e31]
      - button "Rename task" [ref=f5e32]
    - generic [ref=f5e34]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e35]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f5e36]:
    - text: Priority second
    - checkbox "Complete Priority second" [ref=f5e38]
    - group [ref=f5e40]:
      - generic [ref=f5e41]:
        - text: New task title
        - textbox "New task title" [ref=f5e42]
      - button "Rename task" [ref=f5e43]
    - generic [ref=f5e45]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e46]:
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