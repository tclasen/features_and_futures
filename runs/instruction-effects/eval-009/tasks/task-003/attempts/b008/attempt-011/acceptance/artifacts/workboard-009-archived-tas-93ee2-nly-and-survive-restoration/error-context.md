# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/eval-009/definitions/project/acceptance/workboard.spec.mjs:114:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button type="button">Open project</button> aka locator('article:nth-child(26) > button').first()
    2) <button type="button">Open project</button> aka locator('article:nth-child(52) > button').first()

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=f4e2]:
  - heading "Workboard" [level=1] [ref=f4e3]
  - generic [ref=f4e4]:
    - generic [ref=f4e5]: Project name
    - textbox "Project name" [ref=f4e6]
    - button "Create project" [ref=f4e7] [cursor=pointer]
  - text: Project filter
  - combobox "Project filter" [ref=f4e8]:
    - option "Active" [selected]
    - option "Archived"
  - generic [ref=f4e9]:
    - article [ref=f4e10]:
      - generic [ref=f4e11]: task-001 Alpha create
      - generic [ref=f4e12]: 0/0 completed
      - button "Open project" [ref=f4e13] [cursor=pointer]
      - button "Archive project" [ref=f4e14] [cursor=pointer]
    - article [ref=f4e15]:
      - generic [ref=f4e16]: task-001 Blank validation sentinel
      - generic [ref=f4e17]: 0/0 completed
      - button "Open project" [ref=f4e18] [cursor=pointer]
      - button "Archive project" [ref=f4e19] [cursor=pointer]
    - article [ref=f4e20]:
      - generic [ref=f4e21]: task-001 Order first
      - generic [ref=f4e22]: 0/0 completed
      - button "Open project" [ref=f4e23] [cursor=pointer]
      - button "Archive project" [ref=f4e24] [cursor=pointer]
    - article [ref=f4e25]:
      - generic [ref=f4e26]: task-001 Order second
      - generic [ref=f4e27]: 0/0 completed
      - button "Open project" [ref=f4e28] [cursor=pointer]
      - button "Archive project" [ref=f4e29] [cursor=pointer]
    - article [ref=f4e30]:
      - generic [ref=f4e31]: task-001 Persistence sentinel
      - generic [ref=f4e32]: 0/0 completed
      - button "Open project" [ref=f4e33] [cursor=pointer]
      - button "Archive project" [ref=f4e34] [cursor=pointer]
    - article [ref=f4e35]:
      - generic [ref=f4e36]: task-002 Alpha create
      - generic [ref=f4e37]: 0/0 completed
      - button "Open project" [ref=f4e38] [cursor=pointer]
      - button "Archive project" [ref=f4e39] [cursor=pointer]
    - article [ref=f4e40]:
      - generic [ref=f4e41]: task-002 Blank validation sentinel
      - generic [ref=f4e42]: 0/0 completed
      - button "Open project" [ref=f4e43] [cursor=pointer]
      - button "Archive project" [ref=f4e44] [cursor=pointer]
    - article [ref=f4e45]:
      - generic [ref=f4e46]: task-002 Order first
      - generic [ref=f4e47]: 0/0 completed
      - button "Open project" [ref=f4e48] [cursor=pointer]
      - button "Archive project" [ref=f4e49] [cursor=pointer]
    - article [ref=f4e50]:
      - generic [ref=f4e51]: task-002 Order second
      - generic [ref=f4e52]: 0/0 completed
      - button "Open project" [ref=f4e53] [cursor=pointer]
      - button "Archive project" [ref=f4e54] [cursor=pointer]
    - article [ref=f4e55]:
      - generic [ref=f4e56]: task-002 Task reload
      - generic [ref=f4e57]: 0/1 completed
      - button "Open project" [ref=f4e58] [cursor=pointer]
      - button "Archive project" [ref=f4e59] [cursor=pointer]
    - article [ref=f4e60]:
      - generic [ref=f4e61]: task-002 Task invalid
      - generic [ref=f4e62]: 0/0 completed
      - button "Open project" [ref=f4e63] [cursor=pointer]
      - button "Archive project" [ref=f4e64] [cursor=pointer]
    - article [ref=f4e65]:
      - generic [ref=f4e66]: task-002 Task owner
      - generic [ref=f4e67]: 0/1 completed
      - button "Open project" [ref=f4e68] [cursor=pointer]
      - button "Archive project" [ref=f4e69] [cursor=pointer]
    - article [ref=f4e70]:
      - generic [ref=f4e71]: task-002 Other project
      - generic [ref=f4e72]: 0/0 completed
      - button "Open project" [ref=f4e73] [cursor=pointer]
      - button "Archive project" [ref=f4e74] [cursor=pointer]
    - article [ref=f4e75]:
      - generic [ref=f4e76]: task-002 Task filters
      - generic [ref=f4e77]: 0/2 completed
      - button "Open project" [ref=f4e78] [cursor=pointer]
      - button "Archive project" [ref=f4e79] [cursor=pointer]
    - article [ref=f4e80]:
      - generic [ref=f4e81]: task-002 Persistence sentinel
      - generic [ref=f4e82]: 1/1 completed
      - button "Open project" [ref=f4e83] [cursor=pointer]
      - button "Archive project" [ref=f4e84] [cursor=pointer]
    - article [ref=f4e85]:
      - generic [ref=f4e86]: task-003 Alpha create
      - generic [ref=f4e87]: 0/0 completed
      - button "Open project" [ref=f4e88] [cursor=pointer]
      - button "Archive project" [ref=f4e89] [cursor=pointer]
    - article [ref=f4e90]:
      - generic [ref=f4e91]: task-003 Blank validation sentinel
      - generic [ref=f4e92]: 0/0 completed
      - button "Open project" [ref=f4e93] [cursor=pointer]
      - button "Archive project" [ref=f4e94] [cursor=pointer]
    - article [ref=f4e95]:
      - generic [ref=f4e96]: task-003 Order first
      - generic [ref=f4e97]: 0/0 completed
      - button "Open project" [ref=f4e98] [cursor=pointer]
      - button "Archive project" [ref=f4e99] [cursor=pointer]
    - article [ref=f4e100]:
      - generic [ref=f4e101]: task-003 Order second
      - generic [ref=f4e102]: 0/0 completed
      - button "Open project" [ref=f4e103] [cursor=pointer]
      - button "Archive project" [ref=f4e104] [cursor=pointer]
    - article [ref=f4e105]:
      - generic [ref=f4e106]: task-003 Task reload
      - generic [ref=f4e107]: 0/1 completed
      - button "Open project" [ref=f4e108] [cursor=pointer]
      - button "Archive project" [ref=f4e109] [cursor=pointer]
    - article [ref=f4e110]:
      - generic [ref=f4e111]: task-003 Task invalid
      - generic [ref=f4e112]: 0/0 completed
      - button "Open project" [ref=f4e113] [cursor=pointer]
      - button "Archive project" [ref=f4e114] [cursor=pointer]
    - article [ref=f4e115]:
      - generic [ref=f4e116]: task-003 Task owner
      - generic [ref=f4e117]: 0/1 completed
      - button "Open project" [ref=f4e118] [cursor=pointer]
      - button "Archive project" [ref=f4e119] [cursor=pointer]
    - article [ref=f4e120]:
      - generic [ref=f4e121]: task-003 Other project
      - generic [ref=f4e122]: 0/0 completed
      - button "Open project" [ref=f4e123] [cursor=pointer]
      - button "Archive project" [ref=f4e124] [cursor=pointer]
    - article [ref=f4e125]:
      - generic [ref=f4e126]: task-003 Task filters
      - generic [ref=f4e127]: 0/2 completed
      - button "Open project" [ref=f4e128] [cursor=pointer]
      - button "Archive project" [ref=f4e129] [cursor=pointer]
    - article [ref=f4e130]:
      - generic [ref=f4e131]: task-003 Archive lifecycle
      - generic [ref=f4e132]: 0/0 completed
      - button "Open project" [ref=f4e133] [cursor=pointer]
      - button "Archive project" [ref=f4e134] [cursor=pointer]
    - article [ref=f4e135]:
      - generic [ref=f4e136]: task-003 Archive tasks
      - generic [ref=f4e137]: 1/1 completed
      - button "Open project" [ref=f4e138] [cursor=pointer]
      - button "Archive project" [ref=f4e139] [cursor=pointer]
    - article [ref=f4e140]:
      - generic [ref=f4e141]: task-001 Alpha create
      - generic [ref=f4e142]: 0/0 completed
      - button "Open project" [ref=f4e143] [cursor=pointer]
      - button "Archive project" [ref=f4e144] [cursor=pointer]
    - article [ref=f4e145]:
      - generic [ref=f4e146]: task-001 Blank validation sentinel
      - generic [ref=f4e147]: 0/0 completed
      - button "Open project" [ref=f4e148] [cursor=pointer]
      - button "Archive project" [ref=f4e149] [cursor=pointer]
    - article [ref=f4e150]:
      - generic [ref=f4e151]: task-001 Order first
      - generic [ref=f4e152]: 0/0 completed
      - button "Open project" [ref=f4e153] [cursor=pointer]
      - button "Archive project" [ref=f4e154] [cursor=pointer]
    - article [ref=f4e155]:
      - generic [ref=f4e156]: task-001 Order second
      - generic [ref=f4e157]: 0/0 completed
      - button "Open project" [ref=f4e158] [cursor=pointer]
      - button "Archive project" [ref=f4e159] [cursor=pointer]
    - article [ref=f4e160]:
      - generic [ref=f4e161]: task-001 Persistence sentinel
      - generic [ref=f4e162]: 0/0 completed
      - button "Open project" [ref=f4e163] [cursor=pointer]
      - button "Archive project" [ref=f4e164] [cursor=pointer]
    - article [ref=f4e165]:
      - generic [ref=f4e166]: task-002 Alpha create
      - generic [ref=f4e167]: 0/0 completed
      - button "Open project" [ref=f4e168] [cursor=pointer]
      - button "Archive project" [ref=f4e169] [cursor=pointer]
    - article [ref=f4e170]:
      - generic [ref=f4e171]: task-002 Blank validation sentinel
      - generic [ref=f4e172]: 0/0 completed
      - button "Open project" [ref=f4e173] [cursor=pointer]
      - button "Archive project" [ref=f4e174] [cursor=pointer]
    - article [ref=f4e175]:
      - generic [ref=f4e176]: task-002 Order first
      - generic [ref=f4e177]: 0/0 completed
      - button "Open project" [ref=f4e178] [cursor=pointer]
      - button "Archive project" [ref=f4e179] [cursor=pointer]
    - article [ref=f4e180]:
      - generic [ref=f4e181]: task-002 Order second
      - generic [ref=f4e182]: 0/0 completed
      - button "Open project" [ref=f4e183] [cursor=pointer]
      - button "Archive project" [ref=f4e184] [cursor=pointer]
    - article [ref=f4e185]:
      - generic [ref=f4e186]: task-002 Task reload
      - generic [ref=f4e187]: 0/1 completed
      - button "Open project" [ref=f4e188] [cursor=pointer]
      - button "Archive project" [ref=f4e189] [cursor=pointer]
    - article [ref=f4e190]:
      - generic [ref=f4e191]: task-002 Task invalid
      - generic [ref=f4e192]: 0/0 completed
      - button "Open project" [ref=f4e193] [cursor=pointer]
      - button "Archive project" [ref=f4e194] [cursor=pointer]
    - article [ref=f4e195]:
      - generic [ref=f4e196]: task-002 Task owner
      - generic [ref=f4e197]: 0/1 completed
      - button "Open project" [ref=f4e198] [cursor=pointer]
      - button "Archive project" [ref=f4e199] [cursor=pointer]
    - article [ref=f4e200]:
      - generic [ref=f4e201]: task-002 Other project
      - generic [ref=f4e202]: 0/0 completed
      - button "Open project" [ref=f4e203] [cursor=pointer]
      - button "Archive project" [ref=f4e204] [cursor=pointer]
    - article [ref=f4e205]:
      - generic [ref=f4e206]: task-002 Task filters
      - generic [ref=f4e207]: 0/2 completed
      - button "Open project" [ref=f4e208] [cursor=pointer]
      - button "Archive project" [ref=f4e209] [cursor=pointer]
    - article [ref=f4e210]:
      - generic [ref=f4e211]: task-002 Persistence sentinel
      - generic [ref=f4e212]: 1/1 completed
      - button "Open project" [ref=f4e213] [cursor=pointer]
      - button "Archive project" [ref=f4e214] [cursor=pointer]
    - article [ref=f4e215]:
      - generic [ref=f4e216]: task-003 Alpha create
      - generic [ref=f4e217]: 0/0 completed
      - button "Open project" [ref=f4e218] [cursor=pointer]
      - button "Archive project" [ref=f4e219] [cursor=pointer]
    - article [ref=f4e220]:
      - generic [ref=f4e221]: task-003 Blank validation sentinel
      - generic [ref=f4e222]: 0/0 completed
      - button "Open project" [ref=f4e223] [cursor=pointer]
      - button "Archive project" [ref=f4e224] [cursor=pointer]
    - article [ref=f4e225]:
      - generic [ref=f4e226]: task-003 Order first
      - generic [ref=f4e227]: 0/0 completed
      - button "Open project" [ref=f4e228] [cursor=pointer]
      - button "Archive project" [ref=f4e229] [cursor=pointer]
    - article [ref=f4e230]:
      - generic [ref=f4e231]: task-003 Order second
      - generic [ref=f4e232]: 0/0 completed
      - button "Open project" [ref=f4e233] [cursor=pointer]
      - button "Archive project" [ref=f4e234] [cursor=pointer]
    - article [ref=f4e235]:
      - generic [ref=f4e236]: task-003 Task reload
      - generic [ref=f4e237]: 0/1 completed
      - button "Open project" [ref=f4e238] [cursor=pointer]
      - button "Archive project" [ref=f4e239] [cursor=pointer]
    - article [ref=f4e240]:
      - generic [ref=f4e241]: task-003 Task invalid
      - generic [ref=f4e242]: 0/0 completed
      - button "Open project" [ref=f4e243] [cursor=pointer]
      - button "Archive project" [ref=f4e244] [cursor=pointer]
    - article [ref=f4e245]:
      - generic [ref=f4e246]: task-003 Task owner
      - generic [ref=f4e247]: 0/1 completed
      - button "Open project" [ref=f4e248] [cursor=pointer]
      - button "Archive project" [ref=f4e249] [cursor=pointer]
    - article [ref=f4e250]:
      - generic [ref=f4e251]: task-003 Other project
      - generic [ref=f4e252]: 0/0 completed
      - button "Open project" [ref=f4e253] [cursor=pointer]
      - button "Archive project" [ref=f4e254] [cursor=pointer]
    - article [ref=f4e255]:
      - generic [ref=f4e256]: task-003 Task filters
      - generic [ref=f4e257]: 0/2 completed
      - button "Open project" [ref=f4e258] [cursor=pointer]
      - button "Archive project" [ref=f4e259] [cursor=pointer]
    - article [ref=f4e260]:
      - generic [ref=f4e261]: task-003 Archive lifecycle
      - generic [ref=f4e262]: 0/0 completed
      - button "Open project" [ref=f4e263] [cursor=pointer]
      - button "Archive project" [ref=f4e264] [cursor=pointer]
    - article [ref=f4e265]:
      - generic [ref=f4e266]: task-003 Archive tasks
      - generic [ref=f4e267]: 1/1 completed
      - button "Open project" [ref=f4e268] [cursor=pointer]
      - button "Archive project" [ref=f4e269] [cursor=pointer]
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