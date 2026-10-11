# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: directory-notes-status.spec.mjs >> 123 notes presence alone selects each bulk write and assignment or clear changes membership
- Location: experiments/instruction-effects/revisions/research-v010/preflight/task036-executed02-suite/directory-notes-status.spec.mjs:20:2

# Error details

```
Error: Task priority must be durable before the next navigation

Task priority must be durable before the next navigation

expect(received).toBe(expected) // Object.is equality

Expected: "High"
Received: "Low"

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f30e1]:
  - heading "Task directory" [level=1] [ref=f30e2]
  - text: 0/1 completed
  - generic [ref=f30e3]:
    - text: task-036 Notes independent bulk0/1 completed
    - group [ref=f30e5]:
      - button "Open project" [ref=f30e6]
  - group [ref=f30e8]:
    - button "Complete visible tasks" [ref=f30e9]
  - group [ref=f30e11]:
    - button "Reopen visible tasks" [disabled] [ref=f30e12]
  - group [ref=f30e14]:
    - button "Delete visible tasks" [ref=f30e15]
  - group [ref=f30e17]:
    - button "Restore visible tasks" [disabled] [ref=f30e18]
  - group [ref=f30e20]:
    - generic [ref=f30e21]:
      - text: Visible tasks priority
      - combobox "Visible tasks priority" [ref=f30e22]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - button "Set visible priority" [ref=f30e23]
  - group [ref=f30e25]:
    - generic [ref=f30e26]:
      - text: Visible tasks due date
      - textbox "Visible tasks due date" [ref=f30e27]
    - button "Save visible due date" [ref=f30e28]
  - group [ref=f30e30]:
    - generic [ref=f30e31]:
      - text: Visible tasks notes
      - textbox "Visible tasks notes" [ref=f30e32]
    - button "Save visible notes" [ref=f30e33]
  - group [ref=f30e35]:
    - button "Export matching workspace" [ref=f30e36]
  - group [ref=f30e38]:
    - button "Projects" [ref=f30e39]
  - generic [ref=f30e41]:
    - text: Directory notes status
    - combobox "Directory notes status" [ref=f30e42]:
      - option "All"
      - option "Empty" [selected]
      - option "Present"
  - generic [ref=f30e44]:
    - text: Directory due status
    - combobox "Directory due status" [ref=f30e45]:
      - option "All" [selected]
      - option "Dated"
      - option "Undated"
  - generic [ref=f30e47]:
    - text: Directory search mode
    - combobox "Directory search mode" [ref=f30e48]:
      - option "Phrase" [selected]
      - option "All words"
      - option "Any words"
  - generic [ref=f30e50]:
    - text: Directory order
    - combobox "Directory order" [ref=f30e51]:
      - option "Original" [selected]
      - option "Priority"
      - option "Due date"
      - option "Title"
      - option "Project name"
  - generic [ref=f30e53]:
    - text: Project scope
    - combobox "Project scope" [ref=f30e54]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f30e56]:
    - text: Task filter
    - combobox "Task filter" [ref=f30e57]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f30e59]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f30e60]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - group [ref=f30e62]:
    - generic [ref=f30e63]:
      - text: Directory search
      - textbox "Directory search" [ref=f30e64]: NotesIndependent36
    - button "Search directory" [ref=f30e65]
  - group [ref=f30e67]:
    - generic [ref=f30e68]:
      - text: Due from
      - textbox "Due from" [ref=f30e69]
    - generic [ref=f30e70]:
      - text: Due through
      - textbox "Due through" [ref=f30e71]
    - button "Apply due range" [ref=f30e72]
  - generic [ref=f30e73]:
    - text: NotesIndependent36 emptytask-036 Notes independent bulkOpenLow
    - group [ref=f30e75]:
      - button "Open project" [ref=f30e76]
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
> 74 |     }, {timeout:5000, message:'Task priority must be durable before the next navigation'}).toBe(priority);
     |                                                                                            ^ Error: Task priority must be durable before the next navigation
  75 |   } finally { await observer.close(); }
  76 | }
  77 | 
```