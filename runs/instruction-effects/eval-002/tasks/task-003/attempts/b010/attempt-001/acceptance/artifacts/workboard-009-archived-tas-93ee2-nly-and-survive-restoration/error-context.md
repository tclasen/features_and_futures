# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/eval-002/definitions/project/acceptance/workboard.spec.mjs:114:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button type="button">Open project</button> aka locator('section:nth-child(29) > button').first()
    2) <button type="button">Open project</button> aka locator('section:nth-child(55) > button').first()

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Workboard" [level=1] [ref=e3]
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: Project name
      - textbox "Project name" [ref=e7]
    - button "Create project" [ref=e8] [cursor=pointer]
  - generic [ref=e9]:
    - generic [ref=e10]: Project filter
    - combobox "Project filter" [ref=e11]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=e12]:
    - generic [ref=e13]: task-001 Alpha create
    - generic [ref=e14]: 0/0 completed
    - button "Open project" [ref=e15] [cursor=pointer]
    - button "Archive project" [ref=e16] [cursor=pointer]
  - generic [ref=e17]:
    - generic [ref=e18]: task-001 Blank validation sentinel
    - generic [ref=e19]: 0/0 completed
    - button "Open project" [ref=e20] [cursor=pointer]
    - button "Archive project" [ref=e21] [cursor=pointer]
  - generic [ref=e22]:
    - generic [ref=e23]: task-001 Order first
    - generic [ref=e24]: 0/0 completed
    - button "Open project" [ref=e25] [cursor=pointer]
    - button "Archive project" [ref=e26] [cursor=pointer]
  - generic [ref=e27]:
    - generic [ref=e28]: task-001 Order second
    - generic [ref=e29]: 0/0 completed
    - button "Open project" [ref=e30] [cursor=pointer]
    - button "Archive project" [ref=e31] [cursor=pointer]
  - generic [ref=e32]:
    - generic [ref=e33]: task-001 Persistence sentinel
    - generic [ref=e34]: 0/0 completed
    - button "Open project" [ref=e35] [cursor=pointer]
    - button "Archive project" [ref=e36] [cursor=pointer]
  - generic [ref=e37]:
    - generic [ref=e38]: task-002 Alpha create
    - generic [ref=e39]: 0/0 completed
    - button "Open project" [ref=e40] [cursor=pointer]
    - button "Archive project" [ref=e41] [cursor=pointer]
  - generic [ref=e42]:
    - generic [ref=e43]: task-002 Blank validation sentinel
    - generic [ref=e44]: 0/0 completed
    - button "Open project" [ref=e45] [cursor=pointer]
    - button "Archive project" [ref=e46] [cursor=pointer]
  - generic [ref=e47]:
    - generic [ref=e48]: task-002 Order first
    - generic [ref=e49]: 0/0 completed
    - button "Open project" [ref=e50] [cursor=pointer]
    - button "Archive project" [ref=e51] [cursor=pointer]
  - generic [ref=e52]:
    - generic [ref=e53]: task-002 Order second
    - generic [ref=e54]: 0/0 completed
    - button "Open project" [ref=e55] [cursor=pointer]
    - button "Archive project" [ref=e56] [cursor=pointer]
  - generic [ref=e57]:
    - generic [ref=e58]: task-002 Task reload
    - generic [ref=e59]: 0/1 completed
    - button "Open project" [ref=e60] [cursor=pointer]
    - button "Archive project" [ref=e61] [cursor=pointer]
  - generic [ref=e62]:
    - generic [ref=e63]: task-002 Task invalid
    - generic [ref=e64]: 0/0 completed
    - button "Open project" [ref=e65] [cursor=pointer]
    - button "Archive project" [ref=e66] [cursor=pointer]
  - generic [ref=e67]:
    - generic [ref=e68]: task-002 Task owner
    - generic [ref=e69]: 0/1 completed
    - button "Open project" [ref=e70] [cursor=pointer]
    - button "Archive project" [ref=e71] [cursor=pointer]
  - generic [ref=e72]:
    - generic [ref=e73]: task-002 Other project
    - generic [ref=e74]: 0/0 completed
    - button "Open project" [ref=e75] [cursor=pointer]
    - button "Archive project" [ref=e76] [cursor=pointer]
  - generic [ref=e77]:
    - generic [ref=e78]: task-002 Task filters
    - generic [ref=e79]: 0/2 completed
    - button "Open project" [ref=e80] [cursor=pointer]
    - button "Archive project" [ref=e81] [cursor=pointer]
  - generic [ref=e82]:
    - generic [ref=e83]: task-002 Persistence sentinel
    - generic [ref=e84]: 1/1 completed
    - button "Open project" [ref=e85] [cursor=pointer]
    - button "Archive project" [ref=e86] [cursor=pointer]
  - generic [ref=e87]:
    - generic [ref=e88]: task-003 Alpha create
    - generic [ref=e89]: 0/0 completed
    - button "Open project" [ref=e90] [cursor=pointer]
    - button "Archive project" [ref=e91] [cursor=pointer]
  - generic [ref=e92]:
    - generic [ref=e93]: task-003 Blank validation sentinel
    - generic [ref=e94]: 0/0 completed
    - button "Open project" [ref=e95] [cursor=pointer]
    - button "Archive project" [ref=e96] [cursor=pointer]
  - generic [ref=e97]:
    - generic [ref=e98]: task-003 Order first
    - generic [ref=e99]: 0/0 completed
    - button "Open project" [ref=e100] [cursor=pointer]
    - button "Archive project" [ref=e101] [cursor=pointer]
  - generic [ref=e102]:
    - generic [ref=e103]: task-003 Order second
    - generic [ref=e104]: 0/0 completed
    - button "Open project" [ref=e105] [cursor=pointer]
    - button "Archive project" [ref=e106] [cursor=pointer]
  - generic [ref=e107]:
    - generic [ref=e108]: task-003 Task reload
    - generic [ref=e109]: 0/1 completed
    - button "Open project" [ref=e110] [cursor=pointer]
    - button "Archive project" [ref=e111] [cursor=pointer]
  - generic [ref=e112]:
    - generic [ref=e113]: task-003 Task invalid
    - generic [ref=e114]: 0/0 completed
    - button "Open project" [ref=e115] [cursor=pointer]
    - button "Archive project" [ref=e116] [cursor=pointer]
  - generic [ref=e117]:
    - generic [ref=e118]: task-003 Task owner
    - generic [ref=e119]: 0/1 completed
    - button "Open project" [ref=e120] [cursor=pointer]
    - button "Archive project" [ref=e121] [cursor=pointer]
  - generic [ref=e122]:
    - generic [ref=e123]: task-003 Other project
    - generic [ref=e124]: 0/0 completed
    - button "Open project" [ref=e125] [cursor=pointer]
    - button "Archive project" [ref=e126] [cursor=pointer]
  - generic [ref=e127]:
    - generic [ref=e128]: task-003 Task filters
    - generic [ref=e129]: 0/2 completed
    - button "Open project" [ref=e130] [cursor=pointer]
    - button "Archive project" [ref=e131] [cursor=pointer]
  - generic [ref=e132]:
    - generic [ref=e133]: task-003 Archive lifecycle
    - generic [ref=e134]: 0/0 completed
    - button "Open project" [ref=e135] [cursor=pointer]
    - button "Archive project" [ref=e136] [cursor=pointer]
  - generic [ref=e137]:
    - generic [ref=e138]: task-003 Archive tasks
    - generic [ref=e139]: 1/1 completed
    - button "Open project" [ref=e140] [cursor=pointer]
    - button "Archive project" [ref=e141] [cursor=pointer]
  - generic [ref=e142]:
    - generic [ref=e143]: task-001 Alpha create
    - generic [ref=e144]: 0/0 completed
    - button "Open project" [ref=e145] [cursor=pointer]
    - button "Archive project" [ref=e146] [cursor=pointer]
  - generic [ref=e147]:
    - generic [ref=e148]: task-001 Blank validation sentinel
    - generic [ref=e149]: 0/0 completed
    - button "Open project" [ref=e150] [cursor=pointer]
    - button "Archive project" [ref=e151] [cursor=pointer]
  - generic [ref=e152]:
    - generic [ref=e153]: task-001 Order first
    - generic [ref=e154]: 0/0 completed
    - button "Open project" [ref=e155] [cursor=pointer]
    - button "Archive project" [ref=e156] [cursor=pointer]
  - generic [ref=e157]:
    - generic [ref=e158]: task-001 Order second
    - generic [ref=e159]: 0/0 completed
    - button "Open project" [ref=e160] [cursor=pointer]
    - button "Archive project" [ref=e161] [cursor=pointer]
  - generic [ref=e162]:
    - generic [ref=e163]: task-001 Persistence sentinel
    - generic [ref=e164]: 0/0 completed
    - button "Open project" [ref=e165] [cursor=pointer]
    - button "Archive project" [ref=e166] [cursor=pointer]
  - generic [ref=e167]:
    - generic [ref=e168]: task-002 Alpha create
    - generic [ref=e169]: 0/0 completed
    - button "Open project" [ref=e170] [cursor=pointer]
    - button "Archive project" [ref=e171] [cursor=pointer]
  - generic [ref=e172]:
    - generic [ref=e173]: task-002 Blank validation sentinel
    - generic [ref=e174]: 0/0 completed
    - button "Open project" [ref=e175] [cursor=pointer]
    - button "Archive project" [ref=e176] [cursor=pointer]
  - generic [ref=e177]:
    - generic [ref=e178]: task-002 Order first
    - generic [ref=e179]: 0/0 completed
    - button "Open project" [ref=e180] [cursor=pointer]
    - button "Archive project" [ref=e181] [cursor=pointer]
  - generic [ref=e182]:
    - generic [ref=e183]: task-002 Order second
    - generic [ref=e184]: 0/0 completed
    - button "Open project" [ref=e185] [cursor=pointer]
    - button "Archive project" [ref=e186] [cursor=pointer]
  - generic [ref=e187]:
    - generic [ref=e188]: task-002 Task reload
    - generic [ref=e189]: 0/1 completed
    - button "Open project" [ref=e190] [cursor=pointer]
    - button "Archive project" [ref=e191] [cursor=pointer]
  - generic [ref=e192]:
    - generic [ref=e193]: task-002 Task invalid
    - generic [ref=e194]: 0/0 completed
    - button "Open project" [ref=e195] [cursor=pointer]
    - button "Archive project" [ref=e196] [cursor=pointer]
  - generic [ref=e197]:
    - generic [ref=e198]: task-002 Task owner
    - generic [ref=e199]: 0/1 completed
    - button "Open project" [ref=e200] [cursor=pointer]
    - button "Archive project" [ref=e201] [cursor=pointer]
  - generic [ref=e202]:
    - generic [ref=e203]: task-002 Other project
    - generic [ref=e204]: 0/0 completed
    - button "Open project" [ref=e205] [cursor=pointer]
    - button "Archive project" [ref=e206] [cursor=pointer]
  - generic [ref=e207]:
    - generic [ref=e208]: task-002 Task filters
    - generic [ref=e209]: 0/2 completed
    - button "Open project" [ref=e210] [cursor=pointer]
    - button "Archive project" [ref=e211] [cursor=pointer]
  - generic [ref=e212]:
    - generic [ref=e213]: task-002 Persistence sentinel
    - generic [ref=e214]: 1/1 completed
    - button "Open project" [ref=e215] [cursor=pointer]
    - button "Archive project" [ref=e216] [cursor=pointer]
  - generic [ref=e217]:
    - generic [ref=e218]: task-003 Alpha create
    - generic [ref=e219]: 0/0 completed
    - button "Open project" [ref=e220] [cursor=pointer]
    - button "Archive project" [ref=e221] [cursor=pointer]
  - generic [ref=e222]:
    - generic [ref=e223]: task-003 Blank validation sentinel
    - generic [ref=e224]: 0/0 completed
    - button "Open project" [ref=e225] [cursor=pointer]
    - button "Archive project" [ref=e226] [cursor=pointer]
  - generic [ref=e227]:
    - generic [ref=e228]: task-003 Order first
    - generic [ref=e229]: 0/0 completed
    - button "Open project" [ref=e230] [cursor=pointer]
    - button "Archive project" [ref=e231] [cursor=pointer]
  - generic [ref=e232]:
    - generic [ref=e233]: task-003 Order second
    - generic [ref=e234]: 0/0 completed
    - button "Open project" [ref=e235] [cursor=pointer]
    - button "Archive project" [ref=e236] [cursor=pointer]
  - generic [ref=e237]:
    - generic [ref=e238]: task-003 Task reload
    - generic [ref=e239]: 0/1 completed
    - button "Open project" [ref=e240] [cursor=pointer]
    - button "Archive project" [ref=e241] [cursor=pointer]
  - generic [ref=e242]:
    - generic [ref=e243]: task-003 Task invalid
    - generic [ref=e244]: 0/0 completed
    - button "Open project" [ref=e245] [cursor=pointer]
    - button "Archive project" [ref=e246] [cursor=pointer]
  - generic [ref=e247]:
    - generic [ref=e248]: task-003 Task owner
    - generic [ref=e249]: 0/1 completed
    - button "Open project" [ref=e250] [cursor=pointer]
    - button "Archive project" [ref=e251] [cursor=pointer]
  - generic [ref=e252]:
    - generic [ref=e253]: task-003 Other project
    - generic [ref=e254]: 0/0 completed
    - button "Open project" [ref=e255] [cursor=pointer]
    - button "Archive project" [ref=e256] [cursor=pointer]
  - generic [ref=e257]:
    - generic [ref=e258]: task-003 Task filters
    - generic [ref=e259]: 0/2 completed
    - button "Open project" [ref=e260] [cursor=pointer]
    - button "Archive project" [ref=e261] [cursor=pointer]
  - generic [ref=e262]:
    - generic [ref=e263]: task-003 Archive lifecycle
    - generic [ref=e264]: 0/0 completed
    - button "Open project" [ref=e265] [cursor=pointer]
    - button "Archive project" [ref=e266] [cursor=pointer]
  - generic [ref=e267]:
    - generic [ref=e268]: task-003 Archive tasks
    - generic [ref=e269]: 1/1 completed
    - button "Open project" [ref=e270] [cursor=pointer]
    - button "Archive project" [ref=e271] [cursor=pointer]
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