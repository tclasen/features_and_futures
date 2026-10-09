# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/pilot-011/definitions/project/acceptance/workboard.spec.mjs:108:3

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
- main [ref=f2e2]:
  - heading "Workboard" [level=1] [ref=f2e3]
  - alert [ref=f2e4]
  - generic [ref=f2e5]:
    - generic [ref=f2e6]: Project filter
    - combobox "Project filter" [ref=f2e7]:
      - option "Active"
      - option "Archived" [selected]
  - generic [ref=f2e8]:
    - generic [ref=f2e9]: Project name
    - textbox "Project name" [ref=f2e10]
    - button "Create project" [ref=f2e11] [cursor=pointer]
  - region "Projects" [ref=f2e12]:
    - generic [ref=f2e13]:
      - generic "Rename project" [ref=f2e14]: task-003 Archive tasks
      - generic [ref=f2e15]: 1/1 completed
      - generic [ref=f2e16]:
        - button "Open project" [ref=f2e17] [cursor=pointer]
        - button "Restore project" [ref=f2e18] [cursor=pointer]
    - generic [ref=f2e19]:
      - generic "Rename project" [ref=f2e20]: task-003 Archive tasks
      - generic [ref=f2e21]: 1/1 completed
      - generic [ref=f2e22]:
        - button "Open project" [ref=f2e23] [cursor=pointer]
        - button "Restore project" [ref=f2e24] [cursor=pointer]
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
```