# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notes.spec.mjs >> 052 multiline notes retain literal text filters and archived read-only behavior
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/notes.spec.mjs:10:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Notes values' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f23e1]:
  - heading "Workboard" [level=1] [ref=f23e2]
  - group [ref=f23e4]:
    - button "Task directory" [ref=f23e5]
  - group [ref=f23e7]:
    - generic [ref=f23e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f23e9]
    - generic [ref=f23e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f23e11]
    - button "Import project" [ref=f23e12]
  - group [ref=f23e14]:
    - generic [ref=f23e15]:
      - text: Project name
      - textbox "Project name" [ref=f23e16]
    - button "Create project" [ref=f23e17]
  - group [ref=f23e19]:
    - generic [ref=f23e20]:
      - text: Project search
      - textbox "Project search" [ref=f23e21]
    - button "Search projects" [ref=f23e22]
  - generic [ref=f23e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f23e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f23e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f23e28]:
      - button "Open project" [ref=f23e29]
    - group [ref=f23e31]:
      - button "Archive project" [ref=f23e32]
  - generic [ref=f23e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f23e35]:
      - button "Open project" [ref=f23e36]
    - group [ref=f23e38]:
      - button "Archive project" [ref=f23e39]
  - generic [ref=f23e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f23e42]:
      - button "Open project" [ref=f23e43]
    - group [ref=f23e45]:
      - button "Archive project" [ref=f23e46]
  - generic [ref=f23e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f23e49]:
      - button "Open project" [ref=f23e50]
    - group [ref=f23e52]:
      - button "Archive project" [ref=f23e53]
  - generic [ref=f23e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f23e56]:
      - button "Open project" [ref=f23e57]
    - group [ref=f23e59]:
      - button "Archive project" [ref=f23e60]
  - generic [ref=f23e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f23e63]:
      - button "Open project" [ref=f23e64]
    - group [ref=f23e66]:
      - button "Archive project" [ref=f23e67]
  - generic [ref=f23e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f23e70]:
      - button "Open project" [ref=f23e71]
    - group [ref=f23e73]:
      - button "Archive project" [ref=f23e74]
  - generic [ref=f23e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f23e77]:
      - button "Open project" [ref=f23e78]
    - group [ref=f23e80]:
      - button "Archive project" [ref=f23e81]
  - generic [ref=f23e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f23e84]:
      - button "Open project" [ref=f23e85]
    - group [ref=f23e87]:
      - button "Archive project" [ref=f23e88]
  - generic [ref=f23e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f23e91]:
      - button "Open project" [ref=f23e92]
    - group [ref=f23e94]:
      - button "Archive project" [ref=f23e95]
  - generic [ref=f23e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f23e98]:
      - button "Open project" [ref=f23e99]
    - group [ref=f23e101]:
      - button "Archive project" [ref=f23e102]
  - generic [ref=f23e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f23e105]:
      - button "Open project" [ref=f23e106]
    - group [ref=f23e108]:
      - button "Archive project" [ref=f23e109]
  - generic [ref=f23e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f23e112]:
      - button "Open project" [ref=f23e113]
    - group [ref=f23e115]:
      - button "Archive project" [ref=f23e116]
  - generic [ref=f23e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f23e119]:
      - button "Open project" [ref=f23e120]
    - group [ref=f23e122]:
      - button "Archive project" [ref=f23e123]
  - generic [ref=f23e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f23e126]:
      - button "Open project" [ref=f23e127]
    - group [ref=f23e129]:
      - button "Archive project" [ref=f23e130]
  - generic [ref=f23e131]:
    - text: task-020 Deletion fields4/6 completed
    - group [ref=f23e133]:
      - button "Open project" [ref=f23e134]
    - group [ref=f23e136]:
      - button "Archive project" [ref=f23e137]
  - generic [ref=f23e138]:
    - text: task-020 Deletion target1/3 completed
    - group [ref=f23e140]:
      - button "Open project" [ref=f23e141]
    - group [ref=f23e143]:
      - button "Archive project" [ref=f23e144]
  - generic [ref=f23e145]:
    - text: task-020 Deletion order0/3 completed
    - group [ref=f23e147]:
      - button "Open project" [ref=f23e148]
    - group [ref=f23e150]:
      - button "Archive project" [ref=f23e151]
  - generic [ref=f23e152]:
    - text: task-020 Deletion restart0/0 completed
    - group [ref=f23e154]:
      - button "Open project" [ref=f23e155]
    - group [ref=f23e157]:
      - button "Archive project" [ref=f23e158]
  - generic [ref=f23e159]:
    - text: task-020 Deleted intersections0/0 completed
    - group [ref=f23e161]:
      - button "Open project" [ref=f23e162]
    - group [ref=f23e164]:
      - button "Archive project" [ref=f23e165]
  - generic [ref=f23e166]:
    - text: task-020 Directory Zulu owner1/3 completed
    - group [ref=f23e168]:
      - button "Open project" [ref=f23e169]
    - group [ref=f23e171]:
      - button "Archive project" [ref=f23e172]
  - generic [ref=f23e173]:
    - text: task-020 Directory Alpha owner0/1 completed
    - group [ref=f23e175]:
      - button "Open project" [ref=f23e176]
    - group [ref=f23e178]:
      - button "Archive project" [ref=f23e179]
  - generic [ref=f23e180]:
    - text: task-020 Directory filter owner1/5 completed
    - group [ref=f23e182]:
      - button "Open project" [ref=f23e183]
    - group [ref=f23e185]:
      - button "Archive project" [ref=f23e186]
  - generic [ref=f23e187]:
    - text: task-020 Directory whitespace0/1 completed
    - group [ref=f23e189]:
      - button "Open project" [ref=f23e190]
    - group [ref=f23e192]:
      - button "Archive project" [ref=f23e193]
  - generic [ref=f23e194]:
    - text: task-020 Calendar persistence0/1 completed
    - group [ref=f23e196]:
      - button "Open project" [ref=f23e197]
    - group [ref=f23e199]:
      - button "Archive project" [ref=f23e200]
  - generic [ref=f23e201]:
    - text: task-020 Calendar validation0/1 completed
    - group [ref=f23e203]:
      - button "Open project" [ref=f23e204]
    - group [ref=f23e206]:
      - button "Archive project" [ref=f23e207]
  - generic [ref=f23e208]:
    - text: task-020 Calendar independence2/3 completed
    - group [ref=f23e210]:
      - button "Open project" [ref=f23e211]
    - group [ref=f23e213]:
      - button "Archive project" [ref=f23e214]
  - generic [ref=f23e215]:
    - text: task-020 Calendar second owner0/1 completed
    - group [ref=f23e217]:
      - button "Open project" [ref=f23e218]
    - group [ref=f23e220]:
      - button "Archive project" [ref=f23e221]
  - generic [ref=f23e222]:
    - text: task-020 Calendar archival0/1 completed
    - group [ref=f23e224]:
      - button "Open project" [ref=f23e225]
    - group [ref=f23e227]:
      - button "Archive project" [ref=f23e228]
  - generic [ref=f23e229]:
    - text: task-020 Range boundaries0/5 completed
    - group [ref=f23e231]:
      - button "Open project" [ref=f23e232]
    - group [ref=f23e234]:
      - button "Archive project" [ref=f23e235]
  - generic [ref=f23e236]:
    - text: task-020 Range intersections0/4 completed
    - group [ref=f23e238]:
      - button "Open project" [ref=f23e239]
    - group [ref=f23e241]:
      - button "Archive project" [ref=f23e242]
  - generic [ref=f23e243]:
    - text: task-020 Range validation0/2 completed
    - group [ref=f23e245]:
      - button "Open project" [ref=f23e246]
    - group [ref=f23e248]:
      - button "Archive project" [ref=f23e249]
  - generic [ref=f23e250]:
    - text: task-020 Range archival0/2 completed
    - group [ref=f23e252]:
      - button "Open project" [ref=f23e253]
    - group [ref=f23e255]:
      - button "Archive project" [ref=f23e256]
  - generic [ref=f23e257]:
    - text: task-020 Range owner renamed0/3 completed
    - group [ref=f23e259]:
      - button "Open project" [ref=f23e260]
    - group [ref=f23e262]:
      - button "Archive project" [ref=f23e263]
  - generic [ref=f23e264]:
    - text: task-020 Export foreign0/1 completed
    - group [ref=f23e266]:
      - button "Open project" [ref=f23e267]
    - group [ref=f23e269]:
      - button "Archive project" [ref=f23e270]
  - generic [ref=f23e271]:
    - text: task-020 Export full Ω0/2 completed
    - group [ref=f23e273]:
      - button "Open project" [ref=f23e274]
    - group [ref=f23e276]:
      - button "Archive project" [ref=f23e277]
  - generic [ref=f23e278]:
    - text: task-020 Export empty0/0 completed
    - group [ref=f23e280]:
      - button "Open project" [ref=f23e281]
    - group [ref=f23e283]:
      - button "Archive project" [ref=f23e284]
  - generic [ref=f23e285]:
    - text: task-020 Import origin0/2 completed
    - group [ref=f23e287]:
      - button "Open project" [ref=f23e288]
    - group [ref=f23e290]:
      - button "Archive project" [ref=f23e291]
  - generic [ref=f23e292]:
    - text: task-020 Import copy1/4 completed
    - group [ref=f23e294]:
      - button "Open project" [ref=f23e295]
    - group [ref=f23e297]:
      - button "Archive project" [ref=f23e298]
  - generic [ref=f23e299]:
    - text: task-020 Parse guard existing0/1 completed
    - group [ref=f23e301]:
      - button "Open project" [ref=f23e302]
    - group [ref=f23e304]:
      - button "Archive project" [ref=f23e305]
  - generic [ref=f23e306]:
    - text: task-020 Task guard existing0/1 completed
    - group [ref=f23e308]:
      - button "Open project" [ref=f23e309]
    - group [ref=f23e311]:
      - button "Archive project" [ref=f23e312]
  - generic [ref=f23e313]:
    - text: task-020 Import restart0/1 completed
    - group [ref=f23e315]:
      - button "Open project" [ref=f23e316]
    - group [ref=f23e318]:
      - button "Archive project" [ref=f23e319]
  - generic [ref=f23e320]:
    - text: task-020 Transfer target1/3 completed
    - group [ref=f23e322]:
      - button "Open project" [ref=f23e323]
    - group [ref=f23e325]:
      - button "Archive project" [ref=f23e326]
  - generic [ref=f23e327]:
    - text: task-020 Transfer source0/1 completed
    - group [ref=f23e329]:
      - button "Open project" [ref=f23e330]
    - group [ref=f23e332]:
      - button "Archive project" [ref=f23e333]
  - generic [ref=f23e334]:
    - text: task-020 Filtered transfer target0/2 completed
    - group [ref=f23e336]:
      - button "Open project" [ref=f23e337]
    - group [ref=f23e339]:
      - button "Archive project" [ref=f23e340]
  - generic [ref=f23e341]:
    - text: task-020 Filtered transfer source1/5 completed
    - group [ref=f23e343]:
      - button "Open project" [ref=f23e344]
    - group [ref=f23e346]:
      - button "Archive project" [ref=f23e347]
  - generic [ref=f23e348]:
    - text: task-020 Options first0/0 completed
    - group [ref=f23e350]:
      - button "Open project" [ref=f23e351]
    - group [ref=f23e353]:
      - button "Archive project" [ref=f23e354]
  - generic [ref=f23e355]:
    - text: task-020 Options second0/0 completed
    - group [ref=f23e357]:
      - button "Open project" [ref=f23e358]
    - group [ref=f23e360]:
      - button "Archive project" [ref=f23e361]
  - generic [ref=f23e362]:
    - text: task-020 Options owner0/1 completed
    - group [ref=f23e364]:
      - button "Open project" [ref=f23e365]
    - group [ref=f23e367]:
      - button "Archive project" [ref=f23e368]
  - generic [ref=f23e369]:
    - text: task-020 Read-only transfer target0/1 completed
    - group [ref=f23e371]:
      - button "Open project" [ref=f23e372]
    - group [ref=f23e374]:
      - button "Archive project" [ref=f23e375]
  - generic [ref=f23e376]:
    - text: task-020 Read-only transfer owner0/2 completed
    - group [ref=f23e378]:
      - button "Open project" [ref=f23e379]
    - group [ref=f23e381]:
      - button "Archive project" [ref=f23e382]
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