# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.mjs >> 012 data survives a real server-process restart
- Location: runs/instruction-effects/eval-004/tasks/task-006/suite/persistence.spec.mjs:4:1

# Error details

```
Test timeout of 20000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 20000ms exceeded.
Call log:
  - waiting for getByRole('combobox', { name: 'Project filter', exact: true })

```

# Page snapshot

```yaml
- generic [active]:
  - main
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
> 8  |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
     |                                                                               ^ Error: locator.selectOption: Test timeout of 20000ms exceeded.
  9  |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByTestId('project-summary')).toHaveText('1/1 completed');
  10 |   }
  11 |   await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toBeVisible();
  12 |   await openProject(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel');
  13 |   if (stage >= 2) {
  14 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeChecked();
  15 |   }
  16 |   if (stage >= 6) {
  17 |     const priority=page.getByTestId('task-row').filter({hasText:'Memory kept'}).getByRole('combobox', {name:'Task priority', exact:true});
  18 |     await expect(priority.locator('option:checked')).toHaveText('High');
  19 |     await expect(priority).toBeDisabled();
  20 |   }
  21 |   if (stage >= 3) {
  22 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeDisabled();
  23 |   }
  24 | });
  25 | 
```