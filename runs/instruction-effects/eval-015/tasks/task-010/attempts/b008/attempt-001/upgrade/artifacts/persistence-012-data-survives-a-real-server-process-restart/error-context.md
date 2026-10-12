# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.mjs >> 012 data survives a real server-process restart
- Location: runs/instruction-effects/eval-015/tasks/task-009/suite/persistence.spec.mjs:4:1

# Error details

```
Error: expect(locator).toBeChecked() failed

Locator: getByRole('checkbox', { name: 'Complete Memory kept', exact: true })
Expected: checked
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeChecked" getByRole('checkbox', { name: 'Complete Memory kept', exact: true }) with timeout 5000ms
  - waiting for getByRole('checkbox', { name: 'Complete Memory kept', exact: true })

```

```yaml
- main:
  - button "Projects"
  - heading "task-009 Persistence renamed" [level=1]
  - paragraph: Archived project
  - text: New project name
  - textbox "New project name" [disabled]
  - button "Rename project" [disabled]
  - text: Task title
  - textbox "Task title" [disabled]
  - button "Create task" [disabled]
  - text: Default task priority
  - combobox "Default task priority" [disabled]:
    - option "Low" [selected]
    - option "Normal"
    - option "High"
  - text: Task filter
  - combobox "Task filter":
    - option "All" [selected]
    - option "Open"
    - option "Completed"
  - text: Priority filter
  - combobox "Priority filter":
    - option "All" [selected]
    - option "Low"
    - option "Normal"
    - option "High"
  - text: Due from
  - textbox "Due from"
  - text: Due through
  - textbox "Due through"
  - button "Apply due range"
  - region "Tasks"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { stage, projectRow, openProject, isolateBrowser } from './helpers.mjs';
  3  | 
  4  | test('012 data survives a real server-process restart', async ({ page, context }) => {
  5  |   await isolateBrowser(context);
  6  |   await page.goto('/');
  7  |   if (stage >= 3) {
  8  |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  9  |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByTestId('project-summary')).toHaveText('1/1 completed');
  10 |   }
  11 |   await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toBeVisible();
  12 |   await openProject(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel');
  13 |   if (stage >= 2) {
> 14 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeChecked();
     |                                                                                                                                   ^ Error: expect(locator).toBeChecked() failed
  15 |   }
  16 |   if (stage >= 9) {
  17 |     const date=page.getByTestId('task-row').filter({hasText:'Memory kept'}).getByRole('textbox',{name:'Task due date',exact:true});
  18 |     await expect(date).toHaveValue('2028-02-29');
  19 |     await expect(date).toBeDisabled();
  20 |     await expect(page.getByTestId('task-row').filter({hasText:'Memory kept'}).getByRole('button',{name:'Save due date',exact:true})).toBeDisabled();
  21 |   }
  22 |   if (stage >= 8) {
  23 |     const defaults=page.getByRole('combobox', {name:'Default task priority', exact:true});
  24 |     await expect(defaults.locator('option:checked')).toHaveText('Low');
  25 |     await expect(defaults).toBeDisabled();
  26 |   }
  27 |   if (stage >= 6) {
  28 |     const priority=page.getByTestId('task-row').filter({hasText:'Memory kept'}).getByRole('combobox', {name:'Task priority', exact:true});
  29 |     await expect(priority.locator('option:checked')).toHaveText('High');
  30 |     await expect(priority).toBeDisabled();
  31 |   }
  32 |   if (stage >= 3) {
  33 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeDisabled();
  34 |   }
  35 | });
  36 | 
```