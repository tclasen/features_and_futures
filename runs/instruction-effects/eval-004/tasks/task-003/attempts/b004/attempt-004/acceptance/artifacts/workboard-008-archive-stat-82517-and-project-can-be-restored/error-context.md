# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 008 archive state persists and project can be restored
- Location: runs/instruction-effects/eval-004/definitions/project/acceptance/workboard.spec.mjs:102:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive lifecycle' }).visible()
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Workboard" [level=1] [ref=e4]
  - generic [ref=e5]:
    - generic [ref=e6]: Project name
    - textbox "Project name" [ref=e7]
    - button "Create project" [ref=e8] [cursor=pointer]
    - alert [ref=e9]
  - generic [ref=e10]:
    - generic [ref=e11]: Project filter
    - combobox "Project filter" [ref=e12]:
      - option "Active" [selected]
      - option "Archived"
  - region "Projects" [ref=e13]:
    - generic [ref=e14]:
      - generic [ref=e15]: task-001 Alpha create 0/0 completed
      - generic [ref=e16]:
        - button "Open project" [ref=e17] [cursor=pointer]
        - button "Archive project" [ref=e18] [cursor=pointer]
    - generic [ref=e19]:
      - generic [ref=e20]: task-001 Blank validation sentinel 0/0 completed
      - generic [ref=e21]:
        - button "Open project" [ref=e22] [cursor=pointer]
        - button "Archive project" [ref=e23] [cursor=pointer]
    - generic [ref=e24]:
      - generic [ref=e25]: task-001 Order first 0/0 completed
      - generic [ref=e26]:
        - button "Open project" [ref=e27] [cursor=pointer]
        - button "Archive project" [ref=e28] [cursor=pointer]
    - generic [ref=e29]:
      - generic [ref=e30]: task-001 Order second 0/0 completed
      - generic [ref=e31]:
        - button "Open project" [ref=e32] [cursor=pointer]
        - button "Archive project" [ref=e33] [cursor=pointer]
    - generic [ref=e34]:
      - generic [ref=e35]: task-001 Persistence sentinel 0/0 completed
      - generic [ref=e36]:
        - button "Open project" [ref=e37] [cursor=pointer]
        - button "Archive project" [ref=e38] [cursor=pointer]
    - generic [ref=e39]:
      - generic [ref=e40]: task-002 Alpha create 0/0 completed
      - generic [ref=e41]:
        - button "Open project" [ref=e42] [cursor=pointer]
        - button "Archive project" [ref=e43] [cursor=pointer]
    - generic [ref=e44]:
      - generic [ref=e45]: task-002 Blank validation sentinel 0/0 completed
      - generic [ref=e46]:
        - button "Open project" [ref=e47] [cursor=pointer]
        - button "Archive project" [ref=e48] [cursor=pointer]
    - generic [ref=e49]:
      - generic [ref=e50]: task-002 Order first 0/0 completed
      - generic [ref=e51]:
        - button "Open project" [ref=e52] [cursor=pointer]
        - button "Archive project" [ref=e53] [cursor=pointer]
    - generic [ref=e54]:
      - generic [ref=e55]: task-002 Order second 0/0 completed
      - generic [ref=e56]:
        - button "Open project" [ref=e57] [cursor=pointer]
        - button "Archive project" [ref=e58] [cursor=pointer]
    - generic [ref=e59]:
      - generic [ref=e60]: task-002 Task reload 0/1 completed
      - generic [ref=e61]:
        - button "Open project" [ref=e62] [cursor=pointer]
        - button "Archive project" [ref=e63] [cursor=pointer]
    - generic [ref=e64]:
      - generic [ref=e65]: task-002 Task invalid 0/0 completed
      - generic [ref=e66]:
        - button "Open project" [ref=e67] [cursor=pointer]
        - button "Archive project" [ref=e68] [cursor=pointer]
    - generic [ref=e69]:
      - generic [ref=e70]: task-002 Task owner 0/1 completed
      - generic [ref=e71]:
        - button "Open project" [ref=e72] [cursor=pointer]
        - button "Archive project" [ref=e73] [cursor=pointer]
    - generic [ref=e74]:
      - generic [ref=e75]: task-002 Other project 0/0 completed
      - generic [ref=e76]:
        - button "Open project" [ref=e77] [cursor=pointer]
        - button "Archive project" [ref=e78] [cursor=pointer]
    - generic [ref=e79]:
      - generic [ref=e80]: task-002 Task filters 0/2 completed
      - generic [ref=e81]:
        - button "Open project" [ref=e82] [cursor=pointer]
        - button "Archive project" [ref=e83] [cursor=pointer]
    - generic [ref=e84]:
      - generic [ref=e85]: task-002 Persistence sentinel 1/1 completed
      - generic [ref=e86]:
        - button "Open project" [ref=e87] [cursor=pointer]
        - button "Archive project" [ref=e88] [cursor=pointer]
    - generic [ref=e89]:
      - generic [ref=e90]: task-003 Alpha create 0/0 completed
      - generic [ref=e91]:
        - button "Open project" [ref=e92] [cursor=pointer]
        - button "Archive project" [ref=e93] [cursor=pointer]
    - generic [ref=e94]:
      - generic [ref=e95]: task-003 Blank validation sentinel 0/0 completed
      - generic [ref=e96]:
        - button "Open project" [ref=e97] [cursor=pointer]
        - button "Archive project" [ref=e98] [cursor=pointer]
    - generic [ref=e99]:
      - generic [ref=e100]: task-003 Order first 0/0 completed
      - generic [ref=e101]:
        - button "Open project" [ref=e102] [cursor=pointer]
        - button "Archive project" [ref=e103] [cursor=pointer]
    - generic [ref=e104]:
      - generic [ref=e105]: task-003 Order second 0/0 completed
      - generic [ref=e106]:
        - button "Open project" [ref=e107] [cursor=pointer]
        - button "Archive project" [ref=e108] [cursor=pointer]
    - generic [ref=e109]:
      - generic [ref=e110]: task-003 Task reload 0/1 completed
      - generic [ref=e111]:
        - button "Open project" [ref=e112] [cursor=pointer]
        - button "Archive project" [ref=e113] [cursor=pointer]
    - generic [ref=e114]:
      - generic [ref=e115]: task-003 Task invalid 0/0 completed
      - generic [ref=e116]:
        - button "Open project" [ref=e117] [cursor=pointer]
        - button "Archive project" [ref=e118] [cursor=pointer]
    - generic [ref=e119]:
      - generic [ref=e120]: task-003 Task owner 0/1 completed
      - generic [ref=e121]:
        - button "Open project" [ref=e122] [cursor=pointer]
        - button "Archive project" [ref=e123] [cursor=pointer]
    - generic [ref=e124]:
      - generic [ref=e125]: task-003 Other project 0/0 completed
      - generic [ref=e126]:
        - button "Open project" [ref=e127] [cursor=pointer]
        - button "Archive project" [ref=e128] [cursor=pointer]
    - generic [ref=e129]:
      - generic [ref=e130]: task-003 Task filters 0/2 completed
      - generic [ref=e131]:
        - button "Open project" [ref=e132] [cursor=pointer]
        - button "Archive project" [ref=e133] [cursor=pointer]
    - generic [ref=e134]:
      - generic [ref=e135]: task-003 Archive lifecycle 0/0 completed
      - generic [ref=e136]:
        - button "Open project" [ref=e137] [cursor=pointer]
        - button "Archive project" [active] [ref=e138] [cursor=pointer]
```

# Test source

```ts
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
> 105 |     await expect(projectRow(page, 'Archive lifecycle')).toHaveCount(0);
      |                                                         ^ Error: expect(locator).toHaveCount(expected) failed
  106 |     await page.reload();
  107 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  108 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  109 |     await projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true }).click();
  110 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  111 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
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
```