# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workboard.spec.mjs >> 011 seed process-restart persistence checks
- Location: runs/instruction-effects/eval-014/tasks/task-011/suite/workboard.spec.mjs:157:1

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Remember me', exact: true }) }).visible().getByRole('combobox', { name: 'Destination project', exact: true })

```

# Page snapshot

```yaml
- generic [ref=f1e1]:
  - banner [ref=f1e2]: Workboard
  - main [ref=f1e3]:
    - button "Projects" [ref=f1e4] [cursor=pointer]
    - heading "task-011 Transfer restart origin" [level=1] [ref=f1e5]
    - generic [ref=f1e6]:
      - textbox "New project name" [ref=f1e7]: task-011 Transfer restart origin
      - button "Rename project" [ref=f1e8] [cursor=pointer]
    - generic [ref=f1e9]:
      - text: Default task priority
      - combobox "Default task priority" [ref=f1e10]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
    - generic [ref=f1e11]:
      - textbox "Task title" [ref=f1e12]
      - button "Create task" [active] [ref=f1e13] [cursor=pointer]
    - generic [ref=f1e14]:
      - text: Task filter
      - combobox "Task filter" [ref=f1e15]:
        - option "All" [selected]
        - option "Open"
        - option "Completed"
    - generic [ref=f1e16]:
      - text: Priority filter
      - combobox "Priority filter" [ref=f1e17]:
        - option "All" [selected]
        - option "Low"
        - option "Normal"
        - option "High"
    - generic [ref=f1e18]:
      - text: Due from
      - textbox "Due from" [ref=f1e19]
    - generic [ref=f1e20]:
      - text: Due through
      - textbox "Due through" [ref=f1e21]
    - button "Apply due range" [ref=f1e22] [cursor=pointer]
    - generic [ref=f1e24]:
      - generic [ref=f1e25]: Remember me
      - checkbox "Complete Remember me" [ref=f1e27]
      - textbox "New task title" [ref=f1e28]: Remember me
      - button "Rename task" [ref=f1e29] [cursor=pointer]
      - combobox "Task priority" [ref=f1e30]:
        - option "Low"
        - option "Normal" [selected]
        - option "High"
      - textbox "Task due date" [ref=f1e31]
      - button "Save due date" [ref=f1e32] [cursor=pointer]
