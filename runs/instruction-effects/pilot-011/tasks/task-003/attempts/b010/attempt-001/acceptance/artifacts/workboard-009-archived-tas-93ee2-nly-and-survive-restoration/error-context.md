# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/pilot-011/definitions/project/acceptance/workboard.spec.mjs:108:3

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
- main [ref=f2e2]:
  - heading "Workboard" [level=1] [ref=f2e3]
  - generic [ref=f2e4]:
    - generic [ref=f2e5]:
      - generic [ref=f2e6]: Project name
      - textbox "Project name" [ref=f2e7]
    - button "Create project" [ref=f2e8] [cursor=pointer]
  - generic [ref=f2e10]:
    - generic [ref=f2e11]: Project filter
    - combobox "Project filter" [ref=f2e12]:
      - option "Active" [selected]
      - option "Archived"
  - region "Projects" [ref=f2e13]:
    - generic [ref=f2e14]:
      - generic [ref=f2e15]: task-001 Alpha create
      - generic [ref=f2e16]: 0/0 completed
      - button "Open project" [ref=f2e17] [cursor=pointer]
      - button "Archive project" [ref=f2e18] [cursor=pointer]
    - generic [ref=f2e19]:
      - generic [ref=f2e20]: task-001 Blank validation sentinel
      - generic [ref=f2e21]: 0/0 completed
      - button "Open project" [ref=f2e22] [cursor=pointer]
      - button "Archive project" [ref=f2e23] [cursor=pointer]
    - generic [ref=f2e24]:
      - generic [ref=f2e25]: task-001 Order first
      - generic [ref=f2e26]: 0/0 completed
      - button "Open project" [ref=f2e27] [cursor=pointer]
      - button "Archive project" [ref=f2e28] [cursor=pointer]
    - generic [ref=f2e29]:
      - generic [ref=f2e30]: task-001 Order second
      - generic [ref=f2e31]: 0/0 completed
      - button "Open project" [ref=f2e32] [cursor=pointer]
      - button "Archive project" [ref=f2e33] [cursor=pointer]
    - generic [ref=f2e34]:
      - generic [ref=f2e35]: task-001 Persistence sentinel
      - generic [ref=f2e36]: 0/0 completed
      - button "Open project" [ref=f2e37] [cursor=pointer]
      - button "Archive project" [ref=f2e38] [cursor=pointer]
    - generic [ref=f2e39]:
      - generic [ref=f2e40]: task-002 Alpha create
      - generic [ref=f2e41]: 0/0 completed
      - button "Open project" [ref=f2e42] [cursor=pointer]
      - button "Archive project" [ref=f2e43] [cursor=pointer]
    - generic [ref=f2e44]:
      - generic [ref=f2e45]: task-002 Blank validation sentinel
      - generic [ref=f2e46]: 0/0 completed
      - button "Open project" [ref=f2e47] [cursor=pointer]
      - button "Archive project" [ref=f2e48] [cursor=pointer]
    - generic [ref=f2e49]:
      - generic [ref=f2e50]: task-002 Order first
      - generic [ref=f2e51]: 0/0 completed
      - button "Open project" [ref=f2e52] [cursor=pointer]
      - button "Archive project" [ref=f2e53] [cursor=pointer]
    - generic [ref=f2e54]:
      - generic [ref=f2e55]: task-002 Order second
      - generic [ref=f2e56]: 0/0 completed
      - button "Open project" [ref=f2e57] [cursor=pointer]
      - button "Archive project" [ref=f2e58] [cursor=pointer]
    - generic [ref=f2e59]:
      - generic [ref=f2e60]: task-002 Task reload
      - generic [ref=f2e61]: 0/1 completed
      - button "Open project" [ref=f2e62] [cursor=pointer]
      - button "Archive project" [ref=f2e63] [cursor=pointer]
    - generic [ref=f2e64]:
      - generic [ref=f2e65]: task-002 Task invalid
      - generic [ref=f2e66]: 0/0 completed
      - button "Open project" [ref=f2e67] [cursor=pointer]
      - button "Archive project" [ref=f2e68] [cursor=pointer]
    - generic [ref=f2e69]:
      - generic [ref=f2e70]: task-002 Task owner
      - generic [ref=f2e71]: 0/1 completed
      - button "Open project" [ref=f2e72] [cursor=pointer]
      - button "Archive project" [ref=f2e73] [cursor=pointer]
    - generic [ref=f2e74]:
      - generic [ref=f2e75]: task-002 Other project
      - generic [ref=f2e76]: 0/0 completed
      - button "Open project" [ref=f2e77] [cursor=pointer]
      - button "Archive project" [ref=f2e78] [cursor=pointer]
    - generic [ref=f2e79]:
      - generic [ref=f2e80]: task-002 Task filters
      - generic [ref=f2e81]: 0/2 completed
      - button "Open project" [ref=f2e82] [cursor=pointer]
      - button "Archive project" [ref=f2e83] [cursor=pointer]
    - generic [ref=f2e84]:
      - generic [ref=f2e85]: task-002 Persistence sentinel
      - generic [ref=f2e86]: 1/1 completed
      - button "Open project" [ref=f2e87] [cursor=pointer]
      - button "Archive project" [ref=f2e88] [cursor=pointer]
    - generic [ref=f2e89]:
      - generic [ref=f2e90]: task-003 Alpha create
      - generic [ref=f2e91]: 0/0 completed
      - button "Open project" [ref=f2e92] [cursor=pointer]
      - button "Archive project" [ref=f2e93] [cursor=pointer]
    - generic [ref=f2e94]:
      - generic [ref=f2e95]: task-003 Blank validation sentinel
      - generic [ref=f2e96]: 0/0 completed
      - button "Open project" [ref=f2e97] [cursor=pointer]
      - button "Archive project" [ref=f2e98] [cursor=pointer]
    - generic [ref=f2e99]:
      - generic [ref=f2e100]: task-003 Order first
      - generic [ref=f2e101]: 0/0 completed
      - button "Open project" [ref=f2e102] [cursor=pointer]
      - button "Archive project" [ref=f2e103] [cursor=pointer]
    - generic [ref=f2e104]:
      - generic [ref=f2e105]: task-003 Order second
      - generic [ref=f2e106]: 0/0 completed
      - button "Open project" [ref=f2e107] [cursor=pointer]
      - button "Archive project" [ref=f2e108] [cursor=pointer]
    - generic [ref=f2e109]:
      - generic [ref=f2e110]: task-003 Task reload
      - generic [ref=f2e111]: 0/1 completed
      - button "Open project" [ref=f2e112] [cursor=pointer]
      - button "Archive project" [ref=f2e113] [cursor=pointer]
    - generic [ref=f2e114]:
      - generic [ref=f2e115]: task-003 Task invalid
      - generic [ref=f2e116]: 0/0 completed
      - button "Open project" [ref=f2e117] [cursor=pointer]
      - button "Archive project" [ref=f2e118] [cursor=pointer]
    - generic [ref=f2e119]:
      - generic [ref=f2e120]: task-003 Task owner
      - generic [ref=f2e121]: 0/1 completed
      - button "Open project" [ref=f2e122] [cursor=pointer]
      - button "Archive project" [ref=f2e123] [cursor=pointer]
    - generic [ref=f2e124]:
      - generic [ref=f2e125]: task-003 Other project
      - generic [ref=f2e126]: 0/0 completed
      - button "Open project" [ref=f2e127] [cursor=pointer]
      - button "Archive project" [ref=f2e128] [cursor=pointer]
    - generic [ref=f2e129]:
      - generic [ref=f2e130]: task-003 Task filters
      - generic [ref=f2e131]: 0/2 completed
      - button "Open project" [ref=f2e132] [cursor=pointer]
      - button "Archive project" [ref=f2e133] [cursor=pointer]
    - generic [ref=f2e134]:
      - generic [ref=f2e135]: task-003 Archive lifecycle
      - generic [ref=f2e136]: 0/0 completed
      - button "Open project" [ref=f2e137] [cursor=pointer]
      - button "Archive project" [ref=f2e138] [cursor=pointer]
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
```