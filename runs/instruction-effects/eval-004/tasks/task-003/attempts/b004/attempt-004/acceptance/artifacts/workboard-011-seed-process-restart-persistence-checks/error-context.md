# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 011 seed process-restart persistence checks
- Location: runs/instruction-effects/eval-004/definitions/project/acceptance/workboard.spec.mjs:155:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('project-row').filter({ hasText: 'task-003 Persistence sentinel' }).visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('project-row').filter({ hasText: 'task-003 Persistence sentinel' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-003 Persistence sentinel' }).visible()
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- main [ref=f2e2]:
  - heading "Workboard" [level=1] [ref=f2e4]
  - generic [ref=f2e5]:
    - generic [ref=f2e6]: Project name
    - textbox "Project name" [ref=f2e7]
    - button "Create project" [ref=f2e8] [cursor=pointer]
    - alert [ref=f2e9]
  - generic [ref=f2e10]:
    - generic [ref=f2e11]: Project filter
    - combobox "Project filter" [ref=f2e12]:
      - option "Active" [selected]
      - option "Archived"
  - region "Projects" [ref=f2e13]:
    - generic [ref=f2e14]:
      - generic [ref=f2e15]: task-001 Alpha create 0/0 completed
      - generic [ref=f2e16]:
        - button "Open project" [ref=f2e17] [cursor=pointer]
        - button "Archive project" [ref=f2e18] [cursor=pointer]
    - generic [ref=f2e19]:
      - generic [ref=f2e20]: task-001 Blank validation sentinel 0/0 completed
      - generic [ref=f2e21]:
        - button "Open project" [ref=f2e22] [cursor=pointer]
        - button "Archive project" [ref=f2e23] [cursor=pointer]
    - generic [ref=f2e24]:
      - generic [ref=f2e25]: task-001 Order first 0/0 completed
      - generic [ref=f2e26]:
        - button "Open project" [ref=f2e27] [cursor=pointer]
        - button "Archive project" [ref=f2e28] [cursor=pointer]
    - generic [ref=f2e29]:
      - generic [ref=f2e30]: task-001 Order second 0/0 completed
      - generic [ref=f2e31]:
        - button "Open project" [ref=f2e32] [cursor=pointer]
        - button "Archive project" [ref=f2e33] [cursor=pointer]
    - generic [ref=f2e34]:
      - generic [ref=f2e35]: task-001 Persistence sentinel 0/0 completed
      - generic [ref=f2e36]:
        - button "Open project" [ref=f2e37] [cursor=pointer]
        - button "Archive project" [ref=f2e38] [cursor=pointer]
    - generic [ref=f2e39]:
      - generic [ref=f2e40]: task-002 Alpha create 0/0 completed
      - generic [ref=f2e41]:
        - button "Open project" [ref=f2e42] [cursor=pointer]
        - button "Archive project" [ref=f2e43] [cursor=pointer]
    - generic [ref=f2e44]:
      - generic [ref=f2e45]: task-002 Blank validation sentinel 0/0 completed
      - generic [ref=f2e46]:
        - button "Open project" [ref=f2e47] [cursor=pointer]
        - button "Archive project" [ref=f2e48] [cursor=pointer]
    - generic [ref=f2e49]:
      - generic [ref=f2e50]: task-002 Order first 0/0 completed
      - generic [ref=f2e51]:
        - button "Open project" [ref=f2e52] [cursor=pointer]
        - button "Archive project" [ref=f2e53] [cursor=pointer]
    - generic [ref=f2e54]:
      - generic [ref=f2e55]: task-002 Order second 0/0 completed
      - generic [ref=f2e56]:
        - button "Open project" [ref=f2e57] [cursor=pointer]
        - button "Archive project" [ref=f2e58] [cursor=pointer]
    - generic [ref=f2e59]:
      - generic [ref=f2e60]: task-002 Task reload 0/1 completed
      - generic [ref=f2e61]:
        - button "Open project" [ref=f2e62] [cursor=pointer]
        - button "Archive project" [ref=f2e63] [cursor=pointer]
    - generic [ref=f2e64]:
      - generic [ref=f2e65]: task-002 Task invalid 0/0 completed
      - generic [ref=f2e66]:
        - button "Open project" [ref=f2e67] [cursor=pointer]
        - button "Archive project" [ref=f2e68] [cursor=pointer]
    - generic [ref=f2e69]:
      - generic [ref=f2e70]: task-002 Task owner 0/1 completed
      - generic [ref=f2e71]:
        - button "Open project" [ref=f2e72] [cursor=pointer]
        - button "Archive project" [ref=f2e73] [cursor=pointer]
    - generic [ref=f2e74]:
      - generic [ref=f2e75]: task-002 Other project 0/0 completed
      - generic [ref=f2e76]:
        - button "Open project" [ref=f2e77] [cursor=pointer]
        - button "Archive project" [ref=f2e78] [cursor=pointer]
    - generic [ref=f2e79]:
      - generic [ref=f2e80]: task-002 Task filters 0/2 completed
      - generic [ref=f2e81]:
        - button "Open project" [ref=f2e82] [cursor=pointer]
        - button "Archive project" [ref=f2e83] [cursor=pointer]
    - generic [ref=f2e84]:
      - generic [ref=f2e85]: task-002 Persistence sentinel 1/1 completed
      - generic [ref=f2e86]:
        - button "Open project" [ref=f2e87] [cursor=pointer]
        - button "Archive project" [ref=f2e88] [cursor=pointer]
    - generic [ref=f2e89]:
      - generic [ref=f2e90]: task-003 Alpha create 0/0 completed
      - generic [ref=f2e91]:
        - button "Open project" [ref=f2e92] [cursor=pointer]
        - button "Archive project" [ref=f2e93] [cursor=pointer]
    - generic [ref=f2e94]:
      - generic [ref=f2e95]: task-003 Blank validation sentinel 0/0 completed
      - generic [ref=f2e96]:
        - button "Open project" [ref=f2e97] [cursor=pointer]
        - button "Archive project" [ref=f2e98] [cursor=pointer]
    - generic [ref=f2e99]:
      - generic [ref=f2e100]: task-003 Order first 0/0 completed
      - generic [ref=f2e101]:
        - button "Open project" [ref=f2e102] [cursor=pointer]
        - button "Archive project" [ref=f2e103] [cursor=pointer]
    - generic [ref=f2e104]:
      - generic [ref=f2e105]: task-003 Order second 0/0 completed
      - generic [ref=f2e106]:
        - button "Open project" [ref=f2e107] [cursor=pointer]
        - button "Archive project" [ref=f2e108] [cursor=pointer]
    - generic [ref=f2e109]:
      - generic [ref=f2e110]: task-003 Task reload 0/1 completed
      - generic [ref=f2e111]:
        - button "Open project" [ref=f2e112] [cursor=pointer]
        - button "Archive project" [ref=f2e113] [cursor=pointer]
    - generic [ref=f2e114]:
      - generic [ref=f2e115]: task-003 Task invalid 0/0 completed
      - generic [ref=f2e116]:
        - button "Open project" [ref=f2e117] [cursor=pointer]
        - button "Archive project" [ref=f2e118] [cursor=pointer]
    - generic [ref=f2e119]:
      - generic [ref=f2e120]: task-003 Task owner 0/1 completed
      - generic [ref=f2e121]:
        - button "Open project" [ref=f2e122] [cursor=pointer]
        - button "Archive project" [ref=f2e123] [cursor=pointer]
    - generic [ref=f2e124]:
      - generic [ref=f2e125]: task-003 Other project 0/0 completed
      - generic [ref=f2e126]:
        - button "Open project" [ref=f2e127] [cursor=pointer]
        - button "Archive project" [ref=f2e128] [cursor=pointer]
    - generic [ref=f2e129]:
      - generic [ref=f2e130]: task-003 Task filters 0/2 completed
      - generic [ref=f2e131]:
        - button "Open project" [ref=f2e132] [cursor=pointer]
        - button "Archive project" [ref=f2e133] [cursor=pointer]
    - generic [ref=f2e134]:
      - generic [ref=f2e135]: task-003 Archive lifecycle 0/0 completed
      - generic [ref=f2e136]:
        - button "Open project" [ref=f2e137] [cursor=pointer]
        - button "Archive project" [ref=f2e138] [cursor=pointer]
    - generic [ref=f2e139]:
      - generic [ref=f2e140]: task-003 Archive tasks 1/1 completed
      - generic [ref=f2e141]:
        - button "Open project" [ref=f2e142] [cursor=pointer]
        - button "Archive project" [ref=f2e143] [cursor=pointer]
    - generic [ref=f2e144]:
      - generic [ref=f2e145]: task-003 Summary project 1/2 completed
      - generic [ref=f2e146]:
        - button "Open project" [ref=f2e147] [cursor=pointer]
        - button "Archive project" [ref=f2e148] [cursor=pointer]
    - generic [ref=f2e149]:
      - generic [ref=f2e150]: task-003 Persistence sentinel 1/1 completed
      - generic [ref=f2e151]:
        - button "Open project" [ref=f2e152] [cursor=pointer]
        - button "Archive project" [active] [ref=f2e153] [cursor=pointer]
```

# Test source

```ts
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
> 171 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
      |                                                                                                 ^ Error: expect(locator).toHaveCount(expected) failed
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
  212 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  213 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  214 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  215 |     await openProject(page, 'Rename archive');
  216 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  217 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  218 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  219 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  220 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
  221 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  222 |     await openProject(page, 'Rename archive');
  223 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  224 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  225 |   });
  226 | }
  227 | 
```