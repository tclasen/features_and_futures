# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 008 archive state persists and project can be restored
- Location: runs/instruction-effects/eval-005/definitions/project/acceptance/workboard.spec.mjs:102:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()
Expected: visible
Error: strict mode violation: getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() resolved to 2 elements:
    1) <div data-testid="project-row">…</div> aka getByText('task-003 Archive lifecycle0/0 completedOpen projectArchive project').first()
    2) <div data-testid="project-row">…</div> aka getByText('task-003 Archive lifecycle0/0 completedOpen projectArchive project').nth(1)

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()

```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - heading "Workboard" [level=1] [ref=f1e3]
  - generic [ref=f1e4]:
    - textbox "Project name" [ref=f1e5]
    - button "Create project" [ref=f1e6] [cursor=pointer]
  - generic [ref=f1e7]:
    - generic [ref=f1e8]: Project filter
    - combobox "Project filter" [ref=f1e9]:
      - option "Active" [selected]
      - option "Archived"
  - region "Projects" [ref=f1e10]:
    - generic [ref=f1e11]:
      - generic [ref=f1e12]:
        - generic [ref=f1e13]: task-001 Alpha create
        - generic [ref=f1e14]: 0/0 completed
      - generic [ref=f1e15]:
        - button "Open project" [ref=f1e16] [cursor=pointer]
        - button "Archive project" [ref=f1e17] [cursor=pointer]
    - generic [ref=f1e18]:
      - generic [ref=f1e19]:
        - generic [ref=f1e20]: task-001 Blank validation sentinel
        - generic [ref=f1e21]: 0/0 completed
      - generic [ref=f1e22]:
        - button "Open project" [ref=f1e23] [cursor=pointer]
        - button "Archive project" [ref=f1e24] [cursor=pointer]
    - generic [ref=f1e25]:
      - generic [ref=f1e26]:
        - generic [ref=f1e27]: task-001 Order first
        - generic [ref=f1e28]: 0/0 completed
      - generic [ref=f1e29]:
        - button "Open project" [ref=f1e30] [cursor=pointer]
        - button "Archive project" [ref=f1e31] [cursor=pointer]
    - generic [ref=f1e32]:
      - generic [ref=f1e33]:
        - generic [ref=f1e34]: task-001 Order second
        - generic [ref=f1e35]: 0/0 completed
      - generic [ref=f1e36]:
        - button "Open project" [ref=f1e37] [cursor=pointer]
        - button "Archive project" [ref=f1e38] [cursor=pointer]
    - generic [ref=f1e39]:
      - generic [ref=f1e40]:
        - generic [ref=f1e41]: task-001 Persistence sentinel
        - generic [ref=f1e42]: 0/0 completed
      - generic [ref=f1e43]:
        - button "Open project" [ref=f1e44] [cursor=pointer]
        - button "Archive project" [ref=f1e45] [cursor=pointer]
    - generic [ref=f1e46]:
      - generic [ref=f1e47]:
        - generic [ref=f1e48]: task-002 Alpha create
        - generic [ref=f1e49]: 0/0 completed
      - generic [ref=f1e50]:
        - button "Open project" [ref=f1e51] [cursor=pointer]
        - button "Archive project" [ref=f1e52] [cursor=pointer]
    - generic [ref=f1e53]:
      - generic [ref=f1e54]:
        - generic [ref=f1e55]: task-002 Blank validation sentinel
        - generic [ref=f1e56]: 0/0 completed
      - generic [ref=f1e57]:
        - button "Open project" [ref=f1e58] [cursor=pointer]
        - button "Archive project" [ref=f1e59] [cursor=pointer]
    - generic [ref=f1e60]:
      - generic [ref=f1e61]:
        - generic [ref=f1e62]: task-002 Order first
        - generic [ref=f1e63]: 0/0 completed
      - generic [ref=f1e64]:
        - button "Open project" [ref=f1e65] [cursor=pointer]
        - button "Archive project" [ref=f1e66] [cursor=pointer]
    - generic [ref=f1e67]:
      - generic [ref=f1e68]:
        - generic [ref=f1e69]: task-002 Order second
        - generic [ref=f1e70]: 0/0 completed
      - generic [ref=f1e71]:
        - button "Open project" [ref=f1e72] [cursor=pointer]
        - button "Archive project" [ref=f1e73] [cursor=pointer]
    - generic [ref=f1e74]:
      - generic [ref=f1e75]:
        - generic [ref=f1e76]: task-002 Task reload
        - generic [ref=f1e77]: 0/1 completed
      - generic [ref=f1e78]:
        - button "Open project" [ref=f1e79] [cursor=pointer]
        - button "Archive project" [ref=f1e80] [cursor=pointer]
    - generic [ref=f1e81]:
      - generic [ref=f1e82]:
        - generic [ref=f1e83]: task-002 Task invalid
        - generic [ref=f1e84]: 0/0 completed
      - generic [ref=f1e85]:
        - button "Open project" [ref=f1e86] [cursor=pointer]
        - button "Archive project" [ref=f1e87] [cursor=pointer]
    - generic [ref=f1e88]:
      - generic [ref=f1e89]:
        - generic [ref=f1e90]: task-002 Task owner
        - generic [ref=f1e91]: 0/1 completed
      - generic [ref=f1e92]:
        - button "Open project" [ref=f1e93] [cursor=pointer]
        - button "Archive project" [ref=f1e94] [cursor=pointer]
    - generic [ref=f1e95]:
      - generic [ref=f1e96]:
        - generic [ref=f1e97]: task-002 Other project
        - generic [ref=f1e98]: 0/0 completed
      - generic [ref=f1e99]:
        - button "Open project" [ref=f1e100] [cursor=pointer]
        - button "Archive project" [ref=f1e101] [cursor=pointer]
    - generic [ref=f1e102]:
      - generic [ref=f1e103]:
        - generic [ref=f1e104]: task-002 Task filters
        - generic [ref=f1e105]: 0/2 completed
      - generic [ref=f1e106]:
        - button "Open project" [ref=f1e107] [cursor=pointer]
        - button "Archive project" [ref=f1e108] [cursor=pointer]
    - generic [ref=f1e109]:
      - generic [ref=f1e110]:
        - generic [ref=f1e111]: task-002 Persistence sentinel
        - generic [ref=f1e112]: 1/1 completed
      - generic [ref=f1e113]:
        - button "Open project" [ref=f1e114] [cursor=pointer]
        - button "Archive project" [ref=f1e115] [cursor=pointer]
    - generic [ref=f1e116]:
      - generic [ref=f1e117]:
        - generic [ref=f1e118]: task-003 Alpha create
        - generic [ref=f1e119]: 0/0 completed
      - generic [ref=f1e120]:
        - button "Open project" [ref=f1e121] [cursor=pointer]
        - button "Archive project" [ref=f1e122] [cursor=pointer]
    - generic [ref=f1e123]:
      - generic [ref=f1e124]:
        - generic [ref=f1e125]: task-003 Blank validation sentinel
        - generic [ref=f1e126]: 0/0 completed
      - generic [ref=f1e127]:
        - button "Open project" [ref=f1e128] [cursor=pointer]
        - button "Archive project" [ref=f1e129] [cursor=pointer]
    - generic [ref=f1e130]:
      - generic [ref=f1e131]:
        - generic [ref=f1e132]: task-003 Order first
        - generic [ref=f1e133]: 0/0 completed
      - generic [ref=f1e134]:
        - button "Open project" [ref=f1e135] [cursor=pointer]
        - button "Archive project" [ref=f1e136] [cursor=pointer]
    - generic [ref=f1e137]:
      - generic [ref=f1e138]:
        - generic [ref=f1e139]: task-003 Order second
        - generic [ref=f1e140]: 0/0 completed
      - generic [ref=f1e141]:
        - button "Open project" [ref=f1e142] [cursor=pointer]
        - button "Archive project" [ref=f1e143] [cursor=pointer]
    - generic [ref=f1e144]:
      - generic [ref=f1e145]:
        - generic [ref=f1e146]: task-003 Task reload
        - generic [ref=f1e147]: 0/1 completed
      - generic [ref=f1e148]:
        - button "Open project" [ref=f1e149] [cursor=pointer]
        - button "Archive project" [ref=f1e150] [cursor=pointer]
    - generic [ref=f1e151]:
      - generic [ref=f1e152]:
        - generic [ref=f1e153]: task-003 Task invalid
        - generic [ref=f1e154]: 0/0 completed
      - generic [ref=f1e155]:
        - button "Open project" [ref=f1e156] [cursor=pointer]
        - button "Archive project" [ref=f1e157] [cursor=pointer]
    - generic [ref=f1e158]:
      - generic [ref=f1e159]:
        - generic [ref=f1e160]: task-003 Task owner
        - generic [ref=f1e161]: 0/1 completed
      - generic [ref=f1e162]:
        - button "Open project" [ref=f1e163] [cursor=pointer]
        - button "Archive project" [ref=f1e164] [cursor=pointer]
    - generic [ref=f1e165]:
      - generic [ref=f1e166]:
        - generic [ref=f1e167]: task-003 Other project
        - generic [ref=f1e168]: 0/0 completed
      - generic [ref=f1e169]:
        - button "Open project" [ref=f1e170] [cursor=pointer]
        - button "Archive project" [ref=f1e171] [cursor=pointer]
    - generic [ref=f1e172]:
      - generic [ref=f1e173]:
        - generic [ref=f1e174]: task-003 Task filters
        - generic [ref=f1e175]: 0/2 completed
      - generic [ref=f1e176]:
        - button "Open project" [ref=f1e177] [cursor=pointer]
        - button "Archive project" [ref=f1e178] [cursor=pointer]
    - generic [ref=f1e179]:
      - generic [ref=f1e180]:
        - generic [ref=f1e181]: task-003 Archive lifecycle
        - generic [ref=f1e182]: 0/0 completed
      - generic [ref=f1e183]:
        - button "Open project" [ref=f1e184] [cursor=pointer]
        - button "Archive project" [ref=f1e185] [cursor=pointer]
    - generic [ref=f1e186]:
      - generic [ref=f1e187]:
        - generic [ref=f1e188]: task-001 Alpha create
        - generic [ref=f1e189]: 0/0 completed
      - generic [ref=f1e190]:
        - button "Open project" [ref=f1e191] [cursor=pointer]
        - button "Archive project" [ref=f1e192] [cursor=pointer]
    - generic [ref=f1e193]:
      - generic [ref=f1e194]:
        - generic [ref=f1e195]: task-001 Blank validation sentinel
        - generic [ref=f1e196]: 0/0 completed
      - generic [ref=f1e197]:
        - button "Open project" [ref=f1e198] [cursor=pointer]
        - button "Archive project" [ref=f1e199] [cursor=pointer]
    - generic [ref=f1e200]:
      - generic [ref=f1e201]:
        - generic [ref=f1e202]: task-001 Order first
        - generic [ref=f1e203]: 0/0 completed
      - generic [ref=f1e204]:
        - button "Open project" [ref=f1e205] [cursor=pointer]
        - button "Archive project" [ref=f1e206] [cursor=pointer]
    - generic [ref=f1e207]:
      - generic [ref=f1e208]:
        - generic [ref=f1e209]: task-001 Order second
        - generic [ref=f1e210]: 0/0 completed
      - generic [ref=f1e211]:
        - button "Open project" [ref=f1e212] [cursor=pointer]
        - button "Archive project" [ref=f1e213] [cursor=pointer]
    - generic [ref=f1e214]:
      - generic [ref=f1e215]:
        - generic [ref=f1e216]: task-001 Persistence sentinel
        - generic [ref=f1e217]: 0/0 completed
      - generic [ref=f1e218]:
        - button "Open project" [ref=f1e219] [cursor=pointer]
        - button "Archive project" [ref=f1e220] [cursor=pointer]
    - generic [ref=f1e221]:
      - generic [ref=f1e222]:
        - generic [ref=f1e223]: task-002 Alpha create
        - generic [ref=f1e224]: 0/0 completed
      - generic [ref=f1e225]:
        - button "Open project" [ref=f1e226] [cursor=pointer]
        - button "Archive project" [ref=f1e227] [cursor=pointer]
    - generic [ref=f1e228]:
      - generic [ref=f1e229]:
        - generic [ref=f1e230]: task-002 Blank validation sentinel
        - generic [ref=f1e231]: 0/0 completed
      - generic [ref=f1e232]:
        - button "Open project" [ref=f1e233] [cursor=pointer]
        - button "Archive project" [ref=f1e234] [cursor=pointer]
    - generic [ref=f1e235]:
      - generic [ref=f1e236]:
        - generic [ref=f1e237]: task-002 Order first
        - generic [ref=f1e238]: 0/0 completed
      - generic [ref=f1e239]:
        - button "Open project" [ref=f1e240] [cursor=pointer]
        - button "Archive project" [ref=f1e241] [cursor=pointer]
    - generic [ref=f1e242]:
      - generic [ref=f1e243]:
        - generic [ref=f1e244]: task-002 Order second
        - generic [ref=f1e245]: 0/0 completed
      - generic [ref=f1e246]:
        - button "Open project" [ref=f1e247] [cursor=pointer]
        - button "Archive project" [ref=f1e248] [cursor=pointer]
    - generic [ref=f1e249]:
      - generic [ref=f1e250]:
        - generic [ref=f1e251]: task-002 Task reload
        - generic [ref=f1e252]: 0/1 completed
      - generic [ref=f1e253]:
        - button "Open project" [ref=f1e254] [cursor=pointer]
        - button "Archive project" [ref=f1e255] [cursor=pointer]
    - generic [ref=f1e256]:
      - generic [ref=f1e257]:
        - generic [ref=f1e258]: task-002 Task invalid
        - generic [ref=f1e259]: 0/0 completed
      - generic [ref=f1e260]:
        - button "Open project" [ref=f1e261] [cursor=pointer]
        - button "Archive project" [ref=f1e262] [cursor=pointer]
    - generic [ref=f1e263]:
      - generic [ref=f1e264]:
        - generic [ref=f1e265]: task-002 Task owner
        - generic [ref=f1e266]: 0/1 completed
      - generic [ref=f1e267]:
        - button "Open project" [ref=f1e268] [cursor=pointer]
        - button "Archive project" [ref=f1e269] [cursor=pointer]
    - generic [ref=f1e270]:
      - generic [ref=f1e271]:
        - generic [ref=f1e272]: task-002 Other project
        - generic [ref=f1e273]: 0/0 completed
      - generic [ref=f1e274]:
        - button "Open project" [ref=f1e275] [cursor=pointer]
        - button "Archive project" [ref=f1e276] [cursor=pointer]
    - generic [ref=f1e277]:
      - generic [ref=f1e278]:
        - generic [ref=f1e279]: task-002 Task filters
        - generic [ref=f1e280]: 0/2 completed
      - generic [ref=f1e281]:
        - button "Open project" [ref=f1e282] [cursor=pointer]
        - button "Archive project" [ref=f1e283] [cursor=pointer]
    - generic [ref=f1e284]:
      - generic [ref=f1e285]:
        - generic [ref=f1e286]: task-002 Persistence sentinel
        - generic [ref=f1e287]: 1/1 completed
      - generic [ref=f1e288]:
        - button "Open project" [ref=f1e289] [cursor=pointer]
        - button "Archive project" [ref=f1e290] [cursor=pointer]
    - generic [ref=f1e291]:
      - generic [ref=f1e292]:
        - generic [ref=f1e293]: task-003 Alpha create
        - generic [ref=f1e294]: 0/0 completed
      - generic [ref=f1e295]:
        - button "Open project" [ref=f1e296] [cursor=pointer]
        - button "Archive project" [ref=f1e297] [cursor=pointer]
    - generic [ref=f1e298]:
      - generic [ref=f1e299]:
        - generic [ref=f1e300]: task-003 Blank validation sentinel
        - generic [ref=f1e301]: 0/0 completed
      - generic [ref=f1e302]:
        - button "Open project" [ref=f1e303] [cursor=pointer]
        - button "Archive project" [ref=f1e304] [cursor=pointer]
    - generic [ref=f1e305]:
      - generic [ref=f1e306]:
        - generic [ref=f1e307]: task-003 Order first
        - generic [ref=f1e308]: 0/0 completed
      - generic [ref=f1e309]:
        - button "Open project" [ref=f1e310] [cursor=pointer]
        - button "Archive project" [ref=f1e311] [cursor=pointer]
    - generic [ref=f1e312]:
      - generic [ref=f1e313]:
        - generic [ref=f1e314]: task-003 Order second
        - generic [ref=f1e315]: 0/0 completed
      - generic [ref=f1e316]:
        - button "Open project" [ref=f1e317] [cursor=pointer]
        - button "Archive project" [ref=f1e318] [cursor=pointer]
    - generic [ref=f1e319]:
      - generic [ref=f1e320]:
        - generic [ref=f1e321]: task-003 Task reload
        - generic [ref=f1e322]: 0/1 completed
      - generic [ref=f1e323]:
        - button "Open project" [ref=f1e324] [cursor=pointer]
        - button "Archive project" [ref=f1e325] [cursor=pointer]
    - generic [ref=f1e326]:
      - generic [ref=f1e327]:
        - generic [ref=f1e328]: task-003 Task invalid
        - generic [ref=f1e329]: 0/0 completed
      - generic [ref=f1e330]:
        - button "Open project" [ref=f1e331] [cursor=pointer]
        - button "Archive project" [ref=f1e332] [cursor=pointer]
    - generic [ref=f1e333]:
      - generic [ref=f1e334]:
        - generic [ref=f1e335]: task-003 Task owner
        - generic [ref=f1e336]: 0/1 completed
      - generic [ref=f1e337]:
        - button "Open project" [ref=f1e338] [cursor=pointer]
        - button "Archive project" [ref=f1e339] [cursor=pointer]
    - generic [ref=f1e340]:
      - generic [ref=f1e341]:
        - generic [ref=f1e342]: task-003 Other project
        - generic [ref=f1e343]: 0/0 completed
      - generic [ref=f1e344]:
        - button "Open project" [ref=f1e345] [cursor=pointer]
        - button "Archive project" [ref=f1e346] [cursor=pointer]
    - generic [ref=f1e347]:
      - generic [ref=f1e348]:
        - generic [ref=f1e349]: task-003 Task filters
        - generic [ref=f1e350]: 0/2 completed
      - generic [ref=f1e351]:
        - button "Open project" [ref=f1e352] [cursor=pointer]
        - button "Archive project" [ref=f1e353] [cursor=pointer]
    - generic [ref=f1e354]:
      - generic [ref=f1e355]:
        - generic [ref=f1e356]: task-003 Archive lifecycle
        - generic [ref=f1e357]: 0/0 completed
      - generic [ref=f1e358]:
        - button "Open project" [ref=f1e359] [cursor=pointer]
        - button "Archive project" [ref=f1e360] [cursor=pointer]
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