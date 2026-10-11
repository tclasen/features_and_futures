# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owner-archive.spec.mjs >> 134 archive and restore each represented owner while preserving all excluded task fields and creation order
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task039-executed04-suite/directory-owner-archive.spec.mjs:16:2

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: locator.click: Test timeout of 180000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-039 Archive excluded owner' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:60377/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [active] [ref=f58e1]:
  - heading "Task directory" [level=1] [ref=f58e2]
  - text: 2/3 completed
  - generic [ref=f58e3]:
    - text: task-039 Archive first owner1/1 completed
    - group [ref=f58e5]:
      - button "Open project" [ref=f58e6]
  - generic [ref=f58e7]:
    - text: task-039 Archive second owner1/2 completed
    - group [ref=f58e9]:
      - button "Open project" [ref=f58e10]
  - group [ref=f58e12]:
    - button "Complete visible tasks" [disabled] [ref=f58e13]
  - group [ref=f58e15]:
    - button "Reopen visible tasks" [disabled] [ref=f58e16]
  - group [ref=f58e18]:
    - button "Delete visible tasks" [disabled] [ref=f58e19]
  - group [ref=f58e21]:
    - button "Restore visible tasks" [disabled] [ref=f58e22]
  - group [ref=f58e24]:
    - generic [ref=f58e25]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f58e26]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f58e27]
  - group [ref=f58e29]:
    - generic [ref=f58e30]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f58e31]
    - button "Save visible due date" [disabled] [ref=f58e32]
  - group [ref=f58e34]:
    - generic [ref=f58e35]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [disabled] [ref=f58e36]
    - button "Save visible notes" [disabled] [ref=f58e37]
  - group [ref=f58e39]:
    - button "Archive visible projects" [disabled] [ref=f58e40]
  - group [ref=f58e42]:
    - button "Restore visible projects" [ref=f58e43]
  - group [ref=f58e45]:
    - button "Export matching workspace" [ref=f58e46]
  - group [ref=f58e48]:
    - button "Projects" [ref=f58e49]
  - generic [ref=f58e51]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f58e52]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f58e54]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f58e55]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f58e57]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f58e58]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f58e60]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f58e61]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
      - option "Starts with"
  - generic [ref=f58e63]:
    - text: Directory order
    - combobox "Directory order" [ref=f58e64]:
      - option "Original"
      - option "Priority"
      - option "Due date"
      - option "Title" [selected]
      - option "Project name"
  - generic [ref=f58e66]:
    - text: Project scope
    - combobox "Project scope" [ref=f58e67]:
      - option "Active"
      - option "Archived" [selected]
  - generic [ref=f58e69]:
    - text: Task filter
    - combobox "Task filter" [ref=f58e70]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f58e72]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f58e73]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f58e75]:
    - generic [ref=f58e76]:
      - text: Directory search
      - textbox "Directory search" [ref=f58e77]: ArchiveOwners39
    - button "Search directory" [ref=f58e78]
  - group [ref=f58e80]:
    - generic [ref=f58e81]:
      - text: Due from
      - textbox "Due from" [ref=f58e82]
    - generic [ref=f58e83]:
      - text: Due through
      - textbox "Due through" [ref=f58e84]
    - button "Apply due range" [ref=f58e85]
  - generic [ref=f58e86]:
    - text: ArchiveOwners39 Alphatask-039 Archive second ownerOpenHigh
    - group [ref=f58e88]:
      - button "Open project" [ref=f58e89]
  - generic [ref=f58e90]:
    - text: ArchiveOwners39 Middletask-039 Archive second ownerCompletedLow
    - group [ref=f58e92]:
      - button "Open project" [ref=f58e93]
  - generic [ref=f58e94]:
    - text: ArchiveOwners39 Zulutask-039 Archive first ownerCompletedLow3199-03-01 Archive Ω kept
    - group [ref=f58e96]:
      - button "Open project" [ref=f58e97]
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
     |                                                                                           ^ Error: locator.click: Test timeout of 180000ms exceeded.
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