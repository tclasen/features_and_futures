# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 015 archived rename controls become available after restoration
- Location: runs/instruction-effects/eval-015/definitions/project/acceptance/workboard.spec.mjs:212:3

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator: getByRole('textbox', { name: 'New project name', exact: true })
Expected: disabled
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeDisabled" getByRole('textbox', { name: 'New project name', exact: true }) with timeout 5000ms
  - waiting for getByRole('textbox', { name: 'New project name', exact: true })

```

```yaml
- main:
  - button "Projects"
  - heading "task-004 Rename archive" [level=1]
  - paragraph: Archived project
  - text: Task title
  - textbox "Task title" [disabled]
  - button "Create task" [disabled]
  - text: Task filter
  - combobox "Task filter":
    - option "All" [selected]
    - option "Open"
    - option "Completed"
  - region "Tasks"
```

# Test source

```ts
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
  211 | 
  212 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  213 |     await createProject(page, 'Rename archive');
  214 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  215 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  216 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  217 |     await openProject(page, 'Rename archive');
> 218 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
      |                                                                                        ^ Error: expect(locator).toBeDisabled() failed
  219 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  220 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  221 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  222 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();await expect(projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  223 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  224 |     await openProject(page, 'Rename archive');
  225 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  226 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  227 |   });
  228 | }
  229 | 
```