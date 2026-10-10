# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: move-task.spec.mjs >> 040 moving under combined filters retains source range and independent data
- Location: experiments/instruction-effects/revisions/research-v005/decisions/task-018-draft/suite/move-task.spec.mjs:25:2

# Error details

```
Error: locator.isChecked: Error: strict mode violation: getByRole('checkbox', { name: 'Complete Filtered completed guard', exact: true }) resolved to 2 elements:
    1) <input checked value="1" type="checkbox" name="completed" aria-label="Complete Filtered completed guard" onchange="fetch(this.form.action,{method:'POST',body:new URLSearchParams(new FormData(this.form))}).then(r=>r.text()).then(t=>document.documentElement.innerHTML=t)"/> aka getByRole('checkbox', { name: 'Complete Filtered completed' }).first()
    2) <input checked value="1" type="checkbox" name="completed" aria-label="Complete Filtered completed guard" onchange="fetch(this.form.action,{method:'POST',body:new URLSearchParams(new FormData(this.form))}).then(r=>r.text()).then(t=>document.documentElement.innerHTML=t)"/> aka getByRole('checkbox', { name: 'Complete Filtered completed' }).nth(1)

Call log:
  - waiting for getByRole('checkbox', { name: 'Complete Filtered completed guard', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f13e1]:
  - heading "task-018 Filtered transfer source" [level=1] [ref=f13e2]
  - group [ref=f13e4]:
    - button "Download project" [ref=f13e5]
  - group [ref=f13e7]:
    - button "Projects" [ref=f13e8]
  - group [ref=f13e10]:
    - generic [ref=f13e11]:
      - text: Task search
      - textbox "Task search" [ref=f13e12]
    - button "Search tasks" [ref=f13e13]
  - group [ref=f13e15]:
    - generic [ref=f13e16]:
      - text: Due from
      - textbox "Due from" [ref=f13e17]
    - generic [ref=f13e18]:
      - text: Due through
      - textbox "Due through" [ref=f13e19]
    - button "Apply due range" [ref=f13e20]
  - group [ref=f13e22]:
    - generic [ref=f13e23]:
      - text: New project name
      - textbox "New project name" [ref=f13e24]
    - button "Rename project" [ref=f13e25]
  - generic [ref=f13e27]:
    - text: Default task priority
    - combobox "Default task priority" [ref=f13e28]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - group [ref=f13e30]:
    - generic [ref=f13e31]:
      - text: Task title
      - textbox "Task title" [ref=f13e32]
    - button "Create task" [ref=f13e33]
  - generic [ref=f13e35]:
    - text: Task filter
    - combobox "Task filter" [ref=f13e36]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
      - option "Deleted"
  - generic [ref=f13e38]:
    - text: Priority filter
    - combobox "Priority filter" [ref=f13e39]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f13e40]:
    - text: Filtered first
    - group [ref=f13e42]:
      - button "Delete task" [ref=f13e43]
    - checkbox "Complete Filtered first" [ref=f13e45]
    - group [ref=f13e47]:
      - generic [ref=f13e48]:
        - text: Task notes
        - textbox "Task notes" [ref=f13e49]
      - button "Save notes" [ref=f13e50]
    - group [ref=f13e52]:
      - generic [ref=f13e53]:
        - text: Task due date
        - textbox "Task due date" [ref=f13e54]: 2033-01-01
      - button "Save due date" [ref=f13e55]
    - group [ref=f13e57]:
      - generic [ref=f13e58]:
        - text: Destination project
        - combobox "Destination project" [ref=f13e59]:
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
          - option "task-018 Calendar independence"
          - option "task-018 Range validation"
          - option "task-018 Filtered transfer target"
      - button "Move task" [ref=f13e60]
    - group [ref=f13e62]:
      - generic [ref=f13e63]:
        - text: New task title
        - textbox "New task title" [ref=f13e64]
      - button "Rename task" [ref=f13e65]
    - generic [ref=f13e67]:
      - text: Task priority
      - combobox "Task priority" [ref=f13e68]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f13e69]:
    - text: Filtered moving
    - group [ref=f13e71]:
      - button "Delete task" [ref=f13e72]
    - checkbox "Complete Filtered moving" [ref=f13e74]
    - group [ref=f13e76]:
      - generic [ref=f13e77]:
        - text: Task notes
        - textbox "Task notes" [ref=f13e78]
      - button "Save notes" [ref=f13e79]
    - group [ref=f13e81]:
      - generic [ref=f13e82]:
        - text: Task due date
        - textbox "Task due date" [ref=f13e83]: 2033-01-01
      - button "Save due date" [ref=f13e84]
    - group [ref=f13e86]:
      - generic [ref=f13e87]:
        - text: Destination project
        - combobox "Destination project" [ref=f13e88]:
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
          - option "task-018 Calendar independence"
          - option "task-018 Range validation"
          - option "task-018 Filtered transfer target"
      - button "Move task" [ref=f13e89]
    - group [ref=f13e91]:
      - generic [ref=f13e92]:
        - text: New task title
        - textbox "New task title" [ref=f13e93]
      - button "Rename task" [ref=f13e94]
    - generic [ref=f13e96]:
      - text: Task priority
      - combobox "Task priority" [ref=f13e97]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f13e98]:
    - text: Filtered last
    - group [ref=f13e100]:
      - button "Delete task" [ref=f13e101]
    - checkbox "Complete Filtered last" [ref=f13e103]
    - group [ref=f13e105]:
      - generic [ref=f13e106]:
        - text: Task notes
        - textbox "Task notes" [ref=f13e107]
      - button "Save notes" [ref=f13e108]
    - group [ref=f13e110]:
      - generic [ref=f13e111]:
        - text: Task due date
        - textbox "Task due date" [ref=f13e112]: 2033-01-01
      - button "Save due date" [ref=f13e113]
    - group [ref=f13e115]:
      - generic [ref=f13e116]:
        - text: Destination project
        - combobox "Destination project" [ref=f13e117]:
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
          - option "task-018 Calendar independence"
          - option "task-018 Range validation"
          - option "task-018 Filtered transfer target"
      - button "Move task" [ref=f13e118]
    - group [ref=f13e120]:
      - generic [ref=f13e121]:
        - text: New task title
        - textbox "New task title" [ref=f13e122]
      - button "Rename task" [ref=f13e123]
    - generic [ref=f13e125]:
      - text: Task priority
      - combobox "Task priority" [ref=f13e126]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f13e127]:
    - text: Filtered outside range
    - group [ref=f13e129]:
      - button "Delete task" [ref=f13e130]
    - checkbox "Complete Filtered outside range" [ref=f13e132]
    - group [ref=f13e134]:
      - generic [ref=f13e135]:
        - text: Task notes
        - textbox "Task notes" [ref=f13e136]
      - button "Save notes" [ref=f13e137]
    - group [ref=f13e139]:
      - generic [ref=f13e140]:
        - text: Task due date
        - textbox "Task due date" [ref=f13e141]: 2034-01-01
      - button "Save due date" [ref=f13e142]
    - group [ref=f13e144]:
      - generic [ref=f13e145]:
        - text: Destination project
        - combobox "Destination project" [ref=f13e146]:
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
          - option "task-018 Calendar independence"
          - option "task-018 Range validation"
          - option "task-018 Filtered transfer target"
      - button "Move task" [ref=f13e147]
    - group [ref=f13e149]:
      - generic [ref=f13e150]:
        - text: New task title
        - textbox "New task title" [ref=f13e151]
      - button "Rename task" [ref=f13e152]
    - generic [ref=f13e154]:
      - text: Task priority
      - combobox "Task priority" [ref=f13e155]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
  - generic [ref=f13e156]:
    - text: Filtered completed guard
    - group [ref=f13e158]:
      - button "Delete task" [ref=f13e159]
    - checkbox "Complete Filtered completed guard" [checked] [ref=f13e161]
    - group [ref=f13e163]:
      - generic [ref=f13e164]:
        - text: Task notes
        - textbox "Task notes" [ref=f13e165]
      - button "Save notes" [ref=f13e166]
    - group [ref=f13e168]:
      - generic [ref=f13e169]:
        - text: Task due date
        - textbox "Task due date" [ref=f13e170]
      - button "Save due date" [ref=f13e171]
    - group [ref=f13e173]:
      - generic [ref=f13e174]:
        - text: Destination project
        - combobox "Destination project" [ref=f13e175]:
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
          - option "task-018 Calendar independence"
          - option "task-018 Range validation"
          - option "task-018 Filtered transfer target"
      - button "Move task" [ref=f13e176]
    - group [ref=f13e178]:
      - generic [ref=f13e179]:
        - text: New task title
        - textbox "New task title" [ref=f13e180]
      - button "Rename task" [ref=f13e181]
    - generic [ref=f13e183]:
      - text: Task priority
      - combobox "Task priority" [ref=f13e184]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
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
     |                                                                                   ^ Error: locator.isChecked: Error: strict mode violation: getByRole('checkbox', { name: 'Complete Filtered completed guard', exact: true }) resolved to 2 elements:
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