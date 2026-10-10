# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/eval-002/definitions/project/acceptance/workboard.spec.mjs:114:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible()

```

```yaml
- main:
  - heading "Workboard" [level=1]
  - text: Project name
  - textbox "Project name"
  - button "Create project"
  - text: Project filter
  - combobox "Project filter":
    - option "Active" [selected]
    - option "Archived"
  - region "Projects":
    - text: task-001 Alpha create 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-001 Blank validation sentinel 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-001 Order first 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-001 Order second 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-001 Persistence sentinel 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Alpha create 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Blank validation sentinel 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Order first 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Order second 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Task reload 0/1 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Task invalid 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Task owner 0/1 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Other project 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Task filters 0/2 completed
    - button "Open project"
    - button "Archive project"
    - text: task-002 Persistence sentinel 1/1 completed
    - button "Open project"
    - button "Archive project"
    - text: task-003 Alpha create 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-003 Blank validation sentinel 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-003 Order first 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-003 Task reload 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-003 Task invalid 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-003 Task owner 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-003 Task filters 0/0 completed
    - button "Open project"
    - button "Archive project"
    - text: task-003 Archive lifecycle 0/0 completed
    - button "Open project"
    - button "Archive project"
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
```