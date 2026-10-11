# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-owner-archive.spec.mjs >> 136 owner mutation honors every current matching filter and keeps archived task writes protected
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task039-executed04-suite/directory-owner-archive.spec.mjs:24:2

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: locator.click: Test timeout of 180000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-039 Archive wrong notes' }).visible().getByRole('button', { name: 'Open project', exact: true })
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:60377/?project_search=&filter=Active"

```

# Page snapshot

```yaml
- generic [ref=f136e1]:
  - heading "Task directory" [level=1] [ref=f136e2]
  - text: 1/1 completed
  - generic [ref=f136e3]:
    - text: task-039 Archive matching1/1 completed
    - group [ref=f136e5]:
      - button "Open project" [ref=f136e6]
  - group [ref=f136e8]:
    - button "Complete visible tasks" [disabled] [ref=f136e9]
  - group [ref=f136e11]:
    - button "Reopen visible tasks" [disabled] [ref=f136e12]
  - group [ref=f136e14]:
    - button "Delete visible tasks" [disabled] [ref=f136e15]
  - group [ref=f136e17]:
    - button "Restore visible tasks" [disabled] [ref=f136e18]
  - group [ref=f136e20]:
    - generic [ref=f136e21]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [disabled] [ref=f136e22]:
        - option "Low" [disabled]
        - option "Normal" [disabled] [selected]
        - option "High" [disabled]
    - button "Set visible priority" [disabled] [ref=f136e23]
  - group [ref=f136e25]:
    - generic [ref=f136e26]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [disabled] [ref=f136e27]
    - button "Save visible due date" [disabled] [ref=f136e28]
  - group [ref=f136e30]:
    - generic [ref=f136e31]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [disabled] [ref=f136e32]
    - button "Save visible notes" [disabled] [ref=f136e33]
  - group [ref=f136e35]:
    - button "Archive visible projects" [disabled] [ref=f136e36]
  - group [ref=f136e38]:
    - button "Restore visible projects" [ref=f136e39]
  - group [ref=f136e41]:
    - button "Export matching workspace" [active] [ref=f136e42]
  - group [ref=f136e44]:
    - button "Projects" [ref=f136e45]
  - generic [ref=f136e47]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f136e48]:
      - option "All"
      - option "Low"
      - option "Normal"
      - option "High" [selected]
  - generic [ref=f136e50]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f136e51]:
      - option "All"
      - option "Empty"
      - option "Present" [selected]
  - generic [ref=f136e53]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f136e54]:
      - option "All"
      - option "Dated" [selected]
      - option "Undated"
  - generic [ref=f136e56]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f136e57]:
      - option "Phrase"
      - option "All words"
      - option "Any words"
      - option "Starts with" [selected]
  - generic [ref=f136e59]:
    - text: Directory order
    - combobox "Directory order" [ref=f136e60]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f136e62]:
    - text: Project scope
    - combobox "Project scope" [ref=f136e63]:
      - option "Active"
      - option "Archived" [selected]
  - generic [ref=f136e65]:
    - text: Task filter
    - combobox "Task filter" [ref=f136e66]:
      - option "All"
      - option "Open"
      - option "Completed" [selected]
      - option "Deleted"
  - generic [ref=f136e68]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f136e69]:
      - option "All"
      - option "Low" [selected]
      - option "Normal"
      - option "High"
  - group [ref=f136e71]:
    - generic [ref=f136e72]:
      - text: Directory search
      - textbox "Directory search" [ref=f136e73]: ArchiveFilters39
    - button "Search directory" [ref=f136e74]
  - group [ref=f136e76]:
    - generic [ref=f136e77]:
      - text: Due from
      - textbox "Due from" [ref=f136e78]: 3219-03-01
    - generic [ref=f136e79]:
      - text: Due through
      - textbox "Due through" [ref=f136e80]: 3219-03-01
    - button "Apply due range" [ref=f136e81]
  - generic [ref=f136e82]:
    - text: ArchiveFilters39 0task-039 Archive matchingCompletedLow3219-03-01 Filter Ω kept
    - group [ref=f136e84]:
      - button "Open project" [ref=f136e85]
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