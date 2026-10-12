# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 017 blank task rename preserves the original title
- Location: runs/instruction-effects/eval-016/tasks/task-005/suite/workboard.spec.mjs:259:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('alert').filter({ hasText: 'Task title is required' }).visible().first()
Expected substring: "Task title is required"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" getByRole('alert').filter({ hasText: 'Task title is required' }).visible().first() with timeout 5000ms
  - waiting for getByRole('alert').filter({ hasText: 'Task title is required' }).visible().first()

```

```yaml
- main:
  - heading "Workboard" [level=1]:
    - link "Workboard":
      - /url: /
  - button "Projects"
  - heading "task-005 Task rename invalid" [level=2]
  - text: New project name
  - textbox "New project name": task-005 Task rename invalid
  - button "Rename project"
  - text: Task title
  - textbox "Task title"
  - button "Create task"
  - text: Task filter
  - combobox "Task filter":
    - option "All" [selected]
    - option "Open"
    - option "Completed"
  - text: Kept title
  - checkbox "Complete Kept title"
  - textbox "New task title"
  - button "Rename task"
```

# Test source

```ts
  165 |       await taskRow(page, 'Remember me').getByRole('textbox', { name: 'New task title', exact: true }).fill('Memory kept');
  166 |       await taskRow(page, 'Remember me').getByRole('button', { name: 'Rename task', exact: true }).click();
  167 |       await expect(page.getByRole('checkbox', { name: 'Complete Memory kept', exact: true })).toBeChecked();
  168 |     }
  169 |   }
  170 |   if (stage >= 4) {
  171 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  172 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  173 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  174 |   }
  175 |   if (stage >= 3) {
  176 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  177 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  178 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  179 |   }
  180 | });
  181 | 
  182 | if (stage >= 4) {
  183 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  184 |     await createProject(page, 'Identity first');
  185 |     await createProject(page, 'Identity second');
  186 |     await openProject(page, 'Identity first');
  187 |     const originalPath = new URL(page.url()).pathname;
  188 |     await createTask(page, 'Identity task');
  189 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  190 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  191 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  192 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  193 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  194 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  195 |     await page.reload();
  196 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  197 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  198 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  199 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  200 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  201 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  202 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  203 |     await openProject(page, 'Identity updated');
  204 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  205 |   });
  206 | 
  207 |   test('014 blank rename preserves original name', async ({ page }) => {
  208 |     await createProject(page, 'Rename invalid');
  209 |     await openProject(page, 'Rename invalid');
  210 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  211 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  212 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  213 |     await page.reload();
  214 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  215 |   });
  216 | 
  217 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  218 |     await createProject(page, 'Rename archive');
  219 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  220 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  221 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  222 |     await openProject(page, 'Rename archive');
  223 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  224 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  225 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  226 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  227 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();await expect(projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  228 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  229 |     await openProject(page, 'Rename archive');
  230 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  231 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  232 |   });
  233 | }
  234 | 
  235 | if (stage >= 5) {
  236 |   test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
  237 |     await createProject(page, 'Task rename identity');
  238 |     await openProject(page, 'Task rename identity');
  239 |     await createTask(page, 'Name initial');
  240 |     await createTask(page, 'Name second');
  241 |     await page.getByRole('checkbox', { name: 'Complete Name initial', exact: true }).check();
  242 |     await expectPersistedCompletion(page, 'Task rename identity', 'Name initial', true);
  243 |     await taskRow(page, 'Name initial').getByRole('textbox', { name: 'New task title', exact: true }).fill('  Name updated  ');
  244 |     await taskRow(page, 'Name initial').getByRole('button', { name: 'Rename task', exact: true }).click();
  245 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  246 |     await page.reload();
  247 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  248 |     const rows = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  249 |     expect(rows.findIndex(t => t.includes('Name updated'))).toBeLessThan(rows.findIndex(t => t.includes('Name second')));
  250 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  251 |     await expect(taskRow(page, 'Name updated')).toHaveCount(0);
  252 |     await expect(taskRow(page, 'Name second')).toBeVisible();
  253 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  254 |     await expect(taskRow(page, 'Name updated')).toBeVisible();
  255 |     await expect(taskRow(page, 'Name second')).toHaveCount(0);
  256 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  257 |     await expect(projectRow(page, 'Task rename identity').getByTestId('project-summary')).toHaveText('1/2 completed');
  258 |   });
  259 |   test('017 blank task rename preserves the original title', async ({ page }) => {
  260 |     await createProject(page, 'Task rename invalid');
  261 |     await openProject(page, 'Task rename invalid');
  262 |     await createTask(page, 'Kept title');
  263 |     await taskRow(page, 'Kept title').getByRole('textbox', { name: 'New task title', exact: true }).fill('   ');
  264 |     await taskRow(page, 'Kept title').getByRole('button', { name: 'Rename task', exact: true }).click();
> 265 |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
      |                                                                 ^ Error: expect(locator).toContainText(expected) failed
  266 |     await page.reload();
  267 |     await expect(page.getByRole('checkbox', { name: 'Complete Kept title', exact: true })).toBeVisible();
  268 |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(1);
  269 |   });
  270 |   test('018 archived task rename controls become enabled after restoration', async ({ page }) => {
  271 |     await createProject(page, 'Task rename archive');
  272 |     await openProject(page, 'Task rename archive');
  273 |     await createTask(page, 'Archived title');
  274 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  275 |     await projectRow(page, 'Task rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  276 |     await expect(projectRow(page, 'Task rename archive')).toHaveCount(0);
  277 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  278 |     await openProject(page, 'Task rename archive');
  279 |     await expect(taskRow(page, 'Archived title').getByRole('textbox', { name: 'New task title', exact: true })).toBeDisabled();
  280 |     await expect(taskRow(page, 'Archived title').getByRole('button', { name: 'Rename task', exact: true })).toBeDisabled();
  281 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  282 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  283 |     await projectRow(page, 'Task rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();await expect(projectRow(page, 'Task rename archive').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  284 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  285 |     await openProject(page, 'Task rename archive');
  286 |     await expect(taskRow(page, 'Archived title').getByRole('textbox', { name: 'New task title', exact: true })).toBeEnabled();
  287 |     await expect(taskRow(page, 'Archived title').getByRole('button', { name: 'Rename task', exact: true })).toBeEnabled();
  288 |   });
  289 | }
  290 | 
```