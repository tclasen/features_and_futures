# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 011 seed process-restart persistence checks
- Location: runs/instruction-effects/eval-015/tasks/task-009/suite/workboard.spec.mjs:157:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "2028-02-29"
Received: ""

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=f1e2]:
  - button "Projects" [ref=f1e3] [cursor=pointer]
  - heading "task-009 Persistence renamed" [level=1] [ref=f1e4]
  - generic [ref=f1e5]:
    - textbox "New project name" [ref=f1e6]: task-009 Persistence renamed
    - button "Rename project" [ref=f1e7] [cursor=pointer]
  - combobox "Default task priority" [ref=f1e9]:
    - option "Low"
    - option "Normal" [selected]
    - option "High"
  - generic [ref=f1e10]:
    - textbox "Task title" [ref=f1e11]
    - button "Create task" [ref=f1e12] [cursor=pointer]
  - alert [ref=f1e13]: Due date must be a valid YYYY-MM-DD date
  - generic [ref=f1e14]:
    - combobox "Task filter" [ref=f1e15]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
    - combobox "Priority filter" [ref=f1e16]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - region "Tasks" [ref=f1e17]:
    - generic [ref=f1e18]:
      - generic [ref=f1e19]: Memory kept
      - checkbox "Complete Memory kept" [checked] [ref=f1e20]
      - combobox "Task priority" [ref=f1e21]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
      - generic [ref=f1e22]:
        - textbox "Task due date" [ref=f1e23]: 2028-02-29
        - button "Save due date" [active] [ref=f1e24] [cursor=pointer]
      - generic [ref=f1e25]:
        - textbox "New task title" [ref=f1e26]: Memory kept
        - button "Rename task" [ref=f1e27] [cursor=pointer]
```

# Test source

```ts
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
  110 |     await expect(projectRow(page, 'Archive lifecycle').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  111 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  112 |     await expect(projectRow(page, 'Archive lifecycle')).toBeVisible();
  113 |   });
  114 | 
  115 |   test('009 archived tasks are read-only and survive restoration', async ({ page }) => {
  116 |     await createProject(page, 'Archive tasks');
  117 |     await openProject(page, 'Archive tasks');
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
  164 |     if (stage >= 6) {
  165 |       await taskRow(page, 'Remember me').getByRole('combobox', {name:'Task priority', exact:true}).selectOption({label:'High'});
  166 |       await expectPersistedPriority(page, 'Persistence sentinel', 'Remember me', 'High');
  167 |     }
  168 |     if (stage >= 5) {
  169 |       await taskRow(page, 'Remember me').getByRole('textbox', { name: 'New task title', exact: true }).fill('Memory kept');
  170 |       await taskRow(page, 'Remember me').getByRole('button', { name: 'Rename task', exact: true }).click();
  171 |       await expect(page.getByRole('checkbox', { name: 'Complete Memory kept', exact: true })).toBeChecked();
  172 |     }
  173 |   }
  174 |   if (stage >= 4) {
  175 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  176 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  177 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  178 |   }
  179 |   if (stage >= 9) {
  180 |     const dateRow=taskRow(page,'Memory kept');
  181 |     await dateRow.getByRole('textbox',{name:'Task due date',exact:true}).fill('2028-02-29');
  182 |     await dateRow.getByRole('button',{name:'Save due date',exact:true}).click();
  183 |     const dateObserver=await page.context().newPage();
  184 |     try {
> 185 |       await expect.poll(async()=>{await dateObserver.goto('/');await openProject(dateObserver,'Persistence renamed');return taskRow(dateObserver,'Memory kept').getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2028-02-29');
      |                                                                                                                                                                                                                                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  186 |     } finally {await dateObserver.close();}
  187 |   }
  188 |   if (stage >= 8) {
  189 |     await page.getByRole('combobox', {name:'Default task priority', exact:true}).selectOption({label:'Low'});
  190 |     const observer=await page.context().newPage();
  191 |     try {
  192 |       await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Persistence renamed');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');
  193 |     } finally {await observer.close();}
  194 |   }
  195 |   if (stage >= 3) {
  196 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  197 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  198 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  199 |   }
  200 | });
  201 | 
  202 | if (stage >= 4) {
  203 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  204 |     await createProject(page, 'Identity first');
  205 |     await createProject(page, 'Identity second');
  206 |     await openProject(page, 'Identity first');
  207 |     const originalPath = new URL(page.url()).pathname;
  208 |     await createTask(page, 'Identity task');
  209 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  210 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  211 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  212 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  213 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  214 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  215 |     await page.reload();
  216 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  217 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  218 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  219 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  220 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  221 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  222 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  223 |     await openProject(page, 'Identity updated');
  224 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  225 |   });
  226 | 
  227 |   test('014 blank rename preserves original name', async ({ page }) => {
  228 |     await createProject(page, 'Rename invalid');
  229 |     await openProject(page, 'Rename invalid');
  230 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  231 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  232 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  233 |     await page.reload();
  234 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  235 |   });
  236 | 
  237 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  238 |     await createProject(page, 'Rename archive');
  239 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  240 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  241 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  242 |     await openProject(page, 'Rename archive');
  243 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  244 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  245 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  246 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  247 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();await expect(projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  248 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  249 |     await openProject(page, 'Rename archive');
  250 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  251 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  252 |   });
  253 | }
  254 | 
  255 | if (stage >= 5) {
  256 |   test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
  257 |     await createProject(page, 'Task rename identity');
  258 |     await openProject(page, 'Task rename identity');
  259 |     await createTask(page, 'Name initial');
  260 |     await createTask(page, 'Name second');
  261 |     await page.getByRole('checkbox', { name: 'Complete Name initial', exact: true }).check();
  262 |     await expectPersistedCompletion(page, 'Task rename identity', 'Name initial', true);
  263 |     await taskRow(page, 'Name initial').getByRole('textbox', { name: 'New task title', exact: true }).fill('  Name updated  ');
  264 |     await taskRow(page, 'Name initial').getByRole('button', { name: 'Rename task', exact: true }).click();
  265 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  266 |     await page.reload();
  267 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  268 |     const rows = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  269 |     expect(rows.findIndex(t => t.includes('Name updated'))).toBeLessThan(rows.findIndex(t => t.includes('Name second')));
  270 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  271 |     await expect(taskRow(page, 'Name updated')).toHaveCount(0);
  272 |     await expect(taskRow(page, 'Name second')).toBeVisible();
  273 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  274 |     await expect(taskRow(page, 'Name updated')).toBeVisible();
  275 |     await expect(taskRow(page, 'Name second')).toHaveCount(0);
  276 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  277 |     await expect(projectRow(page, 'Task rename identity').getByTestId('project-summary')).toHaveText('1/2 completed');
  278 |   });
  279 |   test('017 blank task rename preserves the original title', async ({ page }) => {
  280 |     await createProject(page, 'Task rename invalid');
  281 |     await openProject(page, 'Task rename invalid');
  282 |     await createTask(page, 'Kept title');
  283 |     await taskRow(page, 'Kept title').getByRole('textbox', { name: 'New task title', exact: true }).fill('   ');
  284 |     await taskRow(page, 'Kept title').getByRole('button', { name: 'Rename task', exact: true }).click();
  285 |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
```