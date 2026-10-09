# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 007 task filters and completion state persist
- Location: runs/instruction-effects/pilot-013/definitions/project/acceptance/workboard.spec.mjs:73:3

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
    14 × locator resolved to <input checked type="checkbox" name="completed" aria-label="Complete Done task" onchange="this.form.requestSubmit()"/>
       - unexpected value "checked"

```

```yaml
- checkbox "Complete Done task" [checked]
```

# Test source

```ts
  1   | import { assertDisclosedControls } from './helpers.mjs';
  2   | import { requiredAlert } from './helpers.mjs';
  3   | import { test, expect } from '@playwright/test';
  4   | import { stage, projectName, projectRow, taskRow, createProject, openProject, createTask, isolateBrowser } from './helpers.mjs';
  5   | 
  6   | test.beforeEach(async ({ context }) => { await isolateBrowser(context); });
  7   | 
  8   | test('001 health and project creation persist on reload', async ({ page, request }) => {
  9   |   const health = await request.get('/health');
  10  |   expect(health.status()).toBe(200);
  11  |   expect(await health.json()).toEqual({ status: 'ok' });
  12  |   await page.goto('/');
  13  |   await expect(page.getByRole('heading', { name: 'Workboard', exact: true })).toBeVisible();
  14  |   await createProject(page, '  Alpha create  ');
  15  |   await assertDisclosedControls(page, stage);
  16  |   await page.reload();
  17  |   await expect(projectRow(page, 'Alpha create')).toBeVisible();
  18  |   await openProject(page, 'Alpha create');
  19  |   await assertDisclosedControls(page, stage);
  20  |   expect(new URL(page.url()).pathname).toMatch(/^\/projects\/[^/]+$/);
  21  |   await page.getByRole('button', { name: 'Projects', exact: true }).click();
  22  |   await expect(projectRow(page, 'Alpha create')).toBeVisible();
  23  | });
  24  | 
  25  | test('002 blank project input is rejected', async ({ page }) => {
  26  |   await createProject(page, 'Blank validation sentinel');
  27  |   await page.reload();
  28  |   await expect(projectRow(page, 'Blank validation sentinel')).toBeVisible();
  29  |   const rows = await page.getByTestId('project-row').filter({ visible: true }).count();
  30  |   await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('   ');
  31  |   await page.getByRole('button', { name: 'Create project', exact: true }).click();
  32  |   await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  33  |   await page.reload();
  34  |   await expect(projectRow(page, 'Blank validation sentinel')).toBeVisible();
  35  |   await expect(page.getByTestId('project-row').filter({ visible: true })).toHaveCount(rows);
  36  | });
  37  | 
  38  | test('003 project creation order', async ({ page }) => {
  39  |   await createProject(page, 'Order first');
  40  |   await createProject(page, 'Order second');
  41  |   const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  42  |   expect(rows.findIndex(t => t.includes(projectName('Order first')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Order second'))));
  43  | });
  44  | 
  45  | if (stage >= 2) {
  46  |   test('004 trimmed tasks and project URL survive reload', async ({ page }) => {
  47  |     await createProject(page, 'Task reload');
  48  |     await openProject(page, 'Task reload');
  49  |     await createTask(page, '  Task preserved  ');
  50  |     await page.reload();
  51  |     await expect(page.getByRole('heading', { name: projectName('Task reload'), exact: true }).first()).toBeVisible();
  52  |     await expect(taskRow(page, 'Task preserved')).toBeVisible();
  53  |   });
  54  | 
  55  |   test('005 blank task input is rejected', async ({ page }) => {
  56  |     await createProject(page, 'Task invalid');
  57  |     await openProject(page, 'Task invalid');
  58  |     await page.getByRole('textbox', { name: 'Task title', exact: true }).fill('   ');
  59  |     await page.getByRole('button', { name: 'Create task', exact: true }).click();
  60  |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
  61  |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  62  |   });
  63  | 
  64  |   test('006 tasks do not cross project boundaries', async ({ page }) => {
  65  |     await createProject(page, 'Task owner');
  66  |     await openProject(page, 'Task owner');
  67  |     await createTask(page, 'Private to owner');
  68  |     await createProject(page, 'Other project');
  69  |     await openProject(page, 'Other project');
  70  |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(0);
  71  |   });
  72  | 
  73  |   test('007 task filters and completion state persist', async ({ page }) => {
  74  |     await createProject(page, 'Task filters');
  75  |     await openProject(page, 'Task filters');
  76  |     await expect(page.getByRole('combobox', { name: 'Task filter', exact: true }).locator('option:checked')).toHaveText('All');
  77  |     await createTask(page, 'Done task');
  78  |     await createTask(page, 'Open task');
  79  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  80  |     await expect(page.getByRole('checkbox', { name: 'Complete Open task', exact: true })).not.toBeChecked();
  81  |     const orderedTasks = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  82  |     expect(orderedTasks.findIndex(t => t.includes('Done task'))).toBeLessThan(orderedTasks.findIndex(t => t.includes('Open task')));
  83  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).check();
  84  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  85  |     await expect(taskRow(page, 'Open task')).toBeVisible();
  86  |     await expect(taskRow(page, 'Done task')).toHaveCount(0);
  87  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  88  |     await expect(taskRow(page, 'Done task')).toBeVisible();
  89  |     await expect(taskRow(page, 'Open task')).toHaveCount(0);
  90  |     await page.reload();
  91  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
  92  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
  93  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
  94  |     await page.reload();
> 95  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
      |                                                                                               ^ Error: expect(locator).not.toBeChecked() failed
  96  |   });
  97  | }
  98  | 
  99  | if (stage >= 3) {
  100 |   test('008 archive state persists and project can be restored', async ({ page }) => {
  101 |     await createProject(page, 'Archive lifecycle');
  102 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
  103 |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
  104 |     await page.reload();
  105 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  106 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  107 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
  108 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  109 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  110 |   });
  111 | 
  112 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  113 |     await createProject(page, 'Archive tasks');
  114 |     await openProject(page, 'Archive tasks');
  115 |     await createTask(page, 'Retained task');
  116 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  117 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  118 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  119 |     await expect(projectRow(page, 'Archive tasks')).toHaveCount(0);
  120 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  121 |     await openProject(page, 'Archive tasks');
  122 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  123 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  124 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  125 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  126 |     await expect(taskRow(page, 'Retained task')).toHaveCount(0);
  127 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  128 |     await expect(taskRow(page, 'Retained task')).toBeVisible();
  129 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  130 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  131 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  132 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  133 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  134 |     await openProject(page, 'Archive tasks');
  135 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  136 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  137 |   });
  138 | 
  139 |   test('010 completion summaries reflect all tasks', async ({ page }) => {
  140 |     await createProject(page, 'Summary project');
  141 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
  142 |     await openProject(page, 'Summary project');
  143 |     await createTask(page, 'Summary one');
  144 |     await createTask(page, 'Summary two');
  145 |     await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
  146 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  147 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  148 |   });
  149 | }
  150 | 
  151 | test('011 seed process-restart persistence checks', async ({ page }) => {
  152 |   await createProject(page, 'Persistence sentinel');
  153 |   if (stage >= 2) {
  154 |     await openProject(page, 'Persistence sentinel');
  155 |     await createTask(page, 'Remember me');
  156 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  157 |   }
  158 |   if (stage >= 4) {
  159 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  160 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  161 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  162 |   }
  163 |   if (stage >= 3) {
  164 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  165 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  166 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  167 |   }
  168 | });
  169 | 
  170 | if (stage >= 4) {
  171 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  172 |     await createProject(page, 'Identity first');
  173 |     await createProject(page, 'Identity second');
  174 |     await openProject(page, 'Identity first');
  175 |     const originalPath = new URL(page.url()).pathname;
  176 |     await createTask(page, 'Identity task');
  177 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  178 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  179 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  180 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  181 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  182 |     await page.reload();
  183 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  184 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  185 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  186 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  187 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  188 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  189 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  190 |     await openProject(page, 'Identity updated');
  191 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  192 |   });
  193 | 
  194 |   test('014 blank rename preserves original name', async ({ page }) => {
  195 |     await createProject(page, 'Rename invalid');
```