# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 005 blank task input is rejected
- Location: runs/instruction-effects/pilot-005/definitions/project/acceptance/workboard.spec.mjs:47:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'recovery-1791562718469764000 Task invalid' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'recovery-1791562718469764000 Task invalid' }) with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'recovery-1791562718469764000 Task invalid' })

```

```yaml
- heading "Workboard" [level=1]
- text: Project name
- textbox "Project name": recovery-1791562718469764000 Task invalid
- button "Create project"
- alert: input is not defined
- text: task-001 Alpha create
- button "Open project"
- text: task-001 Order first
- button "Open project"
- text: task-001 Order second
- button "Open project"
- text: task-001 Persistence sentinel
- button "Open project"
- text: recovery-1791562718469764000 Alpha create
- button "Open project"
- text: recovery-1791562718469764000 Order first
- button "Open project"
- text: recovery-1791562718469764000 Task reload
- button "Open project"
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