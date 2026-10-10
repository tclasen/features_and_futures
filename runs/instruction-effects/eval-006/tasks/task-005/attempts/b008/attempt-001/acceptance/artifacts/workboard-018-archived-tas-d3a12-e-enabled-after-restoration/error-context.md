# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 018 archived task rename controls become enabled after restoration
- Location: runs/instruction-effects/eval-006/tasks/task-005/suite/workboard.spec.mjs:268:3

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator: getByTestId('task-row').filter({ hasText: 'Archived title' }).visible().getByRole('textbox', { name: 'New task title', exact: true })
Expected: disabled
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeDisabled" getByTestId('task-row').filter({ hasText: 'Archived title' }).visible().getByRole('textbox', { name: 'New task title', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ hasText: 'Archived title' }).visible().getByRole('textbox', { name: 'New task title', exact: true })

```

```yaml
- main:
  - button "Projects"
  - heading "task-005 Task rename archive" [level=1]
  - paragraph: Archived project
  - text: New project name
  - textbox "New project name" [disabled]: task-005 Task rename archive
  - button "Rename project" [disabled]
  - text: Task title
  - textbox "Task title" [disabled]
  - button "Create task" [disabled]
  - alert
  - text: Task filter
  - combobox "Task filter":
    - option "All" [selected]
    - option "Open"
    - option "Completed"
  - region "Tasks":
    - text: Archived title
    - checkbox "Complete Archived title" [disabled]
```

# Test source

```ts
  177 |   }
  178 | });
  179 | 
  180 | if (stage >= 4) {
  181 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  182 |     await createProject(page, 'Identity first');
  183 |     await createProject(page, 'Identity second');
  184 |     await openProject(page, 'Identity first');
  185 |     const originalPath = new URL(page.url()).pathname;
  186 |     await createTask(page, 'Identity task');
  187 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  188 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  189 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  190 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  191 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  192 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  193 |     await page.reload();
  194 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  195 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  196 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  197 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  198 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  199 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  200 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  201 |     await openProject(page, 'Identity updated');
  202 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  203 |   });
  204 | 
  205 |   test('014 blank rename preserves original name', async ({ page }) => {
  206 |     await createProject(page, 'Rename invalid');
  207 |     await openProject(page, 'Rename invalid');
  208 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  209 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  210 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  211 |     await page.reload();
  212 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  213 |   });
  214 | 
  215 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  216 |     await createProject(page, 'Rename archive');
  217 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  218 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  219 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  220 |     await openProject(page, 'Rename archive');
  221 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  222 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  223 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  224 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  225 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
  226 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  227 |     await openProject(page, 'Rename archive');
  228 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  229 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  230 |   });
  231 | }
  232 | 
  233 | if (stage >= 5) {
  234 |   test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
  235 |     await createProject(page, 'Task rename identity');
  236 |     await openProject(page, 'Task rename identity');
  237 |     await createTask(page, 'Name initial');
  238 |     await createTask(page, 'Name second');
  239 |     await page.getByRole('checkbox', { name: 'Complete Name initial', exact: true }).check();
  240 |     await expectPersistedCompletion(page, 'Task rename identity', 'Name initial', true);
  241 |     await taskRow(page, 'Name initial').getByRole('textbox', { name: 'New task title', exact: true }).fill('  Name updated  ');
  242 |     await taskRow(page, 'Name initial').getByRole('button', { name: 'Rename task', exact: true }).click();
  243 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  244 |     await page.reload();
  245 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  246 |     const rows = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  247 |     expect(rows.findIndex(t => t.includes('Name updated'))).toBeLessThan(rows.findIndex(t => t.includes('Name second')));
  248 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  249 |     await expect(taskRow(page, 'Name updated')).toHaveCount(0);
  250 |     await expect(taskRow(page, 'Name second')).toBeVisible();
  251 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  252 |     await expect(taskRow(page, 'Name updated')).toBeVisible();
  253 |     await expect(taskRow(page, 'Name second')).toHaveCount(0);
  254 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  255 |     await expect(projectRow(page, 'Task rename identity').getByTestId('project-summary')).toHaveText('1/2 completed');
  256 |   });
  257 |   test('017 blank task rename preserves the original title', async ({ page }) => {
  258 |     await createProject(page, 'Task rename invalid');
  259 |     await openProject(page, 'Task rename invalid');
  260 |     await createTask(page, 'Kept title');
  261 |     await taskRow(page, 'Kept title').getByRole('textbox', { name: 'New task title', exact: true }).fill('   ');
  262 |     await taskRow(page, 'Kept title').getByRole('button', { name: 'Rename task', exact: true }).click();
  263 |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
  264 |     await page.reload();
  265 |     await expect(page.getByRole('checkbox', { name: 'Complete Kept title', exact: true })).toBeVisible();
  266 |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(1);
  267 |   });
  268 |   test('018 archived task rename controls become enabled after restoration', async ({ page }) => {
  269 |     await createProject(page, 'Task rename archive');
  270 |     await openProject(page, 'Task rename archive');
  271 |     await createTask(page, 'Archived title');
  272 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  273 |     await projectRow(page, 'Task rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  274 |     await expect(projectRow(page, 'Task rename archive')).toHaveCount(0);
  275 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  276 |     await openProject(page, 'Task rename archive');
> 277 |     await expect(taskRow(page, 'Archived title').getByRole('textbox', { name: 'New task title', exact: true })).toBeDisabled();
      |                                                                                                                 ^ Error: expect(locator).toBeDisabled() failed
  278 |     await expect(taskRow(page, 'Archived title').getByRole('button', { name: 'Rename task', exact: true })).toBeDisabled();
  279 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  280 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  281 |     await projectRow(page, 'Task rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
  282 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  283 |     await openProject(page, 'Task rename archive');
  284 |     await expect(taskRow(page, 'Archived title').getByRole('textbox', { name: 'New task title', exact: true })).toBeEnabled();
  285 |     await expect(taskRow(page, 'Archived title').getByRole('button', { name: 'Rename task', exact: true })).toBeEnabled();
  286 |   });
  287 | }
  288 | 
```