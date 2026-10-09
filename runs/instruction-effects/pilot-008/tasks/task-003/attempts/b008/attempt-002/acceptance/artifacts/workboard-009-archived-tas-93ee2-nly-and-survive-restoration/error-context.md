# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/pilot-008/definitions/project/acceptance/workboard.spec.mjs:99:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button>Open project</button> aka getByRole('button', { name: 'Open project' }).first()
    2) <button>Open project</button> aka getByRole('button', { name: 'Open project' }).nth(1)

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=f2e2]:
  - heading "Workboard" [level=1] [ref=f2e3]
  - generic [ref=f2e4]: Project filter
  - combobox "Project filter" [ref=f2e5]:
    - option "Active"
    - option "Archived" [selected]
  - generic [ref=f2e6]:
    - generic [ref=f2e7]:
      - generic [ref=f2e8]: Project name
      - textbox "Project name" [ref=f2e9]
    - button "Create project" [ref=f2e10] [cursor=pointer]
  - region "Projects" [ref=f2e11]:
    - generic [ref=f2e12]:
      - generic [ref=f2e13]: task-003 Archive tasks
      - generic [ref=f2e14]: 1/1 completed
      - button "Open project" [ref=f2e15] [cursor=pointer]
      - button "Restore project" [ref=f2e16] [cursor=pointer]
    - generic [ref=f2e17]:
      - generic [ref=f2e18]: task-003 Archive tasks
      - generic [ref=f2e19]: 1/1 completed
      - button "Open project" [ref=f2e20] [cursor=pointer]
      - button "Restore project" [ref=f2e21] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect } from '@playwright/test';
  2  | export const stage = Number(process.env.FF_STAGE);
  3  | export function projectName(name) {
  4  |   return (process.env.FF_FIXTURE_PREFIX ? process.env.FF_FIXTURE_PREFIX + ' ' : '') + name.trim();
  5  | }
  6  | export function projectRow(page, name) {
  7  |   return page.getByTestId('project-row').filter({ hasText: projectName(name) });
  8  | }
  9  | export function taskRow(page, title) {
  10 |   return page.getByTestId('task-row').filter({ hasText: title });
  11 | }
  12 | export async function createProject(page, name) {
  13 |   await page.goto('/');
  14 |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name === name.trim() ? projectName(name) : '  ' + projectName(name) + '  ');
  15 |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  16 |   await expect(projectRow(page, name.trim())).toBeVisible();
  17 | }
  18 | export async function openProject(page, name) {
> 19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
     |                                                                                           ^ Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
  20 |   await expect(page.getByRole('heading', { name: projectName(name), exact: true }).first()).toBeVisible();
  21 | }
  22 | export async function createTask(page, title) {
  23 |   await page.getByRole('textbox', { name: 'Task title', exact: true }).fill(title);
  24 |   await page.getByRole('button', { name: 'Create task', exact: true }).click();
  25 |   await expect(taskRow(page, title.trim())).toBeVisible();
  26 | }
  27 | export async function isolateBrowser(context) {
  28 |   await context.routeWebSocket('**/*', socket => socket.close());
  29 |   const origin = new URL(process.env.FF_BASE_URL).origin;
  30 |   await context.route('**/*', route => {
  31 |     const url = new URL(route.request().url());
  32 |     return url.origin === origin ? route.continue() : route.abort();
  33 |   });
  34 | }
  35 | 
```