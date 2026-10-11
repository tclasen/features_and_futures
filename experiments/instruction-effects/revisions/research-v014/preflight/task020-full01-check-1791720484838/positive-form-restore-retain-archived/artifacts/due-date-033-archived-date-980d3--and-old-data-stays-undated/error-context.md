# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: due-date.spec.mjs >> 033 archived dates are read-only restored and old data stays undated
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/due-date.spec.mjs:44:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Calendar archival' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f14e1]:
  - heading "Workboard" [level=1] [ref=f14e2]
  - group [ref=f14e4]:
    - button "Task directory" [ref=f14e5]
  - group [ref=f14e7]:
    - generic [ref=f14e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f14e9]
    - generic [ref=f14e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f14e11]
    - button "Import project" [ref=f14e12]
  - group [ref=f14e14]:
    - generic [ref=f14e15]:
      - text: Project name
      - textbox "Project name" [ref=f14e16]
    - button "Create project" [ref=f14e17]
  - group [ref=f14e19]:
    - generic [ref=f14e20]:
      - text: Project search
      - textbox "Project search" [ref=f14e21]
    - button "Search projects" [ref=f14e22]
  - generic [ref=f14e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f14e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f14e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f14e28]:
      - button "Open project" [ref=f14e29]
    - group [ref=f14e31]:
      - button "Archive project" [ref=f14e32]
  - generic [ref=f14e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f14e35]:
      - button "Open project" [ref=f14e36]
    - group [ref=f14e38]:
      - button "Archive project" [ref=f14e39]
  - generic [ref=f14e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f14e42]:
      - button "Open project" [ref=f14e43]
    - group [ref=f14e45]:
      - button "Archive project" [ref=f14e46]
  - generic [ref=f14e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f14e49]:
      - button "Open project" [ref=f14e50]
    - group [ref=f14e52]:
      - button "Archive project" [ref=f14e53]
  - generic [ref=f14e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f14e56]:
      - button "Open project" [ref=f14e57]
    - group [ref=f14e59]:
      - button "Archive project" [ref=f14e60]
  - generic [ref=f14e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f14e63]:
      - button "Open project" [ref=f14e64]
    - group [ref=f14e66]:
      - button "Archive project" [ref=f14e67]
  - generic [ref=f14e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f14e70]:
      - button "Open project" [ref=f14e71]
    - group [ref=f14e73]:
      - button "Archive project" [ref=f14e74]
  - generic [ref=f14e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f14e77]:
      - button "Open project" [ref=f14e78]
    - group [ref=f14e80]:
      - button "Archive project" [ref=f14e81]
  - generic [ref=f14e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f14e84]:
      - button "Open project" [ref=f14e85]
    - group [ref=f14e87]:
      - button "Archive project" [ref=f14e88]
  - generic [ref=f14e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f14e91]:
      - button "Open project" [ref=f14e92]
    - group [ref=f14e94]:
      - button "Archive project" [ref=f14e95]
  - generic [ref=f14e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f14e98]:
      - button "Open project" [ref=f14e99]
    - group [ref=f14e101]:
      - button "Archive project" [ref=f14e102]
  - generic [ref=f14e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f14e105]:
      - button "Open project" [ref=f14e106]
    - group [ref=f14e108]:
      - button "Archive project" [ref=f14e109]
  - generic [ref=f14e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f14e112]:
      - button "Open project" [ref=f14e113]
    - group [ref=f14e115]:
      - button "Archive project" [ref=f14e116]
  - generic [ref=f14e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f14e119]:
      - button "Open project" [ref=f14e120]
    - group [ref=f14e122]:
      - button "Archive project" [ref=f14e123]
  - generic [ref=f14e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f14e126]:
      - button "Open project" [ref=f14e127]
    - group [ref=f14e129]:
      - button "Archive project" [ref=f14e130]
  - generic [ref=f14e131]:
    - text: task-020 Deletion fields4/6 completed
    - group [ref=f14e133]:
      - button "Open project" [ref=f14e134]
    - group [ref=f14e136]:
      - button "Archive project" [ref=f14e137]
  - generic [ref=f14e138]:
    - text: task-020 Deletion target1/3 completed
    - group [ref=f14e140]:
      - button "Open project" [ref=f14e141]
    - group [ref=f14e143]:
      - button "Archive project" [ref=f14e144]
  - generic [ref=f14e145]:
    - text: task-020 Deletion order0/3 completed
    - group [ref=f14e147]:
      - button "Open project" [ref=f14e148]
    - group [ref=f14e150]:
      - button "Archive project" [ref=f14e151]
  - generic [ref=f14e152]:
    - text: task-020 Deletion restart0/0 completed
    - group [ref=f14e154]:
      - button "Open project" [ref=f14e155]
    - group [ref=f14e157]:
      - button "Archive project" [ref=f14e158]
  - generic [ref=f14e159]:
    - text: task-020 Deleted intersections0/0 completed
    - group [ref=f14e161]:
      - button "Open project" [ref=f14e162]
    - group [ref=f14e164]:
      - button "Archive project" [ref=f14e165]
  - generic [ref=f14e166]:
    - text: task-020 Directory Zulu owner1/3 completed
    - group [ref=f14e168]:
      - button "Open project" [ref=f14e169]
    - group [ref=f14e171]:
      - button "Archive project" [ref=f14e172]
  - generic [ref=f14e173]:
    - text: task-020 Directory Alpha owner0/1 completed
    - group [ref=f14e175]:
      - button "Open project" [ref=f14e176]
    - group [ref=f14e178]:
      - button "Archive project" [ref=f14e179]
  - generic [ref=f14e180]:
    - text: task-020 Directory filter owner1/5 completed
    - group [ref=f14e182]:
      - button "Open project" [ref=f14e183]
    - group [ref=f14e185]:
      - button "Archive project" [ref=f14e186]
  - generic [ref=f14e187]:
    - text: task-020 Directory whitespace0/1 completed
    - group [ref=f14e189]:
      - button "Open project" [ref=f14e190]
    - group [ref=f14e192]:
      - button "Archive project" [ref=f14e193]
  - generic [ref=f14e194]:
    - text: task-020 Calendar persistence0/1 completed
    - group [ref=f14e196]:
      - button "Open project" [ref=f14e197]
    - group [ref=f14e199]:
      - button "Archive project" [ref=f14e200]
  - generic [ref=f14e201]:
    - text: task-020 Calendar validation0/1 completed
    - group [ref=f14e203]:
      - button "Open project" [ref=f14e204]
    - group [ref=f14e206]:
      - button "Archive project" [ref=f14e207]
  - generic [ref=f14e208]:
    - text: task-020 Calendar independence2/3 completed
    - group [ref=f14e210]:
      - button "Open project" [ref=f14e211]
    - group [ref=f14e213]:
      - button "Archive project" [ref=f14e214]
  - generic [ref=f14e215]:
    - text: task-020 Calendar second owner0/1 completed
    - group [ref=f14e217]:
      - button "Open project" [ref=f14e218]
    - group [ref=f14e220]:
      - button "Archive project" [ref=f14e221]
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