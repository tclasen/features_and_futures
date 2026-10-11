# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 042 archived source moves are disabled restoration allows moving an undated task
- Location: runs/instruction-effects/eval-010/tasks/task-016/suite/move-task.spec.mjs:41:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-016 Read-only transfer owner' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - locator resolved to <button type="button">Open project</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - region [ref=f1e3]:
    - heading "Workboard" [level=1] [ref=f1e4]
    - generic [ref=f1e5]:
      - generic [ref=f1e6]: Project name
      - generic [ref=f1e7]:
        - textbox "Project name" [ref=f1e8]
        - button "Create project" [ref=f1e9] [cursor=pointer]
    - generic [ref=f1e10]: Project filter
    - combobox "Project filter" [ref=f1e11]:
      - option "Active" [selected]
      - option "Archived"
    - generic [ref=f1e12]:
      - generic [ref=f1e13]: Project search
      - generic [ref=f1e14]:
        - textbox "Project search" [ref=f1e15]
        - button "Search projects" [ref=f1e16] [cursor=pointer]
    - generic [ref=f1e17]:
      - generic [ref=f1e18]:
        - generic [ref=f1e19]: task-003 Persistence sentinel
        - generic [ref=f1e20]: 1/1 completed
        - button "Open project" [ref=f1e21] [cursor=pointer]
        - button "Restore project" [ref=f1e22] [cursor=pointer]
      - generic [ref=f1e23]:
        - generic [ref=f1e24]: task-004 Persistence renamed
        - generic [ref=f1e25]: 1/1 completed
        - button "Open project" [ref=f1e26] [cursor=pointer]
        - button "Restore project" [ref=f1e27] [cursor=pointer]
      - generic [ref=f1e28]:
        - generic [ref=f1e29]: task-005 Persistence renamed
        - generic [ref=f1e30]: 1/1 completed
        - button "Open project" [ref=f1e31] [cursor=pointer]
        - button "Restore project" [ref=f1e32] [cursor=pointer]
      - generic [ref=f1e33]:
        - generic [ref=f1e34]: task-006 Persistence renamed
        - generic [ref=f1e35]: 1/1 completed
        - button "Open project" [ref=f1e36] [cursor=pointer]
        - button "Restore project" [ref=f1e37] [cursor=pointer]
      - generic [ref=f1e38]:
        - generic [ref=f1e39]: task-007 Persistence renamed
        - generic [ref=f1e40]: 1/1 completed
        - button "Open project" [ref=f1e41] [cursor=pointer]
        - button "Restore project" [ref=f1e42] [cursor=pointer]
      - generic [ref=f1e43]:
        - generic [ref=f1e44]: task-008 Persistence renamed
        - generic [ref=f1e45]: 1/1 completed
        - button "Open project" [ref=f1e46] [cursor=pointer]
        - button "Restore project" [ref=f1e47] [cursor=pointer]
      - generic [ref=f1e48]:
        - generic [ref=f1e49]: task-009 Persistence renamed
        - generic [ref=f1e50]: 1/1 completed
        - button "Open project" [ref=f1e51] [cursor=pointer]
        - button "Restore project" [ref=f1e52] [cursor=pointer]
      - generic [ref=f1e53]:
        - generic [ref=f1e54]: task-010 Persistence renamed
        - generic [ref=f1e55]: 1/1 completed
        - button "Open project" [ref=f1e56] [cursor=pointer]
        - button "Restore project" [ref=f1e57] [cursor=pointer]
      - generic [ref=f1e58]:
        - generic [ref=f1e59]: task-011 Options hidden
        - generic [ref=f1e60]: 0/0 completed
        - button "Open project" [ref=f1e61] [cursor=pointer]
        - button "Restore project" [ref=f1e62] [cursor=pointer]
      - generic [ref=f1e63]:
        - generic [ref=f1e64]: task-011 Persistence renamed
        - generic [ref=f1e65]: 1/1 completed
        - button "Open project" [ref=f1e66] [cursor=pointer]
        - button "Restore project" [ref=f1e67] [cursor=pointer]
      - generic [ref=f1e68]:
        - generic [ref=f1e69]: task-012 Options hidden
        - generic [ref=f1e70]: 0/0 completed
        - button "Open project" [ref=f1e71] [cursor=pointer]
        - button "Restore project" [ref=f1e72] [cursor=pointer]
      - generic [ref=f1e73]:
        - generic [ref=f1e74]: task-012 Persistence renamed
        - generic [ref=f1e75]: 1/1 completed
        - button "Open project" [ref=f1e76] [cursor=pointer]
        - button "Restore project" [ref=f1e77] [cursor=pointer]
      - generic [ref=f1e78]:
        - generic [ref=f1e79]: task-013 Options hidden
        - generic [ref=f1e80]: 0/0 completed
        - button "Open project" [ref=f1e81] [cursor=pointer]
        - button "Restore project" [ref=f1e82] [cursor=pointer]
      - generic [ref=f1e83]:
        - generic [ref=f1e84]: task-013 Search MIXED archived
        - generic [ref=f1e85]: 0/0 completed
        - button "Open project" [ref=f1e86] [cursor=pointer]
        - button "Restore project" [ref=f1e87] [cursor=pointer]
      - generic [ref=f1e88]:
        - generic [ref=f1e89]: task-013 Search mutable titles
        - generic [ref=f1e90]: 0/3 completed
        - button "Open project" [ref=f1e91] [cursor=pointer]
        - button "Restore project" [ref=f1e92] [cursor=pointer]
      - generic [ref=f1e93]:
        - generic [ref=f1e94]: task-013 Persistence renamed
        - generic [ref=f1e95]: 1/1 completed
        - button "Open project" [ref=f1e96] [cursor=pointer]
        - button "Restore project" [ref=f1e97] [cursor=pointer]
      - generic [ref=f1e98]:
        - generic [ref=f1e99]: task-014 Options hidden
        - generic [ref=f1e100]: 0/0 completed
        - button "Open project" [ref=f1e101] [cursor=pointer]
        - button "Restore project" [ref=f1e102] [cursor=pointer]
      - generic [ref=f1e103]:
        - generic [ref=f1e104]: task-014 Whitespace Saved archived
        - generic [ref=f1e105]: 0/0 completed
        - button "Open project" [ref=f1e106] [cursor=pointer]
        - button "Restore project" [ref=f1e107] [cursor=pointer]
      - generic [ref=f1e108]:
        - generic [ref=f1e109]: task-014 Search MIXED archived
        - generic [ref=f1e110]: 0/0 completed
        - button "Open project" [ref=f1e111] [cursor=pointer]
        - button "Restore project" [ref=f1e112] [cursor=pointer]
      - generic [ref=f1e113]:
        - generic [ref=f1e114]: task-014 Search mutable titles
        - generic [ref=f1e115]: 0/3 completed
        - button "Open project" [ref=f1e116] [cursor=pointer]
        - button "Restore project" [ref=f1e117] [cursor=pointer]
      - generic [ref=f1e118]:
        - generic [ref=f1e119]: task-014 Persistence renamed
        - generic [ref=f1e120]: 1/1 completed
        - button "Open project" [ref=f1e121] [cursor=pointer]
        - button "Restore project" [ref=f1e122] [cursor=pointer]
      - generic [ref=f1e123]:
        - generic [ref=f1e124]: task-015 Options hidden
        - generic [ref=f1e125]: 0/0 completed
        - button "Open project" [ref=f1e126] [cursor=pointer]
        - button "Restore project" [ref=f1e127] [cursor=pointer]
      - generic [ref=f1e128]:
        - generic [ref=f1e129]: task-015 Whitespace Saved archived
        - generic [ref=f1e130]: 0/0 completed
        - button "Open project" [ref=f1e131] [cursor=pointer]
        - button "Restore project" [ref=f1e132] [cursor=pointer]
      - generic [ref=f1e133]:
        - generic [ref=f1e134]: task-015 Search MIXED archived
        - generic [ref=f1e135]: 0/0 completed
        - button "Open project" [ref=f1e136] [cursor=pointer]
        - button "Restore project" [ref=f1e137] [cursor=pointer]
      - generic [ref=f1e138]:
        - generic [ref=f1e139]: task-015 Search mutable titles
        - generic [ref=f1e140]: 0/3 completed
        - button "Open project" [ref=f1e141] [cursor=pointer]
        - button "Restore project" [ref=f1e142] [cursor=pointer]
      - generic [ref=f1e143]:
        - generic [ref=f1e144]: task-015 Persistence renamed
        - generic [ref=f1e145]: 1/1 completed
        - button "Open project" [ref=f1e146] [cursor=pointer]
        - button "Restore project" [ref=f1e147] [cursor=pointer]
      - generic [ref=f1e148]:
        - generic [ref=f1e149]: task-016 Options hidden
        - generic [ref=f1e150]: 0/0 completed
        - button "Open project" [ref=f1e151] [cursor=pointer]
        - button "Restore project" [ref=f1e152] [cursor=pointer]
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