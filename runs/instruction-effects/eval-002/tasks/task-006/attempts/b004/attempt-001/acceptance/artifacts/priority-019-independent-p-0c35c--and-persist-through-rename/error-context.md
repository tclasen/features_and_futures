# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority.spec.mjs >> 019 independent priorities default to Normal and persist through rename
- Location: runs/instruction-effects/eval-002/tasks/task-006/suite/priority.spec.mjs:19:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('task-row').filter({ hasText: 'Priority first' }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked')
Expected: "Normal"
Received: "Low"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByTestId('task-row').filter({ hasText: 'Priority first' }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked') with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ hasText: 'Priority first' }).visible().getByRole('combobox', { name: 'Task priority', exact: true }).locator('option:checked')
    14 × locator resolved to <option>Low</option>
       - unexpected value "Low"

```

```yaml
- main:
  - button "Projects"
  - heading "task-006 Priority ownership" [level=1]
  - text: New project name
  - textbox "New project name"
  - button "Rename project"
  - text: Task title
  - textbox "Task title"
  - button "Create task"
  - text: Task filter
  - combobox "Task filter":
    - option "All" [selected]
    - option "Open"
    - option "Completed"
  - region "Tasks":
    - text: Priority first
    - checkbox "Complete Priority first"
    - text: Task priority
    - combobox "Task priority":
      - option "Low" [selected]
      - option "Normal"
      - option "High"
    - text: New task title
    - textbox "New task title"
    - button "Rename task"
    - text: Priority second
    - checkbox "Complete Priority second"
    - text: Task priority
    - combobox "Task priority":
      - option "Low" [selected]
      - option "Normal"
      - option "High"
    - text: New task title
    - textbox "New task title"
    - button "Rename task"
```

# Test source

```ts
  1  | import {test, expect} from '@playwright/test';
  2  | import {stage, projectRow, taskRow, createProject, openProject, createTask, isolateBrowser, expectPersistedCompletion, expectPersistedPriority} from './helpers.mjs';
  3  | 
  4  | const priority = (page, title) => taskRow(page, title).getByRole('combobox', {name:'Task priority', exact:true});
  5  | test.beforeEach(async ({context}) => { await isolateBrowser(context); });
  6  | 
  7  | if (stage >= 6) {
  8  |   test('022 pre-priority archived data acquires Normal without changing completion', async ({page}) => {
  9  |     await page.goto('/');
  10 |     await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Archived'});
  11 |     const previous=page.getByTestId('project-row').filter({hasText:'task-005 Persistence renamed'}).filter({visible:true});
  12 |     await expect(previous.getByTestId('project-summary')).toHaveText('1/1 completed');
  13 |     await previous.getByRole('button', {name:'Open project', exact:true}).click();
  14 |     await expect(page.getByRole('checkbox', {name:'Complete Memory kept', exact:true})).toBeChecked();
  15 |     await expect(priority(page, 'Memory kept').locator('option:checked')).toHaveText('Normal');
  16 |     await expect(priority(page, 'Memory kept')).toBeDisabled();
  17 |   });
  18 | 
  19 |   test('019 independent priorities default to Normal and persist through rename', async ({page}) => {
  20 |     await createProject(page, 'Priority ownership');
  21 |     await openProject(page, 'Priority ownership');
  22 |     await createTask(page, 'Priority first');
  23 |     await createTask(page, 'Priority second');
  24 |     await expect(priority(page, 'Priority first').locator('option')).toHaveText(['Low','Normal','High']);
> 25 |     await expect(priority(page, 'Priority first').locator('option:checked')).toHaveText('Normal');
     |                                                                              ^ Error: expect(locator).toHaveText(expected) failed
  26 |     await expect(priority(page, 'Priority second').locator('option:checked')).toHaveText('Normal');
  27 |     await priority(page, 'Priority first').selectOption({label:'High'});
  28 |     await expectPersistedPriority(page, 'Priority ownership', 'Priority first', 'High');
  29 |     await page.reload();
  30 |     await expect(priority(page, 'Priority first').locator('option:checked')).toHaveText('High');
  31 |     await expect(priority(page, 'Priority second').locator('option:checked')).toHaveText('Normal');
  32 |     await priority(page, 'Priority second').selectOption({label:'Low'});
  33 |     await expectPersistedPriority(page, 'Priority ownership', 'Priority second', 'Low');
  34 |     await taskRow(page, 'Priority first').getByRole('textbox', {name:'New task title', exact:true}).fill('Priority renamed');
  35 |     await taskRow(page, 'Priority first').getByRole('button', {name:'Rename task', exact:true}).click();
  36 |     await expect(page.getByRole('checkbox', {name:'Complete Priority renamed', exact:true})).toBeVisible();
  37 |     await expectPersistedPriority(page, 'Priority ownership', 'Priority renamed', 'High');
  38 |     await page.reload();
  39 |     await expect(priority(page, 'Priority renamed').locator('option:checked')).toHaveText('High');
  40 |     await expect(priority(page, 'Priority second').locator('option:checked')).toHaveText('Low');
  41 |     const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
  42 |     expect(rows.findIndex(t=>t.includes('Priority renamed'))).toBeLessThan(rows.findIndex(t=>t.includes('Priority second')));
  43 |     await createProject(page, 'Priority other owner');
  44 |     await openProject(page, 'Priority other owner');
  45 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  46 |     await createTask(page, 'Priority other task');
  47 |     await expect(priority(page, 'Priority other task').locator('option:checked')).toHaveText('Normal');
  48 |   });
  49 | 
  50 |   test('020 priority edits preserve completion filters and summary', async ({page}) => {
  51 |     await createProject(page, 'Priority completion');
  52 |     await openProject(page, 'Priority completion');
  53 |     await createTask(page, 'Priority completed');
  54 |     await createTask(page, 'Priority open');
  55 |     await page.getByRole('checkbox', {name:'Complete Priority completed', exact:true}).check();
  56 |     await expectPersistedCompletion(page, 'Priority completion', 'Priority completed', true);
  57 |     await priority(page, 'Priority completed').selectOption({label:'Low'});
  58 |     await expectPersistedPriority(page, 'Priority completion', 'Priority completed', 'Low');
  59 |     await priority(page, 'Priority open').selectOption({label:'High'});
  60 |     await expectPersistedPriority(page, 'Priority completion', 'Priority open', 'High');
  61 |     await page.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'Completed'});
  62 |     await expect(taskRow(page, 'Priority open')).toHaveCount(0);
  63 |     await expect(page.getByRole('checkbox', {name:'Complete Priority completed', exact:true})).toBeChecked();
  64 |     await page.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'Open'});
  65 |     await expect(taskRow(page, 'Priority completed')).toHaveCount(0);
  66 |     await expect(page.getByRole('checkbox', {name:'Complete Priority open', exact:true})).not.toBeChecked();
  67 |     await page.getByRole('button', {name:'Projects', exact:true}).click();
  68 |     await expect(projectRow(page, 'Priority completion').getByTestId('project-summary')).toHaveText('1/2 completed');
  69 |   });
  70 | 
  71 |   test('021 archived priorities are read-only and restored unchanged', async ({page}) => {
  72 |     await createProject(page, 'Priority archive');
  73 |     await openProject(page, 'Priority archive');
  74 |     await createTask(page, 'Priority retained');
  75 |     await priority(page, 'Priority retained').selectOption({label:'High'});
  76 |     await expectPersistedPriority(page, 'Priority archive', 'Priority retained', 'High');
  77 |     await page.getByRole('button', {name:'Projects', exact:true}).click();
  78 |     await projectRow(page, 'Priority archive').getByRole('button', {name:'Archive project', exact:true}).click();
  79 |     await expect(projectRow(page, 'Priority archive')).toHaveCount(0);
  80 |     await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Archived'});
  81 |     await openProject(page, 'Priority archive');
  82 |     await expect(priority(page, 'Priority retained')).toBeDisabled();
  83 |     await expect(priority(page, 'Priority retained').locator('option:checked')).toHaveText('High');
  84 |     await page.getByRole('button', {name:'Projects', exact:true}).click();
  85 |     await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Archived'});
  86 |     await projectRow(page, 'Priority archive').getByRole('button', {name:'Restore project', exact:true}).click();
  87 |     await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Active'});
  88 |     await openProject(page, 'Priority archive');
  89 |     await expect(priority(page, 'Priority retained')).toBeEnabled();
  90 |     await expect(priority(page, 'Priority retained').locator('option:checked')).toHaveText('High');
  91 |     await priority(page, 'Priority retained').selectOption({label:'Normal'});
  92 |     await expectPersistedPriority(page, 'Priority archive', 'Priority retained', 'Normal');
  93 |   });
  94 | }
  95 | 
```