# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 007 task filters and completion state persist
- Location: runs/instruction-effects/pilot-012/definitions/project/acceptance/workboard.spec.mjs:70:3

# Error details

```
Error: expect(locator).not.toBeChecked() failed

Locator:  getByRole('checkbox', { name: 'Complete Done task', exact: true })
Expected: not checked
Received: checked
Timeout:  5000ms

Call log:
  - Expect "not toBeChecked" getByRole('checkbox', { name: 'Complete Done task', exact: true }) with timeout 5000ms
  - waiting for getByRole('checkbox', { name: 'Complete Done task', exact: true })
    14 × locator resolved to <input checked value="1" type="checkbox" name="completed" aria-label="Complete Done task"/>
       - unexpected value "checked"

```

```yaml
- checkbox "Complete Done task" [checked]
```

# Test source

```ts
  1   | import { requiredAlert } from './helpers.mjs';
  2   | import { test, expect } from '@playwright/test';
  3   | import { stage, projectName, projectRow, taskRow, createProject, openProject, createTask, isolateBrowser } from './helpers.mjs';
  4   | 
  5   | test.beforeEach(async ({ context }) => { await isolateBrowser(context); });
  6   | 
  7   | test('001 health and project creation persist on reload', async ({ page, request }) => {
  8   |   const health = await request.get('/health');
  9   |   expect(health.status()).toBe(200);
  10  |   expect(await health.json()).toEqual({ status: 'ok' });
  11  |   await page.goto('/');
  12  |   await expect(page.getByRole('heading', { name: 'Workboard', exact: true })).toBeVisible();
  13  |   await createProject(page, '  Alpha create  ');
  14  |   await page.reload();
  15  |   await expect(projectRow(page, 'Alpha create')).toBeVisible();
  16  |   await openProject(page, 'Alpha create');
  17  |   expect(new URL(page.url()).pathname).toMatch(/^\/projects\/[^/]+$/);
  18  |   await page.getByRole('button', { name: 'Projects', exact: true }).click();
  19  |   await expect(projectRow(page, 'Alpha create')).toBeVisible();
  20  | });
  21  | 
  22  | test('002 blank project input is rejected', async ({ page }) => {
  23  |   await createProject(page, 'Blank validation sentinel');
  24  |   await page.reload();
  25  |   await expect(projectRow(page, 'Blank validation sentinel')).toBeVisible();
  26  |   const rows = await page.getByTestId('project-row').filter({ visible: true }).count();
  27  |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('   ');
  28  |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  29  |   await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  30  |   await page.reload();
  31  |   await expect(projectRow(page, 'Blank validation sentinel')).toBeVisible();
  32  |   await expect(page.getByTestId('project-row').filter({ visible: true })).toHaveCount(rows);
  33  | });
  34  | 
  35  | test('003 project creation order', async ({ page }) => {
  36  |   await createProject(page, 'Order first');
  37  |   await createProject(page, 'Order second');
  38  |   const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  39  |   expect(rows.findIndex(t => t.includes(projectName('Order first')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Order second'))));
  40  | });
  41  | 
  42  | if (stage >= 2) {
  43  |   test('004 trimmed tasks and project URL survive reload', async ({ page }) => {
  44  |     await createProject(page, 'Task reload');
  45  |     await openProject(page, 'Task reload');
  46  |     await createTask(page, '  Task preserved  ');
  47  |     await page.reload();
  48  |     await expect(page.getByRole('heading', { name: projectName('Task reload'), exact: true }).first()).toBeVisible();
  49  |     await expect(taskRow(page, 'Task preserved')).toBeVisible();
  50  |   });
  51  | 
  52  |   test('005 blank task input is rejected', async ({ page }) => {
  53  |     await createProject(page, 'Task invalid');
  54  |     await openProject(page, 'Task invalid');
  55  |     await page.getByRole('textbox', { name: 'Task title', exact: true }).fill('   ');
  56  |     await page.getByRole('button', { name: 'Create task', exact: true }).click();
  57  |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
  58  |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  59  |   });
  60  | 
  61  |   test('006 tasks do not cross project boundaries', async ({ page }) => {
  62  |     await createProject(page, 'Task owner');
  63  |     await openProject(page, 'Task owner');
  64  |     await createTask(page, 'Private to owner');
  65  |     await createProject(page, 'Other project');
  66  |     await openProject(page, 'Other project');
  67  |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  68  |   });
  69  | 
  70  |   test('007 task filters and completion state persist', async ({ page }) => {
  71  |     await createProject(page, 'Task filters');
  72  |     await openProject(page, 'Task filters');
  73  |     await expect(page.getByRole('combobox', { name: 'Task filter', exact: true }).locator('option:checked')).toHaveText('All');
  74  |     await createTask(page, 'Done task');
  75  |     await createTask(page, 'Open task');
  76  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  77  |     await expect(page.getByRole('checkbox', { name: 'Complete Open task', exact: true })).not.toBeChecked();
  78  |     const orderedTasks = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  79  |     expect(orderedTasks.findIndex(t => t.includes('Done task'))).toBeLessThan(orderedTasks.findIndex(t => t.includes('Open task')));
  80  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).check();
  81  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  82  |     await expect(taskRow(page, 'Open task')).toBeVisible();
  83  |     await expect(taskRow(page, 'Done task')).toHaveCount(0);
  84  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  85  |     await expect(taskRow(page, 'Done task')).toBeVisible();
  86  |     await expect(taskRow(page, 'Open task')).toHaveCount(0);
  87  |     await page.reload();
  88  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
  89  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
  90  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
  91  |     await page.reload();
> 92  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
      |                                                                                               ^ Error: expect(locator).not.toBeChecked() failed
  93  |   });
  94  | }
  95  | 
  96  | if (stage >= 3) {
  97  |   test('008 archive state persists and project can be restored', async ({ page }) => {
  98  |     await createProject(page, 'Archive lifecycle');
  99  |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
  100 |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
  101 |     await page.reload();
  102 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  103 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  104 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
  105 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  106 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  107 |   });
  108 | 
  109 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  110 |     await createProject(page, 'Archive tasks');
  111 |     await openProject(page, 'Archive tasks');
  112 |     await createTask(page, 'Retained task');
  113 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  114 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  115 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  116 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  117 |     await openProject(page, 'Archive tasks');
  118 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  119 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  120 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  121 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  122 |     await expect(taskRow(page, 'Retained task')).toHaveCount(0);
  123 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  124 |     await expect(taskRow(page, 'Retained task')).toBeVisible();
  125 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  126 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  127 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  128 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  129 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  130 |     await openProject(page, 'Archive tasks');
  131 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  132 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  133 |   });
  134 | 
  135 |   test('010 completion summaries reflect all tasks', async ({ page }) => {
  136 |     await createProject(page, 'Summary project');
  137 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
  138 |     await openProject(page, 'Summary project');
  139 |     await createTask(page, 'Summary one');
  140 |     await createTask(page, 'Summary two');
  141 |     await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
  142 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  143 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  144 |   });
  145 | }
  146 | 
  147 | test('011 seed process-restart persistence checks', async ({ page }) => {
  148 |   await createProject(page, 'Persistence sentinel');
  149 |   if (stage >= 2) {
  150 |     await openProject(page, 'Persistence sentinel');
  151 |     await createTask(page, 'Remember me');
  152 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  153 |   }
  154 |   if (stage >= 4) {
  155 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  156 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  157 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  158 |   }
  159 |   if (stage >= 3) {
  160 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  161 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  162 |   }
  163 | });
  164 | 
  165 | if (stage >= 4) {
  166 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  167 |     await createProject(page, 'Identity first');
  168 |     await createProject(page, 'Identity second');
  169 |     await openProject(page, 'Identity first');
  170 |     const originalPath = new URL(page.url()).pathname;
  171 |     await createTask(page, 'Identity task');
  172 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  173 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  174 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  175 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  176 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  177 |     await page.reload();
  178 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  179 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  180 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  181 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  182 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  183 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  184 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  185 |     await openProject(page, 'Identity updated');
  186 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  187 |   });
  188 | 
  189 |   test('014 blank rename preserves original name', async ({ page }) => {
  190 |     await createProject(page, 'Rename invalid');
  191 |     await openProject(page, 'Rename invalid');
  192 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
```