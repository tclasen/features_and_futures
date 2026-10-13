# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence.spec.mjs >> 012 data survives a real server-process restart
- Location: runs/instruction-effects/eval-016/tasks/task-021/suite/persistence.spec.mjs:6:1

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Deleted memory', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true })
Expected: "Original deleted note
retained"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveValue" getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Deleted memory', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true }) with timeout 5000ms
  - waiting for getByTestId('task-row').filter({ has: getByRole('checkbox', { name: 'Complete Deleted memory', exact: true }) }).visible().getByRole('textbox', { name: 'Task notes', exact: true })

```

```yaml
- main:
  - heading "task-021 Deletion restart" [level=1]
  - button "Projects"
  - button "Download project"
  - text: New project name
  - textbox "New project name"
  - button "Rename project"
  - text: Default task priority
  - combobox "Default task priority":
    - option "Low"
    - option "Normal" [selected]
    - option "High"
  - heading "Tasks" [level=2]
  - text: Task title
  - textbox "Task title"
  - button "Create task"
  - text: Task filter
  - combobox "Task filter":
    - option "All"
    - option "Open"
    - option "Completed"
    - option "Deleted" [selected]
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
  - text: Task search
  - textbox "Task search"
  - button "Search tasks"
  - paragraph: No matching tasks.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { stage, projectName, projectRow, taskRow, openProject, isolateBrowser } from './helpers.mjs';
  3  | import {checkWorkspaceImportPersistence} from './workspace-persistence.mjs';
  4  | import {checkBulkDeletionPersistence} from './bulk-deletion-persistence.mjs';
  5  | 
  6  | test('012 data survives a real server-process restart', async ({ page, context }) => {
  7  |   if(stage>=24)test.setTimeout(90000);
  8  |   await isolateBrowser(context);
  9  |   await page.goto('/');
  10 |   if (stage >= 3) {
  11 |     await page.getByRole('combobox', { name: 'Project filter', exact: true }).selectOption({ label: 'Archived' });
  12 |     await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel').getByTestId('project-summary')).toHaveText('1/1 completed');
  13 |   }
  14 |   await expect(projectRow(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel')).toBeVisible();
  15 |   await openProject(page, stage >= 4 ? 'Persistence renamed' : 'Persistence sentinel');
  16 |   if (stage >= 2) {
  17 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeChecked();
  18 |   }
  19 |   if(stage>=15){await expect(taskRow(page,'Memory kept').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('');await expect(taskRow(page,'Memory kept').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();await expect(taskRow(page,'Memory kept').getByRole('button',{name:'Save notes',exact:true})).toBeDisabled();}
  20 |   if(stage>=13) {await expect(page.getByRole('textbox',{name:'Task search',exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Search tasks',exact:true})).toBeEnabled();}
  21 |   if (stage >= 10) {
  22 |     await expect(page.getByRole('textbox',{name:'Due from',exact:true})).toHaveValue('');
  23 |     await expect(page.getByRole('textbox',{name:'Due through',exact:true})).toHaveValue('');
  24 |     await expect(page.getByRole('button',{name:'Apply due range',exact:true})).toBeEnabled();
  25 |   }
  26 |   if (stage >= 9) {
  27 |     const date=taskRow(page,'Memory kept').getByRole('textbox',{name:'Task due date',exact:true});
  28 |     await expect(date).toHaveValue('2028-02-29');
  29 |     await expect(date).toBeDisabled();
  30 |     await expect(taskRow(page,'Memory kept').getByRole('button',{name:'Save due date',exact:true})).toBeDisabled();
  31 |   }
  32 |   if (stage >= 8) {
  33 |     const defaults=page.getByRole('combobox', {name:'Default task priority', exact:true});
  34 |     await expect(defaults.locator('option:checked')).toHaveText('Low');
  35 |     await expect(defaults).toBeDisabled();
  36 |   }
  37 |   if (stage >= 6) {
  38 |     const priority=taskRow(page,'Memory kept').getByRole('combobox', {name:'Task priority', exact:true});
  39 |     await expect(priority.locator('option:checked')).toHaveText('High');
  40 |     await expect(priority).toBeDisabled();
  41 |   }
  42 |   if (stage >= 3) {
  43 |     await expect(page.getByRole('checkbox', { name: stage >= 5 ? 'Complete Memory kept' : 'Complete Remember me', exact: true })).toBeDisabled();
  44 |   }
  45 |   if(stage>=11) {
  46 |     await page.goto('/');await openProject(page,'Transfer restart origin');
  47 |     await expect(page.getByTestId('task-row').filter({visible:true})).toHaveCount(0);
  48 |   }
  49 | 
  50 |   if(stage>=12) {
  51 |     await page.goto('/');await openProject(page,'Position first owner');
  52 |     const rows=page.getByTestId('task-row').filter({visible:true});
  53 |     await expect(rows).toHaveCount(4);
  54 |     for(const [index,title] of ['First existing','Position travelling','First later','First newly created'].entries())await expect(rows.nth(index).getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeVisible();
  55 |   }
  56 | 
> 57 |   if(stage>=16){await page.goto('/');await expect(projectRow(page,'Deletion restart').getByTestId('project-summary')).toHaveText('0/0 completed');await openProject(page,'Deletion restart');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,'Deleted memory').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Original deleted note\nretained');await expect(taskRow(page,'Deleted memory').getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await expect(taskRow(page,'Deleted memory').getByRole('textbox',{name:'Task notes',exact:true})).toBeDisabled();}
     |                                                                                                                                                                                                                                                                                                                                                                                                ^ Error: expect(locator).toHaveValue(expected) failed
  58 | 
  59 |   if(stage>=18){await page.goto('/');await expect(projectRow(page,'Import restart').getByTestId('project-summary')).toHaveText('0/1 completed');await openProject(page,'Import restart');await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Live import');await expect(taskRow(page,'Imported live').getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2044-02-29');await page.getByRole('combobox',{name:'Task filter',exact:true}).selectOption({label:'Deleted'});await expect(taskRow(page,'Imported deleted').getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Import Ω\nretained');await expect(taskRow(page,'Imported deleted').getByRole('button',{name:'Restore task',exact:true})).toBeEnabled();await expect(page.getByRole('checkbox',{name:'Complete Imported deleted',exact:true})).toBeChecked();}
  60 | 
  61 |   if(stage>=20){for(const owner of ['Bulk restart first','Bulk restart second']){await page.goto('/');await expect(projectRow(page,owner).getByTestId('project-summary')).toHaveText('1/1 completed');await openProject(page,owner);const title=projectName('Bulk restart record')+' '+owner;await expect(page.getByRole('checkbox',{name:'Complete '+title,exact:true})).toBeChecked();await expect(taskRow(page,title).getByRole('combobox',{name:'Task priority',exact:true}).locator('option:checked')).toHaveText('High');await expect(taskRow(page,title).getByRole('textbox',{name:'Task due date',exact:true})).toHaveValue('2052-02-29');await expect(taskRow(page,title).getByRole('textbox',{name:'Task notes',exact:true})).toHaveValue('Bulk restart Ω\noriginal');}}
  62 | 
  63 |   if(stage>=30)await checkWorkspaceImportPersistence(page,['postrestart','upgrade'].includes(process.env.FF_PHASE));
  64 |   if(stage>=24)await checkBulkDeletionPersistence(page,['postrestart','upgrade'].includes(process.env.FF_PHASE));
  65 | });
  66 | 
```