# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 009 archived tasks are read-only and survive restoration
- Location: runs/instruction-effects/pilot-012/definitions/project/acceptance/workboard.spec.mjs:109:3

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.click: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Archive tasks' }).visible().getByRole('button', { name: 'Restore project', exact: true })

```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Workboard" [level=1] [ref=e3]
  - text: Project filter
  - combobox "Project filter" [ref=e4]:
    - option "Active"
    - option "Archived" [selected]
  - generic [ref=e5]:
    - generic [ref=e6]: Project name
    - textbox "Project name" [ref=e7]
    - button "Create project" [ref=e8] [cursor=pointer]
  - region "Projects" [ref=e9]:
    - generic [ref=e10]:
      - generic [ref=e11]: task-001 Alpha create
      - generic [ref=e12]: 0/0 completed
      - button "Open project" [ref=e13] [cursor=pointer]
      - button "Archive project" [ref=e14] [cursor=pointer]
    - generic [ref=e15]:
      - generic [ref=e16]: task-001 Blank validation sentinel
      - generic [ref=e17]: 0/0 completed
      - button "Open project" [ref=e18] [cursor=pointer]
      - button "Archive project" [ref=e19] [cursor=pointer]
    - generic [ref=e20]:
      - generic [ref=e21]: task-001 Order first
      - generic [ref=e22]: 0/0 completed
      - button "Open project" [ref=e23] [cursor=pointer]
      - button "Archive project" [ref=e24] [cursor=pointer]
    - generic [ref=e25]:
      - generic [ref=e26]: task-001 Order second
      - generic [ref=e27]: 0/0 completed
      - button "Open project" [ref=e28] [cursor=pointer]
      - button "Archive project" [ref=e29] [cursor=pointer]
    - generic [ref=e30]:
      - generic [ref=e31]: task-001 Persistence sentinel
      - generic [ref=e32]: 0/0 completed
      - button "Open project" [ref=e33] [cursor=pointer]
      - button "Archive project" [ref=e34] [cursor=pointer]
    - generic [ref=e35]:
      - generic [ref=e36]: task-002 Alpha create
      - generic [ref=e37]: 0/0 completed
      - button "Open project" [ref=e38] [cursor=pointer]
      - button "Archive project" [ref=e39] [cursor=pointer]
    - generic [ref=e40]:
      - generic [ref=e41]: task-002 Blank validation sentinel
      - generic [ref=e42]: 0/0 completed
      - button "Open project" [ref=e43] [cursor=pointer]
      - button "Archive project" [ref=e44] [cursor=pointer]
    - generic [ref=e45]:
      - generic [ref=e46]: task-002 Order first
      - generic [ref=e47]: 0/0 completed
      - button "Open project" [ref=e48] [cursor=pointer]
      - button "Archive project" [ref=e49] [cursor=pointer]
    - generic [ref=e50]:
      - generic [ref=e51]: task-002 Order second
      - generic [ref=e52]: 0/0 completed
      - button "Open project" [ref=e53] [cursor=pointer]
      - button "Archive project" [ref=e54] [cursor=pointer]
    - generic [ref=e55]:
      - generic [ref=e56]: task-002 Task reload
      - generic [ref=e57]: 0/1 completed
      - button "Open project" [ref=e58] [cursor=pointer]
      - button "Archive project" [ref=e59] [cursor=pointer]
    - generic [ref=e60]:
      - generic [ref=e61]: task-002 Task invalid
      - generic [ref=e62]: 0/0 completed
      - button "Open project" [ref=e63] [cursor=pointer]
      - button "Archive project" [ref=e64] [cursor=pointer]
    - generic [ref=e65]:
      - generic [ref=e66]: task-002 Task owner
      - generic [ref=e67]: 0/1 completed
      - button "Open project" [ref=e68] [cursor=pointer]
      - button "Archive project" [ref=e69] [cursor=pointer]
    - generic [ref=e70]:
      - generic [ref=e71]: task-002 Other project
      - generic [ref=e72]: 0/0 completed
      - button "Open project" [ref=e73] [cursor=pointer]
      - button "Archive project" [ref=e74] [cursor=pointer]
    - generic [ref=e75]:
      - generic [ref=e76]: task-002 Task filters
      - generic [ref=e77]: 0/2 completed
      - button "Open project" [ref=e78] [cursor=pointer]
      - button "Archive project" [ref=e79] [cursor=pointer]
    - generic [ref=e80]:
      - generic [ref=e81]: task-002 Persistence sentinel
      - generic [ref=e82]: 1/1 completed
      - button "Open project" [ref=e83] [cursor=pointer]
      - button "Archive project" [ref=e84] [cursor=pointer]
    - generic [ref=e85]:
      - generic [ref=e86]: task-003 Alpha create
      - generic [ref=e87]: 0/0 completed
      - button "Open project" [ref=e88] [cursor=pointer]
      - button "Archive project" [ref=e89] [cursor=pointer]
    - generic [ref=e90]:
      - generic [ref=e91]: task-003 Blank validation sentinel
      - generic [ref=e92]: 0/0 completed
      - button "Open project" [ref=e93] [cursor=pointer]
      - button "Archive project" [ref=e94] [cursor=pointer]
    - generic [ref=e95]:
      - generic [ref=e96]: task-003 Order first
      - generic [ref=e97]: 0/0 completed
      - button "Open project" [ref=e98] [cursor=pointer]
      - button "Archive project" [ref=e99] [cursor=pointer]
    - generic [ref=e100]:
      - generic [ref=e101]: task-003 Order second
      - generic [ref=e102]: 0/0 completed
      - button "Open project" [ref=e103] [cursor=pointer]
      - button "Archive project" [ref=e104] [cursor=pointer]
    - generic [ref=e105]:
      - generic [ref=e106]: task-003 Task reload
      - generic [ref=e107]: 0/1 completed
      - button "Open project" [ref=e108] [cursor=pointer]
      - button "Archive project" [ref=e109] [cursor=pointer]
    - generic [ref=e110]:
      - generic [ref=e111]: task-003 Task invalid
      - generic [ref=e112]: 0/0 completed
      - button "Open project" [ref=e113] [cursor=pointer]
      - button "Archive project" [ref=e114] [cursor=pointer]
    - generic [ref=e115]:
      - generic [ref=e116]: task-003 Task owner
      - generic [ref=e117]: 0/1 completed
      - button "Open project" [ref=e118] [cursor=pointer]
      - button "Archive project" [ref=e119] [cursor=pointer]
    - generic [ref=e120]:
      - generic [ref=e121]: task-003 Other project
      - generic [ref=e122]: 0/0 completed
      - button "Open project" [ref=e123] [cursor=pointer]
      - button "Archive project" [ref=e124] [cursor=pointer]
    - generic [ref=e125]:
      - generic [ref=e126]: task-003 Task filters
      - generic [ref=e127]: 0/2 completed
      - button "Open project" [ref=e128] [cursor=pointer]
      - button "Archive project" [ref=e129] [cursor=pointer]
    - generic [ref=e130]:
      - generic [ref=e131]: task-003 Archive lifecycle
      - generic [ref=e132]: 0/0 completed
      - button "Open project" [ref=e133] [cursor=pointer]
      - button "Archive project" [ref=e134] [cursor=pointer]
```

# Test source

```ts
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
> 128 |     await projectRow(page, 'Archive tasks').getByRole('button', { name: 'Restore project', exact: true }).click();
      |                                                                                                           ^ Error: locator.click: Test timeout of 20000ms exceeded.
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
  207 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  208 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
  209 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  210 |     await openProject(page, 'Rename archive');
  211 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  212 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  213 |   });
  214 | }
  215 | 
```