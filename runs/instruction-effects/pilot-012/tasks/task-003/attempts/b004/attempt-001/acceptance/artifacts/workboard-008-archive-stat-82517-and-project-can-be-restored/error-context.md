# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 008 archive state persists and project can be restored
- Location: runs/instruction-effects/pilot-012/definitions/project/acceptance/workboard.spec.mjs:97:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() resolved to 2 elements:
    1) <div class="project-row" data-testid="project-row">…</div> aka getByText('task-003 Archive lifecycle0/0').first()
    2) <div class="project-row" data-testid="project-row">…</div> aka getByText('task-003 Archive lifecycle0/0').nth(1)

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading "Workboard" [level=1] [ref=f1e3]
  - text: Project filter
  - combobox "Project filter" [ref=f1e4]:
    - option "Active" [selected]
    - option "Archived"
  - generic [ref=f1e5]:
    - generic [ref=f1e6]: Project name
    - textbox "Project name" [ref=f1e7]
    - button "Create project" [ref=f1e8] [cursor=pointer]
  - region "Projects" [ref=f1e9]:
    - generic [ref=f1e10]:
      - generic [ref=f1e11]: task-001 Alpha create
      - generic [ref=f1e12]: 0/0 completed
      - button "Open project" [ref=f1e13] [cursor=pointer]
      - button "Archive project" [ref=f1e14] [cursor=pointer]
    - generic [ref=f1e15]:
      - generic [ref=f1e16]: task-001 Blank validation sentinel
      - generic [ref=f1e17]: 0/0 completed
      - button "Open project" [ref=f1e18] [cursor=pointer]
      - button "Archive project" [ref=f1e19] [cursor=pointer]
    - generic [ref=f1e20]:
      - generic [ref=f1e21]: task-001 Order first
      - generic [ref=f1e22]: 0/0 completed
      - button "Open project" [ref=f1e23] [cursor=pointer]
      - button "Archive project" [ref=f1e24] [cursor=pointer]
    - generic [ref=f1e25]:
      - generic [ref=f1e26]: task-001 Order second
      - generic [ref=f1e27]: 0/0 completed
      - button "Open project" [ref=f1e28] [cursor=pointer]
      - button "Archive project" [ref=f1e29] [cursor=pointer]
    - generic [ref=f1e30]:
      - generic [ref=f1e31]: task-001 Persistence sentinel
      - generic [ref=f1e32]: 0/0 completed
      - button "Open project" [ref=f1e33] [cursor=pointer]
      - button "Archive project" [ref=f1e34] [cursor=pointer]
    - generic [ref=f1e35]:
      - generic [ref=f1e36]: task-002 Alpha create
      - generic [ref=f1e37]: 0/0 completed
      - button "Open project" [ref=f1e38] [cursor=pointer]
      - button "Archive project" [ref=f1e39] [cursor=pointer]
    - generic [ref=f1e40]:
      - generic [ref=f1e41]: task-002 Blank validation sentinel
      - generic [ref=f1e42]: 0/0 completed
      - button "Open project" [ref=f1e43] [cursor=pointer]
      - button "Archive project" [ref=f1e44] [cursor=pointer]
    - generic [ref=f1e45]:
      - generic [ref=f1e46]: task-002 Order first
      - generic [ref=f1e47]: 0/0 completed
      - button "Open project" [ref=f1e48] [cursor=pointer]
      - button "Archive project" [ref=f1e49] [cursor=pointer]
    - generic [ref=f1e50]:
      - generic [ref=f1e51]: task-002 Order second
      - generic [ref=f1e52]: 0/0 completed
      - button "Open project" [ref=f1e53] [cursor=pointer]
      - button "Archive project" [ref=f1e54] [cursor=pointer]
    - generic [ref=f1e55]:
      - generic [ref=f1e56]: task-002 Task reload
      - generic [ref=f1e57]: 0/1 completed
      - button "Open project" [ref=f1e58] [cursor=pointer]
      - button "Archive project" [ref=f1e59] [cursor=pointer]
    - generic [ref=f1e60]:
      - generic [ref=f1e61]: task-002 Task invalid
      - generic [ref=f1e62]: 0/0 completed
      - button "Open project" [ref=f1e63] [cursor=pointer]
      - button "Archive project" [ref=f1e64] [cursor=pointer]
    - generic [ref=f1e65]:
      - generic [ref=f1e66]: task-002 Task owner
      - generic [ref=f1e67]: 0/1 completed
      - button "Open project" [ref=f1e68] [cursor=pointer]
      - button "Archive project" [ref=f1e69] [cursor=pointer]
    - generic [ref=f1e70]:
      - generic [ref=f1e71]: task-002 Other project
      - generic [ref=f1e72]: 0/0 completed
      - button "Open project" [ref=f1e73] [cursor=pointer]
      - button "Archive project" [ref=f1e74] [cursor=pointer]
    - generic [ref=f1e75]:
      - generic [ref=f1e76]: task-002 Task filters
      - generic [ref=f1e77]: 0/2 completed
      - button "Open project" [ref=f1e78] [cursor=pointer]
      - button "Archive project" [ref=f1e79] [cursor=pointer]
    - generic [ref=f1e80]:
      - generic [ref=f1e81]: task-002 Persistence sentinel
      - generic [ref=f1e82]: 1/1 completed
      - button "Open project" [ref=f1e83] [cursor=pointer]
      - button "Archive project" [ref=f1e84] [cursor=pointer]
    - generic [ref=f1e85]:
      - generic [ref=f1e86]: task-003 Alpha create
      - generic [ref=f1e87]: 0/0 completed
      - button "Open project" [ref=f1e88] [cursor=pointer]
      - button "Archive project" [ref=f1e89] [cursor=pointer]
    - generic [ref=f1e90]:
      - generic [ref=f1e91]: task-003 Blank validation sentinel
      - generic [ref=f1e92]: 0/0 completed
      - button "Open project" [ref=f1e93] [cursor=pointer]
      - button "Archive project" [ref=f1e94] [cursor=pointer]
    - generic [ref=f1e95]:
      - generic [ref=f1e96]: task-003 Order first
      - generic [ref=f1e97]: 0/0 completed
      - button "Open project" [ref=f1e98] [cursor=pointer]
      - button "Archive project" [ref=f1e99] [cursor=pointer]
    - generic [ref=f1e100]:
      - generic [ref=f1e101]: task-003 Order second
      - generic [ref=f1e102]: 0/0 completed
      - button "Open project" [ref=f1e103] [cursor=pointer]
      - button "Archive project" [ref=f1e104] [cursor=pointer]
    - generic [ref=f1e105]:
      - generic [ref=f1e106]: task-003 Task reload
      - generic [ref=f1e107]: 0/1 completed
      - button "Open project" [ref=f1e108] [cursor=pointer]
      - button "Archive project" [ref=f1e109] [cursor=pointer]
    - generic [ref=f1e110]:
      - generic [ref=f1e111]: task-003 Task invalid
      - generic [ref=f1e112]: 0/0 completed
      - button "Open project" [ref=f1e113] [cursor=pointer]
      - button "Archive project" [ref=f1e114] [cursor=pointer]
    - generic [ref=f1e115]:
      - generic [ref=f1e116]: task-003 Task owner
      - generic [ref=f1e117]: 0/1 completed
      - button "Open project" [ref=f1e118] [cursor=pointer]
      - button "Archive project" [ref=f1e119] [cursor=pointer]
    - generic [ref=f1e120]:
      - generic [ref=f1e121]: task-003 Other project
      - generic [ref=f1e122]: 0/0 completed
      - button "Open project" [ref=f1e123] [cursor=pointer]
      - button "Archive project" [ref=f1e124] [cursor=pointer]
    - generic [ref=f1e125]:
      - generic [ref=f1e126]: task-003 Task filters
      - generic [ref=f1e127]: 0/2 completed
      - button "Open project" [ref=f1e128] [cursor=pointer]
      - button "Archive project" [ref=f1e129] [cursor=pointer]
    - generic [ref=f1e130]:
      - generic [ref=f1e131]: task-003 Archive lifecycle
      - generic [ref=f1e132]: 0/0 completed
      - button "Open project" [ref=f1e133] [cursor=pointer]
      - button "Archive project" [ref=f1e134] [cursor=pointer]
  - region "Projects" [ref=f1e135]:
    - generic [ref=f1e136]:
      - generic [ref=f1e137]: task-001 Alpha create
      - generic [ref=f1e138]: 0/0 completed
      - button "Open project" [ref=f1e139] [cursor=pointer]
      - button "Archive project" [ref=f1e140] [cursor=pointer]
    - generic [ref=f1e141]:
      - generic [ref=f1e142]: task-001 Blank validation sentinel
      - generic [ref=f1e143]: 0/0 completed
      - button "Open project" [ref=f1e144] [cursor=pointer]
      - button "Archive project" [ref=f1e145] [cursor=pointer]
    - generic [ref=f1e146]:
      - generic [ref=f1e147]: task-001 Order first
      - generic [ref=f1e148]: 0/0 completed
      - button "Open project" [ref=f1e149] [cursor=pointer]
      - button "Archive project" [ref=f1e150] [cursor=pointer]
    - generic [ref=f1e151]:
      - generic [ref=f1e152]: task-001 Order second
      - generic [ref=f1e153]: 0/0 completed
      - button "Open project" [ref=f1e154] [cursor=pointer]
      - button "Archive project" [ref=f1e155] [cursor=pointer]
    - generic [ref=f1e156]:
      - generic [ref=f1e157]: task-001 Persistence sentinel
      - generic [ref=f1e158]: 0/0 completed
      - button "Open project" [ref=f1e159] [cursor=pointer]
      - button "Archive project" [ref=f1e160] [cursor=pointer]
    - generic [ref=f1e161]:
      - generic [ref=f1e162]: task-002 Alpha create
      - generic [ref=f1e163]: 0/0 completed
      - button "Open project" [ref=f1e164] [cursor=pointer]
      - button "Archive project" [ref=f1e165] [cursor=pointer]
    - generic [ref=f1e166]:
      - generic [ref=f1e167]: task-002 Blank validation sentinel
      - generic [ref=f1e168]: 0/0 completed
      - button "Open project" [ref=f1e169] [cursor=pointer]
      - button "Archive project" [ref=f1e170] [cursor=pointer]
    - generic [ref=f1e171]:
      - generic [ref=f1e172]: task-002 Order first
      - generic [ref=f1e173]: 0/0 completed
      - button "Open project" [ref=f1e174] [cursor=pointer]
      - button "Archive project" [ref=f1e175] [cursor=pointer]
    - generic [ref=f1e176]:
      - generic [ref=f1e177]: task-002 Order second
      - generic [ref=f1e178]: 0/0 completed
      - button "Open project" [ref=f1e179] [cursor=pointer]
      - button "Archive project" [ref=f1e180] [cursor=pointer]
    - generic [ref=f1e181]:
      - generic [ref=f1e182]: task-002 Task reload
      - generic [ref=f1e183]: 0/1 completed
      - button "Open project" [ref=f1e184] [cursor=pointer]
      - button "Archive project" [ref=f1e185] [cursor=pointer]
    - generic [ref=f1e186]:
      - generic [ref=f1e187]: task-002 Task invalid
      - generic [ref=f1e188]: 0/0 completed
      - button "Open project" [ref=f1e189] [cursor=pointer]
      - button "Archive project" [ref=f1e190] [cursor=pointer]
    - generic [ref=f1e191]:
      - generic [ref=f1e192]: task-002 Task owner
      - generic [ref=f1e193]: 0/1 completed
      - button "Open project" [ref=f1e194] [cursor=pointer]
      - button "Archive project" [ref=f1e195] [cursor=pointer]
    - generic [ref=f1e196]:
      - generic [ref=f1e197]: task-002 Other project
      - generic [ref=f1e198]: 0/0 completed
      - button "Open project" [ref=f1e199] [cursor=pointer]
      - button "Archive project" [ref=f1e200] [cursor=pointer]
    - generic [ref=f1e201]:
      - generic [ref=f1e202]: task-002 Task filters
      - generic [ref=f1e203]: 0/2 completed
      - button "Open project" [ref=f1e204] [cursor=pointer]
      - button "Archive project" [ref=f1e205] [cursor=pointer]
    - generic [ref=f1e206]:
      - generic [ref=f1e207]: task-002 Persistence sentinel
      - generic [ref=f1e208]: 1/1 completed
      - button "Open project" [ref=f1e209] [cursor=pointer]
      - button "Archive project" [ref=f1e210] [cursor=pointer]
    - generic [ref=f1e211]:
      - generic [ref=f1e212]: task-003 Alpha create
      - generic [ref=f1e213]: 0/0 completed
      - button "Open project" [ref=f1e214] [cursor=pointer]
      - button "Archive project" [ref=f1e215] [cursor=pointer]
    - generic [ref=f1e216]:
      - generic [ref=f1e217]: task-003 Blank validation sentinel
      - generic [ref=f1e218]: 0/0 completed
      - button "Open project" [ref=f1e219] [cursor=pointer]
      - button "Archive project" [ref=f1e220] [cursor=pointer]
    - generic [ref=f1e221]:
      - generic [ref=f1e222]: task-003 Order first
      - generic [ref=f1e223]: 0/0 completed
      - button "Open project" [ref=f1e224] [cursor=pointer]
      - button "Archive project" [ref=f1e225] [cursor=pointer]
    - generic [ref=f1e226]:
      - generic [ref=f1e227]: task-003 Order second
      - generic [ref=f1e228]: 0/0 completed
      - button "Open project" [ref=f1e229] [cursor=pointer]
      - button "Archive project" [ref=f1e230] [cursor=pointer]
    - generic [ref=f1e231]:
      - generic [ref=f1e232]: task-003 Task reload
      - generic [ref=f1e233]: 0/1 completed
      - button "Open project" [ref=f1e234] [cursor=pointer]
      - button "Archive project" [ref=f1e235] [cursor=pointer]
    - generic [ref=f1e236]:
      - generic [ref=f1e237]: task-003 Task invalid
      - generic [ref=f1e238]: 0/0 completed
      - button "Open project" [ref=f1e239] [cursor=pointer]
      - button "Archive project" [ref=f1e240] [cursor=pointer]
    - generic [ref=f1e241]:
      - generic [ref=f1e242]: task-003 Task owner
      - generic [ref=f1e243]: 0/1 completed
      - button "Open project" [ref=f1e244] [cursor=pointer]
      - button "Archive project" [ref=f1e245] [cursor=pointer]
    - generic [ref=f1e246]:
      - generic [ref=f1e247]: task-003 Other project
      - generic [ref=f1e248]: 0/0 completed
      - button "Open project" [ref=f1e249] [cursor=pointer]
      - button "Archive project" [ref=f1e250] [cursor=pointer]
    - generic [ref=f1e251]:
      - generic [ref=f1e252]: task-003 Task filters
      - generic [ref=f1e253]: 0/2 completed
      - button "Open project" [ref=f1e254] [cursor=pointer]
      - button "Archive project" [ref=f1e255] [cursor=pointer]
    - generic [ref=f1e256]:
      - generic [ref=f1e257]: task-003 Archive lifecycle
      - generic [ref=f1e258]: 0/0 completed
      - button "Open project" [ref=f1e259] [cursor=pointer]
      - button "Archive project" [ref=f1e260] [cursor=pointer]
```

# Test source

```ts
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
  92  |     await expect(page.getByRole('checkbox', { name: 'Complete Done task', exact: true })).not.toBeChecked();
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
> 106 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
      |                                                         ^ Error: expect(locator).toBeVisible() failed
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
  193 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  194 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  195 |     await page.reload();
  196 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  197 |   });
  198 | 
  199 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  200 |     await createProject(page, 'Rename archive');
  201 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  202 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  203 |     await openProject(page, 'Rename archive');
  204 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  205 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  206 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
```