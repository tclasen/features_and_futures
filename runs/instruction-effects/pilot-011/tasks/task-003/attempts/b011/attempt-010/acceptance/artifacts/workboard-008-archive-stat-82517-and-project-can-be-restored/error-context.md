# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 008 archive state persists and project can be restored
- Location: runs/instruction-effects/pilot-011/definitions/project/acceptance/workboard.spec.mjs:96:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() resolved to 2 elements:
    1) <li class="row" data-testid="project-row">…</li> aka getByText('task-003 Archive lifecycle0/0').first()
    2) <li class="row" data-testid="project-row">…</li> aka getByText('task-003 Archive lifecycle0/0').nth(1)

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading "Workboard" [level=1] [ref=f1e3]
  - generic [ref=f1e4]:
    - generic [ref=f1e5]:
      - generic [ref=f1e6]: Project name
      - textbox "Project name" [ref=f1e7]
    - button "Create project" [ref=f1e8] [cursor=pointer]
  - alert
  - generic [ref=f1e9]:
    - generic [ref=f1e10]: Project filter
    - combobox "Project filter" [ref=f1e11]:
      - option "Active" [selected]
      - option "Archived"
  - list [ref=f1e12]:
    - listitem [ref=f1e13]:
      - generic [ref=f1e14]: task-001 Alpha create
      - generic [ref=f1e15]: 0/0 completed
      - button "Open project" [ref=f1e16] [cursor=pointer]
      - button "Archive project" [ref=f1e17] [cursor=pointer]
    - listitem [ref=f1e18]:
      - generic [ref=f1e19]: task-001 Blank validation sentinel
      - generic [ref=f1e20]: 0/0 completed
      - button "Open project" [ref=f1e21] [cursor=pointer]
      - button "Archive project" [ref=f1e22] [cursor=pointer]
    - listitem [ref=f1e23]:
      - generic [ref=f1e24]: task-001 Order first
      - generic [ref=f1e25]: 0/0 completed
      - button "Open project" [ref=f1e26] [cursor=pointer]
      - button "Archive project" [ref=f1e27] [cursor=pointer]
    - listitem [ref=f1e28]:
      - generic [ref=f1e29]: task-001 Order second
      - generic [ref=f1e30]: 0/0 completed
      - button "Open project" [ref=f1e31] [cursor=pointer]
      - button "Archive project" [ref=f1e32] [cursor=pointer]
    - listitem [ref=f1e33]:
      - generic [ref=f1e34]: task-001 Persistence sentinel
      - generic [ref=f1e35]: 0/0 completed
      - button "Open project" [ref=f1e36] [cursor=pointer]
      - button "Archive project" [ref=f1e37] [cursor=pointer]
    - listitem [ref=f1e38]:
      - generic [ref=f1e39]: task-002 Alpha create
      - generic [ref=f1e40]: 0/0 completed
      - button "Open project" [ref=f1e41] [cursor=pointer]
      - button "Archive project" [ref=f1e42] [cursor=pointer]
    - listitem [ref=f1e43]:
      - generic [ref=f1e44]: task-002 Blank validation sentinel
      - generic [ref=f1e45]: 0/0 completed
      - button "Open project" [ref=f1e46] [cursor=pointer]
      - button "Archive project" [ref=f1e47] [cursor=pointer]
    - listitem [ref=f1e48]:
      - generic [ref=f1e49]: task-002 Order first
      - generic [ref=f1e50]: 0/0 completed
      - button "Open project" [ref=f1e51] [cursor=pointer]
      - button "Archive project" [ref=f1e52] [cursor=pointer]
    - listitem [ref=f1e53]:
      - generic [ref=f1e54]: task-002 Order second
      - generic [ref=f1e55]: 0/0 completed
      - button "Open project" [ref=f1e56] [cursor=pointer]
      - button "Archive project" [ref=f1e57] [cursor=pointer]
    - listitem [ref=f1e58]:
      - generic [ref=f1e59]: task-002 Task reload
      - generic [ref=f1e60]: 0/1 completed
      - button "Open project" [ref=f1e61] [cursor=pointer]
      - button "Archive project" [ref=f1e62] [cursor=pointer]
    - listitem [ref=f1e63]:
      - generic [ref=f1e64]: task-002 Task invalid
      - generic [ref=f1e65]: 0/0 completed
      - button "Open project" [ref=f1e66] [cursor=pointer]
      - button "Archive project" [ref=f1e67] [cursor=pointer]
    - listitem [ref=f1e68]:
      - generic [ref=f1e69]: task-002 Task owner
      - generic [ref=f1e70]: 0/1 completed
      - button "Open project" [ref=f1e71] [cursor=pointer]
      - button "Archive project" [ref=f1e72] [cursor=pointer]
    - listitem [ref=f1e73]:
      - generic [ref=f1e74]: task-002 Other project
      - generic [ref=f1e75]: 0/0 completed
      - button "Open project" [ref=f1e76] [cursor=pointer]
      - button "Archive project" [ref=f1e77] [cursor=pointer]
    - listitem [ref=f1e78]:
      - generic [ref=f1e79]: task-002 Task filters
      - generic [ref=f1e80]: 0/2 completed
      - button "Open project" [ref=f1e81] [cursor=pointer]
      - button "Archive project" [ref=f1e82] [cursor=pointer]
    - listitem [ref=f1e83]:
      - generic [ref=f1e84]: task-002 Persistence sentinel
      - generic [ref=f1e85]: 1/1 completed
      - button "Open project" [ref=f1e86] [cursor=pointer]
      - button "Archive project" [ref=f1e87] [cursor=pointer]
    - listitem [ref=f1e88]:
      - generic [ref=f1e89]: task-003 Alpha create
      - generic [ref=f1e90]: 0/0 completed
      - button "Open project" [ref=f1e91] [cursor=pointer]
      - button "Archive project" [ref=f1e92] [cursor=pointer]
    - listitem [ref=f1e93]:
      - generic [ref=f1e94]: task-003 Blank validation sentinel
      - generic [ref=f1e95]: 0/0 completed
      - button "Open project" [ref=f1e96] [cursor=pointer]
      - button "Archive project" [ref=f1e97] [cursor=pointer]
    - listitem [ref=f1e98]:
      - generic [ref=f1e99]: task-003 Order first
      - generic [ref=f1e100]: 0/0 completed
      - button "Open project" [ref=f1e101] [cursor=pointer]
      - button "Archive project" [ref=f1e102] [cursor=pointer]
    - listitem [ref=f1e103]:
      - generic [ref=f1e104]: task-003 Order second
      - generic [ref=f1e105]: 0/0 completed
      - button "Open project" [ref=f1e106] [cursor=pointer]
      - button "Archive project" [ref=f1e107] [cursor=pointer]
    - listitem [ref=f1e108]:
      - generic [ref=f1e109]: task-003 Task reload
      - generic [ref=f1e110]: 0/1 completed
      - button "Open project" [ref=f1e111] [cursor=pointer]
      - button "Archive project" [ref=f1e112] [cursor=pointer]
    - listitem [ref=f1e113]:
      - generic [ref=f1e114]: task-003 Task invalid
      - generic [ref=f1e115]: 0/0 completed
      - button "Open project" [ref=f1e116] [cursor=pointer]
      - button "Archive project" [ref=f1e117] [cursor=pointer]
    - listitem [ref=f1e118]:
      - generic [ref=f1e119]: task-003 Task owner
      - generic [ref=f1e120]: 0/1 completed
      - button "Open project" [ref=f1e121] [cursor=pointer]
      - button "Archive project" [ref=f1e122] [cursor=pointer]
    - listitem [ref=f1e123]:
      - generic [ref=f1e124]: task-003 Other project
      - generic [ref=f1e125]: 0/0 completed
      - button "Open project" [ref=f1e126] [cursor=pointer]
      - button "Archive project" [ref=f1e127] [cursor=pointer]
    - listitem [ref=f1e128]:
      - generic [ref=f1e129]: task-003 Task filters
      - generic [ref=f1e130]: 1/2 completed
      - button "Open project" [ref=f1e131] [cursor=pointer]
      - button "Archive project" [ref=f1e132] [cursor=pointer]
    - listitem [ref=f1e133]:
      - generic [ref=f1e134]: task-003 Archive lifecycle
      - generic [ref=f1e135]: 0/0 completed
      - button "Open project" [ref=f1e136] [cursor=pointer]
      - button "Archive project" [ref=f1e137] [cursor=pointer]
    - listitem [ref=f1e138]:
      - generic [ref=f1e139]: task-001 Alpha create
      - generic [ref=f1e140]: 0/0 completed
      - button "Open project" [ref=f1e141] [cursor=pointer]
      - button "Archive project" [ref=f1e142] [cursor=pointer]
    - listitem [ref=f1e143]:
      - generic [ref=f1e144]: task-001 Blank validation sentinel
      - generic [ref=f1e145]: 0/0 completed
      - button "Open project" [ref=f1e146] [cursor=pointer]
      - button "Archive project" [ref=f1e147] [cursor=pointer]
    - listitem [ref=f1e148]:
      - generic [ref=f1e149]: task-001 Order first
      - generic [ref=f1e150]: 0/0 completed
      - button "Open project" [ref=f1e151] [cursor=pointer]
      - button "Archive project" [ref=f1e152] [cursor=pointer]
    - listitem [ref=f1e153]:
      - generic [ref=f1e154]: task-001 Order second
      - generic [ref=f1e155]: 0/0 completed
      - button "Open project" [ref=f1e156] [cursor=pointer]
      - button "Archive project" [ref=f1e157] [cursor=pointer]
    - listitem [ref=f1e158]:
      - generic [ref=f1e159]: task-001 Persistence sentinel
      - generic [ref=f1e160]: 0/0 completed
      - button "Open project" [ref=f1e161] [cursor=pointer]
      - button "Archive project" [ref=f1e162] [cursor=pointer]
    - listitem [ref=f1e163]:
      - generic [ref=f1e164]: task-002 Alpha create
      - generic [ref=f1e165]: 0/0 completed
      - button "Open project" [ref=f1e166] [cursor=pointer]
      - button "Archive project" [ref=f1e167] [cursor=pointer]
    - listitem [ref=f1e168]:
      - generic [ref=f1e169]: task-002 Blank validation sentinel
      - generic [ref=f1e170]: 0/0 completed
      - button "Open project" [ref=f1e171] [cursor=pointer]
      - button "Archive project" [ref=f1e172] [cursor=pointer]
    - listitem [ref=f1e173]:
      - generic [ref=f1e174]: task-002 Order first
      - generic [ref=f1e175]: 0/0 completed
      - button "Open project" [ref=f1e176] [cursor=pointer]
      - button "Archive project" [ref=f1e177] [cursor=pointer]
    - listitem [ref=f1e178]:
      - generic [ref=f1e179]: task-002 Order second
      - generic [ref=f1e180]: 0/0 completed
      - button "Open project" [ref=f1e181] [cursor=pointer]
      - button "Archive project" [ref=f1e182] [cursor=pointer]
    - listitem [ref=f1e183]:
      - generic [ref=f1e184]: task-002 Task reload
      - generic [ref=f1e185]: 0/1 completed
      - button "Open project" [ref=f1e186] [cursor=pointer]
      - button "Archive project" [ref=f1e187] [cursor=pointer]
    - listitem [ref=f1e188]:
      - generic [ref=f1e189]: task-002 Task invalid
      - generic [ref=f1e190]: 0/0 completed
      - button "Open project" [ref=f1e191] [cursor=pointer]
      - button "Archive project" [ref=f1e192] [cursor=pointer]
    - listitem [ref=f1e193]:
      - generic [ref=f1e194]: task-002 Task owner
      - generic [ref=f1e195]: 0/1 completed
      - button "Open project" [ref=f1e196] [cursor=pointer]
      - button "Archive project" [ref=f1e197] [cursor=pointer]
    - listitem [ref=f1e198]:
      - generic [ref=f1e199]: task-002 Other project
      - generic [ref=f1e200]: 0/0 completed
      - button "Open project" [ref=f1e201] [cursor=pointer]
      - button "Archive project" [ref=f1e202] [cursor=pointer]
    - listitem [ref=f1e203]:
      - generic [ref=f1e204]: task-002 Task filters
      - generic [ref=f1e205]: 0/2 completed
      - button "Open project" [ref=f1e206] [cursor=pointer]
      - button "Archive project" [ref=f1e207] [cursor=pointer]
    - listitem [ref=f1e208]:
      - generic [ref=f1e209]: task-002 Persistence sentinel
      - generic [ref=f1e210]: 1/1 completed
      - button "Open project" [ref=f1e211] [cursor=pointer]
      - button "Archive project" [ref=f1e212] [cursor=pointer]
    - listitem [ref=f1e213]:
      - generic [ref=f1e214]: task-003 Alpha create
      - generic [ref=f1e215]: 0/0 completed
      - button "Open project" [ref=f1e216] [cursor=pointer]
      - button "Archive project" [ref=f1e217] [cursor=pointer]
    - listitem [ref=f1e218]:
      - generic [ref=f1e219]: task-003 Blank validation sentinel
      - generic [ref=f1e220]: 0/0 completed
      - button "Open project" [ref=f1e221] [cursor=pointer]
      - button "Archive project" [ref=f1e222] [cursor=pointer]
    - listitem [ref=f1e223]:
      - generic [ref=f1e224]: task-003 Order first
      - generic [ref=f1e225]: 0/0 completed
      - button "Open project" [ref=f1e226] [cursor=pointer]
      - button "Archive project" [ref=f1e227] [cursor=pointer]
    - listitem [ref=f1e228]:
      - generic [ref=f1e229]: task-003 Order second
      - generic [ref=f1e230]: 0/0 completed
      - button "Open project" [ref=f1e231] [cursor=pointer]
      - button "Archive project" [ref=f1e232] [cursor=pointer]
    - listitem [ref=f1e233]:
      - generic [ref=f1e234]: task-003 Task reload
      - generic [ref=f1e235]: 0/1 completed
      - button "Open project" [ref=f1e236] [cursor=pointer]
      - button "Archive project" [ref=f1e237] [cursor=pointer]
    - listitem [ref=f1e238]:
      - generic [ref=f1e239]: task-003 Task invalid
      - generic [ref=f1e240]: 0/0 completed
      - button "Open project" [ref=f1e241] [cursor=pointer]
      - button "Archive project" [ref=f1e242] [cursor=pointer]
    - listitem [ref=f1e243]:
      - generic [ref=f1e244]: task-003 Task owner
      - generic [ref=f1e245]: 0/1 completed
      - button "Open project" [ref=f1e246] [cursor=pointer]
      - button "Archive project" [ref=f1e247] [cursor=pointer]
    - listitem [ref=f1e248]:
      - generic [ref=f1e249]: task-003 Other project
      - generic [ref=f1e250]: 0/0 completed
      - button "Open project" [ref=f1e251] [cursor=pointer]
      - button "Archive project" [ref=f1e252] [cursor=pointer]
    - listitem [ref=f1e253]:
      - generic [ref=f1e254]: task-003 Task filters
      - generic [ref=f1e255]: 1/2 completed
      - button "Open project" [ref=f1e256] [cursor=pointer]
      - button "Archive project" [ref=f1e257] [cursor=pointer]
    - listitem [ref=f1e258]:
      - generic [ref=f1e259]: task-003 Archive lifecycle
      - generic [ref=f1e260]: 0/0 completed
      - button "Open project" [ref=f1e261] [cursor=pointer]
      - button "Archive project" [ref=f1e262] [cursor=pointer]
```

# Test source

```ts
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
  81  |     await expect(taskRow(page, 'Open task')).toBeVisible();
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
> 105 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
      |                                                         ^ Error: expect(locator).toBeVisible() failed
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
  182 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  183 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  184 |     await openProject(page, 'Identity updated');
  185 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  186 |   });
  187 | 
  188 |   test('014 blank rename preserves original name', async ({ page }) => {
  189 |     await createProject(page, 'Rename invalid');
  190 |     await openProject(page, 'Rename invalid');
  191 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  192 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  193 |     await expect(page.getByRole('alert')).toContainText('Project name is required');
  194 |     await page.reload();
  195 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  196 |   });
  197 | 
  198 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  199 |     await createProject(page, 'Rename archive');
  200 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  201 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  202 |     await openProject(page, 'Rename archive');
  203 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  204 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  205 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
```