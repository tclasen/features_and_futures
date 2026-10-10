# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-order.spec.mjs >> 091 project-name ordering folds ASCII keeps stable owner ties and reads current renames without changing storage
- Location: experiments/instruction-effects/revisions/research-v008/preflight/priority-fixtures/final030-executed-suite/directory-project-order.spec.mjs:33:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-030 Name order ALPHA' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-030 Name order ALPHA' }).visible() resolved to 2 elements:
    1) <div data-testid="project-row">…</div> aka getByText('task-030 Name order alpha0/2')
    2) <div data-testid="project-row">…</div> aka getByText('task-030 Name order ALPHA0/0')

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-030 Name order ALPHA' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-030 Name order ALPHA' }).visible()

```

# Page snapshot

```yaml
- generic [active] [ref=f26e1]:
  - heading "Workboard" [level=1] [ref=f26e2]
  - group [ref=f26e4]:
    - button "Task directory" [ref=f26e5]
  - group [ref=f26e7]:
    - generic [ref=f26e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f26e9]
    - generic [ref=f26e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f26e11]
    - button "Import project" [ref=f26e12]
  - group [ref=f26e14]:
    - generic [ref=f26e15]:
      - text: Workspace JSON
      - textbox "Workspace JSON" [ref=f26e16]
    - button "Import workspace" [ref=f26e17]
  - group [ref=f26e19]:
    - generic [ref=f26e20]:
      - text: Project name
      - textbox "Project name" [ref=f26e21]
    - button "Create project" [ref=f26e22]
  - group [ref=f26e24]:
    - generic [ref=f26e25]:
      - text: Project search
      - textbox "Project search" [ref=f26e26]
    - button "Search projects" [ref=f26e27]
  - generic [ref=f26e29]:
    - text: Project filter
    - combobox "Project filter" [ref=f26e30]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f26e31]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f26e33]:
      - button "Open project" [ref=f26e34]
    - group [ref=f26e36]:
      - button "Archive project" [ref=f26e37]
  - generic [ref=f26e38]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f26e40]:
      - button "Open project" [ref=f26e41]
    - group [ref=f26e43]:
      - button "Archive project" [ref=f26e44]
  - generic [ref=f26e45]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f26e47]:
      - button "Open project" [ref=f26e48]
    - group [ref=f26e50]:
      - button "Archive project" [ref=f26e51]
  - generic [ref=f26e52]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f26e54]:
      - button "Open project" [ref=f26e55]
    - group [ref=f26e57]:
      - button "Archive project" [ref=f26e58]
  - generic [ref=f26e59]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f26e61]:
      - button "Open project" [ref=f26e62]
    - group [ref=f26e64]:
      - button "Archive project" [ref=f26e65]
  - generic [ref=f26e66]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f26e68]:
      - button "Open project" [ref=f26e69]
    - group [ref=f26e71]:
      - button "Archive project" [ref=f26e72]
  - generic [ref=f26e73]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f26e75]:
      - button "Open project" [ref=f26e76]
    - group [ref=f26e78]:
      - button "Archive project" [ref=f26e79]
  - generic [ref=f26e80]:
    - text: task-030 Date batch first1/5 completed
    - group [ref=f26e82]:
      - button "Open project" [ref=f26e83]
    - group [ref=f26e85]:
      - button "Archive project" [ref=f26e86]
  - generic [ref=f26e87]:
    - text: task-030 Date batch second0/1 completed
    - group [ref=f26e89]:
      - button "Open project" [ref=f26e90]
    - group [ref=f26e92]:
      - button "Archive project" [ref=f26e93]
  - generic [ref=f26e94]:
    - text: task-030 Date validation first0/1 completed
    - group [ref=f26e96]:
      - button "Open project" [ref=f26e97]
    - group [ref=f26e99]:
      - button "Archive project" [ref=f26e100]
  - generic [ref=f26e101]:
    - text: task-030 Date validation second1/1 completed
    - group [ref=f26e103]:
      - button "Open project" [ref=f26e104]
    - group [ref=f26e106]:
      - button "Archive project" [ref=f26e107]
  - generic [ref=f26e108]:
    - text: task-030 Bulk position first1/3 completed
    - group [ref=f26e110]:
      - button "Open project" [ref=f26e111]
    - group [ref=f26e113]:
      - button "Archive project" [ref=f26e114]
  - generic [ref=f26e115]:
    - text: task-030 Bulk position second0/2 completed
    - group [ref=f26e117]:
      - button "Open project" [ref=f26e118]
    - group [ref=f26e120]:
      - button "Archive project" [ref=f26e121]
  - generic [ref=f26e122]:
    - text: task-030 Notes batch first1/5 completed
    - group [ref=f26e124]:
      - button "Open project" [ref=f26e125]
    - group [ref=f26e127]:
      - button "Archive project" [ref=f26e128]
  - generic [ref=f26e129]:
    - text: task-030 Notes batch second0/1 completed
    - group [ref=f26e131]:
      - button "Open project" [ref=f26e132]
    - group [ref=f26e134]:
      - button "Archive project" [ref=f26e135]
  - generic [ref=f26e136]:
    - text: task-030 Notes limit first0/1 completed
    - group [ref=f26e138]:
      - button "Open project" [ref=f26e139]
    - group [ref=f26e141]:
      - button "Archive project" [ref=f26e142]
  - generic [ref=f26e143]:
    - text: task-030 Notes limit second1/1 completed
    - group [ref=f26e145]:
      - button "Open project" [ref=f26e146]
    - group [ref=f26e148]:
      - button "Archive project" [ref=f26e149]
  - generic [ref=f26e150]:
    - text: task-030 Bulk position first0/0 completed
    - group [ref=f26e152]:
      - button "Open project" [ref=f26e153]
    - group [ref=f26e155]:
      - button "Archive project" [ref=f26e156]
  - generic [ref=f26e157]:
    - text: task-030 Bulk position first0/0 completed
    - group [ref=f26e159]:
      - button "Open project" [ref=f26e160]
    - group [ref=f26e162]:
      - button "Archive project" [ref=f26e163]
  - generic [ref=f26e164]:
    - text: task-030 Priority batch first owner1/5 completed
    - group [ref=f26e166]:
      - button "Open project" [ref=f26e167]
    - group [ref=f26e169]:
      - button "Archive project" [ref=f26e170]
  - generic [ref=f26e171]:
    - text: task-030 Priority batch second owner0/1 completed
    - group [ref=f26e173]:
      - button "Open project" [ref=f26e174]
    - group [ref=f26e176]:
      - button "Archive project" [ref=f26e177]
  - generic [ref=f26e178]:
    - text: task-030 Priority duplicate owner0/3 completed
    - group [ref=f26e180]:
      - button "Open project" [ref=f26e181]
    - group [ref=f26e183]:
      - button "Archive project" [ref=f26e184]
  - generic [ref=f26e185]:
    - text: task-030 Priority duplicate owner1/3 completed
    - group [ref=f26e187]:
      - button "Open project" [ref=f26e188]
    - group [ref=f26e190]:
      - button "Archive project" [ref=f26e191]
  - generic [ref=f26e192]:
    - text: task-030 Bulk position first0/0 completed
    - group [ref=f26e194]:
      - button "Open project" [ref=f26e195]
    - group [ref=f26e197]:
      - button "Archive project" [ref=f26e198]
  - generic [ref=f26e199]:
    - text: task-030 Name order Zulu0/2 completed
    - group [ref=f26e201]:
      - button "Open project" [ref=f26e202]
    - group [ref=f26e204]:
      - button "Archive project" [ref=f26e205]
  - generic [ref=f26e206]:
    - text: task-030 Name order alpha0/2 completed
    - group [ref=f26e208]:
      - button "Open project" [ref=f26e209]
    - group [ref=f26e211]:
      - button "Archive project" [ref=f26e212]
  - generic [ref=f26e213]:
    - text: task-030 Name order ALPHA0/0 completed
    - group [ref=f26e215]:
      - button "Open project" [ref=f26e216]
    - group [ref=f26e218]:
      - button "Archive project" [ref=f26e219]
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
> 16 |   await expect(projectRow(page, name.trim())).toBeVisible();
     |                                               ^ Error: expect(locator).toBeVisible() failed
  17 | }
  18 | export async function openProject(page, name) {
  19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
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