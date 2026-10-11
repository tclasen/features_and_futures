# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: due-range.spec.mjs >> 037 archived ranges stay usable and reopening clears transient boundaries
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/due-range.spec.mjs:48:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Range archival' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f15e1]:
  - heading "Workboard" [level=1] [ref=f15e2]
  - group [ref=f15e4]:
    - button "Task directory" [ref=f15e5]
  - group [ref=f15e7]:
    - generic [ref=f15e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f15e9]
    - generic [ref=f15e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f15e11]
    - button "Import project" [ref=f15e12]
  - group [ref=f15e14]:
    - generic [ref=f15e15]:
      - text: Project name
      - textbox "Project name" [ref=f15e16]
    - button "Create project" [ref=f15e17]
  - group [ref=f15e19]:
    - generic [ref=f15e20]:
      - text: Project search
      - textbox "Project search" [ref=f15e21]
    - button "Search projects" [ref=f15e22]
  - generic [ref=f15e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f15e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f15e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f15e28]:
      - button "Open project" [ref=f15e29]
    - group [ref=f15e31]:
      - button "Archive project" [ref=f15e32]
  - generic [ref=f15e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f15e35]:
      - button "Open project" [ref=f15e36]
    - group [ref=f15e38]:
      - button "Archive project" [ref=f15e39]
  - generic [ref=f15e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f15e42]:
      - button "Open project" [ref=f15e43]
    - group [ref=f15e45]:
      - button "Archive project" [ref=f15e46]
  - generic [ref=f15e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f15e49]:
      - button "Open project" [ref=f15e50]
    - group [ref=f15e52]:
      - button "Archive project" [ref=f15e53]
  - generic [ref=f15e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f15e56]:
      - button "Open project" [ref=f15e57]
    - group [ref=f15e59]:
      - button "Archive project" [ref=f15e60]
  - generic [ref=f15e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f15e63]:
      - button "Open project" [ref=f15e64]
    - group [ref=f15e66]:
      - button "Archive project" [ref=f15e67]
  - generic [ref=f15e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f15e70]:
      - button "Open project" [ref=f15e71]
    - group [ref=f15e73]:
      - button "Archive project" [ref=f15e74]
  - generic [ref=f15e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f15e77]:
      - button "Open project" [ref=f15e78]
    - group [ref=f15e80]:
      - button "Archive project" [ref=f15e81]
  - generic [ref=f15e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f15e84]:
      - button "Open project" [ref=f15e85]
    - group [ref=f15e87]:
      - button "Archive project" [ref=f15e88]
  - generic [ref=f15e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f15e91]:
      - button "Open project" [ref=f15e92]
    - group [ref=f15e94]:
      - button "Archive project" [ref=f15e95]
  - generic [ref=f15e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f15e98]:
      - button "Open project" [ref=f15e99]
    - group [ref=f15e101]:
      - button "Archive project" [ref=f15e102]
  - generic [ref=f15e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f15e105]:
      - button "Open project" [ref=f15e106]
    - group [ref=f15e108]:
      - button "Archive project" [ref=f15e109]
  - generic [ref=f15e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f15e112]:
      - button "Open project" [ref=f15e113]
    - group [ref=f15e115]:
      - button "Archive project" [ref=f15e116]
  - generic [ref=f15e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f15e119]:
      - button "Open project" [ref=f15e120]
    - group [ref=f15e122]:
      - button "Archive project" [ref=f15e123]
  - generic [ref=f15e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f15e126]:
      - button "Open project" [ref=f15e127]
    - group [ref=f15e129]:
      - button "Archive project" [ref=f15e130]
  - generic [ref=f15e131]:
    - text: task-020 Deletion fields4/6 completed
    - group [ref=f15e133]:
      - button "Open project" [ref=f15e134]
    - group [ref=f15e136]:
      - button "Archive project" [ref=f15e137]
  - generic [ref=f15e138]:
    - text: task-020 Deletion target1/3 completed
    - group [ref=f15e140]:
      - button "Open project" [ref=f15e141]
    - group [ref=f15e143]:
      - button "Archive project" [ref=f15e144]
  - generic [ref=f15e145]:
    - text: task-020 Deletion order0/3 completed
    - group [ref=f15e147]:
      - button "Open project" [ref=f15e148]
    - group [ref=f15e150]:
      - button "Archive project" [ref=f15e151]
  - generic [ref=f15e152]:
    - text: task-020 Deletion restart0/0 completed
    - group [ref=f15e154]:
      - button "Open project" [ref=f15e155]
    - group [ref=f15e157]:
      - button "Archive project" [ref=f15e158]
  - generic [ref=f15e159]:
    - text: task-020 Deleted intersections0/0 completed
    - group [ref=f15e161]:
      - button "Open project" [ref=f15e162]
    - group [ref=f15e164]:
      - button "Archive project" [ref=f15e165]
  - generic [ref=f15e166]:
    - text: task-020 Directory Zulu owner1/3 completed
    - group [ref=f15e168]:
      - button "Open project" [ref=f15e169]
    - group [ref=f15e171]:
      - button "Archive project" [ref=f15e172]
  - generic [ref=f15e173]:
    - text: task-020 Directory Alpha owner0/1 completed
    - group [ref=f15e175]:
      - button "Open project" [ref=f15e176]
    - group [ref=f15e178]:
      - button "Archive project" [ref=f15e179]
  - generic [ref=f15e180]:
    - text: task-020 Directory filter owner1/5 completed
    - group [ref=f15e182]:
      - button "Open project" [ref=f15e183]
    - group [ref=f15e185]:
      - button "Archive project" [ref=f15e186]
  - generic [ref=f15e187]:
    - text: task-020 Directory whitespace0/1 completed
    - group [ref=f15e189]:
      - button "Open project" [ref=f15e190]
    - group [ref=f15e192]:
      - button "Archive project" [ref=f15e193]
  - generic [ref=f15e194]:
    - text: task-020 Calendar persistence0/1 completed
    - group [ref=f15e196]:
      - button "Open project" [ref=f15e197]
    - group [ref=f15e199]:
      - button "Archive project" [ref=f15e200]
  - generic [ref=f15e201]:
    - text: task-020 Calendar validation0/1 completed
    - group [ref=f15e203]:
      - button "Open project" [ref=f15e204]
    - group [ref=f15e206]:
      - button "Archive project" [ref=f15e207]
  - generic [ref=f15e208]:
    - text: task-020 Calendar independence2/3 completed
    - group [ref=f15e210]:
      - button "Open project" [ref=f15e211]
    - group [ref=f15e213]:
      - button "Archive project" [ref=f15e214]
  - generic [ref=f15e215]:
    - text: task-020 Calendar second owner0/1 completed
    - group [ref=f15e217]:
      - button "Open project" [ref=f15e218]
    - group [ref=f15e220]:
      - button "Archive project" [ref=f15e221]
  - generic [ref=f15e222]:
    - text: task-020 Calendar archival0/1 completed
    - group [ref=f15e224]:
      - button "Open project" [ref=f15e225]
    - group [ref=f15e227]:
      - button "Archive project" [ref=f15e228]
  - generic [ref=f15e229]:
    - text: task-020 Range boundaries0/5 completed
    - group [ref=f15e231]:
      - button "Open project" [ref=f15e232]
    - group [ref=f15e234]:
      - button "Archive project" [ref=f15e235]
  - generic [ref=f15e236]:
    - text: task-020 Range intersections0/4 completed
    - group [ref=f15e238]:
      - button "Open project" [ref=f15e239]
    - group [ref=f15e241]:
      - button "Archive project" [ref=f15e242]
  - generic [ref=f15e243]:
    - text: task-020 Range validation0/2 completed
    - group [ref=f15e245]:
      - button "Open project" [ref=f15e246]
    - group [ref=f15e248]:
      - button "Archive project" [ref=f15e249]
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