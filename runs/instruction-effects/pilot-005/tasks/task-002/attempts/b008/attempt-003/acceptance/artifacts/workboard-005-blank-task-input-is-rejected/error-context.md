# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 005 blank task input is rejected
- Location: runs/instruction-effects/pilot-005/definitions/project/acceptance/workboard.spec.mjs:47:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.fill: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: 'Task title', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - heading "task-002 Task invalid" [level=1] [ref=f1e2]
  - button "Projects" [ref=f1e3]
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
  23  |   const rows = await page.getByTestId('project-row').count();
  24  |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('   ');
  25  |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  26  |   await expect(page.getByRole('alert')).toContainText('Project name is required');
  27  |   await expect(page.getByTestId('project-row')).toHaveCount(rows);
  28  | });
  29  | 
  30  | test('003 project creation order', async ({ page }) => {
  31  |   await createProject(page, 'Order first');
  32  |   await createProject(page, 'Order second');
  33  |   const rows = await page.getByTestId('project-row').allTextContents();
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
> 50  |     await page.getByRole('textbox', { name: 'Task title', exact: true }).fill('   ');
      |                                                                          ^ Error: locator.fill: Test timeout of 20000ms exceeded.
  51  |     await page.getByRole('button', { name: 'Create task', exact: true }).click();
  52  |     await expect(page.getByRole('alert')).toContainText('Task title is required');
  53  |     await expect(page.getByTestId('task-row')).toHaveCount(0);
  54  |   });
  55  | 
  56  |   test('006 tasks do not cross project boundaries', async ({ page }) => {
  57  |     await createProject(page, 'Task owner');
  58  |     await openProject(page, 'Task owner');
  59  |     await createTask(page, 'Private to owner');
  60  |     await createProject(page, 'Other project');
  61  |     await openProject(page, 'Other project');
  62  |     await expect(page.getByTestId('task-row')).toHaveCount(0);
  63  |   });
  64  | 
  65  |   test('007 task filters and completion state persist', async ({ page }) => {
  66  |     await createProject(page, 'Task filters');
  67  |     await openProject(page, 'Task filters');
  68  |     await createTask(page, 'Done task');
  69  |     await createTask(page, 'Open task');
  70  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).check();
  71  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  72  |     await expect(taskRow(page, 'Open task')).toBeVisible();
  73  |     await expect(taskRow(page, 'Done task')).toHaveCount(0);
  74  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  75  |     await expect(taskRow(page, 'Done task')).toBeVisible();
  76  |     await expect(taskRow(page, 'Open task')).toHaveCount(0);
  77  |     await page.reload();
  78  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
  79  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
  80  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
  81  |     await page.reload();
  82  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  83  |   });
  84  | }
  85  | 
  86  | if (stage >= 3) {
  87  |   test('008 archive state persists and project can be restored', async ({ page }) => {
  88  |     await createProject(page, 'Archive lifecycle');
  89  |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
  90  |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
  91  |     await page.reload();
  92  |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  93  |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  94  |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
  95  |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  96  |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  97  |   });
  98  | 
  99  |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  100 |     await createProject(page, 'Archive tasks');
  101 |     await openProject(page, 'Archive tasks');
  102 |     await createTask(page, 'Retained task');
  103 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  104 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  105 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  106 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  107 |     await openProject(page, 'Archive tasks');
  108 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  109 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  110 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  111 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  112 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  113 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  114 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  115 |     await openProject(page, 'Archive tasks');
  116 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  117 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  118 |   });
  119 | 
  120 |   test('010 completion summaries reflect all tasks', async ({ page }) => {
  121 |     await createProject(page, 'Summary project');
  122 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
  123 |     await openProject(page, 'Summary project');
  124 |     await createTask(page, 'Summary one');
  125 |     await createTask(page, 'Summary two');
  126 |     await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
  127 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  128 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  129 |   });
  130 | }
  131 | 
  132 | test('011 seed process-restart persistence checks', async ({ page }) => {
  133 |   await createProject(page, 'Persistence sentinel');
  134 |   if (stage >= 2) {
  135 |     await openProject(page, 'Persistence sentinel');
  136 |     await createTask(page, 'Remember me');
  137 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  138 |   }
  139 |   if (stage >= 3) {
  140 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  141 |     await projectRow(page, 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  142 |   }
  143 | });
  144 | 
```