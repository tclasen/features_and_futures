# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: import.spec.mjs >> 060 exported projects import independently with saved fields deleted order and project defaults
- Location: experiments/instruction-effects/revisions/research-v004/decisions/task-018-draft/suite/import.spec.mjs:14:2

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-018 Import origin' }).visible().getByRole('button', { name: 'Open project', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f19e1]:
  - heading "Workboard" [level=1] [ref=f19e2]
  - group [ref=f19e4]:
    - generic [ref=f19e5]:
      - text: Project JSON
      - textbox "Project JSON" [ref=f19e6]
    - generic [ref=f19e7]:
      - text: Imported project name
      - textbox "Imported project name" [ref=f19e8]
    - button "Import project" [ref=f19e9]
  - group [ref=f19e11]:
    - generic [ref=f19e12]:
      - text: Project name
      - textbox "Project name" [ref=f19e13]
    - button "Create project" [ref=f19e14]
  - group [ref=f19e16]:
    - generic [ref=f19e17]:
      - text: Project search
      - textbox "Project search" [ref=f19e18]
    - button "Search projects" [ref=f19e19]
  - generic [ref=f19e21]:
    - text: Project filter
    - combobox "Project filter" [ref=f19e22]:
      - option "Active" [selected]
      - option "Archived"
  - generic [ref=f19e23]:
    - text: task-012 Position first owner0/4 completed
    - group [ref=f19e25]:
      - button "Open project" [ref=f19e26]
    - group [ref=f19e28]:
      - button "Archive project" [ref=f19e29]
  - generic [ref=f19e30]:
    - text: task-012 Position second owner0/2 completed
    - group [ref=f19e32]:
      - button "Open project" [ref=f19e33]
    - group [ref=f19e35]:
      - button "Archive project" [ref=f19e36]
  - generic [ref=f19e37]:
    - text: task-012 Search Mixed first0/0 completed
    - group [ref=f19e39]:
      - button "Open project" [ref=f19e40]
    - group [ref=f19e42]:
      - button "Archive project" [ref=f19e43]
  - generic [ref=f19e44]:
    - text: task-012 Search mixed last0/0 completed
    - group [ref=f19e46]:
      - button "Open project" [ref=f19e47]
    - group [ref=f19e49]:
      - button "Archive project" [ref=f19e50]
  - generic [ref=f19e51]:
    - text: task-012 Search double gap0/0 completed
    - group [ref=f19e53]:
      - button "Open project" [ref=f19e54]
    - group [ref=f19e56]:
      - button "Archive project" [ref=f19e57]
  - generic [ref=f19e58]:
    - text: task-012 Whitespace Saved first0/0 completed
    - group [ref=f19e60]:
      - button "Open project" [ref=f19e61]
    - group [ref=f19e63]:
      - button "Archive project" [ref=f19e64]
  - generic [ref=f19e65]:
    - text: task-018 Import copy1/4 completed
    - group [ref=f19e67]:
      - button "Open project" [ref=f19e68]
    - group [ref=f19e70]:
      - button "Archive project" [ref=f19e71]
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