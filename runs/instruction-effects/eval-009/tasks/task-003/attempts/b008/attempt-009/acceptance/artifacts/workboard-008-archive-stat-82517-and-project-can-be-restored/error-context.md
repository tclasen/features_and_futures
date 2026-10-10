# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 008 archive state persists and project can be restored
- Location: runs/instruction-effects/eval-009/definitions/project/acceptance/workboard.spec.mjs:102:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() resolved to 2 elements:
    1) <article class="project-row" data-testid="project-row">…</article> aka getByText('task-003 Archive lifecycle0/0').first()
    2) <article class="project-row" data-testid="project-row">…</article> aka getByText('task-003 Archive lifecycle0/0').nth(1)

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading "Workboard" [level=1] [ref=f1e3]
  - generic [ref=f1e4]:
    - generic [ref=f1e5]: Project name
    - textbox "Project name" [ref=f1e6]
    - button "Create project" [ref=f1e7] [cursor=pointer]
  - text: Project filter
  - combobox "Project filter" [ref=f1e8]:
    - option "Active" [selected]
    - option "Archived"
  - generic [ref=f1e9]:
    - article [ref=f1e10]:
      - generic [ref=f1e11]: task-001 Alpha create
      - generic [ref=f1e12]: 0/0 completed
      - button "Open project" [ref=f1e13] [cursor=pointer]
      - button "Archive project" [ref=f1e14] [cursor=pointer]
    - article [ref=f1e15]:
      - generic [ref=f1e16]: task-001 Blank validation sentinel
      - generic [ref=f1e17]: 0/0 completed
      - button "Open project" [ref=f1e18] [cursor=pointer]
      - button "Archive project" [ref=f1e19] [cursor=pointer]
    - article [ref=f1e20]:
      - generic [ref=f1e21]: task-001 Order first
      - generic [ref=f1e22]: 0/0 completed
      - button "Open project" [ref=f1e23] [cursor=pointer]
      - button "Archive project" [ref=f1e24] [cursor=pointer]
    - article [ref=f1e25]:
      - generic [ref=f1e26]: task-001 Order second
      - generic [ref=f1e27]: 0/0 completed
      - button "Open project" [ref=f1e28] [cursor=pointer]
      - button "Archive project" [ref=f1e29] [cursor=pointer]
    - article [ref=f1e30]:
      - generic [ref=f1e31]: task-001 Persistence sentinel
      - generic [ref=f1e32]: 0/0 completed
      - button "Open project" [ref=f1e33] [cursor=pointer]
      - button "Archive project" [ref=f1e34] [cursor=pointer]
    - article [ref=f1e35]:
      - generic [ref=f1e36]: task-002 Alpha create
      - generic [ref=f1e37]: 0/0 completed
      - button "Open project" [ref=f1e38] [cursor=pointer]
      - button "Archive project" [ref=f1e39] [cursor=pointer]
    - article [ref=f1e40]:
      - generic [ref=f1e41]: task-002 Blank validation sentinel
      - generic [ref=f1e42]: 0/0 completed
      - button "Open project" [ref=f1e43] [cursor=pointer]
      - button "Archive project" [ref=f1e44] [cursor=pointer]
    - article [ref=f1e45]:
      - generic [ref=f1e46]: task-002 Order first
      - generic [ref=f1e47]: 0/0 completed
      - button "Open project" [ref=f1e48] [cursor=pointer]
      - button "Archive project" [ref=f1e49] [cursor=pointer]
    - article [ref=f1e50]:
      - generic [ref=f1e51]: task-002 Order second
      - generic [ref=f1e52]: 0/0 completed
      - button "Open project" [ref=f1e53] [cursor=pointer]
      - button "Archive project" [ref=f1e54] [cursor=pointer]
    - article [ref=f1e55]:
      - generic [ref=f1e56]: task-002 Task reload
      - generic [ref=f1e57]: 0/1 completed
      - button "Open project" [ref=f1e58] [cursor=pointer]
      - button "Archive project" [ref=f1e59] [cursor=pointer]
    - article [ref=f1e60]:
      - generic [ref=f1e61]: task-002 Task invalid
      - generic [ref=f1e62]: 0/0 completed
      - button "Open project" [ref=f1e63] [cursor=pointer]
      - button "Archive project" [ref=f1e64] [cursor=pointer]
    - article [ref=f1e65]:
      - generic [ref=f1e66]: task-002 Task owner
      - generic [ref=f1e67]: 0/1 completed
      - button "Open project" [ref=f1e68] [cursor=pointer]
      - button "Archive project" [ref=f1e69] [cursor=pointer]
    - article [ref=f1e70]:
      - generic [ref=f1e71]: task-002 Other project
      - generic [ref=f1e72]: 0/0 completed
      - button "Open project" [ref=f1e73] [cursor=pointer]
      - button "Archive project" [ref=f1e74] [cursor=pointer]
    - article [ref=f1e75]:
      - generic [ref=f1e76]: task-002 Task filters
      - generic [ref=f1e77]: 0/2 completed
      - button "Open project" [ref=f1e78] [cursor=pointer]
      - button "Archive project" [ref=f1e79] [cursor=pointer]
    - article [ref=f1e80]:
      - generic [ref=f1e81]: task-002 Persistence sentinel
      - generic [ref=f1e82]: 1/1 completed
      - button "Open project" [ref=f1e83] [cursor=pointer]
      - button "Archive project" [ref=f1e84] [cursor=pointer]
    - article [ref=f1e85]:
      - generic [ref=f1e86]: task-003 Alpha create
      - generic [ref=f1e87]: 0/0 completed
      - button "Open project" [ref=f1e88] [cursor=pointer]
      - button "Archive project" [ref=f1e89] [cursor=pointer]
    - article [ref=f1e90]:
      - generic [ref=f1e91]: task-003 Blank validation sentinel
      - generic [ref=f1e92]: 0/0 completed
      - button "Open project" [ref=f1e93] [cursor=pointer]
      - button "Archive project" [ref=f1e94] [cursor=pointer]
    - article [ref=f1e95]:
      - generic [ref=f1e96]: task-003 Order first
      - generic [ref=f1e97]: 0/0 completed
      - button "Open project" [ref=f1e98] [cursor=pointer]
      - button "Archive project" [ref=f1e99] [cursor=pointer]
    - article [ref=f1e100]:
      - generic [ref=f1e101]: task-003 Order second
      - generic [ref=f1e102]: 0/0 completed
      - button "Open project" [ref=f1e103] [cursor=pointer]
      - button "Archive project" [ref=f1e104] [cursor=pointer]
    - article [ref=f1e105]:
      - generic [ref=f1e106]: task-003 Task reload
      - generic [ref=f1e107]: 0/1 completed
      - button "Open project" [ref=f1e108] [cursor=pointer]
      - button "Archive project" [ref=f1e109] [cursor=pointer]
    - article [ref=f1e110]:
      - generic [ref=f1e111]: task-003 Task invalid
      - generic [ref=f1e112]: 0/0 completed
      - button "Open project" [ref=f1e113] [cursor=pointer]
      - button "Archive project" [ref=f1e114] [cursor=pointer]
    - article [ref=f1e115]:
      - generic [ref=f1e116]: task-003 Task owner
      - generic [ref=f1e117]: 0/1 completed
      - button "Open project" [ref=f1e118] [cursor=pointer]
      - button "Archive project" [ref=f1e119] [cursor=pointer]
    - article [ref=f1e120]:
      - generic [ref=f1e121]: task-003 Other project
      - generic [ref=f1e122]: 0/0 completed
      - button "Open project" [ref=f1e123] [cursor=pointer]
      - button "Archive project" [ref=f1e124] [cursor=pointer]
    - article [ref=f1e125]:
      - generic [ref=f1e126]: task-003 Task filters
      - generic [ref=f1e127]: 0/2 completed
      - button "Open project" [ref=f1e128] [cursor=pointer]
      - button "Archive project" [ref=f1e129] [cursor=pointer]
    - article [ref=f1e130]:
      - generic [ref=f1e131]: task-003 Archive lifecycle
      - generic [ref=f1e132]: 0/0 completed
      - button "Open project" [ref=f1e133] [cursor=pointer]
      - button "Archive project" [ref=f1e134] [cursor=pointer]
    - article [ref=f1e135]:
      - generic [ref=f1e136]: task-001 Alpha create
      - generic [ref=f1e137]: 0/0 completed
      - button "Open project" [ref=f1e138] [cursor=pointer]
      - button "Archive project" [ref=f1e139] [cursor=pointer]
    - article [ref=f1e140]:
      - generic [ref=f1e141]: task-001 Blank validation sentinel
      - generic [ref=f1e142]: 0/0 completed
      - button "Open project" [ref=f1e143] [cursor=pointer]
      - button "Archive project" [ref=f1e144] [cursor=pointer]
    - article [ref=f1e145]:
      - generic [ref=f1e146]: task-001 Order first
      - generic [ref=f1e147]: 0/0 completed
      - button "Open project" [ref=f1e148] [cursor=pointer]
      - button "Archive project" [ref=f1e149] [cursor=pointer]
    - article [ref=f1e150]:
      - generic [ref=f1e151]: task-001 Order second
      - generic [ref=f1e152]: 0/0 completed
      - button "Open project" [ref=f1e153] [cursor=pointer]
      - button "Archive project" [ref=f1e154] [cursor=pointer]
    - article [ref=f1e155]:
      - generic [ref=f1e156]: task-001 Persistence sentinel
      - generic [ref=f1e157]: 0/0 completed
      - button "Open project" [ref=f1e158] [cursor=pointer]
      - button "Archive project" [ref=f1e159] [cursor=pointer]
    - article [ref=f1e160]:
      - generic [ref=f1e161]: task-002 Alpha create
      - generic [ref=f1e162]: 0/0 completed
      - button "Open project" [ref=f1e163] [cursor=pointer]
      - button "Archive project" [ref=f1e164] [cursor=pointer]
    - article [ref=f1e165]:
      - generic [ref=f1e166]: task-002 Blank validation sentinel
      - generic [ref=f1e167]: 0/0 completed
      - button "Open project" [ref=f1e168] [cursor=pointer]
      - button "Archive project" [ref=f1e169] [cursor=pointer]
    - article [ref=f1e170]:
      - generic [ref=f1e171]: task-002 Order first
      - generic [ref=f1e172]: 0/0 completed
      - button "Open project" [ref=f1e173] [cursor=pointer]
      - button "Archive project" [ref=f1e174] [cursor=pointer]
    - article [ref=f1e175]:
      - generic [ref=f1e176]: task-002 Order second
      - generic [ref=f1e177]: 0/0 completed
      - button "Open project" [ref=f1e178] [cursor=pointer]
      - button "Archive project" [ref=f1e179] [cursor=pointer]
    - article [ref=f1e180]:
      - generic [ref=f1e181]: task-002 Task reload
      - generic [ref=f1e182]: 0/1 completed
      - button "Open project" [ref=f1e183] [cursor=pointer]
      - button "Archive project" [ref=f1e184] [cursor=pointer]
    - article [ref=f1e185]:
      - generic [ref=f1e186]: task-002 Task invalid
      - generic [ref=f1e187]: 0/0 completed
      - button "Open project" [ref=f1e188] [cursor=pointer]
      - button "Archive project" [ref=f1e189] [cursor=pointer]
    - article [ref=f1e190]:
      - generic [ref=f1e191]: task-002 Task owner
      - generic [ref=f1e192]: 0/1 completed
      - button "Open project" [ref=f1e193] [cursor=pointer]
      - button "Archive project" [ref=f1e194] [cursor=pointer]
    - article [ref=f1e195]:
      - generic [ref=f1e196]: task-002 Other project
      - generic [ref=f1e197]: 0/0 completed
      - button "Open project" [ref=f1e198] [cursor=pointer]
      - button "Archive project" [ref=f1e199] [cursor=pointer]
    - article [ref=f1e200]:
      - generic [ref=f1e201]: task-002 Task filters
      - generic [ref=f1e202]: 0/2 completed
      - button "Open project" [ref=f1e203] [cursor=pointer]
      - button "Archive project" [ref=f1e204] [cursor=pointer]
    - article [ref=f1e205]:
      - generic [ref=f1e206]: task-002 Persistence sentinel
      - generic [ref=f1e207]: 1/1 completed
      - button "Open project" [ref=f1e208] [cursor=pointer]
      - button "Archive project" [ref=f1e209] [cursor=pointer]
    - article [ref=f1e210]:
      - generic [ref=f1e211]: task-003 Alpha create
      - generic [ref=f1e212]: 0/0 completed
      - button "Open project" [ref=f1e213] [cursor=pointer]
      - button "Archive project" [ref=f1e214] [cursor=pointer]
    - article [ref=f1e215]:
      - generic [ref=f1e216]: task-003 Blank validation sentinel
      - generic [ref=f1e217]: 0/0 completed
      - button "Open project" [ref=f1e218] [cursor=pointer]
      - button "Archive project" [ref=f1e219] [cursor=pointer]
    - article [ref=f1e220]:
      - generic [ref=f1e221]: task-003 Order first
      - generic [ref=f1e222]: 0/0 completed
      - button "Open project" [ref=f1e223] [cursor=pointer]
      - button "Archive project" [ref=f1e224] [cursor=pointer]
    - article [ref=f1e225]:
      - generic [ref=f1e226]: task-003 Order second
      - generic [ref=f1e227]: 0/0 completed
      - button "Open project" [ref=f1e228] [cursor=pointer]
      - button "Archive project" [ref=f1e229] [cursor=pointer]
    - article [ref=f1e230]:
      - generic [ref=f1e231]: task-003 Task reload
      - generic [ref=f1e232]: 0/1 completed
      - button "Open project" [ref=f1e233] [cursor=pointer]
      - button "Archive project" [ref=f1e234] [cursor=pointer]
    - article [ref=f1e235]:
      - generic [ref=f1e236]: task-003 Task invalid
      - generic [ref=f1e237]: 0/0 completed
      - button "Open project" [ref=f1e238] [cursor=pointer]
      - button "Archive project" [ref=f1e239] [cursor=pointer]
    - article [ref=f1e240]:
      - generic [ref=f1e241]: task-003 Task owner
      - generic [ref=f1e242]: 0/1 completed
      - button "Open project" [ref=f1e243] [cursor=pointer]
      - button "Archive project" [ref=f1e244] [cursor=pointer]
    - article [ref=f1e245]:
      - generic [ref=f1e246]: task-003 Other project
      - generic [ref=f1e247]: 0/0 completed
      - button "Open project" [ref=f1e248] [cursor=pointer]
      - button "Archive project" [ref=f1e249] [cursor=pointer]
    - article [ref=f1e250]:
      - generic [ref=f1e251]: task-003 Task filters
      - generic [ref=f1e252]: 0/2 completed
      - button "Open project" [ref=f1e253] [cursor=pointer]
      - button "Archive project" [ref=f1e254] [cursor=pointer]
    - article [ref=f1e255]:
      - generic [ref=f1e256]: task-003 Archive lifecycle
      - generic [ref=f1e257]: 0/0 completed
      - button "Open project" [ref=f1e258] [cursor=pointer]
      - button "Archive project" [ref=f1e259] [cursor=pointer]
