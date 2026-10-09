# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/pilot-012/definitions/project/acceptance/workboard.spec.mjs:109:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button type="button">Open project</button> aka getByRole('button', { name: 'Open project' }).first()
    2) <button type="button">Open project</button> aka getByRole('button', { name: 'Open project' }).nth(1)

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Workboard" [level=1] [ref=e3]
  - text: Project filter
  - combobox "Project filter" [ref=e4]:
    - option "Active"
    - option "Archived" [selected]
  - generic [ref=e5]:
    - generic [ref=e6]: Project name
    - textbox "Project name" [ref=e7]
    - button "Create project" [ref=e8] [cursor=pointer]
  - region "Projects" [ref=e9]:
    - generic [ref=e10]:
      - generic [ref=e11]: task-003 Archive tasks
      - generic [ref=e12]: 1/1 completed
      - button "Open project" [ref=e13] [cursor=pointer]
      - button "Restore project" [ref=e14] [cursor=pointer]
    - generic [ref=e15]:
      - generic [ref=e16]: task-003 Archive tasks
      - generic [ref=e17]: 1/1 completed
      - button "Open project" [ref=e18] [cursor=pointer]
      - button "Restore project" [ref=e19] [cursor=pointer]
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
> 19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
     |                                                                                           ^ Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
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
```