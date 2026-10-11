# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 008 archive state persists and project can be restored
- Location: experiments/instruction-effects/revisions/research-v014/decisions/frozen-prefix-drafts/task-003/suite/workboard.spec.mjs:102:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').filter({ hasText: 'negative-form-ignored-restore Archive lifecycle' }).visible().getByRole('button', { name: 'Restore project', exact: true })
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').filter({ hasText: 'negative-form-ignored-restore Archive lifecycle' }).visible().getByRole('button', { name: 'Restore project', exact: true }) with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'negative-form-ignored-restore Archive lifecycle' }).visible().getByRole('button', { name: 'Restore project', exact: true })
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - heading "Workboard" [level=1] [ref=f5e2]
  - generic [ref=f5e3]:
    - generic [ref=f5e4]:
      - text: Project name
      - textbox "Project name" [ref=f5e5]
    - button "Create project" [ref=f5e6]
  - generic [ref=f5e8]:
    - text: Project filter
    - combobox "Project filter" [ref=f5e9]:
      - option "Active"
      - option "Archived" [selected]
  - generic [ref=f5e10]:
    - text: negative-form-ignored-restore Archive lifecycle0/0 completed
    - button "Open project" [ref=f5e12]
    - button "Restore project" [ref=f5e14]
```

# Test source

```ts
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
  84  |     await expectPersistedCompletion(page, 'Task filters', 'Done task', true);
  85  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  86  |     await expect(taskRow(page, 'Open task')).toBeVisible();
  87  |     await expect(taskRow(page, 'Done task')).toHaveCount(0);
  88  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  89  |     await expect(taskRow(page, 'Done task')).toBeVisible();
  90  |     await expect(taskRow(page, 'Open task')).toHaveCount(0);
  91  |     await page.reload();
  92  |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'All' });
  93  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).toBeChecked();
  94  |     await page.getByRole('checkbox', { name: 'Complete Done task', exact: true }).uncheck();
  95  |     await expectPersistedCompletion(page, 'Task filters', 'Done task', false);
  96  |     await page.reload();
  97  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
  98  |   });
  99  | }
  100 | 
  101 | if (stage >= 3) {
  102 |   test('008 archive state persists and project can be restored', async ({ page }) => {
  103 |     await createProject(page, 'Archive lifecycle');
  104 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Archive project', exact: true }).click();
  105 |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
  106 |     await page.reload();
  107 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  108 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  109 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
> 110 |     await expect(projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
      |                                                                                                                       ^ Error: expect(locator).toHaveCount(expected) failed
  111 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  112 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  113 |   });
  114 | 
  115 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  116 |     await createProject(page, 'Archive tasks');
  117 |     await openProject(page, 'Archive tasks');
  118 |     await createTask(page, 'Retained task');
  119 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  120 |     await expectPersistedCompletion(page, 'Archive tasks', 'Retained task', true);
  121 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  122 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  123 |     await expect(projectRow(page, 'Archive tasks')).toHaveCount(0);
  124 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  125 |     await openProject(page, 'Archive tasks');
  126 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  127 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  128 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  129 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  130 |     await expect(taskRow(page, 'Retained task')).toHaveCount(0);
  131 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  132 |     await expect(taskRow(page, 'Retained task')).toBeVisible();
  133 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  134 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  135 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  136 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  137 |     await expect(projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  138 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  139 |     await openProject(page, 'Archive tasks');
  140 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  141 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  142 |   });
  143 | 
  144 |   test('010 completion summaries reflect all tasks', async ({ page }) => {
  145 |     await createProject(page, 'Summary project');
  146 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
  147 |     await openProject(page, 'Summary project');
  148 |     await createTask(page, 'Summary one');
  149 |     await createTask(page, 'Summary two');
  150 |     await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
  151 |     await expectPersistedCompletion(page, 'Summary project', 'Summary one', true);
  152 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  153 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  154 |   });
  155 | }
  156 | 
  157 | test('011 seed process-restart persistence checks', async ({ page }) => {
  158 |   await createProject(page, 'Persistence sentinel');
  159 |   if (stage >= 2) {
  160 |     await openProject(page, 'Persistence sentinel');
  161 |     await createTask(page, 'Remember me');
  162 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  163 |     await expectPersistedCompletion(page, 'Persistence sentinel', 'Remember me', true);
  164 |   }
  165 |   if (stage >= 4) {
  166 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  167 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  168 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  169 |   }
  170 |   if (stage >= 3) {
  171 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  172 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  173 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  174 |   }
  175 | });
  176 | 
  177 | if (stage >= 4) {
  178 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  179 |     await createProject(page, 'Identity first');
  180 |     await createProject(page, 'Identity second');
  181 |     await openProject(page, 'Identity first');
  182 |     const originalPath = new URL(page.url()).pathname;
  183 |     await createTask(page, 'Identity task');
  184 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  185 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  186 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  187 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  188 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  189 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  190 |     await page.reload();
  191 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  192 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  193 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  194 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  195 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  196 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  197 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  198 |     await openProject(page, 'Identity updated');
  199 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  200 |   });
  201 | 
  202 |   test('014 blank rename preserves original name', async ({ page }) => {
  203 |     await createProject(page, 'Rename invalid');
  204 |     await openProject(page, 'Rename invalid');
  205 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  206 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  207 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  208 |     await page.reload();
  209 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  210 |   });
```