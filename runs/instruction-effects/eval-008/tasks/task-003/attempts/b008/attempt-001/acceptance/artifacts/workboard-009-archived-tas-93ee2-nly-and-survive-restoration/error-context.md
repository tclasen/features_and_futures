# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/eval-008/definitions/project/acceptance/workboard.spec.mjs:114:3

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
      - text: Project name
      - textbox "Project name" [ref=f2e6]
    - button "Create project" [ref=f2e7] [cursor=pointer]
  - generic [ref=f2e8]:
    - text: Project filter
    - combobox "Project filter" [ref=f2e9]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f2e10]:
    - generic [ref=f2e11]: task-001 Alpha create
    - generic [ref=f2e12]: 0/0 completed
    - button "Open project" [ref=f2e13] [cursor=pointer]
    - button "Archive project" [ref=f2e14] [cursor=pointer]
  - generic [ref=f2e15]:
    - generic [ref=f2e16]: task-001 Blank validation sentinel
    - generic [ref=f2e17]: 0/0 completed
    - button "Open project" [ref=f2e18] [cursor=pointer]
    - button "Archive project" [ref=f2e19] [cursor=pointer]
  - generic [ref=f2e20]:
    - generic [ref=f2e21]: task-001 Order first
    - generic [ref=f2e22]: 0/0 completed
    - button "Open project" [ref=f2e23] [cursor=pointer]
    - button "Archive project" [ref=f2e24] [cursor=pointer]
  - generic [ref=f2e25]:
    - generic [ref=f2e26]: task-001 Order second
    - generic [ref=f2e27]: 0/0 completed
    - button "Open project" [ref=f2e28] [cursor=pointer]
    - button "Archive project" [ref=f2e29] [cursor=pointer]
  - generic [ref=f2e30]:
    - generic [ref=f2e31]: task-001 Persistence sentinel
    - generic [ref=f2e32]: 0/0 completed
    - button "Open project" [ref=f2e33] [cursor=pointer]
    - button "Archive project" [ref=f2e34] [cursor=pointer]
  - generic [ref=f2e35]:
    - generic [ref=f2e36]: task-002 Alpha create
    - generic [ref=f2e37]: 0/0 completed
    - button "Open project" [ref=f2e38] [cursor=pointer]
    - button "Archive project" [ref=f2e39] [cursor=pointer]
  - generic [ref=f2e40]:
    - generic [ref=f2e41]: task-002 Blank validation sentinel
    - generic [ref=f2e42]: 0/0 completed
    - button "Open project" [ref=f2e43] [cursor=pointer]
    - button "Archive project" [ref=f2e44] [cursor=pointer]
  - generic [ref=f2e45]:
    - generic [ref=f2e46]: task-002 Order first
    - generic [ref=f2e47]: 0/0 completed
    - button "Open project" [ref=f2e48] [cursor=pointer]
    - button "Archive project" [ref=f2e49] [cursor=pointer]
  - generic [ref=f2e50]:
    - generic [ref=f2e51]: task-002 Order second
    - generic [ref=f2e52]: 0/0 completed
    - button "Open project" [ref=f2e53] [cursor=pointer]
    - button "Archive project" [ref=f2e54] [cursor=pointer]
  - generic [ref=f2e55]:
    - generic [ref=f2e56]: task-002 Task reload
    - generic [ref=f2e57]: 0/1 completed
    - button "Open project" [ref=f2e58] [cursor=pointer]
    - button "Archive project" [ref=f2e59] [cursor=pointer]
  - generic [ref=f2e60]:
    - generic [ref=f2e61]: task-002 Task invalid
    - generic [ref=f2e62]: 0/0 completed
    - button "Open project" [ref=f2e63] [cursor=pointer]
    - button "Archive project" [ref=f2e64] [cursor=pointer]
  - generic [ref=f2e65]:
    - generic [ref=f2e66]: task-002 Task owner
    - generic [ref=f2e67]: 0/1 completed
    - button "Open project" [ref=f2e68] [cursor=pointer]
    - button "Archive project" [ref=f2e69] [cursor=pointer]
  - generic [ref=f2e70]:
    - generic [ref=f2e71]: task-002 Other project
    - generic [ref=f2e72]: 0/0 completed
    - button "Open project" [ref=f2e73] [cursor=pointer]
    - button "Archive project" [ref=f2e74] [cursor=pointer]
  - generic [ref=f2e75]:
    - generic [ref=f2e76]: task-002 Task filters
    - generic [ref=f2e77]: 0/2 completed
    - button "Open project" [ref=f2e78] [cursor=pointer]
    - button "Archive project" [ref=f2e79] [cursor=pointer]
  - generic [ref=f2e80]:
    - generic [ref=f2e81]: task-002 Persistence sentinel
    - generic [ref=f2e82]: 1/1 completed
    - button "Open project" [ref=f2e83] [cursor=pointer]
    - button "Archive project" [ref=f2e84] [cursor=pointer]
  - generic [ref=f2e85]:
    - generic [ref=f2e86]: task-003 Alpha create
    - generic [ref=f2e87]: 0/0 completed
    - button "Open project" [ref=f2e88] [cursor=pointer]
    - button "Archive project" [ref=f2e89] [cursor=pointer]
  - generic [ref=f2e90]:
    - generic [ref=f2e91]: task-003 Blank validation sentinel
    - generic [ref=f2e92]: 0/0 completed
    - button "Open project" [ref=f2e93] [cursor=pointer]
    - button "Archive project" [ref=f2e94] [cursor=pointer]
  - generic [ref=f2e95]:
    - generic [ref=f2e96]: task-003 Order first
    - generic [ref=f2e97]: 0/0 completed
    - button "Open project" [ref=f2e98] [cursor=pointer]
    - button "Archive project" [ref=f2e99] [cursor=pointer]
  - generic [ref=f2e100]:
    - generic [ref=f2e101]: task-003 Order second
    - generic [ref=f2e102]: 0/0 completed
    - button "Open project" [ref=f2e103] [cursor=pointer]
    - button "Archive project" [ref=f2e104] [cursor=pointer]
  - generic [ref=f2e105]:
    - generic [ref=f2e106]: task-003 Task reload
    - generic [ref=f2e107]: 0/1 completed
    - button "Open project" [ref=f2e108] [cursor=pointer]
    - button "Archive project" [ref=f2e109] [cursor=pointer]
  - generic [ref=f2e110]:
    - generic [ref=f2e111]: task-003 Task invalid
    - generic [ref=f2e112]: 0/0 completed
    - button "Open project" [ref=f2e113] [cursor=pointer]
    - button "Archive project" [ref=f2e114] [cursor=pointer]
  - generic [ref=f2e115]:
    - generic [ref=f2e116]: task-003 Task owner
    - generic [ref=f2e117]: 0/1 completed
    - button "Open project" [ref=f2e118] [cursor=pointer]
    - button "Archive project" [ref=f2e119] [cursor=pointer]
  - generic [ref=f2e120]:
    - generic [ref=f2e121]: task-003 Other project
    - generic [ref=f2e122]: 0/0 completed
    - button "Open project" [ref=f2e123] [cursor=pointer]
    - button "Archive project" [ref=f2e124] [cursor=pointer]
  - generic [ref=f2e125]:
    - generic [ref=f2e126]: task-003 Task filters
    - generic [ref=f2e127]: 1/2 completed
    - button "Open project" [ref=f2e128] [cursor=pointer]
    - button "Archive project" [ref=f2e129] [cursor=pointer]
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