# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.mjs >> 012 data survives a real server-process restart
- Location: runs/instruction-effects/pilot-002/definitions/project/acceptance/persistence.spec.mjs:4:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'preflight Persistence sentinel', exact: true })
Expected: visible
Error: strict mode violation: getByRole('heading', { name: 'preflight Persistence sentinel', exact: true }) resolved to 2 elements:
    1) <h1 id="page-title">preflight Persistence sentinel</h1> aka locator('#page-title')
    2) <h2 id="project-title">preflight Persistence sentinel</h2> aka locator('#project-title')

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'preflight Persistence sentinel', exact: true }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'preflight Persistence sentinel', exact: true })

```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - paragraph [ref=e4]: PROJECT SPACE
    - heading "preflight Persistence sentinel" [level=1] [ref=e5]
  - region [ref=e6]:
    - button "Projects" [ref=e7] [cursor=pointer]
    - heading "preflight Persistence sentinel" [level=2] [ref=e8]
```

# Test source

```ts
  1  | import { expect } from '@playwright/test';
  2  | export const stage = Number(process.env.FF_STAGE);
  3  | export function projectName(name) {
  4  |   return (process.env.FF_FIXTURE_PREFIX ? process.env.FF_FIXTURE_PREFIX + ' ' : '') + name.trim();
  5  | }
  6  | export function projectRow(page, name) {
  7  |   return page.getByTestId('project-row').filter({ has: page.getByText(projectName(name), { exact: true }) });
  8  | }
  9  | export function taskRow(page, title) {
  10 |   return page.getByTestId('task-row').filter({ has: page.getByText(title, { exact: true }) });
  11 | }
  12 | export async function createProject(page, name) {
  13 |   await page.goto('/');
  14 |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name === name.trim() ? projectName(name) : '  ' + projectName(name) + '  ');
  15 |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  16 |   await expect(projectRow(page, name.trim())).toBeVisible();
  17 | }
  18 | export async function openProject(page, name) {
  19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
> 20 |   await expect(page.getByRole('heading', { name: projectName(name), exact: true })).toBeVisible();
     |                                                                                     ^ Error: expect(locator).toBeVisible() failed
  21 | }
  22 | export async function createTask(page, title) {
  23 |   await page.getByRole('textbox', { name: 'Task title', exact: true }).fill(title);
  24 |   await page.getByRole('button', { name: 'Create task', exact: true }).click();
  25 |   await expect(taskRow(page, title.trim())).toBeVisible();
  26 | }
  27 | export async function isolateBrowser(context) {
  28 |   const origin = new URL(process.env.FF_BASE_URL).origin;
  29 |   await context.route('**/*', route => {
  30 |     const url = new URL(route.request().url());
  31 |     return url.origin === origin ? route.continue() : route.abort();
  32 |   });
  33 | }
  34 | 
```