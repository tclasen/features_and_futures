# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority-filter.spec.mjs >> 026 archived combined filters are readable without enabling task editing
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/priority-filter.spec.mjs:91:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Archived combined filters' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f17e1]:
  - heading "Workboard" [level=1] [ref=f17e2]
  - group [ref=f17e4]:
    - button "Task directory" [ref=f17e5]
  - group [ref=f17e7]:
    - generic [ref=f17e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f17e9]
    - generic [ref=f17e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f17e11]
    - button "Import project" [ref=f17e12]
  - group [ref=f17e14]:
    - generic [ref=f17e15]:
      - text: Project name
      - textbox "Project name" [ref=f17e16]
    - button "Create project" [ref=f17e17]
  - group [ref=f17e19]:
    - generic [ref=f17e20]:
      - text: Project search
      - textbox "Project search" [ref=f17e21]
    - button "Search projects" [ref=f17e22]
  - generic [ref=f17e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f17e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f17e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f17e28]:
      - button "Open project" [ref=f17e29]
    - group [ref=f17e31]:
      - button "Archive project" [ref=f17e32]
  - generic [ref=f17e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f17e35]:
      - button "Open project" [ref=f17e36]
    - group [ref=f17e38]:
      - button "Archive project" [ref=f17e39]
  - generic [ref=f17e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f17e42]:
      - button "Open project" [ref=f17e43]
    - group [ref=f17e45]:
      - button "Archive project" [ref=f17e46]
  - generic [ref=f17e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f17e49]:
      - button "Open project" [ref=f17e50]
    - group [ref=f17e52]:
      - button "Archive project" [ref=f17e53]
  - generic [ref=f17e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f17e56]:
      - button "Open project" [ref=f17e57]
    - group [ref=f17e59]:
      - button "Archive project" [ref=f17e60]
  - generic [ref=f17e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f17e63]:
      - button "Open project" [ref=f17e64]
    - group [ref=f17e66]:
      - button "Archive project" [ref=f17e67]
  - generic [ref=f17e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f17e70]:
      - button "Open project" [ref=f17e71]
    - group [ref=f17e73]:
      - button "Archive project" [ref=f17e74]
  - generic [ref=f17e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f17e77]:
      - button "Open project" [ref=f17e78]
    - group [ref=f17e80]:
      - button "Archive project" [ref=f17e81]
  - generic [ref=f17e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f17e84]:
      - button "Open project" [ref=f17e85]
    - group [ref=f17e87]:
      - button "Archive project" [ref=f17e88]
  - generic [ref=f17e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f17e91]:
      - button "Open project" [ref=f17e92]
    - group [ref=f17e94]:
      - button "Archive project" [ref=f17e95]
  - generic [ref=f17e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f17e98]:
      - button "Open project" [ref=f17e99]
    - group [ref=f17e101]:
      - button "Archive project" [ref=f17e102]
  - generic [ref=f17e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f17e105]:
      - button "Open project" [ref=f17e106]
    - group [ref=f17e108]:
      - button "Archive project" [ref=f17e109]
  - generic [ref=f17e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f17e112]:
      - button "Open project" [ref=f17e113]
    - group [ref=f17e115]:
      - button "Archive project" [ref=f17e116]
  - generic [ref=f17e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f17e119]:
      - button "Open project" [ref=f17e120]
    - group [ref=f17e122]:
      - button "Archive project" [ref=f17e123]
  - generic [ref=f17e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f17e126]:
      - button "Open project" [ref=f17e127]
    - group [ref=f17e129]:
      - button "Archive project" [ref=f17e130]
  - generic [ref=f17e131]:
    - text: task-020 Deletion fields4/6 completed
    - group [ref=f17e133]:
      - button "Open project" [ref=f17e134]
    - group [ref=f17e136]:
      - button "Archive project" [ref=f17e137]
  - generic [ref=f17e138]:
    - text: task-020 Deletion target1/3 completed
    - group [ref=f17e140]:
      - button "Open project" [ref=f17e141]
    - group [ref=f17e143]:
      - button "Archive project" [ref=f17e144]
  - generic [ref=f17e145]:
    - text: task-020 Deletion order0/3 completed
    - group [ref=f17e147]:
      - button "Open project" [ref=f17e148]
    - group [ref=f17e150]:
      - button "Archive project" [ref=f17e151]
  - generic [ref=f17e152]:
    - text: task-020 Deletion restart0/0 completed
    - group [ref=f17e154]:
      - button "Open project" [ref=f17e155]
    - group [ref=f17e157]:
      - button "Archive project" [ref=f17e158]
  - generic [ref=f17e159]:
    - text: task-020 Deleted intersections0/0 completed
    - group [ref=f17e161]:
      - button "Open project" [ref=f17e162]
    - group [ref=f17e164]:
      - button "Archive project" [ref=f17e165]
  - generic [ref=f17e166]:
    - text: task-020 Directory Zulu owner1/3 completed
    - group [ref=f17e168]:
      - button "Open project" [ref=f17e169]
    - group [ref=f17e171]:
      - button "Archive project" [ref=f17e172]
  - generic [ref=f17e173]:
    - text: task-020 Directory Alpha owner0/1 completed
    - group [ref=f17e175]:
      - button "Open project" [ref=f17e176]
    - group [ref=f17e178]:
      - button "Archive project" [ref=f17e179]
  - generic [ref=f17e180]:
    - text: task-020 Directory filter owner1/5 completed
    - group [ref=f17e182]:
      - button "Open project" [ref=f17e183]
    - group [ref=f17e185]:
      - button "Archive project" [ref=f17e186]
  - generic [ref=f17e187]:
    - text: task-020 Directory whitespace0/1 completed
    - group [ref=f17e189]:
      - button "Open project" [ref=f17e190]
    - group [ref=f17e192]:
      - button "Archive project" [ref=f17e193]
  - generic [ref=f17e194]:
    - text: task-020 Calendar persistence0/1 completed
    - group [ref=f17e196]:
      - button "Open project" [ref=f17e197]
    - group [ref=f17e199]:
      - button "Archive project" [ref=f17e200]
  - generic [ref=f17e201]:
    - text: task-020 Calendar validation0/1 completed
    - group [ref=f17e203]:
      - button "Open project" [ref=f17e204]
    - group [ref=f17e206]:
      - button "Archive project" [ref=f17e207]
  - generic [ref=f17e208]:
    - text: task-020 Calendar independence2/3 completed
    - group [ref=f17e210]:
      - button "Open project" [ref=f17e211]
    - group [ref=f17e213]:
      - button "Archive project" [ref=f17e214]
  - generic [ref=f17e215]:
    - text: task-020 Calendar second owner0/1 completed
    - group [ref=f17e217]:
      - button "Open project" [ref=f17e218]
    - group [ref=f17e220]:
      - button "Archive project" [ref=f17e221]
  - generic [ref=f17e222]:
    - text: task-020 Calendar archival0/1 completed
    - group [ref=f17e224]:
      - button "Open project" [ref=f17e225]
    - group [ref=f17e227]:
      - button "Archive project" [ref=f17e228]
  - generic [ref=f17e229]:
    - text: task-020 Range boundaries0/5 completed
    - group [ref=f17e231]:
      - button "Open project" [ref=f17e232]
    - group [ref=f17e234]:
      - button "Archive project" [ref=f17e235]
  - generic [ref=f17e236]:
    - text: task-020 Range intersections0/4 completed
    - group [ref=f17e238]:
      - button "Open project" [ref=f17e239]
    - group [ref=f17e241]:
      - button "Archive project" [ref=f17e242]
  - generic [ref=f17e243]:
    - text: task-020 Range validation0/2 completed
    - group [ref=f17e245]:
      - button "Open project" [ref=f17e246]
    - group [ref=f17e248]:
      - button "Archive project" [ref=f17e249]
  - generic [ref=f17e250]:
    - text: task-020 Range archival0/2 completed
    - group [ref=f17e252]:
      - button "Open project" [ref=f17e253]
    - group [ref=f17e255]:
      - button "Archive project" [ref=f17e256]
  - generic [ref=f17e257]:
    - text: task-020 Range owner renamed0/3 completed
    - group [ref=f17e259]:
      - button "Open project" [ref=f17e260]
    - group [ref=f17e262]:
      - button "Archive project" [ref=f17e263]
  - generic [ref=f17e264]:
    - text: task-020 Export foreign0/1 completed
    - group [ref=f17e266]:
      - button "Open project" [ref=f17e267]
    - group [ref=f17e269]:
      - button "Archive project" [ref=f17e270]
  - generic [ref=f17e271]:
    - text: task-020 Export full Ω0/2 completed
    - group [ref=f17e273]:
      - button "Open project" [ref=f17e274]
    - group [ref=f17e276]:
      - button "Archive project" [ref=f17e277]
  - generic [ref=f17e278]:
    - text: task-020 Export empty0/0 completed
    - group [ref=f17e280]:
      - button "Open project" [ref=f17e281]
    - group [ref=f17e283]:
      - button "Archive project" [ref=f17e284]
  - generic [ref=f17e285]:
    - text: task-020 Import origin0/2 completed
    - group [ref=f17e287]:
      - button "Open project" [ref=f17e288]
    - group [ref=f17e290]:
      - button "Archive project" [ref=f17e291]
  - generic [ref=f17e292]:
    - text: task-020 Import copy1/4 completed
    - group [ref=f17e294]:
      - button "Open project" [ref=f17e295]
    - group [ref=f17e297]:
      - button "Archive project" [ref=f17e298]
  - generic [ref=f17e299]:
    - text: task-020 Parse guard existing0/1 completed
    - group [ref=f17e301]:
      - button "Open project" [ref=f17e302]
    - group [ref=f17e304]:
      - button "Archive project" [ref=f17e305]
  - generic [ref=f17e306]:
    - text: task-020 Task guard existing0/1 completed
    - group [ref=f17e308]:
      - button "Open project" [ref=f17e309]
    - group [ref=f17e311]:
      - button "Archive project" [ref=f17e312]
  - generic [ref=f17e313]:
    - text: task-020 Import restart0/1 completed
    - group [ref=f17e315]:
      - button "Open project" [ref=f17e316]
    - group [ref=f17e318]:
      - button "Archive project" [ref=f17e319]
  - generic [ref=f17e320]:
    - text: task-020 Transfer target1/3 completed
    - group [ref=f17e322]:
      - button "Open project" [ref=f17e323]
    - group [ref=f17e325]:
      - button "Archive project" [ref=f17e326]
  - generic [ref=f17e327]:
    - text: task-020 Transfer source0/1 completed
    - group [ref=f17e329]:
      - button "Open project" [ref=f17e330]
    - group [ref=f17e332]:
      - button "Archive project" [ref=f17e333]
  - generic [ref=f17e334]:
    - text: task-020 Filtered transfer target0/2 completed
    - group [ref=f17e336]:
      - button "Open project" [ref=f17e337]
    - group [ref=f17e339]:
      - button "Archive project" [ref=f17e340]
  - generic [ref=f17e341]:
    - text: task-020 Filtered transfer source1/5 completed
    - group [ref=f17e343]:
      - button "Open project" [ref=f17e344]
    - group [ref=f17e346]:
      - button "Archive project" [ref=f17e347]
  - generic [ref=f17e348]:
    - text: task-020 Options first0/0 completed
    - group [ref=f17e350]:
      - button "Open project" [ref=f17e351]
    - group [ref=f17e353]:
      - button "Archive project" [ref=f17e354]
  - generic [ref=f17e355]:
    - text: task-020 Options second0/0 completed
    - group [ref=f17e357]:
      - button "Open project" [ref=f17e358]
    - group [ref=f17e360]:
      - button "Archive project" [ref=f17e361]
  - generic [ref=f17e362]:
    - text: task-020 Options owner0/1 completed
    - group [ref=f17e364]:
      - button "Open project" [ref=f17e365]
    - group [ref=f17e367]:
      - button "Archive project" [ref=f17e368]
  - generic [ref=f17e369]:
    - text: task-020 Read-only transfer target0/1 completed
    - group [ref=f17e371]:
      - button "Open project" [ref=f17e372]
    - group [ref=f17e374]:
      - button "Archive project" [ref=f17e375]
  - generic [ref=f17e376]:
    - text: task-020 Read-only transfer owner0/2 completed
    - group [ref=f17e378]:
      - button "Open project" [ref=f17e379]
    - group [ref=f17e381]:
      - button "Archive project" [ref=f17e382]
  - generic [ref=f17e383]:
    - text: task-020 Notes values0/2 completed
    - group [ref=f17e385]:
      - button "Open project" [ref=f17e386]
    - group [ref=f17e388]:
      - button "Archive project" [ref=f17e389]
  - generic [ref=f17e390]:
    - text: task-020 Notes target0/1 completed
    - group [ref=f17e392]:
      - button "Open project" [ref=f17e393]
    - group [ref=f17e395]:
      - button "Archive project" [ref=f17e396]
  - generic [ref=f17e397]:
    - text: task-020 Notes owner0/3 completed
    - group [ref=f17e399]:
      - button "Open project" [ref=f17e400]
    - group [ref=f17e402]:
      - button "Archive project" [ref=f17e403]
  - generic [ref=f17e404]:
    - text: task-020 Priority intersection1/4 completed
    - group [ref=f17e406]:
      - button "Open project" [ref=f17e407]
    - group [ref=f17e409]:
      - button "Archive project" [ref=f17e410]
  - generic [ref=f17e411]:
    - text: task-020 Priority live filters1/4 completed
    - group [ref=f17e413]:
      - button "Open project" [ref=f17e414]
    - group [ref=f17e416]:
      - button "Archive project" [ref=f17e417]
  - generic [ref=f17e418]:
    - text: task-020 Priority rename filters1/3 completed
    - group [ref=f17e420]:
      - button "Open project" [ref=f17e421]
    - group [ref=f17e423]:
      - button "Archive project" [ref=f17e424]
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