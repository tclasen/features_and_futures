# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: priority.spec.mjs >> 020 priority edits preserve completion filters and summary
- Location: runs/instruction-effects/eval-001/decisions/task-006-draft/suite/priority.spec.mjs:49:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('task-row').filter({ hasText: 'Priority open' }).visible()
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('task-row').filter({ hasText: 'Priority open' }).visible() with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ hasText: 'Priority open' }).visible()
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:54567/projects/3?filter=Completed"
    14 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=f8e1]:
  - heading "task-006 Priority completion" [level=1] [ref=f8e2]
  - group [ref=f8e4]:
    - button "Projects" [ref=f8e5]
  - group [ref=f8e7]:
    - generic [ref=f8e8]:
      - text: New project name
      - textbox "New project name" [ref=f8e9]
    - button "Rename project" [ref=f8e10]
  - group [ref=f8e12]:
    - generic [ref=f8e13]:
      - text: Task title
      - textbox "Task title" [ref=f8e14]
    - button "Create task" [ref=f8e15]
  - generic [ref=f8e17]:
    - text: Task filter
    - combobox "Task filter" [ref=f8e18]:
      - option "All"
      - option "Open"
      - option "Completed" [selected]
  - generic [ref=f8e19]:
    - text: Priority open
    - checkbox "Complete Priority open" [checked] [ref=f8e21]
    - group [ref=f8e23]:
      - generic [ref=f8e24]:
        - text: New task title
        - textbox "New task title" [ref=f8e25]
      - button "Rename task" [ref=f8e26]
    - generic [ref=f8e28]:
      - text: Task priority
      - combobox "Task priority" [ref=f8e29]:
        - option "Low"
        - option "Normal"
        - option "High" [selected]
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
  25 |     await expect(priority(page, 'Priority first').locator('option:checked')).toHaveText('Normal');
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
  37 |     await page.reload();
  38 |     await expect(priority(page, 'Priority renamed').locator('option:checked')).toHaveText('High');
  39 |     await expect(priority(page, 'Priority second').locator('option:checked')).toHaveText('Low');
  40 |     const rows=await page.getByTestId('task-row').filter({visible:true}).allTextContents();
  41 |     expect(rows.findIndex(t=>t.includes('Priority renamed'))).toBeLessThan(rows.findIndex(t=>t.includes('Priority second')));
  42 |     await createProject(page, 'Priority other owner');
  43 |     await openProject(page, 'Priority other owner');
  44 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  45 |     await createTask(page, 'Priority other task');
  46 |     await expect(priority(page, 'Priority other task').locator('option:checked')).toHaveText('Normal');
  47 |   });
  48 | 
  49 |   test('020 priority edits preserve completion filters and summary', async ({page}) => {
  50 |     await createProject(page, 'Priority completion');
  51 |     await openProject(page, 'Priority completion');
  52 |     await createTask(page, 'Priority completed');
  53 |     await createTask(page, 'Priority open');
  54 |     await page.getByRole('checkbox', {name:'Complete Priority completed', exact:true}).check();
  55 |     await expectPersistedCompletion(page, 'Priority completion', 'Priority completed', true);
  56 |     await priority(page, 'Priority completed').selectOption({label:'Low'});
  57 |     await expectPersistedPriority(page, 'Priority completion', 'Priority completed', 'Low');
  58 |     await priority(page, 'Priority open').selectOption({label:'High'});
  59 |     await expectPersistedPriority(page, 'Priority completion', 'Priority open', 'High');
  60 |     await page.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'Completed'});
> 61 |     await expect(taskRow(page, 'Priority open')).toHaveCount(0);
     |                                                  ^ Error: expect(locator).toHaveCount(expected) failed
  62 |     await expect(page.getByRole('checkbox', {name:'Complete Priority completed', exact:true})).toBeChecked();
  63 |     await page.getByRole('combobox', {name:'Task filter', exact:true}).selectOption({label:'Open'});
  64 |     await expect(taskRow(page, 'Priority completed')).toHaveCount(0);
  65 |     await expect(page.getByRole('checkbox', {name:'Complete Priority open', exact:true})).not.toBeChecked();
  66 |     await page.getByRole('button', {name:'Projects', exact:true}).click();
  67 |     await expect(projectRow(page, 'Priority completion').getByTestId('project-summary')).toHaveText('1/2 completed');
  68 |   });
  69 | 
  70 |   test('021 archived priorities are read-only and restored unchanged', async ({page}) => {
  71 |     await createProject(page, 'Priority archive');
  72 |     await openProject(page, 'Priority archive');
  73 |     await createTask(page, 'Priority retained');
  74 |     await priority(page, 'Priority retained').selectOption({label:'High'});
  75 |     await expectPersistedPriority(page, 'Priority archive', 'Priority retained', 'High');
  76 |     await page.getByRole('button', {name:'Projects', exact:true}).click();
  77 |     await projectRow(page, 'Priority archive').getByRole('button', {name:'Archive project', exact:true}).click();
  78 |     await expect(projectRow(page, 'Priority archive')).toHaveCount(0);
  79 |     await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Archived'});
  80 |     await openProject(page, 'Priority archive');
  81 |     await expect(priority(page, 'Priority retained')).toBeDisabled();
  82 |     await expect(priority(page, 'Priority retained').locator('option:checked')).toHaveText('High');
  83 |     await page.getByRole('button', {name:'Projects', exact:true}).click();
  84 |     await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Archived'});
  85 |     await projectRow(page, 'Priority archive').getByRole('button', {name:'Restore project', exact:true}).click();
  86 |     await page.getByRole('combobox', {name:'Project filter', exact:true}).selectOption({label:'Active'});
  87 |     await openProject(page, 'Priority archive');
  88 |     await expect(priority(page, 'Priority retained')).toBeEnabled();
  89 |     await expect(priority(page, 'Priority retained').locator('option:checked')).toHaveText('High');
  90 |     await priority(page, 'Priority retained').selectOption({label:'Normal'});
  91 |     await expectPersistedPriority(page, 'Priority archive', 'Priority retained', 'Normal');
  92 |   });
  93 | }
  94 | 
```