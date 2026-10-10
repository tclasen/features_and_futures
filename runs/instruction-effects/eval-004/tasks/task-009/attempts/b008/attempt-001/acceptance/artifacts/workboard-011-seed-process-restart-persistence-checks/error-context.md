# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 011 seed process-restart persistence checks
- Location: runs/instruction-effects/eval-004/tasks/task-009/suite/workboard.spec.mjs:155:1

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
  - alert [ref=f1e5]: Due date must be a valid YYYY-MM-DD date
  - generic [ref=f1e6]:
    - generic [ref=f1e7]:
      - generic [ref=f1e8]: New project name
      - textbox "New project name" [ref=f1e9]
    - button "Rename project" [ref=f1e10] [cursor=pointer]
  - generic [ref=f1e11]:
    - generic [ref=f1e12]:
      - generic [ref=f1e13]: Task title
      - textbox "Task title" [ref=f1e14]
    - button "Create task" [ref=f1e15] [cursor=pointer]
  - generic [ref=f1e16]:
    - generic [ref=f1e17]: Task filter
    - combobox "Task filter" [ref=f1e18]:
      - option "All" [selected]
      - option "Open"
      - option "Completed"
  - generic [ref=f1e19]:
    - generic [ref=f1e20]: Priority filter
    - combobox "Priority filter" [ref=f1e21]:
      - option "All" [selected]
      - option "Low"
      - option "Normal"
      - option "High"
  - generic [ref=f1e22]:
    - generic [ref=f1e23]: Default task priority
    - combobox "Default task priority" [ref=f1e24]:
      - option "Low"
      - option "Normal" [selected]
      - option "High"
  - region "Tasks" [ref=f1e25]:
    - generic [ref=f1e26]:
      - generic [ref=f1e27]: Memory kept
      - checkbox "Complete Memory kept" [checked] [ref=f1e28]
      - generic [ref=f1e29]:
        - generic [ref=f1e30]:
          - text: New task title
          - textbox "New task title" [ref=f1e31]
        - button "Rename task" [ref=f1e32] [cursor=pointer]
      - generic [ref=f1e33]:
        - text: Task due date
        - textbox "Task due date" [ref=f1e34]:
          - /placeholder: YYYY-MM-DD
          - text: 2028-02-29
      - button "Save due date" [active] [ref=f1e35] [cursor=pointer]
      - generic [ref=f1e36]:
        - text: Task priority
        - combobox "Task priority" [ref=f1e37]:
          - option "Low"
          - option "Normal"
          - option "High" [selected]
```

# Test source

```ts
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
  177 |   if (stage >= 9) {
  178 |     const dateRow=taskRow(page,'Memory kept');
  179 |     await dateRow.getByRole('textbox',{name:'Task due date',exact:true}).fill('2028-02-29');
  180 |     await dateRow.getByRole('button',{name:'Save due date',exact:true}).click();
  181 |     const dateObserver=await page.context().newPage();
  182 |     try {
> 183 |       await expect.poll(async()=>{await dateObserver.goto('/');await openProject(dateObserver,'Persistence renamed');return taskRow(dateObserver,'Memory kept').getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2028-02-29');
      |                                                                                                                                                                                                                                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  184 |     } finally {await dateObserver.close();}
  185 |   }
  186 |   if (stage >= 8) {
  187 |     await page.getByRole('combobox', {name:'Default task priority', exact:true}).selectOption({label:'Low'});
  188 |     const observer=await page.context().newPage();
  189 |     try {
  190 |       await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Persistence renamed');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');
  191 |     } finally {await observer.close();}
  192 |   }
  193 |   if (stage >= 3) {
  194 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  195 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  196 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  197 |   }
  198 | });
  199 | 
  200 | if (stage >= 4) {
  201 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  202 |     await createProject(page, 'Identity first');
  203 |     await createProject(page, 'Identity second');
  204 |     await openProject(page, 'Identity first');
  205 |     const originalPath = new URL(page.url()).pathname;
  206 |     await createTask(page, 'Identity task');
  207 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  208 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  209 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  210 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  211 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  212 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  213 |     await page.reload();
  214 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  215 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  216 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  217 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  218 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  219 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  220 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  221 |     await openProject(page, 'Identity updated');
  222 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  223 |   });
  224 | 
  225 |   test('014 blank rename preserves original name', async ({ page }) => {
  226 |     await createProject(page, 'Rename invalid');
  227 |     await openProject(page, 'Rename invalid');
  228 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  229 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  230 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  231 |     await page.reload();
  232 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  233 |   });
  234 | 
  235 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  236 |     await createProject(page, 'Rename archive');
  237 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  238 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  239 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  240 |     await openProject(page, 'Rename archive');
  241 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  242 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  243 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  244 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  245 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();
  246 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  247 |     await openProject(page, 'Rename archive');
  248 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  249 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  250 |   });
  251 | }
  252 | 
  253 | if (stage >= 5) {
  254 |   test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
  255 |     await createProject(page, 'Task rename identity');
  256 |     await openProject(page, 'Task rename identity');
  257 |     await createTask(page, 'Name initial');
  258 |     await createTask(page, 'Name second');
  259 |     await page.getByRole('checkbox', { name: 'Complete Name initial', exact: true }).check();
  260 |     await expectPersistedCompletion(page, 'Task rename identity', 'Name initial', true);
  261 |     await taskRow(page, 'Name initial').getByRole('textbox', { name: 'New task title', exact: true }).fill('  Name updated  ');
  262 |     await taskRow(page, 'Name initial').getByRole('button', { name: 'Rename task', exact: true }).click();
  263 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  264 |     await page.reload();
  265 |     await expect(page.getByRole('checkbox', { name: 'Complete Name updated', exact: true })).toBeChecked();
  266 |     const rows = await page.getByTestId('task-row').filter({ visible: true }).allTextContents();
  267 |     expect(rows.findIndex(t => t.includes('Name updated'))).toBeLessThan(rows.findIndex(t => t.includes('Name second')));
  268 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Open' });
  269 |     await expect(taskRow(page, 'Name updated')).toHaveCount(0);
  270 |     await expect(taskRow(page, 'Name second')).toBeVisible();
  271 |     await page.getByRole('combobox', { name: 'Task filter', exact: true }).selectOption({ label: 'Completed' });
  272 |     await expect(taskRow(page, 'Name updated')).toBeVisible();
  273 |     await expect(taskRow(page, 'Name second')).toHaveCount(0);
  274 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  275 |     await expect(projectRow(page, 'Task rename identity').getByTestId('project-summary')).toHaveText('1/2 completed');
  276 |   });
  277 |   test('017 blank task rename preserves the original title', async ({ page }) => {
  278 |     await createProject(page, 'Task rename invalid');
  279 |     await openProject(page, 'Task rename invalid');
  280 |     await createTask(page, 'Kept title');
  281 |     await taskRow(page, 'Kept title').getByRole('textbox', { name: 'New task title', exact: true }).fill('   ');
  282 |     await taskRow(page, 'Kept title').getByRole('button', { name: 'Rename task', exact: true }).click();
  283 |     await expect(requiredAlert(page, 'Task title is required')).toContainText('Task title is required');
```