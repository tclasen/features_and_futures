# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/pilot-012/definitions/project/acceptance/workboard.spec.mjs:109:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Workboard" [level=1] [ref=e3]
  - text: Project filter
  - combobox "Project filter" [ref=e4]:
    - option "Active" [selected]
    - option "Archived"
  - generic [ref=e5]:
    - generic [ref=e6]: Project name
    - textbox "Project name" [ref=e7]
    - button "Create project" [ref=e8] [cursor=pointer]
  - region "Projects" [ref=e9]:
    - generic [ref=e10]:
      - generic [ref=e11]: task-001 Alpha create
      - generic [ref=e12]: 0/0 completed
      - button "Open project" [ref=e13] [cursor=pointer]
      - button "Archive project" [ref=e14] [cursor=pointer]
    - generic [ref=e15]:
      - generic [ref=e16]: task-001 Blank validation sentinel
      - generic [ref=e17]: 0/0 completed
      - button "Open project" [ref=e18] [cursor=pointer]
      - button "Archive project" [ref=e19] [cursor=pointer]
    - generic [ref=e20]:
      - generic [ref=e21]: task-001 Order first
      - generic [ref=e22]: 0/0 completed
      - button "Open project" [ref=e23] [cursor=pointer]
      - button "Archive project" [ref=e24] [cursor=pointer]
    - generic [ref=e25]:
      - generic [ref=e26]: task-001 Order second
      - generic [ref=e27]: 0/0 completed
      - button "Open project" [ref=e28] [cursor=pointer]
      - button "Archive project" [ref=e29] [cursor=pointer]
    - generic [ref=e30]:
      - generic [ref=e31]: task-001 Persistence sentinel
      - generic [ref=e32]: 0/0 completed
      - button "Open project" [ref=e33] [cursor=pointer]
      - button "Archive project" [ref=e34] [cursor=pointer]
    - generic [ref=e35]:
      - generic [ref=e36]: task-002 Alpha create
      - generic [ref=e37]: 0/0 completed
      - button "Open project" [ref=e38] [cursor=pointer]
      - button "Archive project" [ref=e39] [cursor=pointer]
    - generic [ref=e40]:
      - generic [ref=e41]: task-002 Blank validation sentinel
      - generic [ref=e42]: 0/0 completed
      - button "Open project" [ref=e43] [cursor=pointer]
      - button "Archive project" [ref=e44] [cursor=pointer]
    - generic [ref=e45]:
      - generic [ref=e46]: task-002 Order first
      - generic [ref=e47]: 0/0 completed
      - button "Open project" [ref=e48] [cursor=pointer]
      - button "Archive project" [ref=e49] [cursor=pointer]
    - generic [ref=e50]:
      - generic [ref=e51]: task-002 Order second
      - generic [ref=e52]: 0/0 completed
      - button "Open project" [ref=e53] [cursor=pointer]
      - button "Archive project" [ref=e54] [cursor=pointer]
    - generic [ref=e55]:
      - generic [ref=e56]: task-002 Task reload
      - generic [ref=e57]: 0/1 completed
      - button "Open project" [ref=e58] [cursor=pointer]
      - button "Archive project" [ref=e59] [cursor=pointer]
    - generic [ref=e60]:
      - generic [ref=e61]: task-002 Task invalid
      - generic [ref=e62]: 0/0 completed
      - button "Open project" [ref=e63] [cursor=pointer]
      - button "Archive project" [ref=e64] [cursor=pointer]
    - generic [ref=e65]:
      - generic [ref=e66]: task-002 Task owner
      - generic [ref=e67]: 0/1 completed
      - button "Open project" [ref=e68] [cursor=pointer]
      - button "Archive project" [ref=e69] [cursor=pointer]
    - generic [ref=e70]:
      - generic [ref=e71]: task-002 Other project
      - generic [ref=e72]: 0/0 completed
      - button "Open project" [ref=e73] [cursor=pointer]
      - button "Archive project" [ref=e74] [cursor=pointer]
    - generic [ref=e75]:
      - generic [ref=e76]: task-002 Task filters
      - generic [ref=e77]: 0/2 completed
      - button "Open project" [ref=e78] [cursor=pointer]
      - button "Archive project" [ref=e79] [cursor=pointer]
    - generic [ref=e80]:
      - generic [ref=e81]: task-002 Persistence sentinel
      - generic [ref=e82]: 1/1 completed
      - button "Open project" [ref=e83] [cursor=pointer]
      - button "Archive project" [ref=e84] [cursor=pointer]
    - generic [ref=e85]:
      - generic [ref=e86]: task-003 Alpha create
      - generic [ref=e87]: 0/0 completed
      - button "Open project" [ref=e88] [cursor=pointer]
      - button "Archive project" [ref=e89] [cursor=pointer]
    - generic [ref=e90]:
      - generic [ref=e91]: task-003 Blank validation sentinel
      - generic [ref=e92]: 0/0 completed
      - button "Open project" [ref=e93] [cursor=pointer]
      - button "Archive project" [ref=e94] [cursor=pointer]
    - generic [ref=e95]:
      - generic [ref=e96]: task-003 Order first
      - generic [ref=e97]: 0/0 completed
      - button "Open project" [ref=e98] [cursor=pointer]
      - button "Archive project" [ref=e99] [cursor=pointer]
    - generic [ref=e100]:
      - generic [ref=e101]: task-003 Order second
      - generic [ref=e102]: 0/0 completed
      - button "Open project" [ref=e103] [cursor=pointer]
      - button "Archive project" [ref=e104] [cursor=pointer]
    - generic [ref=e105]:
      - generic [ref=e106]: task-003 Task reload
      - generic [ref=e107]: 0/1 completed
      - button "Open project" [ref=e108] [cursor=pointer]
      - button "Archive project" [ref=e109] [cursor=pointer]
    - generic [ref=e110]:
      - generic [ref=e111]: task-003 Task invalid
      - generic [ref=e112]: 0/0 completed
      - button "Open project" [ref=e113] [cursor=pointer]
      - button "Archive project" [ref=e114] [cursor=pointer]
    - generic [ref=e115]:
      - generic [ref=e116]: task-003 Task owner
      - generic [ref=e117]: 0/1 completed
      - button "Open project" [ref=e118] [cursor=pointer]
      - button "Archive project" [ref=e119] [cursor=pointer]
    - generic [ref=e120]:
      - generic [ref=e121]: task-003 Other project
      - generic [ref=e122]: 0/0 completed
      - button "Open project" [ref=e123] [cursor=pointer]
      - button "Archive project" [ref=e124] [cursor=pointer]
    - generic [ref=e125]:
      - generic [ref=e126]: task-003 Task filters
      - generic [ref=e127]: 0/2 completed
      - button "Open project" [ref=e128] [cursor=pointer]
      - button "Archive project" [ref=e129] [cursor=pointer]
    - generic [ref=e130]:
      - generic [ref=e131]: task-003 Archive lifecycle
      - generic [ref=e132]: 0/0 completed
      - button "Open project" [ref=e133] [cursor=pointer]
      - button "Archive project" [ref=e134] [cursor=pointer]
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
     |                                                                                           ^ Error: locator.click: Test timeout of 20000ms exceeded.
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