```

# Test source

```ts
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
  110 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
> 111 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
      |                                                         ^ Error: expect(locator).toBeVisible() failed
  112 |   });
  113 | 
  114 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  115 |     await createProject(page, 'Archive tasks');
  116 |     await openProject(page, 'Archive tasks');
  117 |     await createTask(page, 'Retained task');
  118 |     await page.getByRole('checkbox', { name: 'Complete Retained task', exact: true }).check();
  119 |     await expectPersistedCompletion(page, 'Archive tasks', 'Retained task', true);
  120 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  121 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Archive project', exact: true }).click();
  122 |     await expect(projectRow(page, 'Archive tasks')).toHaveCount(0);
  123 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  124 |     await openProject(page, 'Archive tasks');
  125 |     await expect(page.getByText('Archived project', { exact: true })).toBeVisible();
  126 |     await expect(page.getByRole('button', { name: 'Create task', exact: true })).toBeDisabled();
  127 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  128 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  129 |     await expect(taskRow(page, 'Retained task')).toHaveCount(0);
  130 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  131 |     await expect(taskRow(page, 'Retained task')).toBeVisible();
  132 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeDisabled();
  133 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  134 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  135 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
  136 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  137 |     await openProject(page, 'Archive tasks');
  138 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeChecked();
  139 |     await expect(page.getByRole('checkbox', { name: 'Complete Retained task', exact: true })).toBeEnabled();
  140 |   });
  141 | 
  142 |   test('010 completion summaries reflect all tasks', async ({ page }) => {
  143 |     await createProject(page, 'Summary project');
  144 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('0/0 completed');
  145 |     await openProject(page, 'Summary project');
  146 |     await createTask(page, 'Summary one');
  147 |     await createTask(page, 'Summary two');
  148 |     await page.getByRole('checkbox', { name: 'Complete Summary one', exact: true }).check();
  149 |     await expectPersistedCompletion(page, 'Summary project', 'Summary one', true);
  150 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  151 |     await expect(projectRow(page, 'Summary project').getByTestId('project-summary')).toHaveText('1/2 completed');
  152 |   });
  153 | }
  154 | 
  155 | test('011 seed process-restart persistence checks', async ({ page }) => {
  156 |   await createProject(page, 'Persistence sentinel');
  157 |   if (stage >= 2) {
  158 |     await openProject(page, 'Persistence sentinel');
  159 |     await createTask(page, 'Remember me');
  160 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  161 |     await expectPersistedCompletion(page, 'Persistence sentinel', 'Remember me', true);
  162 |   }
  163 |   if (stage >= 4) {
  164 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  165 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  166 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  167 |   }
  168 |   if (stage >= 3) {
  169 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  170 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  171 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  172 |   }
  173 | });
  174 | 
  175 | if (stage >= 4) {
  176 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  177 |     await createProject(page, 'Identity first');
  178 |     await createProject(page, 'Identity second');
  179 |     await openProject(page, 'Identity first');
  180 |     const originalPath = new URL(page.url()).pathname;
  181 |     await createTask(page, 'Identity task');
  182 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  183 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  184 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  185 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  186 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  187 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  188 |     await page.reload();
  189 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  190 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  191 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  192 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  193 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  194 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  195 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  196 |     await openProject(page, 'Identity updated');
  197 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  198 |   });
  199 | 
  200 |   test('014 blank rename preserves original name', async ({ page }) => {
  201 |     await createProject(page, 'Rename invalid');
  202 |     await openProject(page, 'Rename invalid');
  203 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  204 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  205 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  206 |     await page.reload();
  207 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  208 |   });
  209 | 
  210 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  211 |     await createProject(page, 'Rename archive');
```