# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/eval-003/definitions/project/acceptance/workboard.spec.mjs:114:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button type="button">Open project</button> aka locator('div:nth-child(26) > button').first()
    2) <button type="button">Open project</button> aka locator('div:nth-child(52) > button').first()

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=f4e2]:
  - link "Workboard" [ref=f4e4] [cursor=pointer]:
    - /url: /
  - generic [ref=f4e5]:
    - heading "Workboard" [level=1] [ref=f4e6]
    - generic [ref=f4e7]:
      - generic [ref=f4e8]:
        - text: Project name
        - textbox "Project name" [ref=f4e9]
      - button "Create project" [ref=f4e10] [cursor=pointer]
    - generic [ref=f4e11]:
      - text: Project filter
      - combobox "Project filter" [ref=f4e12]:
        - option "Active" [selected]
        - option "Archived"
    - generic [ref=f4e13]:
      - generic [ref=f4e14]:
        - generic [ref=f4e15]: task-001 Alpha create
        - generic [ref=f4e16]: 0/0 completed
        - button "Open project" [ref=f4e17] [cursor=pointer]
        - button "Archive project" [ref=f4e18] [cursor=pointer]
      - generic [ref=f4e19]:
        - generic [ref=f4e20]: task-001 Blank validation sentinel
        - generic [ref=f4e21]: 0/0 completed
        - button "Open project" [ref=f4e22] [cursor=pointer]
        - button "Archive project" [ref=f4e23] [cursor=pointer]
      - generic [ref=f4e24]:
        - generic [ref=f4e25]: task-001 Order first
        - generic [ref=f4e26]: 0/0 completed
        - button "Open project" [ref=f4e27] [cursor=pointer]
        - button "Archive project" [ref=f4e28] [cursor=pointer]
      - generic [ref=f4e29]:
        - generic [ref=f4e30]: task-001 Order second
        - generic [ref=f4e31]: 0/0 completed
        - button "Open project" [ref=f4e32] [cursor=pointer]
        - button "Archive project" [ref=f4e33] [cursor=pointer]
      - generic [ref=f4e34]:
        - generic [ref=f4e35]: task-001 Persistence sentinel
        - generic [ref=f4e36]: 0/0 completed
        - button "Open project" [ref=f4e37] [cursor=pointer]
        - button "Archive project" [ref=f4e38] [cursor=pointer]
      - generic [ref=f4e39]:
        - generic [ref=f4e40]: task-002 Alpha create
        - generic [ref=f4e41]: 0/0 completed
        - button "Open project" [ref=f4e42] [cursor=pointer]
        - button "Archive project" [ref=f4e43] [cursor=pointer]
      - generic [ref=f4e44]:
        - generic [ref=f4e45]: task-002 Blank validation sentinel
        - generic [ref=f4e46]: 0/0 completed
        - button "Open project" [ref=f4e47] [cursor=pointer]
        - button "Archive project" [ref=f4e48] [cursor=pointer]
      - generic [ref=f4e49]:
        - generic [ref=f4e50]: task-002 Order first
        - generic [ref=f4e51]: 0/0 completed
        - button "Open project" [ref=f4e52] [cursor=pointer]
        - button "Archive project" [ref=f4e53] [cursor=pointer]
      - generic [ref=f4e54]:
        - generic [ref=f4e55]: task-002 Order second
        - generic [ref=f4e56]: 0/0 completed
        - button "Open project" [ref=f4e57] [cursor=pointer]
        - button "Archive project" [ref=f4e58] [cursor=pointer]
      - generic [ref=f4e59]:
        - generic [ref=f4e60]: task-002 Task reload
        - generic [ref=f4e61]: 0/1 completed
        - button "Open project" [ref=f4e62] [cursor=pointer]
        - button "Archive project" [ref=f4e63] [cursor=pointer]
      - generic [ref=f4e64]:
        - generic [ref=f4e65]: task-002 Task invalid
        - generic [ref=f4e66]: 0/0 completed
        - button "Open project" [ref=f4e67] [cursor=pointer]
        - button "Archive project" [ref=f4e68] [cursor=pointer]
      - generic [ref=f4e69]:
        - generic [ref=f4e70]: task-002 Task owner
        - generic [ref=f4e71]: 0/1 completed
        - button "Open project" [ref=f4e72] [cursor=pointer]
        - button "Archive project" [ref=f4e73] [cursor=pointer]
      - generic [ref=f4e74]:
        - generic [ref=f4e75]: task-002 Other project
        - generic [ref=f4e76]: 0/0 completed
        - button "Open project" [ref=f4e77] [cursor=pointer]
        - button "Archive project" [ref=f4e78] [cursor=pointer]
      - generic [ref=f4e79]:
        - generic [ref=f4e80]: task-002 Task filters
        - generic [ref=f4e81]: 0/2 completed
        - button "Open project" [ref=f4e82] [cursor=pointer]
        - button "Archive project" [ref=f4e83] [cursor=pointer]
      - generic [ref=f4e84]:
        - generic [ref=f4e85]: task-002 Persistence sentinel
        - generic [ref=f4e86]: 1/1 completed
        - button "Open project" [ref=f4e87] [cursor=pointer]
        - button "Archive project" [ref=f4e88] [cursor=pointer]
      - generic [ref=f4e89]:
        - generic [ref=f4e90]: task-003 Alpha create
        - generic [ref=f4e91]: 0/0 completed
        - button "Open project" [ref=f4e92] [cursor=pointer]
        - button "Archive project" [ref=f4e93] [cursor=pointer]
      - generic [ref=f4e94]:
        - generic [ref=f4e95]: task-003 Blank validation sentinel
        - generic [ref=f4e96]: 0/0 completed
        - button "Open project" [ref=f4e97] [cursor=pointer]
        - button "Archive project" [ref=f4e98] [cursor=pointer]
      - generic [ref=f4e99]:
        - generic [ref=f4e100]: task-003 Order first
        - generic [ref=f4e101]: 0/0 completed
        - button "Open project" [ref=f4e102] [cursor=pointer]
        - button "Archive project" [ref=f4e103] [cursor=pointer]
      - generic [ref=f4e104]:
        - generic [ref=f4e105]: task-003 Order second
        - generic [ref=f4e106]: 0/0 completed
        - button "Open project" [ref=f4e107] [cursor=pointer]
        - button "Archive project" [ref=f4e108] [cursor=pointer]
      - generic [ref=f4e109]:
        - generic [ref=f4e110]: task-003 Task reload
        - generic [ref=f4e111]: 0/1 completed
        - button "Open project" [ref=f4e112] [cursor=pointer]
        - button "Archive project" [ref=f4e113] [cursor=pointer]
      - generic [ref=f4e114]:
        - generic [ref=f4e115]: task-003 Task invalid
        - generic [ref=f4e116]: 0/0 completed
        - button "Open project" [ref=f4e117] [cursor=pointer]
        - button "Archive project" [ref=f4e118] [cursor=pointer]
      - generic [ref=f4e119]:
        - generic [ref=f4e120]: task-003 Task owner
        - generic [ref=f4e121]: 0/1 completed
        - button "Open project" [ref=f4e122] [cursor=pointer]
        - button "Archive project" [ref=f4e123] [cursor=pointer]
      - generic [ref=f4e124]:
        - generic [ref=f4e125]: task-003 Other project
        - generic [ref=f4e126]: 0/0 completed
        - button "Open project" [ref=f4e127] [cursor=pointer]
        - button "Archive project" [ref=f4e128] [cursor=pointer]
      - generic [ref=f4e129]:
        - generic [ref=f4e130]: task-003 Task filters
        - generic [ref=f4e131]: 0/2 completed
        - button "Open project" [ref=f4e132] [cursor=pointer]
        - button "Archive project" [ref=f4e133] [cursor=pointer]
      - generic [ref=f4e134]:
        - generic [ref=f4e135]: task-003 Archive lifecycle
        - generic [ref=f4e136]: 0/0 completed
        - button "Open project" [ref=f4e137] [cursor=pointer]
        - button "Archive project" [ref=f4e138] [cursor=pointer]
      - generic [ref=f4e139]:
        - generic [ref=f4e140]: task-003 Archive tasks
        - generic [ref=f4e141]: 1/1 completed
        - button "Open project" [ref=f4e142] [cursor=pointer]
        - button "Archive project" [ref=f4e143] [cursor=pointer]
      - generic [ref=f4e144]:
        - generic [ref=f4e145]: task-001 Alpha create
        - generic [ref=f4e146]: 0/0 completed
        - button "Open project" [ref=f4e147] [cursor=pointer]
        - button "Archive project" [ref=f4e148] [cursor=pointer]
      - generic [ref=f4e149]:
        - generic [ref=f4e150]: task-001 Blank validation sentinel
        - generic [ref=f4e151]: 0/0 completed
        - button "Open project" [ref=f4e152] [cursor=pointer]
        - button "Archive project" [ref=f4e153] [cursor=pointer]
      - generic [ref=f4e154]:
        - generic [ref=f4e155]: task-001 Order first
        - generic [ref=f4e156]: 0/0 completed
        - button "Open project" [ref=f4e157] [cursor=pointer]
        - button "Archive project" [ref=f4e158] [cursor=pointer]
      - generic [ref=f4e159]:
        - generic [ref=f4e160]: task-001 Order second
        - generic [ref=f4e161]: 0/0 completed
        - button "Open project" [ref=f4e162] [cursor=pointer]
        - button "Archive project" [ref=f4e163] [cursor=pointer]
      - generic [ref=f4e164]:
        - generic [ref=f4e165]: task-001 Persistence sentinel
        - generic [ref=f4e166]: 0/0 completed
        - button "Open project" [ref=f4e167] [cursor=pointer]
        - button "Archive project" [ref=f4e168] [cursor=pointer]
      - generic [ref=f4e169]:
        - generic [ref=f4e170]: task-002 Alpha create
        - generic [ref=f4e171]: 0/0 completed
        - button "Open project" [ref=f4e172] [cursor=pointer]
        - button "Archive project" [ref=f4e173] [cursor=pointer]
      - generic [ref=f4e174]:
        - generic [ref=f4e175]: task-002 Blank validation sentinel
        - generic [ref=f4e176]: 0/0 completed
        - button "Open project" [ref=f4e177] [cursor=pointer]
        - button "Archive project" [ref=f4e178] [cursor=pointer]
      - generic [ref=f4e179]:
        - generic [ref=f4e180]: task-002 Order first
        - generic [ref=f4e181]: 0/0 completed
        - button "Open project" [ref=f4e182] [cursor=pointer]
        - button "Archive project" [ref=f4e183] [cursor=pointer]
      - generic [ref=f4e184]:
        - generic [ref=f4e185]: task-002 Order second
        - generic [ref=f4e186]: 0/0 completed
        - button "Open project" [ref=f4e187] [cursor=pointer]
        - button "Archive project" [ref=f4e188] [cursor=pointer]
      - generic [ref=f4e189]:
        - generic [ref=f4e190]: task-002 Task reload
        - generic [ref=f4e191]: 0/1 completed
        - button "Open project" [ref=f4e192] [cursor=pointer]
        - button "Archive project" [ref=f4e193] [cursor=pointer]
      - generic [ref=f4e194]:
        - generic [ref=f4e195]: task-002 Task invalid
        - generic [ref=f4e196]: 0/0 completed
        - button "Open project" [ref=f4e197] [cursor=pointer]
        - button "Archive project" [ref=f4e198] [cursor=pointer]
      - generic [ref=f4e199]:
        - generic [ref=f4e200]: task-002 Task owner
        - generic [ref=f4e201]: 0/1 completed
        - button "Open project" [ref=f4e202] [cursor=pointer]
        - button "Archive project" [ref=f4e203] [cursor=pointer]
      - generic [ref=f4e204]:
        - generic [ref=f4e205]: task-002 Other project
        - generic [ref=f4e206]: 0/0 completed
        - button "Open project" [ref=f4e207] [cursor=pointer]
        - button "Archive project" [ref=f4e208] [cursor=pointer]
      - generic [ref=f4e209]:
        - generic [ref=f4e210]: task-002 Task filters
        - generic [ref=f4e211]: 0/2 completed
        - button "Open project" [ref=f4e212] [cursor=pointer]
        - button "Archive project" [ref=f4e213] [cursor=pointer]
      - generic [ref=f4e214]:
        - generic [ref=f4e215]: task-002 Persistence sentinel
        - generic [ref=f4e216]: 1/1 completed
        - button "Open project" [ref=f4e217] [cursor=pointer]
        - button "Archive project" [ref=f4e218] [cursor=pointer]
      - generic [ref=f4e219]:
        - generic [ref=f4e220]: task-003 Alpha create
        - generic [ref=f4e221]: 0/0 completed
        - button "Open project" [ref=f4e222] [cursor=pointer]
        - button "Archive project" [ref=f4e223] [cursor=pointer]
      - generic [ref=f4e224]:
        - generic [ref=f4e225]: task-003 Blank validation sentinel
        - generic [ref=f4e226]: 0/0 completed
        - button "Open project" [ref=f4e227] [cursor=pointer]
        - button "Archive project" [ref=f4e228] [cursor=pointer]
      - generic [ref=f4e229]:
        - generic [ref=f4e230]: task-003 Order first
        - generic [ref=f4e231]: 0/0 completed
        - button "Open project" [ref=f4e232] [cursor=pointer]
        - button "Archive project" [ref=f4e233] [cursor=pointer]
      - generic [ref=f4e234]:
        - generic [ref=f4e235]: task-003 Order second
        - generic [ref=f4e236]: 0/0 completed
        - button "Open project" [ref=f4e237] [cursor=pointer]
        - button "Archive project" [ref=f4e238] [cursor=pointer]
      - generic [ref=f4e239]:
        - generic [ref=f4e240]: task-003 Task reload
        - generic [ref=f4e241]: 0/1 completed
        - button "Open project" [ref=f4e242] [cursor=pointer]
        - button "Archive project" [ref=f4e243] [cursor=pointer]
      - generic [ref=f4e244]:
        - generic [ref=f4e245]: task-003 Task invalid
        - generic [ref=f4e246]: 0/0 completed
        - button "Open project" [ref=f4e247] [cursor=pointer]
        - button "Archive project" [ref=f4e248] [cursor=pointer]
      - generic [ref=f4e249]:
        - generic [ref=f4e250]: task-003 Task owner
        - generic [ref=f4e251]: 0/1 completed
        - button "Open project" [ref=f4e252] [cursor=pointer]
        - button "Archive project" [ref=f4e253] [cursor=pointer]
      - generic [ref=f4e254]:
        - generic [ref=f4e255]: task-003 Other project
        - generic [ref=f4e256]: 0/0 completed
        - button "Open project" [ref=f4e257] [cursor=pointer]
        - button "Archive project" [ref=f4e258] [cursor=pointer]
      - generic [ref=f4e259]:
        - generic [ref=f4e260]: task-003 Task filters
        - generic [ref=f4e261]: 0/2 completed
        - button "Open project" [ref=f4e262] [cursor=pointer]
        - button "Archive project" [ref=f4e263] [cursor=pointer]
      - generic [ref=f4e264]:
        - generic [ref=f4e265]: task-003 Archive lifecycle
        - generic [ref=f4e266]: 0/0 completed
        - button "Open project" [ref=f4e267] [cursor=pointer]
        - button "Archive project" [ref=f4e268] [cursor=pointer]
      - generic [ref=f4e269]:
        - generic [ref=f4e270]: task-003 Archive tasks
        - generic [ref=f4e271]: 1/1 completed
        - button "Open project" [ref=f4e272] [cursor=pointer]
        - button "Archive project" [ref=f4e273] [cursor=pointer]
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