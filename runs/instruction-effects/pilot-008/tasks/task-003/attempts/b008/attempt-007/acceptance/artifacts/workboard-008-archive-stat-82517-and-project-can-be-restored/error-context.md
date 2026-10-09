# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 008 archive state persists and project can be restored
- Location: runs/instruction-effects/pilot-008/definitions/project/acceptance/workboard.spec.mjs:87:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' })
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }) resolved to 2 elements:
    1) <div class="row" data-testid="project-row">…</div> aka getByText('task-003 Archive lifecycle0/0').first()
    2) <div class="row" data-testid="project-row">…</div> aka getByText('task-003 Archive lifecycle0/0').nth(1)

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }) with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' })

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading "Workboard" [level=1] [ref=f1e3]
  - generic [ref=f1e4]: Project filter
  - combobox "Project filter" [ref=f1e5]:
    - option "Active" [selected]
    - option "Archived"
  - generic [ref=f1e6]:
    - generic [ref=f1e7]:
      - generic [ref=f1e8]: Project name
      - textbox "Project name" [ref=f1e9]
    - button "Create project" [ref=f1e10] [cursor=pointer]
  - region "Projects" [ref=f1e11]:
    - generic [ref=f1e12]:
      - generic [ref=f1e13]: task-001 Alpha create
      - generic [ref=f1e14]: 0/0 completed
      - button "Open project" [ref=f1e15] [cursor=pointer]
      - button "Archive project" [ref=f1e16] [cursor=pointer]
    - generic [ref=f1e17]:
      - generic [ref=f1e18]: task-001 Order first
      - generic [ref=f1e19]: 0/0 completed
      - button "Open project" [ref=f1e20] [cursor=pointer]
      - button "Archive project" [ref=f1e21] [cursor=pointer]
    - generic [ref=f1e22]:
      - generic [ref=f1e23]: task-001 Order second
      - generic [ref=f1e24]: 0/0 completed
      - button "Open project" [ref=f1e25] [cursor=pointer]
      - button "Archive project" [ref=f1e26] [cursor=pointer]
    - generic [ref=f1e27]:
      - generic [ref=f1e28]: task-001 Persistence sentinel
      - generic [ref=f1e29]: 0/0 completed
      - button "Open project" [ref=f1e30] [cursor=pointer]
      - button "Archive project" [ref=f1e31] [cursor=pointer]
    - generic [ref=f1e32]:
      - generic [ref=f1e33]: task-002 Alpha create
      - generic [ref=f1e34]: 0/0 completed
      - button "Open project" [ref=f1e35] [cursor=pointer]
      - button "Archive project" [ref=f1e36] [cursor=pointer]
    - generic [ref=f1e37]:
      - generic [ref=f1e38]: task-002 Order first
      - generic [ref=f1e39]: 0/0 completed
      - button "Open project" [ref=f1e40] [cursor=pointer]
      - button "Archive project" [ref=f1e41] [cursor=pointer]
    - generic [ref=f1e42]:
      - generic [ref=f1e43]: task-002 Order second
      - generic [ref=f1e44]: 0/0 completed
      - button "Open project" [ref=f1e45] [cursor=pointer]
      - button "Archive project" [ref=f1e46] [cursor=pointer]
    - generic [ref=f1e47]:
      - generic [ref=f1e48]: task-002 Task reload
      - generic [ref=f1e49]: 0/1 completed
      - button "Open project" [ref=f1e50] [cursor=pointer]
      - button "Archive project" [ref=f1e51] [cursor=pointer]
    - generic [ref=f1e52]:
      - generic [ref=f1e53]: task-002 Task invalid
      - generic [ref=f1e54]: 0/0 completed
      - button "Open project" [ref=f1e55] [cursor=pointer]
      - button "Archive project" [ref=f1e56] [cursor=pointer]
    - generic [ref=f1e57]:
      - generic [ref=f1e58]: task-002 Task owner
      - generic [ref=f1e59]: 0/1 completed
      - button "Open project" [ref=f1e60] [cursor=pointer]
      - button "Archive project" [ref=f1e61] [cursor=pointer]
    - generic [ref=f1e62]:
      - generic [ref=f1e63]: task-002 Other project
      - generic [ref=f1e64]: 0/0 completed
      - button "Open project" [ref=f1e65] [cursor=pointer]
      - button "Archive project" [ref=f1e66] [cursor=pointer]
    - generic [ref=f1e67]:
      - generic [ref=f1e68]: task-002 Task filters
      - generic [ref=f1e69]: 0/2 completed
      - button "Open project" [ref=f1e70] [cursor=pointer]
      - button "Archive project" [ref=f1e71] [cursor=pointer]
    - generic [ref=f1e72]:
      - generic [ref=f1e73]: task-002 Persistence sentinel
      - generic [ref=f1e74]: 1/1 completed
      - button "Open project" [ref=f1e75] [cursor=pointer]
      - button "Archive project" [ref=f1e76] [cursor=pointer]
    - generic [ref=f1e77]:
      - generic [ref=f1e78]: task-003 Alpha create
      - generic [ref=f1e79]: 0/0 completed
      - button "Open project" [ref=f1e80] [cursor=pointer]
      - button "Archive project" [ref=f1e81] [cursor=pointer]
    - generic [ref=f1e82]:
      - generic [ref=f1e83]: task-003 Order first
      - generic [ref=f1e84]: 0/0 completed
      - button "Open project" [ref=f1e85] [cursor=pointer]
      - button "Archive project" [ref=f1e86] [cursor=pointer]
    - generic [ref=f1e87]:
      - generic [ref=f1e88]: task-003 Order second
      - generic [ref=f1e89]: 0/0 completed
      - button "Open project" [ref=f1e90] [cursor=pointer]
      - button "Archive project" [ref=f1e91] [cursor=pointer]
    - generic [ref=f1e92]:
      - generic [ref=f1e93]: task-003 Task reload
      - generic [ref=f1e94]: 0/1 completed
      - button "Open project" [ref=f1e95] [cursor=pointer]
      - button "Archive project" [ref=f1e96] [cursor=pointer]
    - generic [ref=f1e97]:
      - generic [ref=f1e98]: task-003 Task invalid
      - generic [ref=f1e99]: 0/0 completed
      - button "Open project" [ref=f1e100] [cursor=pointer]
      - button "Archive project" [ref=f1e101] [cursor=pointer]
    - generic [ref=f1e102]:
      - generic [ref=f1e103]: task-003 Task owner
      - generic [ref=f1e104]: 0/1 completed
      - button "Open project" [ref=f1e105] [cursor=pointer]
      - button "Archive project" [ref=f1e106] [cursor=pointer]
    - generic [ref=f1e107]:
      - generic [ref=f1e108]: task-003 Other project
      - generic [ref=f1e109]: 0/0 completed
      - button "Open project" [ref=f1e110] [cursor=pointer]
      - button "Archive project" [ref=f1e111] [cursor=pointer]
    - generic [ref=f1e112]:
      - generic [ref=f1e113]: task-003 Task filters
      - generic [ref=f1e114]: 0/2 completed
      - button "Open project" [ref=f1e115] [cursor=pointer]
      - button "Archive project" [ref=f1e116] [cursor=pointer]
    - generic [ref=f1e117]:
      - generic [ref=f1e118]: task-003 Archive lifecycle
      - generic [ref=f1e119]: 0/0 completed
      - button "Open project" [ref=f1e120] [cursor=pointer]
      - button "Archive project" [ref=f1e121] [cursor=pointer]
    - generic [ref=f1e122]:
      - generic [ref=f1e123]: task-001 Alpha create
      - generic [ref=f1e124]: 0/0 completed
      - button "Open project" [ref=f1e125] [cursor=pointer]
      - button "Archive project" [ref=f1e126] [cursor=pointer]
    - generic [ref=f1e127]:
      - generic [ref=f1e128]: task-001 Order first
      - generic [ref=f1e129]: 0/0 completed
      - button "Open project" [ref=f1e130] [cursor=pointer]
      - button "Archive project" [ref=f1e131] [cursor=pointer]
    - generic [ref=f1e132]:
      - generic [ref=f1e133]: task-001 Order second
      - generic [ref=f1e134]: 0/0 completed
      - button "Open project" [ref=f1e135] [cursor=pointer]
      - button "Archive project" [ref=f1e136] [cursor=pointer]
    - generic [ref=f1e137]:
      - generic [ref=f1e138]: task-001 Persistence sentinel
      - generic [ref=f1e139]: 0/0 completed
      - button "Open project" [ref=f1e140] [cursor=pointer]
      - button "Archive project" [ref=f1e141] [cursor=pointer]
    - generic [ref=f1e142]:
      - generic [ref=f1e143]: task-002 Alpha create
      - generic [ref=f1e144]: 0/0 completed
      - button "Open project" [ref=f1e145] [cursor=pointer]
      - button "Archive project" [ref=f1e146] [cursor=pointer]
    - generic [ref=f1e147]:
      - generic [ref=f1e148]: task-002 Order first
      - generic [ref=f1e149]: 0/0 completed
      - button "Open project" [ref=f1e150] [cursor=pointer]
      - button "Archive project" [ref=f1e151] [cursor=pointer]
    - generic [ref=f1e152]:
      - generic [ref=f1e153]: task-002 Order second
      - generic [ref=f1e154]: 0/0 completed
      - button "Open project" [ref=f1e155] [cursor=pointer]
      - button "Archive project" [ref=f1e156] [cursor=pointer]
    - generic [ref=f1e157]:
      - generic [ref=f1e158]: task-002 Task reload
      - generic [ref=f1e159]: 0/1 completed
      - button "Open project" [ref=f1e160] [cursor=pointer]
      - button "Archive project" [ref=f1e161] [cursor=pointer]
    - generic [ref=f1e162]:
      - generic [ref=f1e163]: task-002 Task invalid
      - generic [ref=f1e164]: 0/0 completed
      - button "Open project" [ref=f1e165] [cursor=pointer]
      - button "Archive project" [ref=f1e166] [cursor=pointer]
    - generic [ref=f1e167]:
      - generic [ref=f1e168]: task-002 Task owner
      - generic [ref=f1e169]: 0/1 completed
      - button "Open project" [ref=f1e170] [cursor=pointer]
      - button "Archive project" [ref=f1e171] [cursor=pointer]
    - generic [ref=f1e172]:
      - generic [ref=f1e173]: task-002 Other project
      - generic [ref=f1e174]: 0/0 completed
      - button "Open project" [ref=f1e175] [cursor=pointer]
      - button "Archive project" [ref=f1e176] [cursor=pointer]
    - generic [ref=f1e177]:
      - generic [ref=f1e178]: task-002 Task filters
      - generic [ref=f1e179]: 0/2 completed
      - button "Open project" [ref=f1e180] [cursor=pointer]
      - button "Archive project" [ref=f1e181] [cursor=pointer]
    - generic [ref=f1e182]:
      - generic [ref=f1e183]: task-002 Persistence sentinel
      - generic [ref=f1e184]: 1/1 completed
      - button "Open project" [ref=f1e185] [cursor=pointer]
      - button "Archive project" [ref=f1e186] [cursor=pointer]
    - generic [ref=f1e187]:
      - generic [ref=f1e188]: task-003 Alpha create
      - generic [ref=f1e189]: 0/0 completed
      - button "Open project" [ref=f1e190] [cursor=pointer]
      - button "Archive project" [ref=f1e191] [cursor=pointer]
    - generic [ref=f1e192]:
      - generic [ref=f1e193]: task-003 Order first
      - generic [ref=f1e194]: 0/0 completed
      - button "Open project" [ref=f1e195] [cursor=pointer]
      - button "Archive project" [ref=f1e196] [cursor=pointer]
    - generic [ref=f1e197]:
      - generic [ref=f1e198]: task-003 Order second
      - generic [ref=f1e199]: 0/0 completed
      - button "Open project" [ref=f1e200] [cursor=pointer]
      - button "Archive project" [ref=f1e201] [cursor=pointer]
    - generic [ref=f1e202]:
      - generic [ref=f1e203]: task-003 Task reload
      - generic [ref=f1e204]: 0/1 completed
      - button "Open project" [ref=f1e205] [cursor=pointer]
      - button "Archive project" [ref=f1e206] [cursor=pointer]
    - generic [ref=f1e207]:
      - generic [ref=f1e208]: task-003 Task invalid
      - generic [ref=f1e209]: 0/0 completed
      - button "Open project" [ref=f1e210] [cursor=pointer]
      - button "Archive project" [ref=f1e211] [cursor=pointer]
    - generic [ref=f1e212]:
      - generic [ref=f1e213]: task-003 Task owner
      - generic [ref=f1e214]: 0/1 completed
      - button "Open project" [ref=f1e215] [cursor=pointer]
      - button "Archive project" [ref=f1e216] [cursor=pointer]
    - generic [ref=f1e217]:
      - generic [ref=f1e218]: task-003 Other project
      - generic [ref=f1e219]: 0/0 completed
      - button "Open project" [ref=f1e220] [cursor=pointer]
      - button "Archive project" [ref=f1e221] [cursor=pointer]
    - generic [ref=f1e222]:
      - generic [ref=f1e223]: task-003 Task filters
      - generic [ref=f1e224]: 0/2 completed
      - button "Open project" [ref=f1e225] [cursor=pointer]
      - button "Archive project" [ref=f1e226] [cursor=pointer]
    - generic [ref=f1e227]:
      - generic [ref=f1e228]: task-003 Archive lifecycle
      - generic [ref=f1e229]: 0/0 completed
      - button "Open project" [ref=f1e230] [cursor=pointer]
      - button "Archive project" [ref=f1e231] [cursor=pointer]
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
  50  |     await page.getByRole('textbox', { name: 'Task title', exact: true }).fill('   ');
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
> 96  |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
      |                                                         ^ Error: expect(locator).toBeVisible() failed
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