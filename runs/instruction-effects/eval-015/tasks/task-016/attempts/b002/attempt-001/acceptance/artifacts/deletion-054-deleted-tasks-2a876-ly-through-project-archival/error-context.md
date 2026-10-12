# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deletion.spec.mjs >> 054 deleted tasks preserve fields intersect filters and remain read-only through project archival
- Location: runs/instruction-effects/eval-015/tasks/task-016/suite/deletion.spec.mjs:10:2

# Error details

```
Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-016 Deletion fields' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
    1) <button type="button">Open project</button> aka locator('li:nth-child(27) > .project-actions > button').first()
    2) <button type="button">Open project</button> aka locator('li:nth-child(54) > .project-actions > button').first()

Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-016 Deletion fields' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- main [ref=f3e2]:
  - generic [ref=f3e3]:
    - heading "Workboard" [level=1] [ref=f3e4]
    - generic [ref=f3e5]:
      - generic [ref=f3e6]: Project name
      - textbox "Project name" [ref=f3e7]
      - button "Create project" [ref=f3e8] [cursor=pointer]
    - generic [ref=f3e9]: Project filter
    - combobox "Project filter" [ref=f3e10]:
      - option "Active"
      - option "Archived" [selected]
    - generic [ref=f3e11]:
      - generic [ref=f3e12]: Project search
      - textbox "Project search" [ref=f3e13]
      - button "Search projects" [ref=f3e14] [cursor=pointer]
    - list "Projects" [ref=f3e15]:
      - listitem [ref=f3e16]:
        - generic [ref=f3e17]: task-003 Persistence sentinel
        - generic [ref=f3e18]: 1/1 completed
        - generic [ref=f3e19]:
          - button "Open project" [ref=f3e20] [cursor=pointer]
          - button "Restore project" [ref=f3e21] [cursor=pointer]
      - listitem [ref=f3e22]:
        - generic [ref=f3e23]: task-004 Persistence renamed
        - generic [ref=f3e24]: 1/1 completed
        - generic [ref=f3e25]:
          - button "Open project" [ref=f3e26] [cursor=pointer]
          - button "Restore project" [ref=f3e27] [cursor=pointer]
      - listitem [ref=f3e28]:
        - generic [ref=f3e29]: task-005 Persistence renamed
        - generic [ref=f3e30]: 1/1 completed
        - generic [ref=f3e31]:
          - button "Open project" [ref=f3e32] [cursor=pointer]
          - button "Restore project" [ref=f3e33] [cursor=pointer]
      - listitem [ref=f3e34]:
        - generic [ref=f3e35]: task-006 Persistence renamed
        - generic [ref=f3e36]: 1/1 completed
        - generic [ref=f3e37]:
          - button "Open project" [ref=f3e38] [cursor=pointer]
          - button "Restore project" [ref=f3e39] [cursor=pointer]
      - listitem [ref=f3e40]:
        - generic [ref=f3e41]: task-007 Persistence renamed
        - generic [ref=f3e42]: 1/1 completed
        - generic [ref=f3e43]:
          - button "Open project" [ref=f3e44] [cursor=pointer]
          - button "Restore project" [ref=f3e45] [cursor=pointer]
      - listitem [ref=f3e46]:
        - generic [ref=f3e47]: task-008 Persistence renamed
        - generic [ref=f3e48]: 1/1 completed
        - generic [ref=f3e49]:
          - button "Open project" [ref=f3e50] [cursor=pointer]
          - button "Restore project" [ref=f3e51] [cursor=pointer]
      - listitem [ref=f3e52]:
        - generic [ref=f3e53]: task-009 Persistence renamed
        - generic [ref=f3e54]: 1/1 completed
        - generic [ref=f3e55]:
          - button "Open project" [ref=f3e56] [cursor=pointer]
          - button "Restore project" [ref=f3e57] [cursor=pointer]
      - listitem [ref=f3e58]:
        - generic [ref=f3e59]: task-010 Persistence renamed
        - generic [ref=f3e60]: 1/1 completed
        - generic [ref=f3e61]:
          - button "Open project" [ref=f3e62] [cursor=pointer]
          - button "Restore project" [ref=f3e63] [cursor=pointer]
      - listitem [ref=f3e64]:
        - generic [ref=f3e65]: task-011 Options hidden
        - generic [ref=f3e66]: 0/0 completed
        - generic [ref=f3e67]:
          - button "Open project" [ref=f3e68] [cursor=pointer]
          - button "Restore project" [ref=f3e69] [cursor=pointer]
      - listitem [ref=f3e70]:
        - generic [ref=f3e71]: task-011 Persistence renamed
        - generic [ref=f3e72]: 1/1 completed
        - generic [ref=f3e73]:
          - button "Open project" [ref=f3e74] [cursor=pointer]
          - button "Restore project" [ref=f3e75] [cursor=pointer]
      - listitem [ref=f3e76]:
        - generic [ref=f3e77]: task-012 Options hidden
        - generic [ref=f3e78]: 0/0 completed
        - generic [ref=f3e79]:
          - button "Open project" [ref=f3e80] [cursor=pointer]
          - button "Restore project" [ref=f3e81] [cursor=pointer]
      - listitem [ref=f3e82]:
        - generic [ref=f3e83]: task-012 Persistence renamed
        - generic [ref=f3e84]: 1/1 completed
        - generic [ref=f3e85]:
          - button "Open project" [ref=f3e86] [cursor=pointer]
          - button "Restore project" [ref=f3e87] [cursor=pointer]
      - listitem [ref=f3e88]:
        - generic [ref=f3e89]: task-013 Options hidden
        - generic [ref=f3e90]: 0/0 completed
        - generic [ref=f3e91]:
          - button "Open project" [ref=f3e92] [cursor=pointer]
          - button "Restore project" [ref=f3e93] [cursor=pointer]
      - listitem [ref=f3e94]:
        - generic [ref=f3e95]: task-013 Search MIXED archived
        - generic [ref=f3e96]: 0/0 completed
        - generic [ref=f3e97]:
          - button "Open project" [ref=f3e98] [cursor=pointer]
          - button "Restore project" [ref=f3e99] [cursor=pointer]
      - listitem [ref=f3e100]:
        - generic [ref=f3e101]: task-013 Search mutable titles
        - generic [ref=f3e102]: 0/3 completed
        - generic [ref=f3e103]:
          - button "Open project" [ref=f3e104] [cursor=pointer]
          - button "Restore project" [ref=f3e105] [cursor=pointer]
      - listitem [ref=f3e106]:
        - generic [ref=f3e107]: task-013 Persistence renamed
        - generic [ref=f3e108]: 1/1 completed
        - generic [ref=f3e109]:
          - button "Open project" [ref=f3e110] [cursor=pointer]
          - button "Restore project" [ref=f3e111] [cursor=pointer]
      - listitem [ref=f3e112]:
        - generic [ref=f3e113]: task-014 Options hidden
        - generic [ref=f3e114]: 0/0 completed
        - generic [ref=f3e115]:
          - button "Open project" [ref=f3e116] [cursor=pointer]
          - button "Restore project" [ref=f3e117] [cursor=pointer]
      - listitem [ref=f3e118]:
        - generic [ref=f3e119]: task-014 Whitespace Saved archived
        - generic [ref=f3e120]: 0/0 completed
        - generic [ref=f3e121]:
          - button "Open project" [ref=f3e122] [cursor=pointer]
          - button "Restore project" [ref=f3e123] [cursor=pointer]
      - listitem [ref=f3e124]:
        - generic [ref=f3e125]: task-014 Search MIXED archived
        - generic [ref=f3e126]: 0/0 completed
        - generic [ref=f3e127]:
          - button "Open project" [ref=f3e128] [cursor=pointer]
          - button "Restore project" [ref=f3e129] [cursor=pointer]
      - listitem [ref=f3e130]:
        - generic [ref=f3e131]: task-014 Search mutable titles
        - generic [ref=f3e132]: 0/3 completed
        - generic [ref=f3e133]:
          - button "Open project" [ref=f3e134] [cursor=pointer]
          - button "Restore project" [ref=f3e135] [cursor=pointer]
      - listitem [ref=f3e136]:
        - generic [ref=f3e137]: task-014 Persistence renamed
        - generic [ref=f3e138]: 1/1 completed
        - generic [ref=f3e139]:
          - button "Open project" [ref=f3e140] [cursor=pointer]
          - button "Restore project" [ref=f3e141] [cursor=pointer]
      - listitem [ref=f3e142]:
        - generic [ref=f3e143]: task-015 Options hidden
        - generic [ref=f3e144]: 0/0 completed
        - generic [ref=f3e145]:
          - button "Open project" [ref=f3e146] [cursor=pointer]
          - button "Restore project" [ref=f3e147] [cursor=pointer]
      - listitem [ref=f3e148]:
        - generic [ref=f3e149]: task-015 Whitespace Saved archived
        - generic [ref=f3e150]: 0/0 completed
        - generic [ref=f3e151]:
          - button "Open project" [ref=f3e152] [cursor=pointer]
          - button "Restore project" [ref=f3e153] [cursor=pointer]
      - listitem [ref=f3e154]:
        - generic [ref=f3e155]: task-015 Search MIXED archived
        - generic [ref=f3e156]: 0/0 completed
        - generic [ref=f3e157]:
          - button "Open project" [ref=f3e158] [cursor=pointer]
          - button "Restore project" [ref=f3e159] [cursor=pointer]
      - listitem [ref=f3e160]:
        - generic [ref=f3e161]: task-015 Search mutable titles
        - generic [ref=f3e162]: 0/3 completed
        - generic [ref=f3e163]:
          - button "Open project" [ref=f3e164] [cursor=pointer]
          - button "Restore project" [ref=f3e165] [cursor=pointer]
      - listitem [ref=f3e166]:
        - generic [ref=f3e167]: task-015 Persistence renamed
        - generic [ref=f3e168]: 1/1 completed
        - generic [ref=f3e169]:
          - button "Open project" [ref=f3e170] [cursor=pointer]
          - button "Restore project" [ref=f3e171] [cursor=pointer]
      - listitem [ref=f3e172]:
        - generic [ref=f3e173]: task-016 Deletion fields
        - generic [ref=f3e174]: 4/6 completed
        - generic [ref=f3e175]:
          - button "Open project" [ref=f3e176] [cursor=pointer]
          - button "Restore project" [ref=f3e177] [cursor=pointer]
      - listitem [ref=f3e178]:
        - generic [ref=f3e179]: task-003 Persistence sentinel
        - generic [ref=f3e180]: 1/1 completed
        - generic [ref=f3e181]:
          - button "Open project" [ref=f3e182] [cursor=pointer]
          - button "Restore project" [ref=f3e183] [cursor=pointer]
      - listitem [ref=f3e184]:
        - generic [ref=f3e185]: task-004 Persistence renamed
        - generic [ref=f3e186]: 1/1 completed
        - generic [ref=f3e187]:
          - button "Open project" [ref=f3e188] [cursor=pointer]
          - button "Restore project" [ref=f3e189] [cursor=pointer]
      - listitem [ref=f3e190]:
        - generic [ref=f3e191]: task-005 Persistence renamed
        - generic [ref=f3e192]: 1/1 completed
        - generic [ref=f3e193]:
          - button "Open project" [ref=f3e194] [cursor=pointer]
          - button "Restore project" [ref=f3e195] [cursor=pointer]
      - listitem [ref=f3e196]:
        - generic [ref=f3e197]: task-006 Persistence renamed
        - generic [ref=f3e198]: 1/1 completed
        - generic [ref=f3e199]:
          - button "Open project" [ref=f3e200] [cursor=pointer]
          - button "Restore project" [ref=f3e201] [cursor=pointer]
      - listitem [ref=f3e202]:
        - generic [ref=f3e203]: task-007 Persistence renamed
        - generic [ref=f3e204]: 1/1 completed
        - generic [ref=f3e205]:
          - button "Open project" [ref=f3e206] [cursor=pointer]
          - button "Restore project" [ref=f3e207] [cursor=pointer]
      - listitem [ref=f3e208]:
        - generic [ref=f3e209]: task-008 Persistence renamed
        - generic [ref=f3e210]: 1/1 completed
        - generic [ref=f3e211]:
          - button "Open project" [ref=f3e212] [cursor=pointer]
          - button "Restore project" [ref=f3e213] [cursor=pointer]
      - listitem [ref=f3e214]:
        - generic [ref=f3e215]: task-009 Persistence renamed
        - generic [ref=f3e216]: 1/1 completed
        - generic [ref=f3e217]:
          - button "Open project" [ref=f3e218] [cursor=pointer]
          - button "Restore project" [ref=f3e219] [cursor=pointer]
      - listitem [ref=f3e220]:
        - generic [ref=f3e221]: task-010 Persistence renamed
        - generic [ref=f3e222]: 1/1 completed
        - generic [ref=f3e223]:
          - button "Open project" [ref=f3e224] [cursor=pointer]
          - button "Restore project" [ref=f3e225] [cursor=pointer]
      - listitem [ref=f3e226]:
        - generic [ref=f3e227]: task-011 Options hidden
        - generic [ref=f3e228]: 0/0 completed
        - generic [ref=f3e229]:
          - button "Open project" [ref=f3e230] [cursor=pointer]
          - button "Restore project" [ref=f3e231] [cursor=pointer]
      - listitem [ref=f3e232]:
        - generic [ref=f3e233]: task-011 Persistence renamed
        - generic [ref=f3e234]: 1/1 completed
        - generic [ref=f3e235]:
          - button "Open project" [ref=f3e236] [cursor=pointer]
          - button "Restore project" [ref=f3e237] [cursor=pointer]
      - listitem [ref=f3e238]:
        - generic [ref=f3e239]: task-012 Options hidden
        - generic [ref=f3e240]: 0/0 completed
        - generic [ref=f3e241]:
          - button "Open project" [ref=f3e242] [cursor=pointer]
          - button "Restore project" [ref=f3e243] [cursor=pointer]
      - listitem [ref=f3e244]:
        - generic [ref=f3e245]: task-012 Persistence renamed
        - generic [ref=f3e246]: 1/1 completed
        - generic [ref=f3e247]:
          - button "Open project" [ref=f3e248] [cursor=pointer]
          - button "Restore project" [ref=f3e249] [cursor=pointer]
      - listitem [ref=f3e250]:
        - generic [ref=f3e251]: task-013 Options hidden
        - generic [ref=f3e252]: 0/0 completed
        - generic [ref=f3e253]:
          - button "Open project" [ref=f3e254] [cursor=pointer]
          - button "Restore project" [ref=f3e255] [cursor=pointer]
      - listitem [ref=f3e256]:
        - generic [ref=f3e257]: task-013 Search MIXED archived
        - generic [ref=f3e258]: 0/0 completed
        - generic [ref=f3e259]:
          - button "Open project" [ref=f3e260] [cursor=pointer]
          - button "Restore project" [ref=f3e261] [cursor=pointer]
      - listitem [ref=f3e262]:
        - generic [ref=f3e263]: task-013 Search mutable titles
        - generic [ref=f3e264]: 0/3 completed
        - generic [ref=f3e265]:
          - button "Open project" [ref=f3e266] [cursor=pointer]
          - button "Restore project" [ref=f3e267] [cursor=pointer]
      - listitem [ref=f3e268]:
        - generic [ref=f3e269]: task-013 Persistence renamed
        - generic [ref=f3e270]: 1/1 completed
        - generic [ref=f3e271]:
          - button "Open project" [ref=f3e272] [cursor=pointer]
          - button "Restore project" [ref=f3e273] [cursor=pointer]
      - listitem [ref=f3e274]:
        - generic [ref=f3e275]: task-014 Options hidden
        - generic [ref=f3e276]: 0/0 completed
        - generic [ref=f3e277]:
          - button "Open project" [ref=f3e278] [cursor=pointer]
          - button "Restore project" [ref=f3e279] [cursor=pointer]
      - listitem [ref=f3e280]:
        - generic [ref=f3e281]: task-014 Whitespace Saved archived
        - generic [ref=f3e282]: 0/0 completed
        - generic [ref=f3e283]:
          - button "Open project" [ref=f3e284] [cursor=pointer]
          - button "Restore project" [ref=f3e285] [cursor=pointer]
      - listitem [ref=f3e286]:
        - generic [ref=f3e287]: task-014 Search MIXED archived
        - generic [ref=f3e288]: 0/0 completed
        - generic [ref=f3e289]:
          - button "Open project" [ref=f3e290] [cursor=pointer]
          - button "Restore project" [ref=f3e291] [cursor=pointer]
      - listitem [ref=f3e292]:
        - generic [ref=f3e293]: task-014 Search mutable titles
        - generic [ref=f3e294]: 0/3 completed
        - generic [ref=f3e295]:
          - button "Open project" [ref=f3e296] [cursor=pointer]
          - button "Restore project" [ref=f3e297] [cursor=pointer]
      - listitem [ref=f3e298]:
        - generic [ref=f3e299]: task-014 Persistence renamed
        - generic [ref=f3e300]: 1/1 completed
        - generic [ref=f3e301]:
          - button "Open project" [ref=f3e302] [cursor=pointer]
          - button "Restore project" [ref=f3e303] [cursor=pointer]
      - listitem [ref=f3e304]:
        - generic [ref=f3e305]: task-015 Options hidden
        - generic [ref=f3e306]: 0/0 completed
        - generic [ref=f3e307]:
          - button "Open project" [ref=f3e308] [cursor=pointer]
          - button "Restore project" [ref=f3e309] [cursor=pointer]
      - listitem [ref=f3e310]:
        - generic [ref=f3e311]: task-015 Whitespace Saved archived
        - generic [ref=f3e312]: 0/0 completed
        - generic [ref=f3e313]:
          - button "Open project" [ref=f3e314] [cursor=pointer]
          - button "Restore project" [ref=f3e315] [cursor=pointer]
      - listitem [ref=f3e316]:
        - generic [ref=f3e317]: task-015 Search MIXED archived
        - generic [ref=f3e318]: 0/0 completed
        - generic [ref=f3e319]:
          - button "Open project" [ref=f3e320] [cursor=pointer]
          - button "Restore project" [ref=f3e321] [cursor=pointer]
      - listitem [ref=f3e322]:
        - generic [ref=f3e323]: task-015 Search mutable titles
        - generic [ref=f3e324]: 0/3 completed
        - generic [ref=f3e325]:
          - button "Open project" [ref=f3e326] [cursor=pointer]
          - button "Restore project" [ref=f3e327] [cursor=pointer]
      - listitem [ref=f3e328]:
        - generic [ref=f3e329]: task-015 Persistence renamed
        - generic [ref=f3e330]: 1/1 completed
        - generic [ref=f3e331]:
          - button "Open project" [ref=f3e332] [cursor=pointer]
          - button "Restore project" [ref=f3e333] [cursor=pointer]
      - listitem [ref=f3e334]:
        - generic [ref=f3e335]: task-016 Deletion fields
        - generic [ref=f3e336]: 4/6 completed
        - generic [ref=f3e337]:
          - button "Open project" [ref=f3e338] [cursor=pointer]
          - button "Restore project" [ref=f3e339] [cursor=pointer]
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
  10 |   return page.getByTestId('task-row').filter({has:page.getByRole('checkbox',{name:'Complete '+title,exact:true})}).filter({visible:true});
  11 | }
  12 | export async function createProject(page, name) {
  13 |   await page.goto('/');
  14 |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name === name.trim() ? projectName(name) : '  ' + projectName(name) + '  ');
  15 |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  16 |   await expect(projectRow(page, name.trim())).toBeVisible();
  17 | }
  18 | export async function openProject(page, name) {
> 19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
     |                                                                                           ^ Error: locator.click: Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-016 Deletion fields' }).visible().getByRole('button', { name: 'Open project', exact: true }) resolved to 2 elements:
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
  66 | export async function expectPersistedPriority(page, project, title, priority) {
  67 |   const observer = await page.context().newPage();
  68 |   try {
  69 |     await expect.poll(async () => {
  70 |       await observer.goto('/');
  71 |       await openProject(observer, project);
  72 |       await observer.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'All'});
  73 |       return taskRow(observer, title).getByRole('combobox', {name:'Task priority', exact:true}).locator('option:checked').textContent();
  74 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
  75 |   } finally { await observer.close(); }
  76 | }
  77 | 
```