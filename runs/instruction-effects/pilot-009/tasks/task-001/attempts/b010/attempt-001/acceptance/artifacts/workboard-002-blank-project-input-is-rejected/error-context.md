# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 002 blank project input is rejected
- Location: runs/instruction-effects/pilot-009/definitions/project/acceptance/workboard.spec.mjs:21:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').visible() with timeout 5000ms
  - waiting for getByTestId('project-row').visible()
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Workboard" [level=1] [ref=e3]
  - generic [ref=e4]:
    - generic [ref=e5]: Project name
    - generic [ref=e6]:
      - textbox "Project name" [ref=e7]
      - button "Create project" [active] [ref=e8] [cursor=pointer]
    - alert [ref=e9]: Project name is required
  - region "Projects" [ref=e10]:
    - heading "Projects" [level=2] [ref=e11]
    - article [ref=e13]:
      - generic [ref=e14]: task-001 Alpha create
      - button "Open project" [ref=e15] [cursor=pointer]
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
  22  |   await page.goto('/');
  23  |   const rows = await page.getByTestId('project-row').filter({ visible: true }).count();
  24  |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('   ');
  25  |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  26  |   await expect(page.getByRole('alert')).toContainText('Project name is required');
> 27  |   await expect(page.getByTestId('project-row').filter({ visible: true })).toHaveCount(rows);
      |                                                                           ^ Error: expect(locator).toHaveCount(expected) failed
  28  | });
  29  | 
  30  | test('003 project creation order', async ({ page }) => {
  31  |   await createProject(page, 'Order first');
  32  |   await createProject(page, 'Order second');
  33  |   const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  34  |   expect(rows.findIndex(t => t.includes(projectName('Order first')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Order second'))));
  35  | });
  36  | 
  37  | if (stage >= 2) {
  38  |   test('004 trimmed tasks and project URL survive reload', async ({ page }) => {
  39  |     await createProject(page, 'Task reload');
  40  |     await openProject(page, 'Task reload');
  41  |     await createTask(page, '  Task preserved  ');
  42  |     await page.reload();
  43  |     await expect(page.getByRole('heading', { name: projectName('Task reload'), exact: true }).first()).toBeVisible();
  44  |     await expect(taskRow(page, 'Task preserved')).toBeVisible();
  45  |   });
  46  | 
  47  |   test('005 blank task input is rejected', async ({ page }) => {
  48  |     await createProject(page, 'Task invalid');
  49  |     await openProject(page, 'Task invalid');
  50  |     await page.getByRole('textbox', { name: 'Task title', exact: true }).fill('   ');
  51  |     await page.getByRole('button', { name: 'Create task', exact: true }).click();
  52  |     await expect(page.getByRole('alert')).toContainText('Task title is required');
  53  |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  54  |   });
  55  | 
  56  |   test('006 tasks do not cross project boundaries', async ({ page }) => {
  57  |     await createProject(page, 'Task owner');
  58  |     await openProject(page, 'Task owner');
  59  |     await createTask(page, 'Private to owner');
  60  |     await createProject(page, 'Other project');
  61  |     await openProject(page, 'Other project');
  62  |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  63  |   });
  64  | 
  65  |   test('007 task filters and completion state persist', async ({ page }) => {
  66  |     await createProject(page, 'Task filters');
  67  |     await openProject(page, 'Task filters');
  68  |     await expect(page.getByRole('combobox', { name: 'Task filter', exact: true }).locator('option:checked')).toHaveText('All');
  69  |     await createTask(page, 'Done task');
  70  |     await createTask(page, 'Open task');
  71  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  72  |     await expect(page.getByRole('checkbox', { name: 'Complete Open task', exact: true })).not.toBeChecked();
  73  |     const orderedTasks = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  74  |     expect(orderedTasks.findIndex(t => t.includes('Done task'))).toBeLessThan(orderedTasks.findIndex(t => t.includes('Open task')));
  75  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).check();
  76  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  77  |     await expect(taskRow(page, 'Open task')).toBeVisible();
  78  |     await expect(taskRow(page, 'Done task')).toHaveCount(0);
  79  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  80  |     await expect(taskRow(page, 'Done task')).toBeVisible();
  81  |     await expect(taskRow(page, 'Open task')).toHaveCount(0);
  82  |     await page.reload();
  83  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
  84  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
  85  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
  86  |     await page.reload();
  87  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  88  |   });
  89  | }
  90  | 
  91  | if (stage >= 3) {
  92  |   test('008 archive state persists and project can be restored', async ({ page }) => {
  93  |     await createProject(page, 'Archive lifecycle');
  94  |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
  95  |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
  96  |     await page.reload();
  97  |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  98  |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  99  |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
  100 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  101 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  102 |   });
  103 | 
  104 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  105 |     await createProject(page, 'Archive tasks');
  106 |     await openProject(page, 'Archive tasks');
  107 |     await createTask(page, 'Retained task');
  108 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  109 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  110 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  111 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  112 |     await openProject(page, 'Archive tasks');
  113 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  114 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  115 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  116 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  117 |     await expect(taskRow(page, 'Retained task')).toHaveCount(0);
  118 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  119 |     await expect(taskRow(page, 'Retained task')).toBeVisible();
  120 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  121 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  122 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  123 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  124 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  125 |     await openProject(page, 'Archive tasks');
  126 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  127 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
```