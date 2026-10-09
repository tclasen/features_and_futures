# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 001 health and project creation persist on reload
- Location: runs/instruction-effects/pilot-013/preflight/completion-navigation-matched-1791579409045414000/definitions/project/acceptance/workboard.spec.mjs:8:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-002 Alpha create' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-002 Alpha create' }).visible() resolved to 2 elements:
    1) <li data-testid="project-row">…</li> aka getByTestId('project-row').nth(5)
    2) <li data-testid="project-row">…</li> aka getByText('task-002 Alpha create Open').nth(1)

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-002 Alpha create' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-002 Alpha create' }).visible()

```

# Page snapshot

```yaml
- main [ref=f2e2]:
  - heading "Workboard" [level=1] [ref=f2e3]
  - generic [ref=f2e4]:
    - generic [ref=f2e5]: Project name
    - generic [ref=f2e6]:
      - textbox "Project name" [ref=f2e7]
      - button "Create project" [ref=f2e8] [cursor=pointer]
  - list "Projects" [ref=f2e9]:
    - listitem [ref=f2e10]:
      - generic [ref=f2e11]: task-001 Alpha create
      - button "Open project" [ref=f2e13] [cursor=pointer]
    - listitem [ref=f2e14]:
      - generic [ref=f2e15]: task-001 Blank validation sentinel
      - button "Open project" [ref=f2e17] [cursor=pointer]
    - listitem [ref=f2e18]:
      - generic [ref=f2e19]: task-001 Order first
      - button "Open project" [ref=f2e21] [cursor=pointer]
    - listitem [ref=f2e22]:
      - generic [ref=f2e23]: task-001 Order second
      - button "Open project" [ref=f2e25] [cursor=pointer]
    - listitem [ref=f2e26]:
      - generic [ref=f2e27]: task-001 Persistence sentinel
      - button "Open project" [ref=f2e29] [cursor=pointer]
    - listitem [ref=f2e30]:
      - generic [ref=f2e31]: task-002 Alpha create
      - button "Open project" [ref=f2e33] [cursor=pointer]
    - listitem [ref=f2e34]:
      - generic [ref=f2e35]: task-002 Blank validation sentinel
      - button "Open project" [ref=f2e37] [cursor=pointer]
    - listitem [ref=f2e38]:
      - generic [ref=f2e39]: task-002 Order first
      - button "Open project" [ref=f2e41] [cursor=pointer]
    - listitem [ref=f2e42]:
      - generic [ref=f2e43]: task-002 Order second
      - button "Open project" [ref=f2e45] [cursor=pointer]
    - listitem [ref=f2e46]:
      - generic [ref=f2e47]: task-002 Task reload
      - button "Open project" [ref=f2e49] [cursor=pointer]
    - listitem [ref=f2e50]:
      - generic [ref=f2e51]: task-002 Task invalid
      - button "Open project" [ref=f2e53] [cursor=pointer]
    - listitem [ref=f2e54]:
      - generic [ref=f2e55]: task-002 Task owner
      - button "Open project" [ref=f2e57] [cursor=pointer]
    - listitem [ref=f2e58]:
      - generic [ref=f2e59]: task-002 Other project
      - button "Open project" [ref=f2e61] [cursor=pointer]
    - listitem [ref=f2e62]:
      - generic [ref=f2e63]: task-002 Task filters
      - button "Open project" [ref=f2e65] [cursor=pointer]
    - listitem [ref=f2e66]:
      - generic [ref=f2e67]: task-002 Persistence sentinel
      - button "Open project" [ref=f2e69] [cursor=pointer]
    - listitem [ref=f2e70]:
      - generic [ref=f2e71]: task-002 Alpha create
      - button "Open project" [ref=f2e73] [cursor=pointer]
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
```