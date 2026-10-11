# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.mjs >> 012 data survives a real server-process restart
- Location: runs/instruction-effects/eval-014/tasks/task-018/suite/persistence.spec.mjs:4:1

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
- main [ref=e2]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { stage, projectRow, taskRow, openProject, isolateBrowser } from './helpers.mjs';
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
  16 |   if(stage>=15){await expect(taskRow(page,'Memory kept').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('');await expect(taskRow(page,'Memory kept').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();await expect(taskRow(page,'Memory kept').getByRole('button',{name:'Save notes',exact:true})).toBeDisabled();}
  17 |   if(stage>=13) {await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Search tasks',exact:true})).toBeEnabled();}
  18 |   if (stage >= 10) {
  19 |     await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('');
  20 |     await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('');
  21 |     await expect(page.getByRole('button',{name:'Apply due range',exact:true})).toBeEnabled();
  22 |   }
  23 |   if (stage >= 9) {
  24 |     const date=taskRow(page,'Memory kept').getByRole('textbox',{name:'Task due date',exact:true});
  25 |     await expect(date).toHaveValue('2028-02-29');
  26 |     await expect(date).toBeDisabled();
  27 |     await expect(taskRow(page,'Memory kept').getByRole('button',{name:'Save due date',exact:true})).toBeDisabled();
  28 |   }
  29 |   if (stage >= 8) {
  30 |     const defaults=page.getByRole('combobox', {name:'Default task priority', exact:true});
  31 |     await expect(defaults.locator('option:checked')).toHaveText('Low');
  32 |     await expect(defaults).toBeDisabled();
  33 |   }
  34 |   if (stage >= 6) {
  35 |     const priority=taskRow(page,'Memory kept').getByRole('combobox', {name:'Task priority', exact:true});
  36 |     await expect(priority.locator('option:checked')).toHaveText('High');
  37 |     await expect(priority).toBeDisabled();
  38 |   }
  39 |   if (stage >= 3) {
  40 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeDisabled();
  41 |   }
  42 |   if(stage>=11) {
  43 |     await page.goto('/');await openProject(page,'Transfer restart origin');
  44 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  45 |   }
  46 | 
  47 |   if(stage>=12) {
  48 |     await page.goto('/');await openProject(page,'Position first owner');
  49 |     const rows=page.getByTestId('task-row').filter({visible:true});
  50 |     await expect(rows).toHaveCount(4);
  51 |     for(const [index,title] of ['First existing','Position travelling','First later','First newly created'].entries())await expect(rows.nth(index).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();
  52 |   }
  53 | 
  54 |   if(stage>=16){await page.goto('/');await expect(projectRow(page,'Deletion restart').getByTestId('project-summary')).toHaveText('0/0 completed');await openProject(page,'Deletion restart');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,'Deleted memory').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Original deleted note\nretained');await expect(taskRow(page,'Deleted memory').getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await expect(taskRow(page,'Deleted memory').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();}
  55 | 
  56 |   if(stage>=18){await page.goto('/');await expect(projectRow(page,'Import restart').getByTestId('project-summary')).toHaveText('0/1 completed');await openProject(page,'Import restart');await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Live import');await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2044-02-29');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,'Imported deleted').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Import Ω\nretained');await expect(taskRow(page,'Imported deleted').getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await expect(page.getByRole('checkbox',{name:'Complete Imported deleted',exact:true})).toBeChecked();}
  57 | 
  58 | });
  59 | 
```