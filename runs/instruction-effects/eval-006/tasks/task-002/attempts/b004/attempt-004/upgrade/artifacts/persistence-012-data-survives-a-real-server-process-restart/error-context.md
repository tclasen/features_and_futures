# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.mjs >> 012 data survives a real server-process restart
- Location: runs/instruction-effects/eval-006/definitions/project/acceptance/persistence.spec.mjs:4:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('project-row').filter({ hasText: 'task-001 Persistence sentinel' }).visible()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('project-row').filter({ hasText: 'task-001 Persistence sentinel' }).visible() with timeout 5000ms
  - waiting for getByTestId('project-row').filter({ hasText: 'task-001 Persistence sentinel' }).visible()

```

```yaml
- main:
  - heading "Workboard" [level=1]
  - text: Project name
  - textbox "Project name"
  - button "Create project"
  - region "Projects":
    - heading "Your projects" [level=2]
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
> 11 |   await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toBeVisible();
     |                                                                                               ^ Error: expect(locator).toBeVisible() failed
  12 |   await openProject(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel');
  13 |   if (stage >= 2) {
  14 |     await expect(page.getByRole('checkbox', { name: 'Complete Remember me', exact: true })).toBeChecked();
  15 |   }
  16 |   if (stage >= 3) {
  17 |     await expect(page.getByRole('checkbox', { name: 'Complete Remember me', exact: true })).toBeDisabled();
  18 |   }
  19 | });
  20 | 
```