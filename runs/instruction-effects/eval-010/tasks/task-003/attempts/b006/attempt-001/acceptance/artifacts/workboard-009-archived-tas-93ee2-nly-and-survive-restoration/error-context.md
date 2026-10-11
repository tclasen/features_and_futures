# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/eval-010/definitions/project/acceptance/workboard.spec.mjs:114:3

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
  - generic [ref=e4]:
    - generic [ref=e5]: Project name
    - generic [ref=e6]:
      - textbox "Project name" [ref=e7]
      - button "Create project" [ref=e8] [cursor=pointer]
  - generic [ref=e9]:
    - generic [ref=e10]: Project filter
    - combobox "Project filter" [ref=e11]:
      - option "Active" [selected]
      - option "Archived"
  - list "Projects" [ref=e12]:
    - listitem [ref=e13]:
      - generic [ref=e14]: task-001 Alpha create
      - generic [ref=e15]: 0/0 completed
      - button "Open project" [ref=e16] [cursor=pointer]
      - button "Archive project" [ref=e17] [cursor=pointer]
    - listitem [ref=e18]:
      - generic [ref=e19]: task-001 Blank validation sentinel
      - generic [ref=e20]: 0/0 completed
      - button "Open project" [ref=e21] [cursor=pointer]
      - button "Archive project" [ref=e22] [cursor=pointer]
    - listitem [ref=e23]:
      - generic [ref=e24]: task-001 Order first
      - generic [ref=e25]: 0/0 completed
      - button "Open project" [ref=e26] [cursor=pointer]
      - button "Archive project" [ref=e27] [cursor=pointer]
    - listitem [ref=e28]:
      - generic [ref=e29]: task-001 Order second
      - generic [ref=e30]: 0/0 completed
      - button "Open project" [ref=e31] [cursor=pointer]
      - button "Archive project" [ref=e32] [cursor=pointer]
    - listitem [ref=e33]:
      - generic [ref=e34]: task-001 Persistence sentinel
      - generic [ref=e35]: 0/0 completed
      - button "Open project" [ref=e36] [cursor=pointer]
      - button "Archive project" [ref=e37] [cursor=pointer]
    - listitem [ref=e38]:
      - generic [ref=e39]: task-002 Alpha create
      - generic [ref=e40]: 0/0 completed
      - button "Open project" [ref=e41] [cursor=pointer]
      - button "Archive project" [ref=e42] [cursor=pointer]
    - listitem [ref=e43]:
      - generic [ref=e44]: task-002 Blank validation sentinel
      - generic [ref=e45]: 0/0 completed
      - button "Open project" [ref=e46] [cursor=pointer]
      - button "Archive project" [ref=e47] [cursor=pointer]
    - listitem [ref=e48]:
      - generic [ref=e49]: task-002 Order first
      - generic [ref=e50]: 0/0 completed
      - button "Open project" [ref=e51] [cursor=pointer]
      - button "Archive project" [ref=e52] [cursor=pointer]
    - listitem [ref=e53]:
      - generic [ref=e54]: task-002 Order second
      - generic [ref=e55]: 0/0 completed
      - button "Open project" [ref=e56] [cursor=pointer]
      - button "Archive project" [ref=e57] [cursor=pointer]
    - listitem [ref=e58]:
      - generic [ref=e59]: task-002 Task reload
      - generic [ref=e60]: 0/1 completed
      - button "Open project" [ref=e61] [cursor=pointer]
      - button "Archive project" [ref=e62] [cursor=pointer]
    - listitem [ref=e63]:
      - generic [ref=e64]: task-002 Task invalid
      - generic [ref=e65]: 0/0 completed
      - button "Open project" [ref=e66] [cursor=pointer]
      - button "Archive project" [ref=e67] [cursor=pointer]
    - listitem [ref=e68]:
      - generic [ref=e69]: task-002 Task owner
      - generic [ref=e70]: 0/1 completed
      - button "Open project" [ref=e71] [cursor=pointer]
      - button "Archive project" [ref=e72] [cursor=pointer]
    - listitem [ref=e73]:
      - generic [ref=e74]: task-002 Other project
      - generic [ref=e75]: 0/0 completed
      - button "Open project" [ref=e76] [cursor=pointer]
      - button "Archive project" [ref=e77] [cursor=pointer]
    - listitem [ref=e78]:
      - generic [ref=e79]: task-002 Task filters
      - generic [ref=e80]: 0/2 completed
      - button "Open project" [ref=e81] [cursor=pointer]
      - button "Archive project" [ref=e82] [cursor=pointer]
    - listitem [ref=e83]:
      - generic [ref=e84]: task-002 Persistence sentinel
      - generic [ref=e85]: 1/1 completed
      - button "Open project" [ref=e86] [cursor=pointer]
      - button "Archive project" [ref=e87] [cursor=pointer]
    - listitem [ref=e88]:
      - generic [ref=e89]: task-003 Alpha create
      - generic [ref=e90]: 0/0 completed
      - button "Open project" [ref=e91] [cursor=pointer]
      - button "Archive project" [ref=e92] [cursor=pointer]
    - listitem [ref=e93]:
      - generic [ref=e94]: task-003 Blank validation sentinel
      - generic [ref=e95]: 0/0 completed
      - button "Open project" [ref=e96] [cursor=pointer]
      - button "Archive project" [ref=e97] [cursor=pointer]
    - listitem [ref=e98]:
      - generic [ref=e99]: task-003 Order first
      - generic [ref=e100]: 0/0 completed
      - button "Open project" [ref=e101] [cursor=pointer]
      - button "Archive project" [ref=e102] [cursor=pointer]
    - listitem [ref=e103]:
      - generic [ref=e104]: task-003 Order second
      - generic [ref=e105]: 0/0 completed
      - button "Open project" [ref=e106] [cursor=pointer]
      - button "Archive project" [ref=e107] [cursor=pointer]
    - listitem [ref=e108]:
      - generic [ref=e109]: task-003 Task reload
      - generic [ref=e110]: 0/1 completed
      - button "Open project" [ref=e111] [cursor=pointer]
      - button "Archive project" [ref=e112] [cursor=pointer]
    - listitem [ref=e113]:
      - generic [ref=e114]: task-003 Task invalid
      - generic [ref=e115]: 0/0 completed
      - button "Open project" [ref=e116] [cursor=pointer]
      - button "Archive project" [ref=e117] [cursor=pointer]
    - listitem [ref=e118]:
      - generic [ref=e119]: task-003 Task owner
      - generic [ref=e120]: 0/1 completed
      - button "Open project" [ref=e121] [cursor=pointer]
      - button "Archive project" [ref=e122] [cursor=pointer]
    - listitem [ref=e123]:
      - generic [ref=e124]: task-003 Other project
      - generic [ref=e125]: 0/0 completed
      - button "Open project" [ref=e126] [cursor=pointer]
      - button "Archive project" [ref=e127] [cursor=pointer]
    - listitem [ref=e128]:
      - generic [ref=e129]: task-003 Task filters
      - generic [ref=e130]: 0/2 completed
      - button "Open project" [ref=e131] [cursor=pointer]
      - button "Archive project" [ref=e132] [cursor=pointer]
    - listitem [ref=e133]:
      - generic [ref=e134]: task-003 Archive lifecycle
      - generic [ref=e135]: 0/0 completed
      - button "Open project" [ref=e136] [cursor=pointer]
      - button "Archive project" [ref=e137] [cursor=pointer]
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