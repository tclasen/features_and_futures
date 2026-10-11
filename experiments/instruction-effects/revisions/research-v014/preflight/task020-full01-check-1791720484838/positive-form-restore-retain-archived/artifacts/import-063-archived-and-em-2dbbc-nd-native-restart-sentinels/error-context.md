# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: import.spec.mjs >> 063 archived and empty imports preserve flags literal data and native restart sentinels
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/import.spec.mjs:23:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Import restart' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - heading "Workboard" [level=1] [ref=f5e2]
  - group [ref=f5e4]:
    - button "Task directory" [ref=f5e5]
  - group [ref=f5e7]:
    - generic [ref=f5e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f5e9]
    - generic [ref=f5e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f5e11]
    - button "Import project" [ref=f5e12]
  - group [ref=f5e14]:
    - generic [ref=f5e15]:
      - text: Project name
      - textbox "Project name" [ref=f5e16]
    - button "Create project" [ref=f5e17]
  - group [ref=f5e19]:
    - generic [ref=f5e20]:
      - text: Project search
      - textbox "Project search" [ref=f5e21]
    - button "Search projects" [ref=f5e22]
  - generic [ref=f5e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f5e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f5e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f5e28]:
      - button "Open project" [ref=f5e29]
    - group [ref=f5e31]:
      - button "Archive project" [ref=f5e32]
  - generic [ref=f5e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f5e35]:
      - button "Open project" [ref=f5e36]
    - group [ref=f5e38]:
      - button "Archive project" [ref=f5e39]
  - generic [ref=f5e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f5e42]:
      - button "Open project" [ref=f5e43]
    - group [ref=f5e45]:
      - button "Archive project" [ref=f5e46]
  - generic [ref=f5e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f5e49]:
      - button "Open project" [ref=f5e50]
    - group [ref=f5e52]:
      - button "Archive project" [ref=f5e53]
  - generic [ref=f5e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f5e56]:
      - button "Open project" [ref=f5e57]
    - group [ref=f5e59]:
      - button "Archive project" [ref=f5e60]
  - generic [ref=f5e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f5e63]:
      - button "Open project" [ref=f5e64]
    - group [ref=f5e66]:
      - button "Archive project" [ref=f5e67]
  - generic [ref=f5e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f5e70]:
      - button "Open project" [ref=f5e71]
    - group [ref=f5e73]:
      - button "Archive project" [ref=f5e74]
  - generic [ref=f5e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f5e77]:
      - button "Open project" [ref=f5e78]
    - group [ref=f5e80]:
      - button "Archive project" [ref=f5e81]
  - generic [ref=f5e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f5e84]:
      - button "Open project" [ref=f5e85]
    - group [ref=f5e87]:
      - button "Archive project" [ref=f5e88]
  - generic [ref=f5e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f5e91]:
      - button "Open project" [ref=f5e92]
    - group [ref=f5e94]:
      - button "Archive project" [ref=f5e95]
  - generic [ref=f5e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f5e98]:
      - button "Open project" [ref=f5e99]
    - group [ref=f5e101]:
      - button "Archive project" [ref=f5e102]
  - generic [ref=f5e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f5e105]:
      - button "Open project" [ref=f5e106]
    - group [ref=f5e108]:
      - button "Archive project" [ref=f5e109]
  - generic [ref=f5e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f5e112]:
      - button "Open project" [ref=f5e113]
    - group [ref=f5e115]:
      - button "Archive project" [ref=f5e116]
  - generic [ref=f5e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f5e119]:
      - button "Open project" [ref=f5e120]
    - group [ref=f5e122]:
      - button "Archive project" [ref=f5e123]
  - generic [ref=f5e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f5e126]:
      - button "Open project" [ref=f5e127]
    - group [ref=f5e129]:
      - button "Archive project" [ref=f5e130]
  - generic [ref=f5e131]:
    - text: task-020 Deletion fields4/6 completed
    - group [ref=f5e133]:
      - button "Open project" [ref=f5e134]
    - group [ref=f5e136]:
      - button "Archive project" [ref=f5e137]
  - generic [ref=f5e138]:
    - text: task-020 Deletion target1/3 completed
    - group [ref=f5e140]:
      - button "Open project" [ref=f5e141]
    - group [ref=f5e143]:
      - button "Archive project" [ref=f5e144]
  - generic [ref=f5e145]:
    - text: task-020 Deletion order0/3 completed
    - group [ref=f5e147]:
      - button "Open project" [ref=f5e148]
    - group [ref=f5e150]:
      - button "Archive project" [ref=f5e151]
  - generic [ref=f5e152]:
    - text: task-020 Deletion restart0/0 completed
    - group [ref=f5e154]:
      - button "Open project" [ref=f5e155]
    - group [ref=f5e157]:
      - button "Archive project" [ref=f5e158]
  - generic [ref=f5e159]:
    - text: task-020 Deleted intersections0/0 completed
    - group [ref=f5e161]:
      - button "Open project" [ref=f5e162]
    - group [ref=f5e164]:
      - button "Archive project" [ref=f5e165]
  - generic [ref=f5e166]:
    - text: task-020 Directory Zulu owner1/3 completed
    - group [ref=f5e168]:
      - button "Open project" [ref=f5e169]
    - group [ref=f5e171]:
      - button "Archive project" [ref=f5e172]
  - generic [ref=f5e173]:
    - text: task-020 Directory Alpha owner0/1 completed
    - group [ref=f5e175]:
      - button "Open project" [ref=f5e176]
    - group [ref=f5e178]:
      - button "Archive project" [ref=f5e179]
  - generic [ref=f5e180]:
    - text: task-020 Directory filter owner1/5 completed
    - group [ref=f5e182]:
      - button "Open project" [ref=f5e183]
    - group [ref=f5e185]:
      - button "Archive project" [ref=f5e186]
  - generic [ref=f5e187]:
    - text: task-020 Directory whitespace0/1 completed
    - group [ref=f5e189]:
      - button "Open project" [ref=f5e190]
    - group [ref=f5e192]:
      - button "Archive project" [ref=f5e193]
  - generic [ref=f5e194]:
    - text: task-020 Calendar persistence0/1 completed
    - group [ref=f5e196]:
      - button "Open project" [ref=f5e197]
    - group [ref=f5e199]:
      - button "Archive project" [ref=f5e200]
  - generic [ref=f5e201]:
    - text: task-020 Calendar validation0/1 completed
    - group [ref=f5e203]:
      - button "Open project" [ref=f5e204]
    - group [ref=f5e206]:
      - button "Archive project" [ref=f5e207]
  - generic [ref=f5e208]:
    - text: task-020 Calendar independence2/3 completed
    - group [ref=f5e210]:
      - button "Open project" [ref=f5e211]
    - group [ref=f5e213]:
      - button "Archive project" [ref=f5e214]
  - generic [ref=f5e215]:
    - text: task-020 Calendar second owner0/1 completed
    - group [ref=f5e217]:
      - button "Open project" [ref=f5e218]
    - group [ref=f5e220]:
      - button "Archive project" [ref=f5e221]
  - generic [ref=f5e222]:
    - text: task-020 Calendar archival0/1 completed
    - group [ref=f5e224]:
      - button "Open project" [ref=f5e225]
    - group [ref=f5e227]:
      - button "Archive project" [ref=f5e228]
  - generic [ref=f5e229]:
    - text: task-020 Range boundaries0/5 completed
    - group [ref=f5e231]:
      - button "Open project" [ref=f5e232]
    - group [ref=f5e234]:
      - button "Archive project" [ref=f5e235]
  - generic [ref=f5e236]:
    - text: task-020 Range intersections0/4 completed
    - group [ref=f5e238]:
      - button "Open project" [ref=f5e239]
    - group [ref=f5e241]:
      - button "Archive project" [ref=f5e242]
  - generic [ref=f5e243]:
    - text: task-020 Range validation0/2 completed
    - group [ref=f5e245]:
      - button "Open project" [ref=f5e246]
    - group [ref=f5e248]:
      - button "Archive project" [ref=f5e249]
  - generic [ref=f5e250]:
    - text: task-020 Range archival0/2 completed
    - group [ref=f5e252]:
      - button "Open project" [ref=f5e253]
    - group [ref=f5e255]:
      - button "Archive project" [ref=f5e256]
  - generic [ref=f5e257]:
    - text: task-020 Range owner renamed0/3 completed
    - group [ref=f5e259]:
      - button "Open project" [ref=f5e260]
    - group [ref=f5e262]:
      - button "Archive project" [ref=f5e263]
  - generic [ref=f5e264]:
    - text: task-020 Export foreign0/1 completed
    - group [ref=f5e266]:
      - button "Open project" [ref=f5e267]
    - group [ref=f5e269]:
      - button "Archive project" [ref=f5e270]
  - generic [ref=f5e271]:
    - text: task-020 Export full Ω0/2 completed
    - group [ref=f5e273]:
      - button "Open project" [ref=f5e274]
    - group [ref=f5e276]:
      - button "Archive project" [ref=f5e277]
  - generic [ref=f5e278]:
    - text: task-020 Export empty0/0 completed
    - group [ref=f5e280]:
      - button "Open project" [ref=f5e281]
    - group [ref=f5e283]:
      - button "Archive project" [ref=f5e284]
  - generic [ref=f5e285]:
    - text: task-020 Import origin0/2 completed
    - group [ref=f5e287]:
      - button "Open project" [ref=f5e288]
    - group [ref=f5e290]:
      - button "Archive project" [ref=f5e291]
  - generic [ref=f5e292]:
    - text: task-020 Import copy1/4 completed
    - group [ref=f5e294]:
      - button "Open project" [ref=f5e295]
    - group [ref=f5e297]:
      - button "Archive project" [ref=f5e298]
  - generic [ref=f5e299]:
    - text: task-020 Parse guard existing0/1 completed
    - group [ref=f5e301]:
      - button "Open project" [ref=f5e302]
    - group [ref=f5e304]:
      - button "Archive project" [ref=f5e305]
  - generic [ref=f5e306]:
    - text: task-020 Task guard existing0/1 completed
    - group [ref=f5e308]:
      - button "Open project" [ref=f5e309]
    - group [ref=f5e311]:
      - button "Archive project" [ref=f5e312]
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