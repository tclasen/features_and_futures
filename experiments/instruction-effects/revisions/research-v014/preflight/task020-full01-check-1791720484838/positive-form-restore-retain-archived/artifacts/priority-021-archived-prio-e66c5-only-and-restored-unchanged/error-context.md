# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority.spec.mjs >> 021 archived priorities are read-only and restored unchanged
- Location: experiments/instruction-effects/revisions/research-v014/preflight/task020-executed-suite/priority.spec.mjs:71:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-020 Priority archive' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:55708/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f11e1]:
  - heading "Workboard" [level=1] [ref=f11e2]
  - group [ref=f11e4]:
    - button "Task directory" [ref=f11e5]
  - group [ref=f11e7]:
    - generic [ref=f11e8]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f11e9]
    - generic [ref=f11e10]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f11e11]
    - button "Import project" [ref=f11e12]
  - group [ref=f11e14]:
    - generic [ref=f11e15]:
      - text: Project name
      - textbox "Project name" [ref=f11e16]
    - button "Create project" [ref=f11e17]
  - group [ref=f11e19]:
    - generic [ref=f11e20]:
      - text: Project search
      - textbox "Project search" [ref=f11e21]
    - button "Search projects" [ref=f11e22]
  - generic [ref=f11e24]:
    - text: Project filter
    - combobox "Project filter" [ref=f11e25]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f11e26]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f11e28]:
      - button "Open project" [ref=f11e29]
    - group [ref=f11e31]:
      - button "Archive project" [ref=f11e32]
  - generic [ref=f11e33]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f11e35]:
      - button "Open project" [ref=f11e36]
    - group [ref=f11e38]:
      - button "Archive project" [ref=f11e39]
  - generic [ref=f11e40]:
    - text: task-018 Import restart0/1 completed
    - group [ref=f11e42]:
      - button "Open project" [ref=f11e43]
    - group [ref=f11e45]:
      - button "Archive project" [ref=f11e46]
  - generic [ref=f11e47]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f11e49]:
      - button "Open project" [ref=f11e50]
    - group [ref=f11e52]:
      - button "Archive project" [ref=f11e53]
  - generic [ref=f11e54]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f11e56]:
      - button "Open project" [ref=f11e57]
    - group [ref=f11e59]:
      - button "Archive project" [ref=f11e60]
  - generic [ref=f11e61]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f11e63]:
      - button "Open project" [ref=f11e64]
    - group [ref=f11e66]:
      - button "Archive project" [ref=f11e67]
  - generic [ref=f11e68]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f11e70]:
      - button "Open project" [ref=f11e71]
    - group [ref=f11e73]:
      - button "Archive project" [ref=f11e74]
  - generic [ref=f11e75]:
    - text: task-020 Bulk first owner0/7 completed
    - group [ref=f11e77]:
      - button "Open project" [ref=f11e78]
    - group [ref=f11e80]:
      - button "Archive project" [ref=f11e81]
  - generic [ref=f11e82]:
    - text: task-020 Bulk second owner0/2 completed
    - group [ref=f11e84]:
      - button "Open project" [ref=f11e85]
    - group [ref=f11e87]:
      - button "Archive project" [ref=f11e88]
  - generic [ref=f11e89]:
    - text: task-020 Bulk protected1/1 completed
    - group [ref=f11e91]:
      - button "Open project" [ref=f11e92]
    - group [ref=f11e94]:
      - button "Archive project" [ref=f11e95]
  - generic [ref=f11e96]:
    - text: task-020 Bulk restart first1/1 completed
    - group [ref=f11e98]:
      - button "Open project" [ref=f11e99]
    - group [ref=f11e101]:
      - button "Archive project" [ref=f11e102]
  - generic [ref=f11e103]:
    - text: task-020 Bulk restart second1/1 completed
    - group [ref=f11e105]:
      - button "Open project" [ref=f11e106]
    - group [ref=f11e108]:
      - button "Archive project" [ref=f11e109]
  - generic [ref=f11e110]:
    - text: task-020 Defaults independent0/1 completed
    - group [ref=f11e112]:
      - button "Open project" [ref=f11e113]
    - group [ref=f11e115]:
      - button "Archive project" [ref=f11e116]
  - generic [ref=f11e117]:
    - text: task-020 Defaults inheritance1/4 completed
    - group [ref=f11e119]:
      - button "Open project" [ref=f11e120]
    - group [ref=f11e122]:
      - button "Archive project" [ref=f11e123]
  - generic [ref=f11e124]:
    - text: task-020 Defaults renamed0/1 completed
    - group [ref=f11e126]:
      - button "Open project" [ref=f11e127]
    - group [ref=f11e129]:
      - button "Archive project" [ref=f11e130]
  - generic [ref=f11e131]:
    - text: task-020 Deletion fields4/6 completed
    - group [ref=f11e133]:
      - button "Open project" [ref=f11e134]
    - group [ref=f11e136]:
      - button "Archive project" [ref=f11e137]
  - generic [ref=f11e138]:
    - text: task-020 Deletion target1/3 completed
    - group [ref=f11e140]:
      - button "Open project" [ref=f11e141]
    - group [ref=f11e143]:
      - button "Archive project" [ref=f11e144]
  - generic [ref=f11e145]:
    - text: task-020 Deletion order0/3 completed
    - group [ref=f11e147]:
      - button "Open project" [ref=f11e148]
    - group [ref=f11e150]:
      - button "Archive project" [ref=f11e151]
  - generic [ref=f11e152]:
    - text: task-020 Deletion restart0/0 completed
    - group [ref=f11e154]:
      - button "Open project" [ref=f11e155]
    - group [ref=f11e157]:
      - button "Archive project" [ref=f11e158]
  - generic [ref=f11e159]:
    - text: task-020 Deleted intersections0/0 completed
    - group [ref=f11e161]:
      - button "Open project" [ref=f11e162]
    - group [ref=f11e164]:
      - button "Archive project" [ref=f11e165]
  - generic [ref=f11e166]:
    - text: task-020 Directory Zulu owner1/3 completed
    - group [ref=f11e168]:
      - button "Open project" [ref=f11e169]
    - group [ref=f11e171]:
      - button "Archive project" [ref=f11e172]
  - generic [ref=f11e173]:
    - text: task-020 Directory Alpha owner0/1 completed
    - group [ref=f11e175]:
      - button "Open project" [ref=f11e176]
    - group [ref=f11e178]:
      - button "Archive project" [ref=f11e179]
  - generic [ref=f11e180]:
    - text: task-020 Directory filter owner1/5 completed
    - group [ref=f11e182]:
      - button "Open project" [ref=f11e183]
    - group [ref=f11e185]:
      - button "Archive project" [ref=f11e186]
  - generic [ref=f11e187]:
    - text: task-020 Directory whitespace0/1 completed
    - group [ref=f11e189]:
      - button "Open project" [ref=f11e190]
    - group [ref=f11e192]:
      - button "Archive project" [ref=f11e193]
  - generic [ref=f11e194]:
    - text: task-020 Calendar persistence0/1 completed
    - group [ref=f11e196]:
      - button "Open project" [ref=f11e197]
    - group [ref=f11e199]:
      - button "Archive project" [ref=f11e200]
  - generic [ref=f11e201]:
    - text: task-020 Calendar validation0/1 completed
    - group [ref=f11e203]:
      - button "Open project" [ref=f11e204]
    - group [ref=f11e206]:
      - button "Archive project" [ref=f11e207]
  - generic [ref=f11e208]:
    - text: task-020 Calendar independence2/3 completed
    - group [ref=f11e210]:
      - button "Open project" [ref=f11e211]
    - group [ref=f11e213]:
      - button "Archive project" [ref=f11e214]
  - generic [ref=f11e215]:
    - text: task-020 Calendar second owner0/1 completed
    - group [ref=f11e217]:
      - button "Open project" [ref=f11e218]
    - group [ref=f11e220]:
      - button "Archive project" [ref=f11e221]
  - generic [ref=f11e222]:
    - text: task-020 Calendar archival0/1 completed
    - group [ref=f11e224]:
      - button "Open project" [ref=f11e225]
    - group [ref=f11e227]:
      - button "Archive project" [ref=f11e228]
  - generic [ref=f11e229]:
    - text: task-020 Range boundaries0/5 completed
    - group [ref=f11e231]:
      - button "Open project" [ref=f11e232]
    - group [ref=f11e234]:
      - button "Archive project" [ref=f11e235]
  - generic [ref=f11e236]:
    - text: task-020 Range intersections0/4 completed
    - group [ref=f11e238]:
      - button "Open project" [ref=f11e239]
    - group [ref=f11e241]:
      - button "Archive project" [ref=f11e242]
  - generic [ref=f11e243]:
    - text: task-020 Range validation0/2 completed
    - group [ref=f11e245]:
      - button "Open project" [ref=f11e246]
    - group [ref=f11e248]:
      - button "Archive project" [ref=f11e249]
  - generic [ref=f11e250]:
    - text: task-020 Range archival0/2 completed
    - group [ref=f11e252]:
      - button "Open project" [ref=f11e253]
    - group [ref=f11e255]:
      - button "Archive project" [ref=f11e256]
  - generic [ref=f11e257]:
    - text: task-020 Range owner renamed0/3 completed
    - group [ref=f11e259]:
      - button "Open project" [ref=f11e260]
    - group [ref=f11e262]:
      - button "Archive project" [ref=f11e263]
  - generic [ref=f11e264]:
    - text: task-020 Export foreign0/1 completed
    - group [ref=f11e266]:
      - button "Open project" [ref=f11e267]
    - group [ref=f11e269]:
      - button "Archive project" [ref=f11e270]
  - generic [ref=f11e271]:
    - text: task-020 Export full Ω0/2 completed
    - group [ref=f11e273]:
      - button "Open project" [ref=f11e274]
    - group [ref=f11e276]:
      - button "Archive project" [ref=f11e277]
  - generic [ref=f11e278]:
    - text: task-020 Export empty0/0 completed
    - group [ref=f11e280]:
      - button "Open project" [ref=f11e281]
    - group [ref=f11e283]:
      - button "Archive project" [ref=f11e284]
  - generic [ref=f11e285]:
    - text: task-020 Import origin0/2 completed
    - group [ref=f11e287]:
      - button "Open project" [ref=f11e288]
    - group [ref=f11e290]:
      - button "Archive project" [ref=f11e291]
  - generic [ref=f11e292]:
    - text: task-020 Import copy1/4 completed
    - group [ref=f11e294]:
      - button "Open project" [ref=f11e295]
    - group [ref=f11e297]:
      - button "Archive project" [ref=f11e298]
  - generic [ref=f11e299]:
    - text: task-020 Parse guard existing0/1 completed
    - group [ref=f11e301]:
      - button "Open project" [ref=f11e302]
    - group [ref=f11e304]:
      - button "Archive project" [ref=f11e305]
  - generic [ref=f11e306]:
    - text: task-020 Task guard existing0/1 completed
    - group [ref=f11e308]:
      - button "Open project" [ref=f11e309]
    - group [ref=f11e311]:
      - button "Archive project" [ref=f11e312]
  - generic [ref=f11e313]:
    - text: task-020 Import restart0/1 completed
    - group [ref=f11e315]:
      - button "Open project" [ref=f11e316]
    - group [ref=f11e318]:
      - button "Archive project" [ref=f11e319]
  - generic [ref=f11e320]:
    - text: task-020 Transfer target1/3 completed
    - group [ref=f11e322]:
      - button "Open project" [ref=f11e323]
    - group [ref=f11e325]:
      - button "Archive project" [ref=f11e326]
  - generic [ref=f11e327]:
    - text: task-020 Transfer source0/1 completed
    - group [ref=f11e329]:
      - button "Open project" [ref=f11e330]
    - group [ref=f11e332]:
      - button "Archive project" [ref=f11e333]
  - generic [ref=f11e334]:
    - text: task-020 Filtered transfer target0/2 completed
    - group [ref=f11e336]:
      - button "Open project" [ref=f11e337]
    - group [ref=f11e339]:
      - button "Archive project" [ref=f11e340]
  - generic [ref=f11e341]:
    - text: task-020 Filtered transfer source1/5 completed
    - group [ref=f11e343]:
      - button "Open project" [ref=f11e344]
    - group [ref=f11e346]:
      - button "Archive project" [ref=f11e347]
  - generic [ref=f11e348]:
    - text: task-020 Options first0/0 completed
    - group [ref=f11e350]:
      - button "Open project" [ref=f11e351]
    - group [ref=f11e353]:
      - button "Archive project" [ref=f11e354]
  - generic [ref=f11e355]:
    - text: task-020 Options second0/0 completed
    - group [ref=f11e357]:
      - button "Open project" [ref=f11e358]
    - group [ref=f11e360]:
      - button "Archive project" [ref=f11e361]
  - generic [ref=f11e362]:
    - text: task-020 Options owner0/1 completed
    - group [ref=f11e364]:
      - button "Open project" [ref=f11e365]
    - group [ref=f11e367]:
      - button "Archive project" [ref=f11e368]
  - generic [ref=f11e369]:
    - text: task-020 Read-only transfer target0/1 completed
    - group [ref=f11e371]:
      - button "Open project" [ref=f11e372]
    - group [ref=f11e374]:
      - button "Archive project" [ref=f11e375]
  - generic [ref=f11e376]:
    - text: task-020 Read-only transfer owner0/2 completed
    - group [ref=f11e378]:
      - button "Open project" [ref=f11e379]
    - group [ref=f11e381]:
      - button "Archive project" [ref=f11e382]
  - generic [ref=f11e383]:
    - text: task-020 Notes values0/2 completed
    - group [ref=f11e385]:
      - button "Open project" [ref=f11e386]
    - group [ref=f11e388]:
      - button "Archive project" [ref=f11e389]
  - generic [ref=f11e390]:
    - text: task-020 Notes target0/1 completed
    - group [ref=f11e392]:
      - button "Open project" [ref=f11e393]
    - group [ref=f11e395]:
      - button "Archive project" [ref=f11e396]
  - generic [ref=f11e397]:
    - text: task-020 Notes owner0/3 completed
    - group [ref=f11e399]:
      - button "Open project" [ref=f11e400]
    - group [ref=f11e402]:
      - button "Archive project" [ref=f11e403]
  - generic [ref=f11e404]:
    - text: task-020 Priority intersection1/4 completed
    - group [ref=f11e406]:
      - button "Open project" [ref=f11e407]
    - group [ref=f11e409]:
      - button "Archive project" [ref=f11e410]
  - generic [ref=f11e411]:
    - text: task-020 Priority live filters1/4 completed
    - group [ref=f11e413]:
      - button "Open project" [ref=f11e414]
    - group [ref=f11e416]:
      - button "Archive project" [ref=f11e417]
  - generic [ref=f11e418]:
    - text: task-020 Priority rename filters1/3 completed
    - group [ref=f11e420]:
      - button "Open project" [ref=f11e421]
    - group [ref=f11e423]:
      - button "Archive project" [ref=f11e424]
  - generic [ref=f11e425]:
    - text: task-020 Archived combined filters1/2 completed
    - group [ref=f11e427]:
      - button "Open project" [ref=f11e428]
    - group [ref=f11e430]:
      - button "Archive project" [ref=f11e431]
  - generic [ref=f11e432]:
    - text: task-020 Priority ownership0/2 completed
    - group [ref=f11e434]:
      - button "Open project" [ref=f11e435]
    - group [ref=f11e437]:
      - button "Archive project" [ref=f11e438]
  - generic [ref=f11e439]:
    - text: task-020 Priority other owner0/1 completed
    - group [ref=f11e441]:
      - button "Open project" [ref=f11e442]
    - group [ref=f11e444]:
      - button "Archive project" [ref=f11e445]
  - generic [ref=f11e446]:
    - text: task-020 Priority completion1/2 completed
    - group [ref=f11e448]:
      - button "Open project" [ref=f11e449]
    - group [ref=f11e451]:
      - button "Archive project" [ref=f11e452]
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