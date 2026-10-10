# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: due-date.spec.mjs >> 032 date changes retain task identity filters order and all-task summary
- Location: experiments/instruction-effects/revisions/research-v005/decisions/task-018-draft/suite/due-date.spec.mjs:29:2

# Error details

```
Error: locator.isChecked: Error: strict mode violation: getByRole('checkbox', { name: 'Complete Completed normal guard', exact: true }) resolved to 2 elements:
    1) <input checked value="1" type="checkbox" name="completed" aria-label="Complete Completed normal guard" onchange="fetch(this.form.action,{method:'POST',body:new URLSearchParams(new FormData(this.form))}).then(r=>r.text()).then(t=>document.documentElement.innerHTML=t)"/> aka getByRole('checkbox', { name: 'Complete Completed normal' }).first()
    2) <input checked value="1" type="checkbox" name="completed" aria-label="Complete Completed normal guard" onchange="fetch(this.form.action,{method:'POST',body:new URLSearchParams(new FormData(this.form))}).then(r=>r.text()).then(t=>document.documentElement.innerHTML=t)"/> aka getByRole('checkbox', { name: 'Complete Completed normal' }).nth(1)

Call log:
  - waiting for getByRole('checkbox', { name: 'Complete Completed normal guard', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - heading "task-018 Calendar independence" [level=1] [ref=f5e2]
  - group [ref=f5e4]:
    - button "Download project" [ref=f5e5]
  - group [ref=f5e7]:
    - button "Projects" [ref=f5e8]
  - group [ref=f5e10]:
    - generic [ref=f5e11]:
      - text: Task search
      - textbox "Task search" [ref=f5e12]
    - button "Search tasks" [ref=f5e13]
  - group [ref=f5e15]:
    - generic [ref=f5e16]:
      - text: Due from
      - textbox "Due from" [ref=f5e17]
    - generic [ref=f5e18]:
      - text: Due through
      - textbox "Due through" [ref=f5e19]
    - button "Apply due range" [ref=f5e20]
  - group [ref=f5e22]:
    - generic [ref=f5e23]:
      - text: New project name
      - textbox "New project name" [ref=f5e24]
    - button "Rename project" [ref=f5e25]
  - generic [ref=f5e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f5e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f5e30]:
    - generic [ref=f5e31]:
      - text: Task title
      - textbox "Task title" [ref=f5e32]
    - button "Create task" [ref=f5e33]
  - generic [ref=f5e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f5e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f5e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f5e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f5e40]:
    - text: Dated first
    - group [ref=f5e42]:
      - button "Delete task" [ref=f5e43]
    - checkbox "Complete Dated first" [ref=f5e45]
    - group [ref=f5e47]:
      - generic [ref=f5e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f5e49]
      - button "Save notes" [ref=f5e50]
    - group [ref=f5e52]:
      - generic [ref=f5e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f5e54]
      - button "Save due date" [ref=f5e55]
    - group [ref=f5e57]:
      - generic [ref=f5e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f5e59]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-018 Deletion fields"
          - option "task-018 Deletion target"
          - option "task-018 Deletion order"
          - option "task-018 Deletion restart"
      - button "Move task" [ref=f5e60]
    - group [ref=f5e62]:
      - generic [ref=f5e63]:
        - text: New task title
        - textbox "New task title" [ref=f5e64]
      - button "Rename task" [ref=f5e65]
    - generic [ref=f5e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e68]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f5e69]:
    - text: Undated second
    - group [ref=f5e71]:
      - button "Delete task" [ref=f5e72]
    - checkbox "Complete Undated second" [ref=f5e74]
    - group [ref=f5e76]:
      - generic [ref=f5e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f5e78]
      - button "Save notes" [ref=f5e79]
    - group [ref=f5e81]:
      - generic [ref=f5e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f5e83]
      - button "Save due date" [ref=f5e84]
    - group [ref=f5e86]:
      - generic [ref=f5e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f5e88]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-018 Deletion fields"
          - option "task-018 Deletion target"
          - option "task-018 Deletion order"
          - option "task-018 Deletion restart"
      - button "Move task" [ref=f5e89]
    - group [ref=f5e91]:
      - generic [ref=f5e92]:
        - text: New task title
        - textbox "New task title" [ref=f5e93]
      - button "Rename task" [ref=f5e94]
    - generic [ref=f5e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e97]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
  - generic [ref=f5e98]:
    - text: Completed normal guard
    - group [ref=f5e100]:
      - button "Delete task" [ref=f5e101]
    - checkbox "Complete Completed normal guard" [checked] [ref=f5e103]
    - group [ref=f5e105]:
      - generic [ref=f5e106]:
        - text: Task notes
        - textbox "Task notes" [ref=f5e107]
      - button "Save notes" [ref=f5e108]
    - group [ref=f5e110]:
      - generic [ref=f5e111]:
        - text: Task due date
        - textbox "Task due date" [ref=f5e112]
      - button "Save due date" [ref=f5e113]
    - group [ref=f5e115]:
      - generic [ref=f5e116]:
        - text: Destination project
        - combobox "Destination project" [ref=f5e117]:
          - option "task-012 Position first owner" [selected]
          - option "task-012 Position second owner"
          - option "task-012 Search Mixed first"
          - option "task-012 Search mixed last"
          - option "task-012 Search double gap"
          - option "task-012 Whitespace Saved first"
          - option "task-018 Deletion fields"
          - option "task-018 Deletion target"
          - option "task-018 Deletion order"
          - option "task-018 Deletion restart"
      - button "Move task" [ref=f5e118]
    - group [ref=f5e120]:
      - generic [ref=f5e121]:
        - text: New task title
        - textbox "New task title" [ref=f5e122]
      - button "Rename task" [ref=f5e123]
    - generic [ref=f5e125]:
      - text: Task priority
      - combobox "Task priority" [ref=f5e126]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
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
> 61 |       return observer.getByRole('checkbox', {name:'Complete '+title, exact:true}).isChecked();
     |                                                                                   ^ Error: locator.isChecked: Error: strict mode violation: getByRole('checkbox', { name: 'Complete Completed normal guard', exact: true }) resolved to 2 elements:
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