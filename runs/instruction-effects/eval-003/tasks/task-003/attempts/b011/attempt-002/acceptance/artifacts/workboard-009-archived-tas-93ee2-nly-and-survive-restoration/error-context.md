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
    1) <button type="button">Open project</button> aka locator('li:nth-child(26) > .project-actions > button').first()
    2) <button type="button">Open project</button> aka locator('li:nth-child(52) > .project-actions > button').first()

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
  - alert [ref=f4e8]
  - generic [ref=f4e9]: Project filter
  - combobox "Project filter" [ref=f4e10]:
    - option "Active" [selected]
    - option "Archived"
  - list [ref=f4e11]:
    - listitem [ref=f4e12]:
      - generic [ref=f4e13]: task-001 Alpha create
      - generic [ref=f4e14]: 0/0 completed
      - generic [ref=f4e15]:
        - button "Open project" [ref=f4e16] [cursor=pointer]
        - button "Archive project" [ref=f4e17] [cursor=pointer]
    - listitem [ref=f4e18]:
      - generic [ref=f4e19]: task-001 Blank validation sentinel
      - generic [ref=f4e20]: 0/0 completed
      - generic [ref=f4e21]:
        - button "Open project" [ref=f4e22] [cursor=pointer]
        - button "Archive project" [ref=f4e23] [cursor=pointer]
    - listitem [ref=f4e24]:
      - generic [ref=f4e25]: task-001 Order first
      - generic [ref=f4e26]: 0/0 completed
      - generic [ref=f4e27]:
        - button "Open project" [ref=f4e28] [cursor=pointer]
        - button "Archive project" [ref=f4e29] [cursor=pointer]
    - listitem [ref=f4e30]:
      - generic [ref=f4e31]: task-001 Order second
      - generic [ref=f4e32]: 0/0 completed
      - generic [ref=f4e33]:
        - button "Open project" [ref=f4e34] [cursor=pointer]
        - button "Archive project" [ref=f4e35] [cursor=pointer]
    - listitem [ref=f4e36]:
      - generic [ref=f4e37]: task-001 Persistence sentinel
      - generic [ref=f4e38]: 0/0 completed
      - generic [ref=f4e39]:
        - button "Open project" [ref=f4e40] [cursor=pointer]
        - button "Archive project" [ref=f4e41] [cursor=pointer]
    - listitem [ref=f4e42]:
      - generic [ref=f4e43]: task-002 Alpha create
      - generic [ref=f4e44]: 0/0 completed
      - generic [ref=f4e45]:
        - button "Open project" [ref=f4e46] [cursor=pointer]
        - button "Archive project" [ref=f4e47] [cursor=pointer]
    - listitem [ref=f4e48]:
      - generic [ref=f4e49]: task-002 Blank validation sentinel
      - generic [ref=f4e50]: 0/0 completed
      - generic [ref=f4e51]:
        - button "Open project" [ref=f4e52] [cursor=pointer]
        - button "Archive project" [ref=f4e53] [cursor=pointer]
    - listitem [ref=f4e54]:
      - generic [ref=f4e55]: task-002 Order first
      - generic [ref=f4e56]: 0/0 completed
      - generic [ref=f4e57]:
        - button "Open project" [ref=f4e58] [cursor=pointer]
        - button "Archive project" [ref=f4e59] [cursor=pointer]
    - listitem [ref=f4e60]:
      - generic [ref=f4e61]: task-002 Order second
      - generic [ref=f4e62]: 0/0 completed
      - generic [ref=f4e63]:
        - button "Open project" [ref=f4e64] [cursor=pointer]
        - button "Archive project" [ref=f4e65] [cursor=pointer]
    - listitem [ref=f4e66]:
      - generic [ref=f4e67]: task-002 Task reload
      - generic [ref=f4e68]: 0/1 completed
      - generic [ref=f4e69]:
        - button "Open project" [ref=f4e70] [cursor=pointer]
        - button "Archive project" [ref=f4e71] [cursor=pointer]
    - listitem [ref=f4e72]:
      - generic [ref=f4e73]: task-002 Task invalid
      - generic [ref=f4e74]: 0/0 completed
      - generic [ref=f4e75]:
        - button "Open project" [ref=f4e76] [cursor=pointer]
        - button "Archive project" [ref=f4e77] [cursor=pointer]
    - listitem [ref=f4e78]:
      - generic [ref=f4e79]: task-002 Task owner
      - generic [ref=f4e80]: 0/1 completed
      - generic [ref=f4e81]:
        - button "Open project" [ref=f4e82] [cursor=pointer]
        - button "Archive project" [ref=f4e83] [cursor=pointer]
    - listitem [ref=f4e84]:
      - generic [ref=f4e85]: task-002 Other project
      - generic [ref=f4e86]: 0/0 completed
      - generic [ref=f4e87]:
        - button "Open project" [ref=f4e88] [cursor=pointer]
        - button "Archive project" [ref=f4e89] [cursor=pointer]
    - listitem [ref=f4e90]:
      - generic [ref=f4e91]: task-002 Task filters
      - generic [ref=f4e92]: 0/2 completed
      - generic [ref=f4e93]:
        - button "Open project" [ref=f4e94] [cursor=pointer]
        - button "Archive project" [ref=f4e95] [cursor=pointer]
    - listitem [ref=f4e96]:
      - generic [ref=f4e97]: task-002 Persistence sentinel
      - generic [ref=f4e98]: 1/1 completed
      - generic [ref=f4e99]:
        - button "Open project" [ref=f4e100] [cursor=pointer]
        - button "Archive project" [ref=f4e101] [cursor=pointer]
    - listitem [ref=f4e102]:
      - generic [ref=f4e103]: task-003 Alpha create
      - generic [ref=f4e104]: 0/0 completed
      - generic [ref=f4e105]:
        - button "Open project" [ref=f4e106] [cursor=pointer]
        - button "Archive project" [ref=f4e107] [cursor=pointer]
    - listitem [ref=f4e108]:
      - generic [ref=f4e109]: task-003 Blank validation sentinel
      - generic [ref=f4e110]: 0/0 completed
      - generic [ref=f4e111]:
        - button "Open project" [ref=f4e112] [cursor=pointer]
        - button "Archive project" [ref=f4e113] [cursor=pointer]
    - listitem [ref=f4e114]:
      - generic [ref=f4e115]: task-003 Order first
      - generic [ref=f4e116]: 0/0 completed
      - generic [ref=f4e117]:
        - button "Open project" [ref=f4e118] [cursor=pointer]
        - button "Archive project" [ref=f4e119] [cursor=pointer]
    - listitem [ref=f4e120]:
      - generic [ref=f4e121]: task-003 Order second
      - generic [ref=f4e122]: 0/0 completed
      - generic [ref=f4e123]:
        - button "Open project" [ref=f4e124] [cursor=pointer]
        - button "Archive project" [ref=f4e125] [cursor=pointer]
    - listitem [ref=f4e126]:
      - generic [ref=f4e127]: task-003 Task reload
      - generic [ref=f4e128]: 0/1 completed
      - generic [ref=f4e129]:
        - button "Open project" [ref=f4e130] [cursor=pointer]
        - button "Archive project" [ref=f4e131] [cursor=pointer]
    - listitem [ref=f4e132]:
      - generic [ref=f4e133]: task-003 Task invalid
      - generic [ref=f4e134]: 0/0 completed
      - generic [ref=f4e135]:
        - button "Open project" [ref=f4e136] [cursor=pointer]
        - button "Archive project" [ref=f4e137] [cursor=pointer]
    - listitem [ref=f4e138]:
      - generic [ref=f4e139]: task-003 Task owner
      - generic [ref=f4e140]: 0/1 completed
      - generic [ref=f4e141]:
        - button "Open project" [ref=f4e142] [cursor=pointer]
        - button "Archive project" [ref=f4e143] [cursor=pointer]
    - listitem [ref=f4e144]:
      - generic [ref=f4e145]: task-003 Other project
      - generic [ref=f4e146]: 0/0 completed
      - generic [ref=f4e147]:
        - button "Open project" [ref=f4e148] [cursor=pointer]
        - button "Archive project" [ref=f4e149] [cursor=pointer]
    - listitem [ref=f4e150]:
      - generic [ref=f4e151]: task-003 Task filters
      - generic [ref=f4e152]: 0/2 completed
      - generic [ref=f4e153]:
        - button "Open project" [ref=f4e154] [cursor=pointer]
        - button "Archive project" [ref=f4e155] [cursor=pointer]
    - listitem [ref=f4e156]:
      - generic [ref=f4e157]: task-003 Archive lifecycle
      - generic [ref=f4e158]: 0/0 completed
      - generic [ref=f4e159]:
        - button "Open project" [ref=f4e160] [cursor=pointer]
        - button "Archive project" [ref=f4e161] [cursor=pointer]
    - listitem [ref=f4e162]:
      - generic [ref=f4e163]: task-003 Archive tasks
      - generic [ref=f4e164]: 1/1 completed
      - generic [ref=f4e165]:
        - button "Open project" [ref=f4e166] [cursor=pointer]
        - button "Archive project" [ref=f4e167] [cursor=pointer]
    - listitem [ref=f4e168]:
      - generic [ref=f4e169]: task-001 Alpha create
      - generic [ref=f4e170]: 0/0 completed
      - generic [ref=f4e171]:
        - button "Open project" [ref=f4e172] [cursor=pointer]
        - button "Archive project" [ref=f4e173] [cursor=pointer]
    - listitem [ref=f4e174]:
      - generic [ref=f4e175]: task-001 Blank validation sentinel
      - generic [ref=f4e176]: 0/0 completed
      - generic [ref=f4e177]:
        - button "Open project" [ref=f4e178] [cursor=pointer]
        - button "Archive project" [ref=f4e179] [cursor=pointer]
    - listitem [ref=f4e180]:
      - generic [ref=f4e181]: task-001 Order first
      - generic [ref=f4e182]: 0/0 completed
      - generic [ref=f4e183]:
        - button "Open project" [ref=f4e184] [cursor=pointer]
        - button "Archive project" [ref=f4e185] [cursor=pointer]
    - listitem [ref=f4e186]:
      - generic [ref=f4e187]: task-001 Order second
      - generic [ref=f4e188]: 0/0 completed
      - generic [ref=f4e189]:
        - button "Open project" [ref=f4e190] [cursor=pointer]
        - button "Archive project" [ref=f4e191] [cursor=pointer]
    - listitem [ref=f4e192]:
      - generic [ref=f4e193]: task-001 Persistence sentinel
      - generic [ref=f4e194]: 0/0 completed
      - generic [ref=f4e195]:
        - button "Open project" [ref=f4e196] [cursor=pointer]
        - button "Archive project" [ref=f4e197] [cursor=pointer]
    - listitem [ref=f4e198]:
      - generic [ref=f4e199]: task-002 Alpha create
      - generic [ref=f4e200]: 0/0 completed
      - generic [ref=f4e201]:
        - button "Open project" [ref=f4e202] [cursor=pointer]
        - button "Archive project" [ref=f4e203] [cursor=pointer]
    - listitem [ref=f4e204]:
      - generic [ref=f4e205]: task-002 Blank validation sentinel
      - generic [ref=f4e206]: 0/0 completed
      - generic [ref=f4e207]:
        - button "Open project" [ref=f4e208] [cursor=pointer]
        - button "Archive project" [ref=f4e209] [cursor=pointer]
    - listitem [ref=f4e210]:
      - generic [ref=f4e211]: task-002 Order first
      - generic [ref=f4e212]: 0/0 completed
      - generic [ref=f4e213]:
        - button "Open project" [ref=f4e214] [cursor=pointer]
        - button "Archive project" [ref=f4e215] [cursor=pointer]
    - listitem [ref=f4e216]:
      - generic [ref=f4e217]: task-002 Order second
      - generic [ref=f4e218]: 0/0 completed
      - generic [ref=f4e219]:
        - button "Open project" [ref=f4e220] [cursor=pointer]
        - button "Archive project" [ref=f4e221] [cursor=pointer]
    - listitem [ref=f4e222]:
      - generic [ref=f4e223]: task-002 Task reload
      - generic [ref=f4e224]: 0/1 completed
      - generic [ref=f4e225]:
        - button "Open project" [ref=f4e226] [cursor=pointer]
        - button "Archive project" [ref=f4e227] [cursor=pointer]
    - listitem [ref=f4e228]:
      - generic [ref=f4e229]: task-002 Task invalid
      - generic [ref=f4e230]: 0/0 completed
      - generic [ref=f4e231]:
        - button "Open project" [ref=f4e232] [cursor=pointer]
        - button "Archive project" [ref=f4e233] [cursor=pointer]
    - listitem [ref=f4e234]:
      - generic [ref=f4e235]: task-002 Task owner
      - generic [ref=f4e236]: 0/1 completed
      - generic [ref=f4e237]:
        - button "Open project" [ref=f4e238] [cursor=pointer]
        - button "Archive project" [ref=f4e239] [cursor=pointer]
    - listitem [ref=f4e240]:
      - generic [ref=f4e241]: task-002 Other project
      - generic [ref=f4e242]: 0/0 completed
      - generic [ref=f4e243]:
        - button "Open project" [ref=f4e244] [cursor=pointer]
        - button "Archive project" [ref=f4e245] [cursor=pointer]
    - listitem [ref=f4e246]:
      - generic [ref=f4e247]: task-002 Task filters
      - generic [ref=f4e248]: 0/2 completed
      - generic [ref=f4e249]:
        - button "Open project" [ref=f4e250] [cursor=pointer]
        - button "Archive project" [ref=f4e251] [cursor=pointer]
    - listitem [ref=f4e252]:
      - generic [ref=f4e253]: task-002 Persistence sentinel
      - generic [ref=f4e254]: 1/1 completed
      - generic [ref=f4e255]:
        - button "Open project" [ref=f4e256] [cursor=pointer]
        - button "Archive project" [ref=f4e257] [cursor=pointer]
    - listitem [ref=f4e258]:
      - generic [ref=f4e259]: task-003 Alpha create
      - generic [ref=f4e260]: 0/0 completed
      - generic [ref=f4e261]:
        - button "Open project" [ref=f4e262] [cursor=pointer]
        - button "Archive project" [ref=f4e263] [cursor=pointer]
    - listitem [ref=f4e264]:
      - generic [ref=f4e265]: task-003 Blank validation sentinel
      - generic [ref=f4e266]: 0/0 completed
      - generic [ref=f4e267]:
        - button "Open project" [ref=f4e268] [cursor=pointer]
        - button "Archive project" [ref=f4e269] [cursor=pointer]
    - listitem [ref=f4e270]:
      - generic [ref=f4e271]: task-003 Order first
      - generic [ref=f4e272]: 0/0 completed
      - generic [ref=f4e273]:
        - button "Open project" [ref=f4e274] [cursor=pointer]
        - button "Archive project" [ref=f4e275] [cursor=pointer]
    - listitem [ref=f4e276]:
      - generic [ref=f4e277]: task-003 Order second
      - generic [ref=f4e278]: 0/0 completed
      - generic [ref=f4e279]:
        - button "Open project" [ref=f4e280] [cursor=pointer]
        - button "Archive project" [ref=f4e281] [cursor=pointer]
    - listitem [ref=f4e282]:
      - generic [ref=f4e283]: task-003 Task reload
      - generic [ref=f4e284]: 0/1 completed
      - generic [ref=f4e285]:
        - button "Open project" [ref=f4e286] [cursor=pointer]
        - button "Archive project" [ref=f4e287] [cursor=pointer]
    - listitem [ref=f4e288]:
      - generic [ref=f4e289]: task-003 Task invalid
      - generic [ref=f4e290]: 0/0 completed
      - generic [ref=f4e291]:
        - button "Open project" [ref=f4e292] [cursor=pointer]
        - button "Archive project" [ref=f4e293] [cursor=pointer]
    - listitem [ref=f4e294]:
      - generic [ref=f4e295]: task-003 Task owner
      - generic [ref=f4e296]: 0/1 completed
      - generic [ref=f4e297]:
        - button "Open project" [ref=f4e298] [cursor=pointer]
        - button "Archive project" [ref=f4e299] [cursor=pointer]
    - listitem [ref=f4e300]:
      - generic [ref=f4e301]: task-003 Other project
      - generic [ref=f4e302]: 0/0 completed
      - generic [ref=f4e303]:
        - button "Open project" [ref=f4e304] [cursor=pointer]
        - button "Archive project" [ref=f4e305] [cursor=pointer]
    - listitem [ref=f4e306]:
      - generic [ref=f4e307]: task-003 Task filters
      - generic [ref=f4e308]: 0/2 completed
      - generic [ref=f4e309]:
        - button "Open project" [ref=f4e310] [cursor=pointer]
        - button "Archive project" [ref=f4e311] [cursor=pointer]
    - listitem [ref=f4e312]:
      - generic [ref=f4e313]: task-003 Archive lifecycle
      - generic [ref=f4e314]: 0/0 completed
      - generic [ref=f4e315]:
        - button "Open project" [ref=f4e316] [cursor=pointer]
        - button "Archive project" [ref=f4e317] [cursor=pointer]
    - listitem [ref=f4e318]:
      - generic [ref=f4e319]: task-003 Archive tasks
      - generic [ref=f4e320]: 1/1 completed
      - generic [ref=f4e321]:
        - button "Open project" [ref=f4e322] [cursor=pointer]
        - button "Archive project" [ref=f4e323] [cursor=pointer]
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