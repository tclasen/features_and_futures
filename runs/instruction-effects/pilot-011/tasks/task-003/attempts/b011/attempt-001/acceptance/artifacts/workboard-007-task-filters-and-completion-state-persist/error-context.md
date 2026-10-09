# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 007 task filters and completion state persist
- Location: runs/instruction-effects/pilot-011/definitions/project/acceptance/workboard.spec.mjs:69:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('task-row').filter({ hasText: 'Open task' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('task-row').filter({ hasText: 'Open task' }).visible() resolved to 2 elements:
    1) <li class="row" data-testid="task-row">…</li> aka getByTestId('task-row').first()
    2) <li class="row" data-testid="task-row">…</li> aka getByTestId('task-row').nth(1)

Call log:
  - Expect "toBeVisible" getByTestId('task-row').filter({ hasText: 'Open task' }).visible() with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ hasText: 'Open task' }).visible()

```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "task-003 Task filters" [level=1] [ref=e3]
  - button "Projects" [ref=e4] [cursor=pointer]
  - generic [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]: Task title
      - textbox "Task title" [ref=e8]
    - button "Create task" [ref=e9] [cursor=pointer]
  - alert
  - generic [ref=e10]:
    - generic [ref=e11]: Task filter
    - combobox "Task filter" [ref=e12]:
      - option "All"
      - option "Open" [selected]
      - option "Completed"
  - list [ref=e13]:
    - listitem [ref=e14]:
      - generic [ref=e15]:
        - checkbox "Complete Open task" [ref=e16]
        - generic [ref=e17]: Open task
    - listitem [ref=e18]:
      - generic [ref=e19]:
        - checkbox "Complete Open task" [ref=e20]
        - generic [ref=e21]: Open task
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { stage, projectName, projectRow, taskRow, createProject, openProject, createTask, isolateBrowser } from './helpers.mjs';
  3   | 
  4   | test.beforeEach(async ({ context }) => { await isolateBrowser(context); });
  5   | 
  6   | test('001 health and project creation persist on reload', async ({ page, request }) => {
  7   |   const health = await request.get('/health');
  8   |   expect(health.status()).toBe(200);
  9   |   expect(await health.json()).toEqual({ status: 'ok' });
  10  |   await page.goto('/');
  11  |   await expect(page.getByRole('heading', { name: 'Workboard', exact: true })).toBeVisible();
  12  |   await createProject(page, '  Alpha create  ');
  13  |   await page.reload();
  14  |   await expect(projectRow(page, 'Alpha create')).toBeVisible();
  15  |   await openProject(page, 'Alpha create');
  16  |   expect(new URL(page.url()).pathname).toMatch(/^\/projects\/[^/]+$/);
  17  |   await page.getByRole('button', { name: 'Projects', exact: true }).click();
  18  |   await expect(projectRow(page, 'Alpha create')).toBeVisible();
  19  | });
  20  | 
  21  | test('002 blank project input is rejected', async ({ page }) => {
  22  |   await createProject(page, 'Blank validation sentinel');
  23  |   await page.reload();
  24  |   await expect(projectRow(page, 'Blank validation sentinel')).toBeVisible();
  25  |   const rows = await page.getByTestId('project-row').filter({ visible: true }).count();
  26  |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('   ');
  27  |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  28  |   await expect(page.getByRole('alert')).toContainText('Project name is required');
  29  |   await page.reload();
  30  |   await expect(projectRow(page, 'Blank validation sentinel')).toBeVisible();
  31  |   await expect(page.getByTestId('project-row').filter({ visible: true })).toHaveCount(rows);
  32  | });
  33  | 
  34  | test('003 project creation order', async ({ page }) => {
  35  |   await createProject(page, 'Order first');
  36  |   await createProject(page, 'Order second');
  37  |   const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  38  |   expect(rows.findIndex(t => t.includes(projectName('Order first')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Order second'))));
  39  | });
  40  | 
  41  | if (stage >= 2) {
  42  |   test('004 trimmed tasks and project URL survive reload', async ({ page }) => {
  43  |     await createProject(page, 'Task reload');
  44  |     await openProject(page, 'Task reload');
  45  |     await createTask(page, '  Task preserved  ');
  46  |     await page.reload();
  47  |     await expect(page.getByRole('heading', { name: projectName('Task reload'), exact: true }).first()).toBeVisible();
  48  |     await expect(taskRow(page, 'Task preserved')).toBeVisible();
  49  |   });
  50  | 
  51  |   test('005 blank task input is rejected', async ({ page }) => {
  52  |     await createProject(page, 'Task invalid');
  53  |     await openProject(page, 'Task invalid');
  54  |     await page.getByRole('textbox', { name: 'Task title', exact: true }).fill('   ');
  55  |     await page.getByRole('button', { name: 'Create task', exact: true }).click();
  56  |     await expect(page.getByRole('alert')).toContainText('Task title is required');
  57  |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  58  |   });
  59  | 
  60  |   test('006 tasks do not cross project boundaries', async ({ page }) => {
  61  |     await createProject(page, 'Task owner');
  62  |     await openProject(page, 'Task owner');
  63  |     await createTask(page, 'Private to owner');
  64  |     await createProject(page, 'Other project');
  65  |     await openProject(page, 'Other project');
  66  |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  67  |   });
  68  | 
  69  |   test('007 task filters and completion state persist', async ({ page }) => {
  70  |     await createProject(page, 'Task filters');
  71  |     await openProject(page, 'Task filters');
  72  |     await expect(page.getByRole('combobox', { name: 'Task filter', exact: true }).locator('option:checked')).toHaveText('All');
  73  |     await createTask(page, 'Done task');
  74  |     await createTask(page, 'Open task');
  75  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  76  |     await expect(page.getByRole('checkbox', { name: 'Complete Open task', exact: true })).not.toBeChecked();
  77  |     const orderedTasks = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  78  |     expect(orderedTasks.findIndex(t => t.includes('Done task'))).toBeLessThan(orderedTasks.findIndex(t => t.includes('Open task')));
  79  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).check();
  80  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
> 81  |     await expect(taskRow(page, 'Open task')).toBeVisible();
      |                                              ^ Error: expect(locator).toBeVisible() failed
  82  |     await expect(taskRow(page, 'Done task')).toHaveCount(0);
  83  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  84  |     await expect(taskRow(page, 'Done task')).toBeVisible();
  85  |     await expect(taskRow(page, 'Open task')).toHaveCount(0);
  86  |     await page.reload();
  87  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
  88  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
  89  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
  90  |     await page.reload();
  91  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  92  |   });
  93  | }
  94  | 
  95  | if (stage >= 3) {
  96  |   test('008 archive state persists and project can be restored', async ({ page }) => {
  97  |     await createProject(page, 'Archive lifecycle');
  98  |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
  99  |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
  100 |     await page.reload();
  101 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  102 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  103 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
  104 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  105 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  106 |   });
  107 | 
  108 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  109 |     await createProject(page, 'Archive tasks');
  110 |     await openProject(page, 'Archive tasks');
  111 |     await createTask(page, 'Retained task');
  112 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  113 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  114 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  115 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  116 |     await openProject(page, 'Archive tasks');
  117 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  118 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  119 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  120 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  121 |     await expect(taskRow(page, 'Retained task')).toHaveCount(0);
  122 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  123 |     await expect(taskRow(page, 'Retained task')).toBeVisible();
  124 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  125 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  126 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  127 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  128 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  129 |     await openProject(page, 'Archive tasks');
  130 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  131 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  132 |   });
  133 | 
  134 |   test('010 completion summaries reflect all tasks', async ({ page }) => {
  135 |     await createProject(page, 'Summary project');
  136 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
  137 |     await openProject(page, 'Summary project');
  138 |     await createTask(page, 'Summary one');
  139 |     await createTask(page, 'Summary two');
  140 |     await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
  141 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  142 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  143 |   });
  144 | }
  145 | 
  146 | test('011 seed process-restart persistence checks', async ({ page }) => {
  147 |   await createProject(page, 'Persistence sentinel');
  148 |   if (stage >= 2) {
  149 |     await openProject(page, 'Persistence sentinel');
  150 |     await createTask(page, 'Remember me');
  151 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  152 |   }
  153 |   if (stage >= 4) {
  154 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  155 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  156 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  157 |   }
  158 |   if (stage >= 3) {
  159 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  160 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  161 |   }
  162 | });
  163 | 
  164 | if (stage >= 4) {
  165 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  166 |     await createProject(page, 'Identity first');
  167 |     await createProject(page, 'Identity second');
  168 |     await openProject(page, 'Identity first');
  169 |     const originalPath = new URL(page.url()).pathname;
  170 |     await createTask(page, 'Identity task');
  171 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  172 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  173 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  174 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  175 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  176 |     await page.reload();
  177 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  178 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  179 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  180 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  181 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
```