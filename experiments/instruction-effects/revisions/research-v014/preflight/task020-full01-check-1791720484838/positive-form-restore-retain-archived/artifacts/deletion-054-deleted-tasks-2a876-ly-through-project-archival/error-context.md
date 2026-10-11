# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deletion.spec.mjs >> 054 deleted tasks preserve fields intersect filters and remain read-only through project archival
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/deletion.spec.mjs:10:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Deletion fields' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f38e1]:
  - heading "Workboard" [level=1] [ref=f38e2]
  - group [ref=f38e4]:
    - button "Task directory" [ref=f38e5]
  - group [ref=f38e7]:
    - generic [ref=f38e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f38e9]
    - generic [ref=f38e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f38e11]
    - button "Import project" [ref=f38e12]
  - group [ref=f38e14]:
    - generic [ref=f38e15]:
      - text: Project name
      - textbox "Project name" [ref=f38e16]
    - button "Create project" [ref=f38e17]
  - group [ref=f38e19]:
    - generic [ref=f38e20]:
      - text: Project search
      - textbox "Project search" [ref=f38e21]
    - button "Search projects" [ref=f38e22]
  - generic [ref=f38e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f38e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f38e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f38e28]:
      - button "Open project" [ref=f38e29]
    - group [ref=f38e31]:
      - button "Archive project" [ref=f38e32]
  - generic [ref=f38e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f38e35]:
      - button "Open project" [ref=f38e36]
    - group [ref=f38e38]:
      - button "Archive project" [ref=f38e39]
  - generic [ref=f38e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f38e42]:
      - button "Open project" [ref=f38e43]
    - group [ref=f38e45]:
      - button "Archive project" [ref=f38e46]
  - generic [ref=f38e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f38e49]:
      - button "Open project" [ref=f38e50]
    - group [ref=f38e52]:
      - button "Archive project" [ref=f38e53]
  - generic [ref=f38e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f38e56]:
      - button "Open project" [ref=f38e57]
    - group [ref=f38e59]:
      - button "Archive project" [ref=f38e60]
  - generic [ref=f38e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f38e63]:
      - button "Open project" [ref=f38e64]
    - group [ref=f38e66]:
      - button "Archive project" [ref=f38e67]
  - generic [ref=f38e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f38e70]:
      - button "Open project" [ref=f38e71]
    - group [ref=f38e73]:
      - button "Archive project" [ref=f38e74]
  - generic [ref=f38e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f38e77]:
      - button "Open project" [ref=f38e78]
    - group [ref=f38e80]:
      - button "Archive project" [ref=f38e81]
  - generic [ref=f38e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f38e84]:
      - button "Open project" [ref=f38e85]
    - group [ref=f38e87]:
      - button "Archive project" [ref=f38e88]
  - generic [ref=f38e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f38e91]:
      - button "Open project" [ref=f38e92]
    - group [ref=f38e94]:
      - button "Archive project" [ref=f38e95]
  - generic [ref=f38e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f38e98]:
      - button "Open project" [ref=f38e99]
    - group [ref=f38e101]:
      - button "Archive project" [ref=f38e102]
  - generic [ref=f38e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f38e105]:
      - button "Open project" [ref=f38e106]
    - group [ref=f38e108]:
      - button "Archive project" [ref=f38e109]
  - generic [ref=f38e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f38e112]:
      - button "Open project" [ref=f38e113]
    - group [ref=f38e115]:
      - button "Archive project" [ref=f38e116]
  - generic [ref=f38e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f38e119]:
      - button "Open project" [ref=f38e120]
    - group [ref=f38e122]:
      - button "Archive project" [ref=f38e123]
  - generic [ref=f38e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f38e126]:
      - button "Open project" [ref=f38e127]
    - group [ref=f38e129]:
      - button "Archive project" [ref=f38e130]
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