```

# Test source

```ts
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
  161 |     if(stage>=11) {
  162 |       await createProject(page,'Transfer restart origin');await openProject(page,'Transfer restart origin');await createTask(page,'Remember me');
> 163 |       await taskRow(page,'Remember me').getByRole('combobox',{name:'Destination project',exact:true}).selectOption({label:projectName('Persistence sentinel')});
      |                                                                                                       ^ Error: locator.selectOption: Test timeout of 20000ms exceeded.
  164 |       await taskRow(page,'Remember me').getByRole('button',{name:'Move task',exact:true}).click();
  165 |       await expect(taskRow(page,'Remember me')).toHaveCount(0);
  166 |       await page.goto('/');await openProject(page,'Persistence sentinel');await expect(taskRow(page,'Remember me')).toBeVisible();
  167 |     } else {await createTask(page, 'Remember me');}
  168 |     await page.getByRole('checkbox', { name: 'Complete Remember me', exact: true }).check();
  169 |     await expectPersistedCompletion(page, 'Persistence sentinel', 'Remember me', true);
  170 |     if (stage >= 6) {
  171 |       await taskRow(page, 'Remember me').getByRole('combobox', {name:'Task priority', exact:true}).selectOption({label:'High'});
  172 |       await expectPersistedPriority(page, 'Persistence sentinel', 'Remember me', 'High');
  173 |     }
  174 |     if (stage >= 5) {
  175 |       await taskRow(page, 'Remember me').getByRole('textbox', { name: 'New task title', exact: true }).fill('Memory kept');
  176 |       await taskRow(page, 'Remember me').getByRole('button', { name: 'Rename task', exact: true }).click();
  177 |       await expect(page.getByRole('checkbox', { name: 'Complete Memory kept', exact: true })).toBeChecked();
  178 |     }
  179 |   }
  180 |   if (stage >= 4) {
  181 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill(projectName('Persistence renamed'));
  182 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  183 |     await expect(page.getByRole('heading', { name: projectName('Persistence renamed'), exact: true }).first()).toBeVisible();
  184 |   }
  185 |   if (stage >= 9) {
  186 |     const dateRow=taskRow(page,'Memory kept');
  187 |     await dateRow.getByRole('textbox',{name:'Task due date',exact:true}).fill('2028-02-29');
  188 |     await dateRow.getByRole('button',{name:'Save due date',exact:true}).click();
  189 |     const dateObserver=await page.context().newPage();
  190 |     try {
  191 |       await expect.poll(async()=>{await dateObserver.goto('/');await openProject(dateObserver,'Persistence renamed');return taskRow(dateObserver,'Memory kept').getByRole('textbox',{name:'Task due date',exact:true}).inputValue();},{timeout:5000}).toBe('2028-02-29');
  192 |     } finally {await dateObserver.close();}
  193 |   }
  194 |   if (stage >= 8) {
  195 |     await page.getByRole('combobox', {name:'Default task priority', exact:true}).selectOption({label:'Low'});
  196 |     const observer=await page.context().newPage();
  197 |     try {
  198 |       await expect.poll(async()=>{await observer.goto('/');await openProject(observer,'Persistence renamed');return observer.getByRole('combobox',{name:'Default task priority',exact:true}).locator('option:checked').textContent();},{timeout:5000}).toBe('Low');
  199 |     } finally {await observer.close();}
  200 |   }
  201 |   if (stage >= 3) {
  202 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  203 |     await projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByRole('button', { name: 'Archive project', exact: true }).click();
  204 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toHaveCount(0);
  205 |   }
  206 | });
  207 | 
  208 | if (stage >= 4) {
  209 |   test('013 rename preserves project URL, task state, summary and creation order', async ({ page }) => {
  210 |     await createProject(page, 'Identity first');
  211 |     await createProject(page, 'Identity second');
  212 |     await openProject(page, 'Identity first');
  213 |     const originalPath = new URL(page.url()).pathname;
  214 |     await createTask(page, 'Identity task');
  215 |     await page.getByRole('checkbox', { name: 'Complete Identity task', exact: true }).check();
  216 |     await expectPersistedCompletion(page, 'Identity first', 'Identity task', true);
  217 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('  ' + projectName('Identity updated') + '  ');
  218 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  219 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  220 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  221 |     await page.reload();
  222 |     await expect(page.getByRole('heading', { name: projectName('Identity updated'), exact: true }).first()).toBeVisible();
  223 |     await expect(page.getByRole('checkbox', { name: 'Complete Identity task', exact: true })).toBeChecked();
  224 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  225 |     await expect(projectRow(page, 'Identity first')).toHaveCount(0);
  226 |     await expect(projectRow(page, 'Identity updated').getByTestId('project-summary')).toHaveText('1/1 completed');
  227 |     const rows = await page.getByTestId('project-row').filter({ visible: true }).allTextContents();
  228 |     expect(rows.findIndex(t => t.includes(projectName('Identity updated')))).toBeLessThan(rows.findIndex(t => t.includes(projectName('Identity second'))));
  229 |     await openProject(page, 'Identity updated');
  230 |     expect(new URL(page.url()).pathname).toBe(originalPath);
  231 |   });
  232 | 
  233 |   test('014 blank rename preserves original name', async ({ page }) => {
  234 |     await createProject(page, 'Rename invalid');
  235 |     await openProject(page, 'Rename invalid');
  236 |     await page.getByRole('textbox', { name: 'New project name', exact: true }).fill('   ');
  237 |     await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  238 |     await expect(requiredAlert(page, 'Project name is required')).toContainText('Project name is required');
  239 |     await page.reload();
  240 |     await expect(page.getByRole('heading', { name: projectName('Rename invalid'), exact: true }).first()).toBeVisible();
  241 |   });
  242 | 
  243 |   test('015 archived rename controls become available after restoration', async ({ page }) => {
  244 |     await createProject(page, 'Rename archive');
  245 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Archive project', exact: true }).click();
  246 |     await expect(projectRow(page, 'Rename archive')).toHaveCount(0);
  247 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  248 |     await openProject(page, 'Rename archive');
  249 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeDisabled();
  250 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeDisabled();
  251 |     await page.getByRole('button', { name: 'Projects', exact: true }).click();
  252 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  253 |     await projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true }).click();await expect(projectRow(page, 'Rename archive').getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
  254 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Active' });
  255 |     await openProject(page, 'Rename archive');
  256 |     await expect(page.getByRole('textbox', { name: 'New project name', exact: true })).toBeEnabled();
  257 |     await expect(page.getByRole('button', { name: 'Rename project', exact: true })).toBeEnabled();
  258 |   });
  259 | }
  260 | 
  261 | if (stage >= 5) {
  262 |   test('016 task rename preserves completion, order, filter membership and summary', async ({ page }) => {
  263 |     await createProject(page, 'Task rename identity');
```