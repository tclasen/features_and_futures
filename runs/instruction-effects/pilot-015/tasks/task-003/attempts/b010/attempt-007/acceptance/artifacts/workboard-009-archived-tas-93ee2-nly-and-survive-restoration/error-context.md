# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/pilot-015/definitions/project/acceptance/workboard.spec.mjs:114:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button type="button">Open project</button> aka locator('div:nth-child(26) > .project-actions > button').first()
    2) <button type="button">Open project</button> aka locator('div:nth-child(52) > .project-actions > button').first()

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=f4e2]:
  - heading "Workboard" [level=1] [ref=f4e3]
  - generic [ref=f4e4]:
    - generic [ref=f4e5]: Project filter
    - combobox "Project filter" [ref=f4e6]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f4e7]:
    - generic [ref=f4e8]: Project name
    - textbox "Project name" [ref=f4e9]
    - button "Create project" [ref=f4e10] [cursor=pointer]
  - region "Projects" [ref=f4e11]:
    - generic [ref=f4e12]:
      - generic [ref=f4e13]:
        - generic [ref=f4e14]: task-001 Alpha create
        - generic [ref=f4e15]: 0/0 completed
      - generic [ref=f4e16]:
        - button "Open project" [ref=f4e17] [cursor=pointer]
        - button "Archive project" [ref=f4e18] [cursor=pointer]
    - generic [ref=f4e19]:
      - generic [ref=f4e20]:
        - generic [ref=f4e21]: task-001 Blank validation sentinel
        - generic [ref=f4e22]: 0/0 completed
      - generic [ref=f4e23]:
        - button "Open project" [ref=f4e24] [cursor=pointer]
        - button "Archive project" [ref=f4e25] [cursor=pointer]
    - generic [ref=f4e26]:
      - generic [ref=f4e27]:
        - generic [ref=f4e28]: task-001 Order first
        - generic [ref=f4e29]: 0/0 completed
      - generic [ref=f4e30]:
        - button "Open project" [ref=f4e31] [cursor=pointer]
        - button "Archive project" [ref=f4e32] [cursor=pointer]
    - generic [ref=f4e33]:
      - generic [ref=f4e34]:
        - generic [ref=f4e35]: task-001 Order second
        - generic [ref=f4e36]: 0/0 completed
      - generic [ref=f4e37]:
        - button "Open project" [ref=f4e38] [cursor=pointer]
        - button "Archive project" [ref=f4e39] [cursor=pointer]
    - generic [ref=f4e40]:
      - generic [ref=f4e41]:
        - generic [ref=f4e42]: task-001 Persistence sentinel
        - generic [ref=f4e43]: 0/0 completed
      - generic [ref=f4e44]:
        - button "Open project" [ref=f4e45] [cursor=pointer]
        - button "Archive project" [ref=f4e46] [cursor=pointer]
    - generic [ref=f4e47]:
      - generic [ref=f4e48]:
        - generic [ref=f4e49]: task-002 Alpha create
        - generic [ref=f4e50]: 0/0 completed
      - generic [ref=f4e51]:
        - button "Open project" [ref=f4e52] [cursor=pointer]
        - button "Archive project" [ref=f4e53] [cursor=pointer]
    - generic [ref=f4e54]:
      - generic [ref=f4e55]:
        - generic [ref=f4e56]: task-002 Blank validation sentinel
        - generic [ref=f4e57]: 0/0 completed
      - generic [ref=f4e58]:
        - button "Open project" [ref=f4e59] [cursor=pointer]
        - button "Archive project" [ref=f4e60] [cursor=pointer]
    - generic [ref=f4e61]:
      - generic [ref=f4e62]:
        - generic [ref=f4e63]: task-002 Order first
        - generic [ref=f4e64]: 0/0 completed
      - generic [ref=f4e65]:
        - button "Open project" [ref=f4e66] [cursor=pointer]
        - button "Archive project" [ref=f4e67] [cursor=pointer]
    - generic [ref=f4e68]:
      - generic [ref=f4e69]:
        - generic [ref=f4e70]: task-002 Order second
        - generic [ref=f4e71]: 0/0 completed
      - generic [ref=f4e72]:
        - button "Open project" [ref=f4e73] [cursor=pointer]
        - button "Archive project" [ref=f4e74] [cursor=pointer]
    - generic [ref=f4e75]:
      - generic [ref=f4e76]:
        - generic [ref=f4e77]: task-002 Task reload
        - generic [ref=f4e78]: 0/1 completed
      - generic [ref=f4e79]:
        - button "Open project" [ref=f4e80] [cursor=pointer]
        - button "Archive project" [ref=f4e81] [cursor=pointer]
    - generic [ref=f4e82]:
      - generic [ref=f4e83]:
        - generic [ref=f4e84]: task-002 Task invalid
        - generic [ref=f4e85]: 0/0 completed
      - generic [ref=f4e86]:
        - button "Open project" [ref=f4e87] [cursor=pointer]
        - button "Archive project" [ref=f4e88] [cursor=pointer]
    - generic [ref=f4e89]:
      - generic [ref=f4e90]:
        - generic [ref=f4e91]: task-002 Task owner
        - generic [ref=f4e92]: 0/1 completed
      - generic [ref=f4e93]:
        - button "Open project" [ref=f4e94] [cursor=pointer]
        - button "Archive project" [ref=f4e95] [cursor=pointer]
    - generic [ref=f4e96]:
      - generic [ref=f4e97]:
        - generic [ref=f4e98]: task-002 Other project
        - generic [ref=f4e99]: 0/0 completed
      - generic [ref=f4e100]:
        - button "Open project" [ref=f4e101] [cursor=pointer]
        - button "Archive project" [ref=f4e102] [cursor=pointer]
    - generic [ref=f4e103]:
      - generic [ref=f4e104]:
        - generic [ref=f4e105]: task-002 Task filters
        - generic [ref=f4e106]: 0/2 completed
      - generic [ref=f4e107]:
        - button "Open project" [ref=f4e108] [cursor=pointer]
        - button "Archive project" [ref=f4e109] [cursor=pointer]
    - generic [ref=f4e110]:
      - generic [ref=f4e111]:
        - generic [ref=f4e112]: task-002 Persistence sentinel
        - generic [ref=f4e113]: 1/1 completed
      - generic [ref=f4e114]:
        - button "Open project" [ref=f4e115] [cursor=pointer]
        - button "Archive project" [ref=f4e116] [cursor=pointer]
    - generic [ref=f4e117]:
      - generic [ref=f4e118]:
        - generic [ref=f4e119]: task-003 Alpha create
        - generic [ref=f4e120]: 0/0 completed
      - generic [ref=f4e121]:
        - button "Open project" [ref=f4e122] [cursor=pointer]
        - button "Archive project" [ref=f4e123] [cursor=pointer]
    - generic [ref=f4e124]:
      - generic [ref=f4e125]:
        - generic [ref=f4e126]: task-003 Blank validation sentinel
        - generic [ref=f4e127]: 0/0 completed
      - generic [ref=f4e128]:
        - button "Open project" [ref=f4e129] [cursor=pointer]
        - button "Archive project" [ref=f4e130] [cursor=pointer]
    - generic [ref=f4e131]:
      - generic [ref=f4e132]:
        - generic [ref=f4e133]: task-003 Order first
        - generic [ref=f4e134]: 0/0 completed
      - generic [ref=f4e135]:
        - button "Open project" [ref=f4e136] [cursor=pointer]
        - button "Archive project" [ref=f4e137] [cursor=pointer]
    - generic [ref=f4e138]:
      - generic [ref=f4e139]:
        - generic [ref=f4e140]: task-003 Order second
        - generic [ref=f4e141]: 0/0 completed
      - generic [ref=f4e142]:
        - button "Open project" [ref=f4e143] [cursor=pointer]
        - button "Archive project" [ref=f4e144] [cursor=pointer]
    - generic [ref=f4e145]:
      - generic [ref=f4e146]:
        - generic [ref=f4e147]: task-003 Task reload
        - generic [ref=f4e148]: 0/1 completed
      - generic [ref=f4e149]:
        - button "Open project" [ref=f4e150] [cursor=pointer]
        - button "Archive project" [ref=f4e151] [cursor=pointer]
    - generic [ref=f4e152]:
      - generic [ref=f4e153]:
        - generic [ref=f4e154]: task-003 Task invalid
        - generic [ref=f4e155]: 0/0 completed
      - generic [ref=f4e156]:
        - button "Open project" [ref=f4e157] [cursor=pointer]
        - button "Archive project" [ref=f4e158] [cursor=pointer]
    - generic [ref=f4e159]:
      - generic [ref=f4e160]:
        - generic [ref=f4e161]: task-003 Task owner
        - generic [ref=f4e162]: 0/1 completed
      - generic [ref=f4e163]:
        - button "Open project" [ref=f4e164] [cursor=pointer]
        - button "Archive project" [ref=f4e165] [cursor=pointer]
    - generic [ref=f4e166]:
      - generic [ref=f4e167]:
        - generic [ref=f4e168]: task-003 Other project
        - generic [ref=f4e169]: 0/0 completed
      - generic [ref=f4e170]:
        - button "Open project" [ref=f4e171] [cursor=pointer]
        - button "Archive project" [ref=f4e172] [cursor=pointer]
    - generic [ref=f4e173]:
      - generic [ref=f4e174]:
        - generic [ref=f4e175]: task-003 Task filters
        - generic [ref=f4e176]: 0/2 completed
      - generic [ref=f4e177]:
        - button "Open project" [ref=f4e178] [cursor=pointer]
        - button "Archive project" [ref=f4e179] [cursor=pointer]
    - generic [ref=f4e180]:
      - generic [ref=f4e181]:
        - generic [ref=f4e182]: task-003 Archive lifecycle
        - generic [ref=f4e183]: 0/0 completed
      - generic [ref=f4e184]:
        - button "Open project" [ref=f4e185] [cursor=pointer]
        - button "Archive project" [ref=f4e186] [cursor=pointer]
    - generic [ref=f4e187]:
      - generic [ref=f4e188]:
        - generic [ref=f4e189]: task-003 Archive tasks
        - generic [ref=f4e190]: 1/1 completed
      - generic [ref=f4e191]:
        - button "Open project" [ref=f4e192] [cursor=pointer]
        - button "Archive project" [ref=f4e193] [cursor=pointer]
    - generic [ref=f4e194]:
      - generic [ref=f4e195]:
        - generic [ref=f4e196]: task-001 Alpha create
        - generic [ref=f4e197]: 0/0 completed
      - generic [ref=f4e198]:
        - button "Open project" [ref=f4e199] [cursor=pointer]
        - button "Archive project" [ref=f4e200] [cursor=pointer]
    - generic [ref=f4e201]:
      - generic [ref=f4e202]:
        - generic [ref=f4e203]: task-001 Blank validation sentinel
        - generic [ref=f4e204]: 0/0 completed
      - generic [ref=f4e205]:
        - button "Open project" [ref=f4e206] [cursor=pointer]
        - button "Archive project" [ref=f4e207] [cursor=pointer]
    - generic [ref=f4e208]:
      - generic [ref=f4e209]:
        - generic [ref=f4e210]: task-001 Order first
        - generic [ref=f4e211]: 0/0 completed
      - generic [ref=f4e212]:
        - button "Open project" [ref=f4e213] [cursor=pointer]
        - button "Archive project" [ref=f4e214] [cursor=pointer]
    - generic [ref=f4e215]:
      - generic [ref=f4e216]:
        - generic [ref=f4e217]: task-001 Order second
        - generic [ref=f4e218]: 0/0 completed
      - generic [ref=f4e219]:
        - button "Open project" [ref=f4e220] [cursor=pointer]
        - button "Archive project" [ref=f4e221] [cursor=pointer]
    - generic [ref=f4e222]:
      - generic [ref=f4e223]:
        - generic [ref=f4e224]: task-001 Persistence sentinel
        - generic [ref=f4e225]: 0/0 completed
      - generic [ref=f4e226]:
        - button "Open project" [ref=f4e227] [cursor=pointer]
        - button "Archive project" [ref=f4e228] [cursor=pointer]
    - generic [ref=f4e229]:
      - generic [ref=f4e230]:
        - generic [ref=f4e231]: task-002 Alpha create
        - generic [ref=f4e232]: 0/0 completed
      - generic [ref=f4e233]:
        - button "Open project" [ref=f4e234] [cursor=pointer]
        - button "Archive project" [ref=f4e235] [cursor=pointer]
    - generic [ref=f4e236]:
      - generic [ref=f4e237]:
        - generic [ref=f4e238]: task-002 Blank validation sentinel
        - generic [ref=f4e239]: 0/0 completed
      - generic [ref=f4e240]:
        - button "Open project" [ref=f4e241] [cursor=pointer]
        - button "Archive project" [ref=f4e242] [cursor=pointer]
    - generic [ref=f4e243]:
      - generic [ref=f4e244]:
        - generic [ref=f4e245]: task-002 Order first
        - generic [ref=f4e246]: 0/0 completed
      - generic [ref=f4e247]:
        - button "Open project" [ref=f4e248] [cursor=pointer]
        - button "Archive project" [ref=f4e249] [cursor=pointer]
    - generic [ref=f4e250]:
      - generic [ref=f4e251]:
        - generic [ref=f4e252]: task-002 Order second
        - generic [ref=f4e253]: 0/0 completed
      - generic [ref=f4e254]:
        - button "Open project" [ref=f4e255] [cursor=pointer]
        - button "Archive project" [ref=f4e256] [cursor=pointer]
    - generic [ref=f4e257]:
      - generic [ref=f4e258]:
        - generic [ref=f4e259]: task-002 Task reload
        - generic [ref=f4e260]: 0/1 completed
      - generic [ref=f4e261]:
        - button "Open project" [ref=f4e262] [cursor=pointer]
        - button "Archive project" [ref=f4e263] [cursor=pointer]
    - generic [ref=f4e264]:
      - generic [ref=f4e265]:
        - generic [ref=f4e266]: task-002 Task invalid
        - generic [ref=f4e267]: 0/0 completed
      - generic [ref=f4e268]:
        - button "Open project" [ref=f4e269] [cursor=pointer]
        - button "Archive project" [ref=f4e270] [cursor=pointer]
    - generic [ref=f4e271]:
      - generic [ref=f4e272]:
        - generic [ref=f4e273]: task-002 Task owner
        - generic [ref=f4e274]: 0/1 completed
      - generic [ref=f4e275]:
        - button "Open project" [ref=f4e276] [cursor=pointer]
        - button "Archive project" [ref=f4e277] [cursor=pointer]
    - generic [ref=f4e278]:
      - generic [ref=f4e279]:
        - generic [ref=f4e280]: task-002 Other project
        - generic [ref=f4e281]: 0/0 completed
      - generic [ref=f4e282]:
        - button "Open project" [ref=f4e283] [cursor=pointer]
        - button "Archive project" [ref=f4e284] [cursor=pointer]
    - generic [ref=f4e285]:
      - generic [ref=f4e286]:
        - generic [ref=f4e287]: task-002 Task filters
        - generic [ref=f4e288]: 0/2 completed
      - generic [ref=f4e289]:
        - button "Open project" [ref=f4e290] [cursor=pointer]
        - button "Archive project" [ref=f4e291] [cursor=pointer]
    - generic [ref=f4e292]:
      - generic [ref=f4e293]:
        - generic [ref=f4e294]: task-002 Persistence sentinel
        - generic [ref=f4e295]: 1/1 completed
      - generic [ref=f4e296]:
        - button "Open project" [ref=f4e297] [cursor=pointer]
        - button "Archive project" [ref=f4e298] [cursor=pointer]
    - generic [ref=f4e299]:
      - generic [ref=f4e300]:
        - generic [ref=f4e301]: task-003 Alpha create
        - generic [ref=f4e302]: 0/0 completed
      - generic [ref=f4e303]:
        - button "Open project" [ref=f4e304] [cursor=pointer]
        - button "Archive project" [ref=f4e305] [cursor=pointer]
    - generic [ref=f4e306]:
      - generic [ref=f4e307]:
        - generic [ref=f4e308]: task-003 Blank validation sentinel
        - generic [ref=f4e309]: 0/0 completed
      - generic [ref=f4e310]:
        - button "Open project" [ref=f4e311] [cursor=pointer]
        - button "Archive project" [ref=f4e312] [cursor=pointer]
    - generic [ref=f4e313]:
      - generic [ref=f4e314]:
        - generic [ref=f4e315]: task-003 Order first
        - generic [ref=f4e316]: 0/0 completed
      - generic [ref=f4e317]:
        - button "Open project" [ref=f4e318] [cursor=pointer]
        - button "Archive project" [ref=f4e319] [cursor=pointer]
    - generic [ref=f4e320]:
      - generic [ref=f4e321]:
        - generic [ref=f4e322]: task-003 Order second
        - generic [ref=f4e323]: 0/0 completed
      - generic [ref=f4e324]:
        - button "Open project" [ref=f4e325] [cursor=pointer]
        - button "Archive project" [ref=f4e326] [cursor=pointer]
    - generic [ref=f4e327]:
      - generic [ref=f4e328]:
        - generic [ref=f4e329]: task-003 Task reload
        - generic [ref=f4e330]: 0/1 completed
      - generic [ref=f4e331]:
        - button "Open project" [ref=f4e332] [cursor=pointer]
        - button "Archive project" [ref=f4e333] [cursor=pointer]
    - generic [ref=f4e334]:
      - generic [ref=f4e335]:
        - generic [ref=f4e336]: task-003 Task invalid
        - generic [ref=f4e337]: 0/0 completed
      - generic [ref=f4e338]:
        - button "Open project" [ref=f4e339] [cursor=pointer]
        - button "Archive project" [ref=f4e340] [cursor=pointer]
    - generic [ref=f4e341]:
      - generic [ref=f4e342]:
        - generic [ref=f4e343]: task-003 Task owner
        - generic [ref=f4e344]: 0/1 completed
      - generic [ref=f4e345]:
        - button "Open project" [ref=f4e346] [cursor=pointer]
        - button "Archive project" [ref=f4e347] [cursor=pointer]
    - generic [ref=f4e348]:
      - generic [ref=f4e349]:
        - generic [ref=f4e350]: task-003 Other project
        - generic [ref=f4e351]: 0/0 completed
      - generic [ref=f4e352]:
        - button "Open project" [ref=f4e353] [cursor=pointer]
        - button "Archive project" [ref=f4e354] [cursor=pointer]
    - generic [ref=f4e355]:
      - generic [ref=f4e356]:
        - generic [ref=f4e357]: task-003 Task filters
        - generic [ref=f4e358]: 0/2 completed
      - generic [ref=f4e359]:
        - button "Open project" [ref=f4e360] [cursor=pointer]
        - button "Archive project" [ref=f4e361] [cursor=pointer]
    - generic [ref=f4e362]:
      - generic [ref=f4e363]:
        - generic [ref=f4e364]: task-003 Archive lifecycle
        - generic [ref=f4e365]: 0/0 completed
      - generic [ref=f4e366]:
        - button "Open project" [ref=f4e367] [cursor=pointer]
        - button "Archive project" [ref=f4e368] [cursor=pointer]
    - generic [ref=f4e369]:
      - generic [ref=f4e370]:
        - generic [ref=f4e371]: task-003 Archive tasks
        - generic [ref=f4e372]: 1/1 completed
      - generic [ref=f4e373]:
        - button "Open project" [ref=f4e374] [cursor=pointer]
        - button "Archive project" [ref=f4e375] [cursor=pointer]
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