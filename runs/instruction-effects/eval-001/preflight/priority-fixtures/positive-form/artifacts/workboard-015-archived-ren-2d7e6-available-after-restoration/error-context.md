# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 015 archived rename controls become available after restoration
- Location: runs/instruction-effects/eval-001/decisions/task-006-draft/suite/workboard.spec.mjs:219:3

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator:  getByRole('textbox', { name: 'New project name', exact: true })
Expected: disabled
Received: enabled
Timeout:  5000ms

Call log:
  - Expect "toBeDisabled" getByRole('textbox', { name: 'New project name', exact: true }) with timeout 5000ms
  - waiting for getByRole('textbox', { name: 'New project name', exact: true })
    14 × locator resolved to <input value="" name="name"/>
       - unexpected value "enabled"

```

```yaml
- textbox "New project name"
```

# Test source

```ts
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
  162 |     if (stage >= 6) {
  163 |       await taskRow(page, 'Remember me').getByRole('combobox', {name:'Task priority', exact:true}).selectOption({label:'High'});
  164 |       await expectPersistedPriority(page, 'Persistence sentinel', 'Remember me', 'High');
  165 |     }
  166 |     if (stage >= 5) {
  167 |       await taskRow(page, 'Remember me').getByRole('textbox', { name: 'New task title', exact: true }).fill('Memory kept');
  168 |       await taskRow(page, 'Remember me').getByRole('button', { name: 'Rename task', exact: true }).click();
  169 |       await expect(page.getByRole('checkbox', { name: 'Complete Memory kept', exact: true })).toBeChecked();
  170 |     }
  171 |   }
  172 |   if (stage >= 4) {
  173 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  174 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  175 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  176 |   }
  177 |   if (stage >= 3) {
  178 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  179 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  180 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  181 |   }
  182 | });
  183 | 
  184 | if (stage >= 4) {
  185 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  186 |     await createProject(page, 'Identity first');
  187 |     await createProject(page, 'Identity second');
  188 |     await openProject(page, 'Identity first');
  189 |     const originalPath = new URL(page.url()).pathname;
  190 |     await createTask(page, 'Identity task');
  191 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  192 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  193 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  194 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  195 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  196 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  197 |     await page.reload();
  198 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  199 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  200 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  201 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  202 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  203 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  204 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  205 |     await openProject(page, 'Identity updated');
  206 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  207 |   });
  208 | 
  209 |   test('014 blank rename preserves original name', async ({ page }) => {
  210 |     await createProject(page, 'Rename invalid');
  211 |     await openProject(page, 'Rename invalid');
  212 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  213 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  214 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  215 |     await page.reload();
  216 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  217 |   });
  218 | 
  219 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  220 |     await createProject(page, 'Rename archive');
  221 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  222 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  223 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  224 |     await openProject(page, 'Rename archive');
> 225 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
      |                                                                                        ^ Error: expect(locator).toBeDisabled() failed
  226 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  227 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  228 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  229 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
  230 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  231 |     await openProject(page, 'Rename archive');
  232 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  233 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  234 |   });
  235 | }
  236 | 
  237 | if (stage >= 5) {
  238 |   test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
  239 |     await createProject(page, 'Task rename identity');
  240 |     await openProject(page, 'Task rename identity');
  241 |     await createTask(page, 'Name initial');
  242 |     await createTask(page, 'Name second');
  243 |     await page.getByRole('checkbox', { name: 'Complete Name initial', exact: true }).check();
  244 |     await expectPersistedCompletion(page, 'Task rename identity', 'Name initial', true);
  245 |     await taskRow(page, 'Name initial').getByRole('textbox', { name: 'New task title', exact: true }).fill('  Name updated  ');
  246 |     await taskRow(page, 'Name initial').getByRole('button', { name: 'Rename task', exact: true }).click();
  247 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  248 |     await page.reload();
  249 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  250 |     const rows = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  251 |     expect(rows.findIndex(t => t.includes('Name updated'))).toBeLessThan(rows.findIndex(t => t.includes('Name second')));
  252 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  253 |     await expect(taskRow(page, 'Name updated')).toHaveCount(0);
  254 |     await expect(taskRow(page, 'Name second')).toBeVisible();
  255 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  256 |     await expect(taskRow(page, 'Name updated')).toBeVisible();
  257 |     await expect(taskRow(page, 'Name second')).toHaveCount(0);
  258 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  259 |     await expect(projectRow(page, 'Task rename identity').getByTestId('project-summary')).toHaveText('1/2 completed');
  260 |   });
  261 |   test('017 blank task rename preserves the original title', async ({ page }) => {
  262 |     await createProject(page, 'Task rename invalid');
  263 |     await openProject(page, 'Task rename invalid');
  264 |     await createTask(page, 'Kept title');
  265 |     await taskRow(page, 'Kept title').getByRole('textbox', { name: 'New task title', exact: true }).fill('   ');
  266 |     await taskRow(page, 'Kept title').getByRole('button', { name: 'Rename task', exact: true }).click();
  267 |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
  268 |     await page.reload();
  269 |     await expect(page.getByRole('checkbox', { name: 'Complete Kept title', exact: true })).toBeVisible();
  270 |     await expect(page.getByTestId('task-row').filter({ visible: true })).toHaveCount(1);
  271 |   });
  272 |   test('018 archived task rename controls become enabled after restoration', async ({ page }) => {
  273 |     await createProject(page, 'Task rename archive');
  274 |     await openProject(page, 'Task rename archive');
  275 |     await createTask(page, 'Archived title');
  276 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  277 |     await projectRow(page, 'Task rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  278 |     await expect(projectRow(page, 'Task rename archive')).toHaveCount(0);
  279 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  280 |     await openProject(page, 'Task rename archive');
  281 |     await expect(taskRow(page, 'Archived title').getByRole('textbox', { name: 'New task title', exact: true })).toBeDisabled();
  282 |     await expect(taskRow(page, 'Archived title').getByRole('button', { name: 'Rename task', exact: true })).toBeDisabled();
  283 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  284 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  285 |     await projectRow(page, 'Task rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
  286 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  287 |     await openProject(page, 'Task rename archive');
  288 |     await expect(taskRow(page, 'Archived title').getByRole('textbox', { name: 'New task title', exact: true })).toBeEnabled();
  289 |     await expect(taskRow(page, 'Archived title').getByRole('button', { name: 'Rename task', exact: true })).toBeEnabled();
  290 |   });
  291 | }
  292 | 
```