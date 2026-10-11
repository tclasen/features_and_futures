# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-prefix-search.spec.mjs >> 132 every bulk action and matching export honor prefix and protect embedded matches
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task038-executed04-suite/directory-prefix-search.spec.mjs:19:2

# Error details

```
Error: Completion state must be durable before the next navigation

Completion state must be durable before the next navigation

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f38e1]:
  - heading "Task directory" [level=1] [ref=f38e2]
  - text: 0/1 completed
  - generic [ref=f38e3]:
    - text: task-038 Owner bulk high0/1 completed
    - group [ref=f38e5]:
      - button "Open project" [ref=f38e6]
  - group [ref=f38e8]:
    - button "Complete visible tasks" [ref=f38e9]
  - group [ref=f38e11]:
    - button "Reopen visible tasks" [disabled] [ref=f38e12]
  - group [ref=f38e14]:
    - button "Delete visible tasks" [ref=f38e15]
  - group [ref=f38e17]:
    - button "Restore visible tasks" [disabled] [ref=f38e18]
  - group [ref=f38e20]:
    - generic [ref=f38e21]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f38e22]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f38e23]
  - group [ref=f38e25]:
    - generic [ref=f38e26]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f38e27]
    - button "Save visible due date" [ref=f38e28]
  - group [ref=f38e30]:
    - generic [ref=f38e31]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f38e32]
    - button "Save visible notes" [ref=f38e33]
  - group [ref=f38e35]:
    - button "Export matching workspace" [ref=f38e36]
  - group [ref=f38e38]:
    - button "Projects" [ref=f38e39]
  - generic [ref=f38e41]:
    - text: Project default priority
    - combobox "Project default priority" [ref=f38e42]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f38e44]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f38e45]:
      - option "All" [selected]
      - option "Empty"
      - option "Present"
  - generic [ref=f38e47]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f38e48]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f38e50]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f38e51]:
      - option "Phrase"
      - option "All words"
      - option "Any words"
      - option "Starts with" [selected]
  - generic [ref=f38e53]:
    - text: Directory order
    - combobox "Directory order" [ref=f38e54]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f38e56]:
    - text: Project scope
    - combobox "Project scope" [ref=f38e57]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f38e59]:
    - text: Task filter
    - combobox "Task filter" [ref=f38e60]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f38e62]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f38e63]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f38e65]:
    - generic [ref=f38e66]:
      - text: Directory search
      - textbox "Directory search" [ref=f38e67]: PrefixBulk38
    - button "Search directory" [ref=f38e68]
  - group [ref=f38e70]:
    - generic [ref=f38e71]:
      - text: Due from
      - textbox "Due from" [ref=f38e72]
    - generic [ref=f38e73]:
      - text: Due through
      - textbox "Due through" [ref=f38e74]
    - button "Apply due range" [ref=f38e75]
  - generic [ref=f38e76]:
    - text: PrefixBulk38 targettask-038 Owner bulk highOpenHigh
    - group [ref=f38e78]:
      - button "Open project" [ref=f38e79]
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
  19 |   await projectRow(page, name).getByRole('button', { name: 'Open project', exact: true }).click();
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
> 62 |     }, {timeout:5000, message:'Completion state must be durable before the next navigation'}).toBe(completed);
     |                                                                                               ^ Error: Completion state must be durable before the next navigation
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