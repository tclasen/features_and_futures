# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-project-order-position.spec.mjs >> 093 project-name ordering preserves own and foreign reserved positions later edits and export order
- Location: experiments/instruction-effects/revisions/research-v008/preflight/priority-fixtures/final030-executed-suite/directory-project-order-position.spec.mjs:8:14

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-030 Bulk position first' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-030 Bulk position first' }).visible() resolved to 4 elements:
    1) <div data-testid="project-row">…</div> aka getByText('task-030 Bulk position first1')
    2) <div data-testid="project-row">…</div> aka getByText('task-030 Bulk position first0').first()
    3) <div data-testid="project-row">…</div> aka getByText('task-030 Bulk position first0').nth(1)
    4) <div data-testid="project-row">…</div> aka getByText('task-030 Bulk position first0').nth(2)

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-030 Bulk position first' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-030 Bulk position first' }).visible()

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - heading "Workboard" [level=1] [ref=f1e2]
  - group [ref=f1e4]:
    - button "Task directory" [ref=f1e5]
  - group [ref=f1e7]:
    - generic [ref=f1e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f1e9]
    - generic [ref=f1e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f1e11]
    - button "Import project" [ref=f1e12]
  - group [ref=f1e14]:
    - generic [ref=f1e15]:
      - text: Workspace JSON
      - textbox "Workspace JSON" [ref=f1e16]
    - button "Import workspace" [ref=f1e17]
  - group [ref=f1e19]:
    - generic [ref=f1e20]:
      - text: Project name
      - textbox "Project name" [ref=f1e21]
    - button "Create project" [ref=f1e22]
  - group [ref=f1e24]:
    - generic [ref=f1e25]:
      - text: Project search
      - textbox "Project search" [ref=f1e26]
    - button "Search projects" [ref=f1e27]
  - generic [ref=f1e29]:
    - text: Project filter
    - combobox "Project filter" [ref=f1e30]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f1e31]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f1e33]:
      - button "Open project" [ref=f1e34]
    - group [ref=f1e36]:
      - button "Archive project" [ref=f1e37]
  - generic [ref=f1e38]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f1e40]:
      - button "Open project" [ref=f1e41]
    - group [ref=f1e43]:
      - button "Archive project" [ref=f1e44]
  - generic [ref=f1e45]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f1e47]:
      - button "Open project" [ref=f1e48]
    - group [ref=f1e50]:
      - button "Archive project" [ref=f1e51]
  - generic [ref=f1e52]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f1e54]:
      - button "Open project" [ref=f1e55]
    - group [ref=f1e57]:
      - button "Archive project" [ref=f1e58]
  - generic [ref=f1e59]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f1e61]:
      - button "Open project" [ref=f1e62]
    - group [ref=f1e64]:
      - button "Archive project" [ref=f1e65]
  - generic [ref=f1e66]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f1e68]:
      - button "Open project" [ref=f1e69]
    - group [ref=f1e71]:
      - button "Archive project" [ref=f1e72]
  - generic [ref=f1e73]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f1e75]:
      - button "Open project" [ref=f1e76]
    - group [ref=f1e78]:
      - button "Archive project" [ref=f1e79]
  - generic [ref=f1e80]:
    - text: task-030 Date batch first1/5 completed
    - group [ref=f1e82]:
      - button "Open project" [ref=f1e83]
    - group [ref=f1e85]:
      - button "Archive project" [ref=f1e86]
  - generic [ref=f1e87]:
    - text: task-030 Date batch second0/1 completed
    - group [ref=f1e89]:
      - button "Open project" [ref=f1e90]
    - group [ref=f1e92]:
      - button "Archive project" [ref=f1e93]
  - generic [ref=f1e94]:
    - text: task-030 Date validation first0/1 completed
    - group [ref=f1e96]:
      - button "Open project" [ref=f1e97]
    - group [ref=f1e99]:
      - button "Archive project" [ref=f1e100]
  - generic [ref=f1e101]:
    - text: task-030 Date validation second1/1 completed
    - group [ref=f1e103]:
      - button "Open project" [ref=f1e104]
    - group [ref=f1e106]:
      - button "Archive project" [ref=f1e107]
  - generic [ref=f1e108]:
    - text: task-030 Bulk position first1/3 completed
    - group [ref=f1e110]:
      - button "Open project" [ref=f1e111]
    - group [ref=f1e113]:
      - button "Archive project" [ref=f1e114]
  - generic [ref=f1e115]:
    - text: task-030 Bulk position second0/2 completed
    - group [ref=f1e117]:
      - button "Open project" [ref=f1e118]
    - group [ref=f1e120]:
      - button "Archive project" [ref=f1e121]
  - generic [ref=f1e122]:
    - text: task-030 Notes batch first1/5 completed
    - group [ref=f1e124]:
      - button "Open project" [ref=f1e125]
    - group [ref=f1e127]:
      - button "Archive project" [ref=f1e128]
  - generic [ref=f1e129]:
    - text: task-030 Notes batch second0/1 completed
    - group [ref=f1e131]:
      - button "Open project" [ref=f1e132]
    - group [ref=f1e134]:
      - button "Archive project" [ref=f1e135]
  - generic [ref=f1e136]:
    - text: task-030 Notes limit first0/1 completed
    - group [ref=f1e138]:
      - button "Open project" [ref=f1e139]
    - group [ref=f1e141]:
      - button "Archive project" [ref=f1e142]
  - generic [ref=f1e143]:
    - text: task-030 Notes limit second1/1 completed
    - group [ref=f1e145]:
      - button "Open project" [ref=f1e146]
    - group [ref=f1e148]:
      - button "Archive project" [ref=f1e149]
  - generic [ref=f1e150]:
    - text: task-030 Bulk position first0/0 completed
    - group [ref=f1e152]:
      - button "Open project" [ref=f1e153]
    - group [ref=f1e155]:
      - button "Archive project" [ref=f1e156]
  - generic [ref=f1e157]:
    - text: task-030 Bulk position first0/0 completed
    - group [ref=f1e159]:
      - button "Open project" [ref=f1e160]
    - group [ref=f1e162]:
      - button "Archive project" [ref=f1e163]
  - generic [ref=f1e164]:
    - text: task-030 Priority batch first owner1/5 completed
    - group [ref=f1e166]:
      - button "Open project" [ref=f1e167]
    - group [ref=f1e169]:
      - button "Archive project" [ref=f1e170]
  - generic [ref=f1e171]:
    - text: task-030 Priority batch second owner0/1 completed
    - group [ref=f1e173]:
      - button "Open project" [ref=f1e174]
    - group [ref=f1e176]:
      - button "Archive project" [ref=f1e177]
  - generic [ref=f1e178]:
    - text: task-030 Priority duplicate owner0/3 completed
    - group [ref=f1e180]:
      - button "Open project" [ref=f1e181]
    - group [ref=f1e183]:
      - button "Archive project" [ref=f1e184]
  - generic [ref=f1e185]:
    - text: task-030 Priority duplicate owner1/3 completed
    - group [ref=f1e187]:
      - button "Open project" [ref=f1e188]
    - group [ref=f1e190]:
      - button "Archive project" [ref=f1e191]
  - generic [ref=f1e192]:
    - text: task-030 Bulk position first0/0 completed
    - group [ref=f1e194]:
      - button "Open project" [ref=f1e195]
    - group [ref=f1e197]:
      - button "Archive project" [ref=f1e198]
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